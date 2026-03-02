# backend/app/services/memory_system.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter,
    CharacterRelationship, Foreshadowing, Outline,
    WritingStyle, NarrativeBlueprint,
)


class ContextBuilder:
    """为章节生成组装完整的上下文信息"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_context(
        self,
        novel_id: int,
        chapter_number: int,
        required_char_ids: list[int],
        optional_char_ids: list[int],
        foreshadowing_ids: list[int] | None = None,
    ) -> dict:
        """组装写作上下文，返回各部分文本"""
        novel = await self.db.get(Novel, novel_id)

        context = {
            "novel_info": await self._build_novel_info(novel),
            "character_context": await self._build_character_context(novel_id, required_char_ids, optional_char_ids),
            "recent_intel": await self._build_recent_intel(novel_id, chapter_number),
            "foreshadowing_context": await self._build_foreshadowing_context(novel_id, foreshadowing_ids),
            "blueprint_context": await self._build_blueprint_context(novel),
            "style_prompt": await self._build_style_prompt(novel),
        }
        return context

    async def _build_novel_info(self, novel: Novel) -> str:
        parts = [f"小说: {novel.title}", f"类型: {novel.genre}", f"模式: {novel.mode}"]
        if novel.world_setting:
            parts.append(f"世界观: {novel.world_setting}")
        if novel.core_conflict:
            parts.append(f"核心冲突: {novel.core_conflict}")
        if novel.power_system:
            parts.append(f"力量体系: {novel.power_system}")

        # 加载大纲摘要
        result = await self.db.execute(select(Outline).where(Outline.novel_id == novel.id))
        outline = result.scalar_one_or_none()
        if outline and outline.main_plot:
            parts.append(f"主线情节: {outline.main_plot}")
        return "\n".join(parts)

    async def _build_character_context(
        self, novel_id: int, required_ids: list[int], optional_ids: list[int]
    ) -> str:
        parts = []

        # 必选角色 - 完整信息
        for cid in required_ids:
            char = await self.db.get(Character, cid)
            if char:
                parts.append(self._format_character_full(char))

        # 可选角色 - 简要信息
        for cid in optional_ids:
            char = await self.db.get(Character, cid)
            if char:
                parts.append(f"[可选] {char.name}({char.role}): {char.identity or ''}")

        # 角色关系
        all_ids = required_ids + optional_ids
        if len(all_ids) >= 2:
            result = await self.db.execute(
                select(CharacterRelationship).where(
                    CharacterRelationship.novel_id == novel_id,
                    CharacterRelationship.character_a_id.in_(all_ids),
                    CharacterRelationship.character_b_id.in_(all_ids),
                )
            )
            for rel in result.scalars().all():
                char_a = await self.db.get(Character, rel.character_a_id)
                char_b = await self.db.get(Character, rel.character_b_id)
                if char_a and char_b:
                    parts.append(f"关系: {char_a.name} ↔ {char_b.name}: {rel.relation_type} - {rel.description or ''}")

        return "\n".join(parts)

    def _format_character_full(self, char: Character) -> str:
        lines = [f"[必选] {char.name}({char.role})"]
        if char.identity:
            lines.append(f"  身份: {char.identity}")
        if char.personality:
            lines.append(f"  性格: {char.personality}")
        if char.golden_finger:
            lines.append(f"  金手指: {char.golden_finger}")
        if char.current_status:
            lines.append(f"  当前状态: {char.current_status}")
        if char.current_location:
            lines.append(f"  当前位置: {char.current_location}")
        if char.emotional_state:
            lines.append(f"  情绪: {char.emotional_state}")
        return "\n".join(lines)

    async def _build_recent_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """获取近期章节情报: 前2章完整情报 + 前3-5章摘要"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.novel_id == novel_id, Chapter.chapter_number < current_chapter_number)
            .order_by(Chapter.chapter_number.desc())
            .limit(5)
        )
        recent_chapters = list(reversed(result.scalars().all()))
        parts = []

        for i, ch in enumerate(recent_chapters):
            result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = result.scalar_one_or_none()
            if not intel:
                continue

            distance = current_chapter_number - ch.chapter_number
            if distance <= 2:
                # 近期: 完整情报
                parts.append(f"--- 第{ch.chapter_number}章 {ch.title or ''} ---")
                parts.append(f"情节: {intel.plot_summary or ''}")
                if intel.character_updates:
                    for cu in intel.character_updates:
                        parts.append(f"  {cu.get('name','')}: {cu.get('status_change','')}")
                if intel.relationship_changes:
                    for rc in intel.relationship_changes:
                        parts.append(f"  关系变化: {rc.get('char_a','')}↔{rc.get('char_b','')}: {rc.get('change','')}")
            else:
                # 中期: 仅摘要
                parts.append(f"第{ch.chapter_number}章摘要: {intel.plot_summary or ''}")

        return "\n".join(parts) if parts else "（这是第一章，暂无前文情报）"

    async def _build_foreshadowing_context(self, novel_id: int, selected_ids: list[int] | None) -> str:
        # 所有未解决伏笔
        result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.novel_id == novel_id,
                Foreshadowing.status.in_(["埋设", "推进中"]),
            )
        )
        active = result.scalars().all()
        if not active:
            return ""

        parts = ["当前活跃伏笔:"]
        for f in active:
            marker = "【本章推进】" if selected_ids and f.id in selected_ids else ""
            parts.append(f"  - {f.description} ({f.status}) {marker}")
        return "\n".join(parts)

    async def _build_blueprint_context(self, novel: Novel) -> str:
        if not novel.selected_blueprint_id:
            return ""
        bp = await self.db.get(NarrativeBlueprint, novel.selected_blueprint_id)
        if not bp or not bp.generated_prompt:
            return ""
        return bp.generated_prompt

    async def _build_style_prompt(self, novel: Novel) -> str:
        if not novel.selected_style_id:
            return ""
        style = await self.db.get(WritingStyle, novel.selected_style_id)
        if not style or not style.generated_prompt:
            return ""
        return style.generated_prompt

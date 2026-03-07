# backend/app/services/memory_system.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter,
    CharacterRelationship, Foreshadowing, Outline,
    WritingStyle, NarrativeBlueprint,
)


def estimate_tokens(text: str) -> int:
    """中文字符 ≈ 0.7 token，ASCII ≈ 0.25 token"""
    if not text:
        return 0
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 0.7 + other_chars * 0.25)


def compute_foreshadowing_urgency(current_chapter: int, fs) -> tuple[str, str]:
    """返回 (紧迫度标签, 行动指示)"""
    start = fs.expected_resolve_start
    end = fs.expected_resolve_end
    if start is None or end is None:
        return "潜伏", ""
    if current_chapter > end:
        return "紧急回收", "请在本章回收此伏笔"
    elif current_chapter >= start:
        return "可回收", "如剧情合适，可以回收此伏笔"
    elif current_chapter >= start - 5:
        return "铺垫", "请自然提及此伏笔相关细节，保持读者记忆"
    else:
        return "潜伏", ""


class ContextBuilder:
    """为章节生成组装完整的上下文信息（分层记忆 P0-P7）"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_context(
        self,
        novel_id: int,
        chapter_number: int,
        required_char_ids: list[int],
        optional_char_ids: list[int],
        foreshadowing_ids: list[int] | None = None,
        max_context_tokens: int = 128000,
    ) -> dict:
        """分层组装写作上下文，按优先级 P0-P7"""
        novel = await self.db.get(Novel, novel_id)
        token_budget = int(max_context_tokens * 0.25)
        used_tokens = 0

        layers = {}

        # P0: 小说骨架
        p0 = await self._build_novel_info(novel)
        layers["novel_info"] = p0
        used_tokens += estimate_tokens(p0)

        # P1: 必选角色
        p1 = await self._build_character_context(novel_id, required_char_ids, [])
        layers["character_context"] = p1
        used_tokens += estimate_tokens(p1)

        # P2: 前1-2章原文
        p2 = await self._build_previous_chapters(novel_id, chapter_number)
        layers["previous_chapters"] = p2
        used_tokens += estimate_tokens(p2)

        # P3: 伏笔系统
        p3 = await self._build_foreshadowing_context(novel_id, chapter_number, foreshadowing_ids)
        layers["foreshadowing_context"] = p3
        used_tokens += estimate_tokens(p3)

        # P4: 前3-5章完整情报
        p4 = await self._build_full_intel(novel_id, chapter_number)
        layers["recent_intel"] = p4
        used_tokens += estimate_tokens(p4)

        # P5: 前6-15章情节摘要
        p5 = await self._build_summary_intel(novel_id, chapter_number)
        if used_tokens + estimate_tokens(p5) <= token_budget:
            layers["summary_intel"] = p5
            used_tokens += estimate_tokens(p5)
        else:
            layers["summary_intel"] = ""

        # P5.5: 前16-30章关键事件
        p5_5 = await self._build_key_events(novel_id, chapter_number)
        if p5_5 and used_tokens + estimate_tokens(p5_5) <= token_budget:
            layers["key_events"] = p5_5
            used_tokens += estimate_tokens(p5_5)
        else:
            layers["key_events"] = ""

        # P6: 可选角色 + 角色关系
        p6 = await self._build_character_context(novel_id, [], optional_char_ids)
        if used_tokens + estimate_tokens(p6) <= token_budget:
            layers["optional_characters"] = p6
            used_tokens += estimate_tokens(p6)
        else:
            layers["optional_characters"] = ""

        # P7: 卷摘要
        p7 = await self._build_volume_summaries(novel_id, chapter_number)
        if p7 and used_tokens + estimate_tokens(p7) <= token_budget:
            layers["volume_summaries"] = p7
            used_tokens += estimate_tokens(p7)
        else:
            layers["volume_summaries"] = ""

        layers["blueprint_context"] = await self._build_blueprint_context(novel)
        layers["style_prompt"] = await self._build_style_prompt(novel)

        return layers

    async def _build_novel_info(self, novel: Novel) -> str:
        parts = [f"小说: {novel.title}", f"类型: {novel.genre}", f"模式: {novel.mode}"]
        if novel.world_setting:
            parts.append(f"世界观: {novel.world_setting}")
        if novel.core_conflict:
            parts.append(f"核心冲突: {novel.core_conflict}")
        if novel.power_system:
            parts.append(f"力量体系: {novel.power_system}")
        if novel.protagonist_identity:
            parts.append(f"主角: {novel.protagonist_identity}")
        result = await self.db.execute(select(Outline).where(Outline.novel_id == novel.id))
        outline = result.scalar_one_or_none()
        if outline:
            if outline.story_background:
                parts.append(f"故事背景: {outline.story_background}")
            if outline.main_plot:
                parts.append(f"主线情节: {outline.main_plot}")
        return "\n".join(parts)

    async def _build_previous_chapters(self, novel_id: int, current_chapter_number: int) -> str:
        """获取前 1-2 章完整原文"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.novel_id == novel_id, Chapter.chapter_number < current_chapter_number)
            .order_by(Chapter.chapter_number.desc())
            .limit(2)
        )
        chapters = list(reversed(result.scalars().all()))
        if not chapters:
            return "（这是第一章，暂无前文）"
        parts = []
        for ch in chapters:
            header = f"--- 第{ch.chapter_number}章 {ch.title or ''} ---"
            content = ch.content or "（无内容）"
            parts.append(f"{header}\n{content}")
        return "\n\n".join(parts)

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

    async def _build_foreshadowing_context(
        self, novel_id: int, current_chapter: int, selected_ids: list[int] | None
    ) -> str:
        """构建伏笔上下文，按紧迫度排序并附带行动指示"""
        result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.novel_id == novel_id,
                Foreshadowing.status.in_(["埋设", "推进中"]),
            )
        )
        active = result.scalars().all()
        if not active:
            return ""
        urgency_order = {"紧急回收": 0, "可回收": 1, "铺垫": 2, "潜伏": 3}
        items = []
        for f in active:
            urgency, instruction = compute_foreshadowing_urgency(current_chapter, f)
            items.append((urgency_order.get(urgency, 3), urgency, instruction, f))
        items.sort(key=lambda x: x[0])
        parts = ["当前活跃伏笔:"]
        for _, urgency, instruction, f in items:
            selected_marker = "【本章推进】" if selected_ids and f.id in selected_ids else ""
            range_info = ""
            if f.expected_resolve_start and f.expected_resolve_end:
                range_info = f"，预期第{f.expected_resolve_start}-{f.expected_resolve_end}章回收"
            elif f.foreshadowing_type == "长线":
                range_info = "，长线伏笔"
            line = f"  [{urgency}] #{f.id} {f.description}（埋设于第{f.created_chapter_id or '?'}章{range_info}）{selected_marker}"
            if instruction:
                line += f"\n    → {instruction}"
            parts.append(line)
        return "\n".join(parts)

    async def _build_full_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """前 3-5 章：完整情报"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number,
                Chapter.chapter_number >= current_chapter_number - 5,
                Chapter.chapter_number < current_chapter_number - 2,
            )
            .order_by(Chapter.chapter_number)
        )
        chapters = result.scalars().all()
        if not chapters:
            return ""
        parts = []
        for ch in chapters:
            intel_result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = intel_result.scalar_one_or_none()
            if not intel:
                continue
            parts.append(f"--- 第{ch.chapter_number}章 {ch.title or ''} ---")
            parts.append(f"情节: {intel.plot_summary or ''}")
            if intel.character_updates:
                for cu in intel.character_updates:
                    updates = []
                    if cu.get("status_change"):
                        updates.append(f"状态: {cu['status_change']}")
                    if cu.get("emotional_state"):
                        updates.append(f"情绪: {cu['emotional_state']}")
                    if cu.get("location"):
                        updates.append(f"位置: {cu['location']}")
                    if updates:
                        parts.append(f"  {cu.get('name', '')}: {', '.join(updates)}")
            if intel.relationship_changes:
                for rc in intel.relationship_changes:
                    parts.append(f"  关系变化: {rc.get('char_a', '')}↔{rc.get('char_b', '')}: {rc.get('change', '')}")
            if intel.timeline_events:
                for te in intel.timeline_events:
                    if isinstance(te, dict):
                        parts.append(f"  时间线: {te.get('time', '')}: {te.get('event', '')}")
        return "\n".join(parts) if parts else ""

    async def _build_summary_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """前 6-15 章：仅情节摘要"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number - 5,
                Chapter.chapter_number >= current_chapter_number - 15,
            )
            .order_by(Chapter.chapter_number)
        )
        chapters = result.scalars().all()
        if not chapters:
            return ""
        parts = []
        for ch in chapters:
            intel_result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = intel_result.scalar_one_or_none()
            if intel and intel.plot_summary:
                parts.append(f"第{ch.chapter_number}章摘要: {intel.plot_summary}")
        return "\n".join(parts) if parts else ""

    async def _build_key_events(self, novel_id: int, current_chapter_number: int) -> str:
        """P5.5: 前16-30章，每章一个关键事件（plot_summary 第一句）"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number - 15,
                Chapter.chapter_number >= current_chapter_number - 30,
            )
            .order_by(Chapter.chapter_number)
        )
        chapters = result.scalars().all()
        if not chapters:
            return ""
        parts = []
        for ch in chapters:
            intel_result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = intel_result.scalar_one_or_none()
            if intel and intel.plot_summary:
                first_sentence = intel.plot_summary.split("。")[0] + "。"
                parts.append(f"第{ch.chapter_number}章: {first_sentence}")
        return "\n".join(parts) if parts else ""

    async def _build_volume_summaries(self, novel_id: int, chapter_number: int) -> str:
        """P7: 加载卷摘要（P7a近期 + P7b弧摘要 + P7c全书纲要）"""
        from app.models.narrative_memory import NarrativeMemory

        parts = []

        # P7c: 全书纲要（最多1条）
        result = await self.db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "global",
            )
        )
        global_mem = result.scalar_one_or_none()
        if global_mem:
            parts.append(f"【全书纲要（第{global_mem.chapter_start}-{global_mem.chapter_end}章）】\n{global_mem.plot_progression}")

        # P7b: 弧摘要
        result = await self.db.execute(
            select(NarrativeMemory)
            .where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "arc",
            )
            .order_by(NarrativeMemory.chapter_start)
        )
        for arc in result.scalars().all():
            parts.append(f"【弧摘要（第{arc.chapter_start}-{arc.chapter_end}章）】\n{arc.plot_progression}")

        # P7a: 最近3个卷摘要
        result = await self.db.execute(
            select(NarrativeMemory)
            .where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
            )
            .order_by(NarrativeMemory.chapter_end.desc())
            .limit(3)
        )
        recent_volumes = list(reversed(result.scalars().all()))
        for vol in recent_volumes:
            vol_parts = [f"【卷摘要（第{vol.chapter_start}-{vol.chapter_end}章）】"]
            vol_parts.append(f"情节: {vol.plot_progression}")
            if vol.character_states:
                for name, state in vol.character_states.items():
                    state_str = ", ".join(f"{k}: {v}" for k, v in state.items()) if isinstance(state, dict) else str(state)
                    vol_parts.append(f"  {name}: {state_str}")
            if vol.unresolved_threads:
                vol_parts.append(f"未解决线索: {'、'.join(vol.unresolved_threads)}")
            parts.append("\n".join(vol_parts))

        return "\n\n".join(parts) if parts else ""

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

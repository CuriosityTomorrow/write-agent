# backend/app/services/writing_engine.py
import json
from typing import AsyncGenerator

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm import get_provider, Message, GenerateConfig
from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing, Outline,
)
from app.prompts import idea_generator, outline_generator, chapter_generator, intel_extractor
from app.services.memory_system import ContextBuilder


async def generate_idea(genre: str, creative_idea: str, model_id: str, db: AsyncSession) -> dict:
    """根据创作思路生成智能模板"""
    provider = get_provider(model_id)
    prompt = idea_generator.build_idea_prompt(genre, creative_idea)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=idea_generator.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.8, max_tokens=2000, stream=False),
    )
    return json.loads(response)


async def generate_outline(novel_id: int, target_chapters: int, model_id: str, db: AsyncSession) -> dict:
    """生成小说大纲"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise ValueError("Novel not found")

    novel_settings = {
        "genre": novel.genre,
        "world_setting": novel.world_setting,
        "protagonist_identity": novel.protagonist_identity,
        "core_conflict": novel.core_conflict,
        "golden_finger": novel.golden_finger,
        "antagonist_setting": novel.antagonist_setting,
        "power_system": novel.power_system,
        "core_suspense": novel.core_suspense,
        "story_stage": novel.story_stage,
        "style_tone": novel.style_tone,
    }

    # 获取叙事蓝图 prompt (如果有)
    blueprint_prompt = ""
    if novel.selected_blueprint_id:
        from app.models import NarrativeBlueprint
        bp = await db.get(NarrativeBlueprint, novel.selected_blueprint_id)
        if bp and bp.generated_prompt:
            blueprint_prompt = bp.generated_prompt

    provider = get_provider(model_id)
    prompt = outline_generator.build_outline_prompt(novel_settings, target_chapters, blueprint_prompt)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=outline_generator.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.7, max_tokens=4000, stream=False),
    )
    return json.loads(response)


async def generate_chapter_stream(
    novel_id: int,
    chapter_id: int,
    model_id: str,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """流式生成章节内容"""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise ValueError("Chapter not found")

    # 获取本章角色配置
    result = await db.execute(
        select(ChapterCharacter).where(ChapterCharacter.chapter_id == chapter_id)
    )
    chapter_chars = result.scalars().all()
    required_ids = [cc.character_id for cc in chapter_chars if cc.is_required]
    optional_ids = [cc.character_id for cc in chapter_chars if not cc.is_required]

    # 构建上下文
    builder = ContextBuilder(db)
    ctx = await builder.build_context(
        novel_id=novel_id,
        chapter_number=chapter.chapter_number,
        required_char_ids=required_ids,
        optional_char_ids=optional_ids,
    )

    # 组装本章配置
    chapter_config_parts = [f"章节序号: 第{chapter.chapter_number}章"]
    if chapter.chapter_outline:
        chapter_config_parts.append(f"章纲: {chapter.chapter_outline}")
    if chapter.conflict_description:
        chapter_config_parts.append(f"本章冲突: {chapter.conflict_description}")
    if chapter.target_word_count:
        chapter_config_parts.append(f"目标字数: {chapter.target_word_count}字")

    # 构建完整 prompt
    style_instruction = ""
    if ctx["style_prompt"]:
        style_instruction = f"\n\n【文笔风格要求】\n{ctx['style_prompt']}"

    system_prompt = chapter_generator.SYSTEM_PROMPT_TEMPLATE.format(style_instruction=style_instruction)

    prompt = chapter_generator.build_chapter_prompt(
        novel_info=ctx["novel_info"],
        character_context=ctx["character_context"],
        recent_intel=ctx["recent_intel"],
        foreshadowing_context=ctx["foreshadowing_context"],
        chapter_config="\n".join(chapter_config_parts),
        blueprint_context=ctx["blueprint_context"],
    )

    provider = get_provider(model_id)
    full_content = ""
    async for chunk in provider.generate(
        messages=[Message(role="user", content=prompt)],
        system_prompt=system_prompt,
        config=GenerateConfig(temperature=0.8, max_tokens=8000),
    ):
        full_content += chunk
        yield chunk

    # 生成完毕后更新章节内容
    chapter.content = full_content
    chapter.actual_word_count = len(full_content)
    chapter.status = "已完成"
    await db.commit()


async def extract_chapter_intel(chapter_id: int, model_id: str, db: AsyncSession) -> dict:
    """提取章节情报并更新角色状态"""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or not chapter.content:
        raise ValueError("Chapter not found or has no content")

    # 获取角色名列表
    result = await db.execute(
        select(Character).where(Character.novel_id == chapter.novel_id)
    )
    characters = result.scalars().all()
    char_names = [c.name for c in characters]
    char_map = {c.name: c for c in characters}

    provider = get_provider(model_id)
    prompt = intel_extractor.build_intel_prompt(chapter.content, char_names)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=intel_extractor.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=3000, stream=False),
    )
    intel_data = json.loads(response)

    # 保存 ChapterIntel
    intel = ChapterIntel(
        chapter_id=chapter_id,
        plot_summary=intel_data.get("plot_summary"),
        character_updates=intel_data.get("character_updates"),
        relationship_changes=intel_data.get("relationship_changes"),
        new_foreshadowings=intel_data.get("new_foreshadowings"),
        resolved_foreshadowings=intel_data.get("resolved_foreshadowings"),
        timeline_events=intel_data.get("timeline_events"),
        next_chapter_required_chars=intel_data.get("next_chapter_required_chars"),
    )
    db.add(intel)

    # 更新角色状态
    for cu in intel_data.get("character_updates", []):
        char = char_map.get(cu.get("name"))
        if char:
            if cu.get("status_change"):
                char.current_status = cu["status_change"]
            if cu.get("emotional_state"):
                char.emotional_state = cu["emotional_state"]
            if cu.get("location"):
                char.current_location = cu["location"]

    # 创建新伏笔
    for fs_desc in intel_data.get("new_foreshadowings", []):
        fs = Foreshadowing(
            novel_id=chapter.novel_id,
            description=fs_desc,
            created_chapter_id=chapter.chapter_number,
            status="埋设",
        )
        db.add(fs)

    await db.commit()
    return intel_data

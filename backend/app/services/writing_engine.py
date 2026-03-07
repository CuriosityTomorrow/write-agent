# backend/app/services/writing_engine.py
import json
import re
from typing import AsyncGenerator

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm import get_provider, Message, GenerateConfig
from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing, Outline,
)
from app.models.narrative_memory import NarrativeMemory
from app.prompts import idea_generator, outline_generator, chapter_generator, intel_extractor, volume_compressor
from app.prompts.presets import get_preset
from app.services.memory_system import ContextBuilder


def _parse_chapter_range(chapter_range: str) -> tuple[int, int]:
    """解析 '第90-95章' 格式为 (90, 95)"""
    m = re.search(r'(\d+)\s*[-~]\s*(\d+)', chapter_range)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r'(\d+)', chapter_range)
    if m:
        n = int(m.group(1))
        return n, n
    return 0, 0


def assign_chapter_type(chapter_number: int, plot_points: list | None, genre: str) -> str:
    """根据大事件覆盖或六章周期分配章节类型"""
    # 1. 检查大事件覆盖
    for pp in (plot_points or []):
        if not isinstance(pp, dict) or pp.get("event_scale") != "major":
            continue
        target_start, target_end = _parse_chapter_range(pp.get("chapter_range", ""))
        if target_start <= 0:
            continue
        # 爆发阶段
        if target_start <= chapter_number <= target_end:
            return "climax"
        # 临场紧张（爆发前5章）
        if target_start - 5 <= chapter_number < target_start:
            return "transition"
        # 铺垫阶段
        buildup_start = pp.get("buildup_start_chapter", target_start - 30)
        if buildup_start <= chapter_number < target_start - 5:
            return "setup"

    # 2. 六章周期
    preset = get_preset(genre)
    pattern = preset["pacing"]["cycle_pattern"]
    cycle_pos = (chapter_number - 1) % len(pattern)
    return pattern[cycle_pos]


def build_pacing_instruction(chapter_type: str, genre: str) -> str:
    """根据章节类型生成节奏指令文本"""
    preset = get_preset(genre)
    config = preset["pacing"]["chapter_types"].get(chapter_type)
    if not config:
        return ""
    return f"""本章类型：{chapter_type}（{config['description']}）

写作约束：
- 主要事件：不超过 {config['main_events']} 个，每个事件必须充分展开
- 次要事件：不超过 {config['sub_events']} 个
- 场景切换：最多 {config['scene_changes_max']} 次
- 细节重点：{config['detail_focus']}
- 章末处理：{config['hook']}

⚠️ 宁可把一个事件写深写透，也不要塞太多事件。
   角色的反应、对话、心理活动、环境描写都需要充分展开。
   参考标准：每个主事件至少需要 800-1000 字的篇幅来展开。"""


def _parse_json(text: str) -> dict:
    """解析LLM返回的JSON，兼容markdown代码块包裹"""
    text = text.strip()
    # 去除 ```json ... ``` 包裹
    m = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


FIELD_LABELS = {
    "world_setting": "世界观设定",
    "protagonist_identity": "主角身份",
    "core_conflict": "核心冲突",
    "golden_finger": "金手指",
    "antagonist_setting": "反派设定",
    "power_system": "力量体系",
    "core_suspense": "核心悬念",
    "story_stage": "故事舞台",
    "style_tone": "风格基调",
}


async def regenerate_single_field(
    field_name: str,
    current_value: str,
    creative_idea: str,
    genre: str,
    suggestion: str,
    model_id: str,
) -> str:
    """重新生成单个设定字段"""
    provider = get_provider(model_id)

    # 生成创意想法（特殊分支）
    if field_name == "creative_idea":
        hint = ""
        if current_value.strip():
            hint = f"\n用户之前写过的思路（可参考但要有新意）：\n{current_value}"
        if suggestion.strip():
            hint += f"\n用户的额外要求：{suggestion}"
        prompt = f"""你是一位脑洞大开的网络小说策划编辑。请为一部{genre}类型的网文生成一个新颖的创意想法。

要求：
- 包含独特的世界观切入点、主角特色、核心冲突
- 150-300字，言简意赅但信息量足够
- 要有新意和吸引力，避免老套设定
- 直接输出创意内容，不要加标题或前缀{hint}"""

        response = await provider.generate_complete(
            messages=[Message(role="user", content=prompt)],
            system_prompt="你是一位经验丰富且脑洞大开的网络小说策划编辑。直接输出创意内容，不要包含任何多余格式或说明。",
            config=GenerateConfig(temperature=0.95, max_tokens=600, stream=False),
        )
        return response.strip()

    # 生成小说名称（特殊分支）
    if field_name == "title":
        hint = ""
        if current_value.strip():
            hint = f"\n之前取的名字（请换一个不同的）：{current_value}"
        if suggestion.strip():
            hint += f"\n用户的要求：{suggestion}"
        prompt = f"""你是一位网络小说取名大师。请根据以下创意和设定，为这部{genre}小说起一个书名。

{creative_idea}{hint}

要求：
- 只输出一个书名，2-8个字
- 要朗朗上口、有记忆点、能体现核心卖点
- 不要输出任何解释或标点，只输出书名本身"""

        response = await provider.generate_complete(
            messages=[Message(role="user", content=prompt)],
            system_prompt="你是网络小说取名大师。只输出书名，不要任何多余内容。",
            config=GenerateConfig(temperature=0.95, max_tokens=50, stream=False),
        )
        return response.strip().strip('《》""「」')

    label = FIELD_LABELS.get(field_name, field_name)

    suggestion_part = ""
    if suggestion.strip():
        suggestion_part = f"\n用户的修改建议：{suggestion}"

    prompt = f"""你是一位网络小说策划编辑。用户正在设计一部{genre}小说，需要你重新生成其中的「{label}」部分。

【原始创意】
{creative_idea}

【当前的{label}内容】
{current_value}

用户对当前内容不太满意，请重新生成一个更好的版本。{suggestion_part}

要求：
- 只输出「{label}」的新内容，不要输出其他字段
- 不要输出任何标签、前缀或解释，直接输出内容本身
- 保持在200字以内
- 要有新意，不要简单重复当前内容"""

    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt="你是一位经验丰富的网络小说策划编辑。直接输出内容，不要包含任何多余的格式或说明。",
        config=GenerateConfig(temperature=0.9, max_tokens=500, stream=False),
    )
    return response.strip()


OUTLINE_FIELD_LABELS = {
    "story_background": "故事背景",
    "main_plot": "主线情节",
    "plot_points": "情节点列表",
    "chapter_outline": "章节大纲",
}


async def regenerate_novel_field(
    novel_id: int,
    field_name: str,
    current_value: str,
    suggestion: str,
    model_id: str,
    db: AsyncSession,
    chapter_number: int | None = None,
) -> str:
    """基于小说上下文重新生成单个字段（大纲字段/章节大纲）"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise ValueError("Novel not found")

    # ---- 构建压缩上下文 ----
    ctx_parts = []

    # 小说设定（各截取前80字）
    settings_fields = [
        ("genre", "类型"), ("world_setting", "世界观"), ("protagonist_identity", "主角"),
        ("core_conflict", "冲突"), ("golden_finger", "金手指"), ("style_tone", "风格"),
    ]
    settings_lines = []
    for attr, lbl in settings_fields:
        val = getattr(novel, attr, None)
        if val:
            settings_lines.append(f"{lbl}: {val[:80]}")
    if settings_lines:
        ctx_parts.append("【小说设定】\n" + "\n".join(settings_lines))

    # 大纲字段（各截取前100字，排除正在重新生成的字段）
    outline_result = await db.execute(
        select(Outline).where(Outline.novel_id == novel_id)
    )
    outline = outline_result.scalar_one_or_none()
    if outline:
        outline_lines = []
        if field_name != "story_background" and outline.story_background:
            outline_lines.append(f"故事背景: {outline.story_background[:100]}")
        if field_name != "main_plot" and outline.main_plot:
            outline_lines.append(f"主线情节: {outline.main_plot[:100]}")
        if field_name != "plot_points" and outline.plot_points:
            pp_summary = "; ".join(
                (p if isinstance(p, str) else p.get("title", p.get("description", "")))[:30]
                for p in outline.plot_points[:10]
            )
            outline_lines.append(f"情节点: {pp_summary}")
        if outline_lines:
            ctx_parts.append("【大纲】\n" + "\n".join(outline_lines))

    # 角色（紧凑格式）
    char_result = await db.execute(
        select(Character).where(Character.novel_id == novel_id)
    )
    chars = char_result.scalars().all()
    if chars:
        char_strs = [f"{c.name}({c.role})" for c in chars[:15]]
        ctx_parts.append("【角色】" + "、".join(char_strs))

    context = "\n\n".join(ctx_parts)
    # 截断总上下文到800字
    if len(context) > 800:
        context = context[:800] + "…"

    label = OUTLINE_FIELD_LABELS.get(field_name, field_name)
    provider = get_provider(model_id)

    # ---- 章节大纲特殊处理 ----
    if field_name == "chapter_outline":
        # 加载已有章节列表
        ch_result = await db.execute(
            select(Chapter).where(Chapter.novel_id == novel_id).order_by(Chapter.chapter_number)
        )
        existing_chapters = ch_result.scalars().all()
        ch_lines = []
        for ch in existing_chapters:
            summary = f"第{ch.chapter_number}章"
            if ch.chapter_outline:
                summary += f": {ch.chapter_outline[:50]}"
            ch_lines.append(summary)

        ch_context = "\n".join(ch_lines) if ch_lines else "暂无已有章节"
        ch_num = chapter_number or (len(existing_chapters) + 1)

        # 找到对应情节点
        plot_hint = ""
        if outline and outline.plot_points and ch_num <= len(outline.plot_points):
            pp = outline.plot_points[ch_num - 1]
            plot_hint_text = pp if isinstance(pp, str) else pp.get("description", pp.get("summary", str(pp)))
            plot_hint = f"\n\n对应情节点: {plot_hint_text}"

        suggestion_part = f"\n用户的要求: {suggestion}" if suggestion.strip() else ""

        prompt = f"""你是一位网络小说策划编辑。请根据以下小说上下文，为第{ch_num}章生成章节大纲。

{context}

【已有章节】
{ch_context}{plot_hint}{suggestion_part}

要求：
- 输出第{ch_num}章的章节大纲，描述本章要写的主要内容
- 150-300字，包含本章的核心事件、冲突和角色互动
- 要承接前面章节的剧情，推进整体故事线
- 直接输出章节大纲内容，不要加标题或前缀"""

        response = await provider.generate_complete(
            messages=[Message(role="user", content=prompt)],
            system_prompt="你是一位经验丰富的网络小说策划编辑。直接输出内容，不要包含任何多余的格式或说明。",
            config=GenerateConfig(temperature=0.85, max_tokens=600, stream=False),
        )
        return response.strip()

    # ---- 大纲字段（story_background / main_plot / plot_points）----
    suggestion_part = f"\n用户的修改建议: {suggestion}" if suggestion.strip() else ""

    if field_name == "plot_points":
        prompt = f"""你是一位网络小说策划编辑。请根据以下小说上下文，重新生成情节点列表。

{context}

【当前的情节点】
{current_value}{suggestion_part}

要求：
- 输出JSON数组格式的情节点列表
- 每个情节点包含 "title"（10字以内标题）和 "summary"（50字以内概要）
- 保持与小说设定和大纲的一致性
- 要有新意，不要简单重复当前内容
- 只输出JSON数组，不要其他内容

示例格式：
[{{"title": "...", "summary": "..."}}, {{"title": "...", "summary": "..."}}]"""
    else:
        prompt = f"""你是一位网络小说策划编辑。请根据以下小说上下文，重新生成「{label}」部分。

{context}

【当前的{label}内容】
{current_value}{suggestion_part}

要求：
- 只输出「{label}」的新内容
- 不要输出任何标签、前缀或解释，直接输出内容本身
- 保持在300字以内
- 保持与小说其他设定的一致性
- 要有新意，不要简单重复当前内容"""

    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt="你是一位经验丰富的网络小说策划编辑。直接输出内容，不要包含任何多余的格式或说明。",
        config=GenerateConfig(temperature=0.85, max_tokens=800, stream=False),
    )

    # plot_points 返回 JSON 字符串
    if field_name == "plot_points":
        try:
            parsed = json.loads(response.strip().strip('```json').strip('```').strip())
            return json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError:
            return response.strip()

    return response.strip()


async def generate_idea(genre: str, creative_idea: str, model_id: str, db: AsyncSession) -> dict:
    """根据创作思路生成智能模板"""
    provider = get_provider(model_id)
    prompt = idea_generator.build_idea_prompt(genre, creative_idea)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=idea_generator.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.8, max_tokens=2000, stream=False),
    )
    data = _parse_json(response)
    # 将嵌套对象展平为字符串（LLM可能返回 {"name": ..., "description": ...}）
    for key in list(data.keys()):
        if isinstance(data[key], dict):
            parts = [v for v in data[key].values() if isinstance(v, str)]
            data[key] = "；".join(parts) if parts else str(data[key])
    return data


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
    return _parse_json(response)


async def generate_chapter_stream(
    novel_id: int,
    chapter_id: int,
    model_id: str,
    db: AsyncSession,
    suggestion: str = "",
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

    provider = get_provider(model_id)
    max_context = provider.max_context_length()

    # 构建上下文
    builder = ContextBuilder(db)
    ctx = await builder.build_context(
        novel_id=novel_id,
        chapter_number=chapter.chapter_number,
        required_char_ids=required_ids,
        optional_char_ids=optional_ids,
        max_context_tokens=max_context,
    )

    # 获取小说信息和大纲（用于节奏控制）
    novel = await db.get(Novel, novel_id)
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    plot_points = outline.plot_points if outline else None

    # 确定章节类型
    effective_type = chapter.chapter_type or assign_chapter_type(
        chapter.chapter_number, plot_points, novel.genre
    )
    pacing_instruction = build_pacing_instruction(effective_type, novel.genre)

    # 组装本章配置
    chapter_config_parts = [f"章节序号: 第{chapter.chapter_number}章"]
    if chapter.chapter_outline:
        chapter_config_parts.append(f"章纲: {chapter.chapter_outline}")
    if chapter.conflict_description:
        chapter_config_parts.append(f"本章冲突: {chapter.conflict_description}")
    if chapter.target_word_count:
        chapter_config_parts.append(f"目标字数: {chapter.target_word_count}字")

    # 构建完整 prompt
    preset = get_preset(novel.genre)
    preset_addon = preset.get("system_prompt_addon", "")
    style_instruction = ""
    if ctx["style_prompt"]:
        style_instruction = f"\n\n【文笔风格要求】\n{ctx['style_prompt']}"
    if preset_addon:
        style_instruction += f"\n\n{preset_addon}"

    system_prompt = chapter_generator.SYSTEM_PROMPT_TEMPLATE.format(style_instruction=style_instruction)

    prompt = chapter_generator.build_chapter_prompt(
        novel_info=ctx["novel_info"],
        character_context=ctx["character_context"],
        recent_intel=ctx["recent_intel"],
        foreshadowing_context=ctx["foreshadowing_context"],
        chapter_config="\n".join(chapter_config_parts),
        blueprint_context=ctx["blueprint_context"],
        previous_chapters=ctx["previous_chapters"],
        summary_intel=ctx["summary_intel"],
        optional_characters=ctx["optional_characters"],
        rewrite_content=chapter.content if suggestion else "",
        rewrite_suggestion=suggestion,
        pacing_instruction=pacing_instruction,
        key_events=ctx.get("key_events", ""),
        volume_summaries=ctx.get("volume_summaries", ""),
    )
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

    # 获取活跃伏笔列表
    fs_result = await db.execute(
        select(Foreshadowing).where(
            Foreshadowing.novel_id == chapter.novel_id,
            Foreshadowing.status.in_(["埋设", "推进中"]),
        )
    )
    active_foreshadowings = [
        {"id": f.id, "description": f.description}
        for f in fs_result.scalars().all()
    ]

    provider = get_provider(model_id)
    prompt = intel_extractor.build_intel_prompt(chapter.content, char_names, active_foreshadowings)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=intel_extractor.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=3000, stream=False),
    )
    intel_data = _parse_json(response)

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
        suggested_foreshadowings=intel_data.get("suggested_foreshadowings"),
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

    # 自动回收伏笔（按 id 匹配）
    for resolved in intel_data.get("resolved_foreshadowings", []):
        fs_id = resolved.get("id") if isinstance(resolved, dict) else None
        if fs_id:
            fs = await db.get(Foreshadowing, fs_id)
            if fs and fs.novel_id == chapter.novel_id and fs.status != "已回收":
                fs.status = "已回收"
                fs.resolved_chapter_id = chapter.chapter_number

    # 创建新伏笔（结构化数据）
    for fs_data in intel_data.get("new_foreshadowings", []):
        desc = fs_data if isinstance(fs_data, str) else fs_data.get("description", "")
        fs_type = fs_data.get("type", "中线") if isinstance(fs_data, dict) else "中线"
        expected_ch = fs_data.get("expected_resolve_chapter") if isinstance(fs_data, dict) else None

        # 计算回收范围
        resolve_start, resolve_end = None, None
        if expected_ch and isinstance(expected_ch, int) and expected_ch > 0:
            if fs_type == "短线":
                resolve_start = max(1, expected_ch - 1)
                resolve_end = expected_ch + 1
            elif fs_type == "中线":
                resolve_start = max(1, expected_ch - 5)
                resolve_end = expected_ch + 5
            # 长线不设范围

        fs = Foreshadowing(
            novel_id=chapter.novel_id,
            description=desc,
            created_chapter_id=chapter.chapter_number,
            status="埋设",
            foreshadowing_type=fs_type,
            expected_resolve_start=resolve_start,
            expected_resolve_end=resolve_end,
        )
        db.add(fs)

    # 自动压缩检查
    await _maybe_auto_compress(chapter.novel_id, chapter.chapter_number, model_id, db)

    await db.commit()
    return intel_data


async def generate_volume_summary(
    novel_id: int,
    chapter_start: int,
    chapter_end: int,
    model_id: str,
    db: AsyncSession,
) -> dict:
    """生成指定章节范围的卷摘要"""
    result = await db.execute(
        select(Chapter)
        .where(
            Chapter.novel_id == novel_id,
            Chapter.chapter_number >= chapter_start,
            Chapter.chapter_number <= chapter_end,
        )
        .order_by(Chapter.chapter_number)
    )
    chapters = result.scalars().all()

    intels_parts = []
    for ch in chapters:
        intel_result = await db.execute(
            select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
        )
        intel = intel_result.scalar_one_or_none()
        if intel:
            parts = [f"第{ch.chapter_number}章 {ch.title or ''}:"]
            parts.append(f"  情节: {intel.plot_summary or ''}")
            if intel.character_updates:
                for cu in intel.character_updates:
                    parts.append(f"  角色: {cu.get('name', '')} - {cu.get('status_change', '')}")
            if intel.relationship_changes:
                for rc in intel.relationship_changes:
                    parts.append(f"  关系: {rc.get('char_a', '')}↔{rc.get('char_b', '')}: {rc.get('change', '')}")
            intels_parts.append("\n".join(parts))

    if not intels_parts:
        raise ValueError(f"No intel found for chapters {chapter_start}-{chapter_end}")

    intels_text = "\n\n".join(intels_parts)

    provider = get_provider(model_id)
    prompt = volume_compressor.build_volume_compress_prompt(intels_text, chapter_start, chapter_end)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=volume_compressor.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=3000, stream=False),
    )
    summary_data = _parse_json(response)

    # 检查是否已存在同范围的摘要
    existing = await db.execute(
        select(NarrativeMemory).where(
            NarrativeMemory.novel_id == novel_id,
            NarrativeMemory.memory_type == "volume",
            NarrativeMemory.chapter_start == chapter_start,
            NarrativeMemory.chapter_end == chapter_end,
        )
    )
    mem = existing.scalar_one_or_none()
    if mem:
        mem.plot_progression = summary_data.get("plot_progression", "")
        mem.character_states = summary_data.get("character_states")
        mem.relationship_changes = summary_data.get("relationship_changes")
        mem.unresolved_threads = summary_data.get("unresolved_threads")
        mem.world_state_changes = summary_data.get("world_state_changes")
    else:
        mem = NarrativeMemory(
            novel_id=novel_id,
            memory_type="volume",
            chapter_start=chapter_start,
            chapter_end=chapter_end,
            plot_progression=summary_data.get("plot_progression", ""),
            character_states=summary_data.get("character_states"),
            relationship_changes=summary_data.get("relationship_changes"),
            unresolved_threads=summary_data.get("unresolved_threads"),
            world_state_changes=summary_data.get("world_state_changes"),
        )
        db.add(mem)

    await db.commit()
    return summary_data


async def _maybe_auto_compress(novel_id: int, chapter_number: int, model_id: str, db: AsyncSession):
    """在 intel 提取后自动检查是否需要生成卷摘要/弧摘要"""
    # 每30章生成一次卷摘要
    if chapter_number % 30 == 0:
        volume_start = chapter_number - 29
        existing = await db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
                NarrativeMemory.chapter_start == volume_start,
            )
        )
        if not existing.scalar_one_or_none():
            await generate_volume_summary(novel_id, volume_start, chapter_number, model_id, db)

    # 每150章生成一次弧摘要
    if chapter_number % 150 == 0:
        arc_start = chapter_number - 149
        result = await db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
                NarrativeMemory.chapter_start >= arc_start,
                NarrativeMemory.chapter_end <= chapter_number,
            ).order_by(NarrativeMemory.chapter_start)
        )
        volumes = result.scalars().all()
        if volumes:
            summaries_text = "\n\n".join(
                f"第{v.chapter_start}-{v.chapter_end}章:\n{v.plot_progression}"
                for v in volumes
            )
            provider = get_provider(model_id)
            prompt = volume_compressor.build_arc_compress_prompt(summaries_text, arc_start, chapter_number)
            response = await provider.generate_complete(
                messages=[Message(role="user", content=prompt)],
                system_prompt=volume_compressor.SYSTEM_PROMPT,
                config=GenerateConfig(temperature=0.3, max_tokens=2000, stream=False),
            )
            arc_data = _parse_json(response)
            arc_mem = NarrativeMemory(
                novel_id=novel_id,
                memory_type="arc",
                chapter_start=arc_start,
                chapter_end=chapter_number,
                plot_progression=arc_data.get("plot_progression", ""),
                character_states=arc_data.get("character_states"),
                relationship_changes=arc_data.get("relationship_changes"),
                unresolved_threads=arc_data.get("unresolved_threads"),
                world_state_changes=arc_data.get("world_state_changes"),
            )
            db.add(arc_mem)
            await db.commit()

SYSTEM_PROMPT = """你是一位小说一致性审核专家。请仔细比对章节内容与提供的设定参考数据，找出所有不一致之处。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_consistency_prompt(
    chapter_content: str,
    chapter_number: int,
    novel_settings: dict,
    characters: list[dict],
    plot_point: str | None,
    prev_intel: dict | None,
    overdue_foreshadowings: list[dict] | None,
) -> str:
    # 小说设定
    settings_parts = []
    field_labels = {
        "world_setting": "世界观",
        "golden_finger": "金手指",
        "power_system": "力量体系",
        "core_conflict": "核心冲突",
        "protagonist_identity": "主角身份",
    }
    for key, label in field_labels.items():
        val = novel_settings.get(key)
        if val:
            settings_parts.append(f"  {label}: {val}")
    settings_section = "\n".join(settings_parts) if settings_parts else "  （无）"

    # 角色设定卡
    char_parts = []
    for c in characters:
        lines = [f"  【{c['name']}】 {c.get('role', '')}"]
        if c.get("personality_tags"):
            lines.append(f"    性格标签: {', '.join(c['personality_tags'])}")
        if c.get("personality"):
            lines.append(f"    性格: {c['personality']}")
        if c.get("motivation"):
            lines.append(f"    动机: {c['motivation']}")
        if c.get("speech_pattern"):
            lines.append(f"    说话方式: {c['speech_pattern']}")
        if c.get("behavior_rules"):
            rules = c["behavior_rules"]
            for do in rules.get("absolute_do", []):
                lines.append(f"    一定会做: {do}")
            for dont in rules.get("absolute_dont", []):
                lines.append(f"    绝对不做: {dont}")
        if c.get("relationship_masks"):
            for target, attitude in c["relationship_masks"].items():
                lines.append(f"    对{target}: {attitude}")
        if c.get("prev_location"):
            lines.append(f"    上一章位置: {c['prev_location']}")
        if c.get("prev_emotional_state"):
            lines.append(f"    上一章情绪: {c['prev_emotional_state']}")
        char_parts.append("\n".join(lines))
    char_section = "\n\n".join(char_parts) if char_parts else "  （无）"

    # 大纲
    outline_section = f"  本章大纲: {plot_point}" if plot_point else "  （无）"

    # 上一章时间线
    timeline_section = "  （无）"
    if prev_intel and prev_intel.get("timeline_events"):
        tl = [f"  {e['time']}: {e['event']}" for e in prev_intel["timeline_events"] if isinstance(e, dict)]
        if tl:
            timeline_section = "\n".join(tl)

    # 超期伏笔
    fs_section = "  （无）"
    if overdue_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}（应在第{f['expected_resolve_end']}章前回收）" for f in overdue_foreshadowings]
        fs_section = "\n".join(fs_lines)

    return f"""请比对以下第{chapter_number}章内容与参考设定，找出所有不一致之处。

【参考设定】

小说世界观:
{settings_section}

角色设定:
{char_section}

大纲:
{outline_section}

上一章时间线:
{timeline_section}

超期未回收伏笔:
{fs_section}

【第{chapter_number}章内容】
{chapter_content}

请严格按以下 JSON 格式输出：
{{
  "conflicts": [
    {{
      "type": "world_setting/golden_finger/power_system/character_personality/character_speech/character_location/character_motivation/outline_deviation/timeline/foreshadowing_overdue",
      "severity": "high/medium/low",
      "description": "章节中的具体内容描述",
      "reference": "现有设定中的对应内容",
      "suggestion": "建议如何处理（修改章节 或 更新设定）",
      "related_entity": "关联的角色名/伏笔ID/设定字段名"
    }}
  ]
}}

注意：
- 如果没有任何不一致，返回 {{"conflicts": []}}
- severity: high=违反核心世界观/力量体系/金手指, medium=角色言行/大纲偏离, low=时间线/伏笔
- type 必须是上面列出的枚举值之一
- description 引用章节中的原文或具体描述
- reference 引用设定中的原文
- related_entity: 角色冲突填角色名，伏笔冲突填伏笔ID，设定冲突填字段名（world_setting/golden_finger/power_system）
- 仅输出真正的不一致，角色的正常成长变化不算冲突（如动机因剧情转变）"""

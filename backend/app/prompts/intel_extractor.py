SYSTEM_PROMPT = """你是一位小说分析师。请仔细阅读章节内容，提取结构化的章节情报。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_intel_prompt(
    chapter_content: str,
    character_names: list[str],
    active_foreshadowings: list[dict] | None = None,
    character_behavior_rules: dict[str, dict] | None = None,
) -> str:
    chars = "、".join(character_names)

    fs_section = ""
    if active_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}" for f in active_foreshadowings]
        fs_section = f"\n\n当前活跃伏笔（用 id 引用）：\n" + "\n".join(fs_lines)

    rules_section = ""
    if character_behavior_rules:
        rules_lines = ["\n\n角色行为准则（用于一致性检查）："]
        for name, rules in character_behavior_rules.items():
            rules_lines.append(f"  {name}:")
            for do in rules.get("absolute_do", []):
                rules_lines.append(f"    一定会做: {do}")
            for dont in rules.get("absolute_dont", []):
                rules_lines.append(f"    绝对不做: {dont}")
        rules_section = "\n".join(rules_lines)

    consistency_output = ""
    if character_behavior_rules:
        consistency_output = """,
  "character_consistency": [
    {
      "name": "角色名",
      "action": "本章中的具体行为",
      "rule_violated": "违反了哪条行为准则（没有违反则不输出该角色）",
      "severity": "minor/major",
      "suggestion": "如何修正或补充理由"
    }
  ]"""

    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}{fs_section}{rules_section}

【章节内容】
{chapter_content}

请严格按以下 JSON 格式输出：
{{
  "plot_summary": "本章情节摘要，200字以内",
  "character_updates": [
    {{
      "name": "角色名",
      "status_change": "本章中该角色的处境变化",
      "emotional_state": "当前情绪状态",
      "location": "当前位置",
      "motivation_shift": "如果角色动机可能发生变化，在此说明建议（没有变化则留空字符串）"
    }}
  ],
  "relationship_changes": [
    {{
      "char_a": "角色A",
      "char_b": "角色B",
      "change": "关系变化描述",
      "trigger": "触发原因"
    }}
  ],
  "new_foreshadowings": [
    {{
      "description": "新埋设的伏笔描述",
      "type": "短线/中线/长线",
      "expected_resolve_chapter": 0
    }}
  ],
  "resolved_foreshadowings": [
    {{
      "id": 0,
      "description": "回收的伏笔描述"
    }}
  ],
  "suggested_foreshadowings": [
    {{
      "description": "建议新增的伏笔",
      "type": "短线/中线/长线",
      "reason": "建议理由",
      "expected_resolve_chapter": 0
    }}
  ],
  "timeline_events": [
    {{
      "time": "故事内时间",
      "event": "事件描述"
    }}
  ],
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]{consistency_output}
}}

注意：
- resolved_foreshadowings 中请使用活跃伏笔列表中的 id 进行引用
- new_foreshadowings 中 type 为 "短线"(3-5章回收)/"中线"(10-30章)/"长线"(50+章)
- suggested_foreshadowings 仅在有伏笔被回收时才建议新伏笔，否则留空数组
- expected_resolve_chapter 填写预估的回收章节号
- motivation_shift 仅在角色经历重大事件可能导致动机转变时填写
- character_consistency 仅输出有违反行为准则的角色，全部符合则留空数组"""

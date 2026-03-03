SYSTEM_PROMPT = """你是一位小说分析师。请仔细阅读章节内容，提取结构化的章节情报。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_intel_prompt(
    chapter_content: str,
    character_names: list[str],
    active_foreshadowings: list[dict] | None = None,
) -> str:
    chars = "、".join(character_names)

    fs_section = ""
    if active_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}" for f in active_foreshadowings]
        fs_section = f"\n\n当前活跃伏笔（用 id 引用）：\n" + "\n".join(fs_lines)

    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}{fs_section}

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
      "location": "当前位置"
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
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]
}}

注意：
- resolved_foreshadowings 中请使用活跃伏笔列表中的 id 进行引用
- new_foreshadowings 中 type 为 "短线"(3-5章回收)/"中线"(10-30章)/"长线"(50+章)
- suggested_foreshadowings 仅在有伏笔被回收时才建议新伏笔，否则留空数组
- expected_resolve_chapter 填写预估的回收章节号"""

SYSTEM_PROMPT = """你是一位小说分析师。请仔细阅读章节内容，提取结构化的章节情报。
输出必须是严格的 JSON 格式，不要包含其他文字。"""

def build_intel_prompt(chapter_content: str, character_names: list[str]) -> str:
    chars = "、".join(character_names)
    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}

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
  "new_foreshadowings": ["新埋设的伏笔描述1"],
  "resolved_foreshadowings": ["本章解决的伏笔描述1"],
  "timeline_events": [
    {{
      "time": "故事内时间",
      "event": "事件描述"
    }}
  ],
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]
}}"""

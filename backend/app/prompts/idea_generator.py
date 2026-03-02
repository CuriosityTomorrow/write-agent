SYSTEM_PROMPT = """你是一位经验丰富的网络小说策划编辑，擅长根据用户的创意灵感，快速设计出完整的小说框架。
你的输出必须是严格的 JSON 格式，不要包含任何其他文字。"""

def build_idea_prompt(genre: str, creative_idea: str) -> str:
    return f"""请根据以下创作思路，生成一个完整的小说模板设定。

【方向】{genre}
【创作思路】{creative_idea}

请严格按以下 JSON 格式输出：
{{
  "world_setting": {{
    "name": "世界观名称",
    "description": "世界观详细描述，200字以内"
  }},
  "protagonist_identity": "主角身份设定，100字以内",
  "core_conflict": "核心冲突描述，100字以内",
  "golden_finger": "金手指设定，100字以内",
  "antagonist_setting": "反派设定，100字以内",
  "power_system": "力量体系描述，150字以内",
  "core_suspense": "核心悬念，100字以内",
  "story_stage": "故事舞台描述，100字以内",
  "style_tone": "风格基调，50字以内",
  "suggested_titles": ["建议小说名1", "建议小说名2", "建议小说名3"]
}}"""

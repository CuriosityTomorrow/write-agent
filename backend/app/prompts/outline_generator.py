SYSTEM_PROMPT = """你是一位资深网络小说大纲策划师。根据小说设定生成详细的故事大纲。
输出必须是严格的 JSON 格式。"""

def build_outline_prompt(novel_settings: dict, target_chapters: int, blueprint_prompt: str = "") -> str:
    blueprint_section = f"\n【叙事蓝图指导】\n{blueprint_prompt}" if blueprint_prompt else ""

    return f"""请根据以下小说设定，生成一个约 {target_chapters} 章的故事大纲。

【小说设定】
- 类型: {novel_settings.get('genre', '')}
- 世界观: {novel_settings.get('world_setting', '')}
- 主角: {novel_settings.get('protagonist_identity', '')}
- 核心冲突: {novel_settings.get('core_conflict', '')}
- 金手指: {novel_settings.get('golden_finger', '')}
- 反派: {novel_settings.get('antagonist_setting', '')}
- 力量体系: {novel_settings.get('power_system', '')}
- 核心悬念: {novel_settings.get('core_suspense', '')}
- 舞台: {novel_settings.get('story_stage', '')}
- 基调: {novel_settings.get('style_tone', '')}
{blueprint_section}

【节奏规划要求】
- 每6章为一个小周期：3章铺垫 + 2章递进 + 1章高潮
- 每个 plot_point 的章节跨度建议为 10-30 章
- 需要长期铺垫的重大弧线请标注 "event_scale": "major"

请严格按以下 JSON 格式输出：
{{
  "story_background": "故事背景，300字以内",
  "characters": [
    {{
      "name": "角色名",
      "role": "主角/配角/反派",
      "identity": "身份设定",
      "personality": "性格特征（详细描述）",
      "tags": ["标签1", "标签2"],
      "personality_tags": ["核心性格标签1", "核心性格标签2"],
      "motivation": "当前核心动机",
      "behavior_rules": {{
        "absolute_do": ["一定会做的事1", "一定会做的事2"],
        "absolute_dont": ["绝对不做的事1", "绝对不做的事2"]
      }},
      "speech_pattern": "说话风格描述",
      "growth_arc_type": "staircase/spiral/cliff/platform",
      "relationship_masks": {{
        "敌人": "对敌人的态度",
        "盟友": "对盟友的态度"
      }}
    }}
  ],
  "main_plot": "完整故事弧线（起承转合），包含主角成长路径和核心冲突演变，1000字以内",
  "plot_points": [
    {{
      "chapter_range": "第1-10章",
      "title": "阶段标题",
      "summary": "这个阶段的情节概述",
      "key_conflicts": "本阶段的核心冲突",
      "foreshadowing_plan": ["计划埋设的伏笔1", "计划埋设的伏笔2"],
      "event_scale": "normal 或 major",
      "chapter_type_hint": "这个阶段整体偏铺垫/递进/高潮"
    }}
  ],
  "highlights": "作品亮点，200字以内",
  "synopsis": "作品简介，200字以内"
}}"""

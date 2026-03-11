SYSTEM_PROMPT = """你是一位资深网络小说结构分析师，擅长从自由文本大纲中提取结构化数据。
输出必须是严格的 JSON 格式。
如果大纲中未明确提及某些要素，请根据上下文合理推断和补充，不要留空。"""


def build_extraction_prompt(outline_text: str, genre: str, mode: str, target_chapters: int) -> str:
    return f"""请从以下小说大纲文本中提取结构化信息。

【大纲文本】
{outline_text}

【小说基本信息】
- 类型: {genre}
- 模式: {mode}
- 目标章节数: {target_chapters}

【提取要求】
1. 如果大纲中未明确提到某些要素，请根据上下文**合理推断和生成**，不要留空
2. 角色的 behavior_rules、personality_tags、relationship_masks 等字段即使大纲未提及也要根据角色性格推断
3. plot_points 的章节范围要根据目标章节数（{target_chapters}章）合理分配
4. 每个 plot_point 跨度建议 10-30 章
5. 需要长期铺垫的重大弧线请标注 "event_scale": "major"

请严格按以下 JSON 格式输出：
{{
  "story_background": "故事背景，300字以内",
  "main_plot": "完整故事弧线（起承转合），包含主角成长路径和核心冲突演变，1000字以内",
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
      "growth_arc_type": "staircase/spiral/cliff/platform 四选一",
      "relationship_masks": {{
        "某角色名或关系": "对其的态度和表现"
      }}
    }}
  ],
  "plot_points": [
    {{
      "chapter_range": "第1-10章",
      "title": "阶段标题（10字以内）",
      "summary": "这个阶段的情节概述",
      "key_conflicts": "本阶段的核心冲突",
      "foreshadowing_plan": ["计划埋设的伏笔1", "计划埋设的伏笔2"],
      "event_scale": "normal 或 major",
      "chapter_type_hint": "这个阶段整体偏铺垫/递进/高潮"
    }}
  ],
  "synopsis": "作品简介，200字以内",
  "highlights": "作品亮点卖点，200字以内"
}}"""

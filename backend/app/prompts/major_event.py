SYSTEM_PROMPT = """你是一位网络小说策划师。请根据提供的信息完成任务。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_range_summary_prompt(intels_text: str, chapter_start: int, chapter_end: int) -> str:
    return f"""请将以下第{chapter_start}-{chapter_end}章的情报整理为一份简明摘要，帮助作者快速回顾这段剧情。

【要求】：
- summary: 300-500字，按时间顺序叙述主要情节
- key_characters: 这段剧情中活跃的主要角色及其当前状态
- active_threads: 目前正在进行中的悬念和线索

【章节情报】：
{intels_text}

请严格按以下 JSON 格式输出：
{{
  "summary": "情节摘要",
  "key_characters": [{{"name": "角色名", "status": "当前状态"}}],
  "active_threads": ["线索1", "线索2"]
}}"""


def build_major_event_ideas_prompt(range_summary: str, novel_info: str, current_chapter: int) -> str:
    return f"""基于以下小说信息和近期剧情摘要，提出 2-3 个可能的大事件方向。

大事件是需要 20-50 章铺垫、能够推动故事进入新阶段的重大剧情弧线。

【小说信息】
{novel_info}

【近期剧情摘要】
{range_summary}

【当前章节】第{current_chapter}章

请严格按以下 JSON 格式输出：
{{
  "ideas": [
    {{
      "title": "事件标题",
      "description": "事件描述（100-200字）",
      "suggested_chapter_range": "第X-Y章",
      "suggested_buildup_chapters": 30,
      "reasoning": "为什么适合在这个节点引入（50字以内）"
    }}
  ]
}}"""


def build_buildup_plan_prompt(event_title: str, event_description: str, buildup_start: int, target_start: int, target_end: int, novel_info: str) -> str:
    buildup_length = target_start - buildup_start
    return f"""请为以下大事件生成分阶段铺垫计划。

【大事件】{event_title}
【事件描述】{event_description}
【铺垫起始】第{buildup_start}章
【事件爆发】第{target_start}-{target_end}章
【铺垫长度】约{buildup_length}章

【小说信息】
{novel_info}

请将铺垫分为 3-4 个阶段，每个阶段说明：
- 这个阶段应该在哪些章节
- 应该铺垫什么内容
- 应该创建什么伏笔

请严格按以下 JSON 格式输出：
{{
  "buildup_plan": {{
    "阶段名": {{
      "chapters": "第X-Y章",
      "description": "这个阶段应该做什么",
      "foreshadowings": [
        {{
          "description": "伏笔描述",
          "type": "短线/中线/长线"
        }}
      ]
    }}
  }}
}}"""

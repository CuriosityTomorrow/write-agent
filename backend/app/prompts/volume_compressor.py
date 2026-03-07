SYSTEM_PROMPT = """你是一位小说编辑。请将多章情报压缩为一份结构化摘要。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_volume_compress_prompt(intels_text: str, chapter_start: int, chapter_end: int) -> str:
    return f"""请将以下第{chapter_start}-{chapter_end}章的情报压缩为一份卷摘要。

【要求】：
1. plot_progression: 500-800字的情节进展叙述，包含所有关键转折点，按时间顺序
2. character_states: 截至本卷末每个主要角色的状态（包含境界/位置/持有关键物品）
3. relationship_changes: 本卷中发生的所有重要关系变化
4. unresolved_threads: 截至本卷末尚未解决的所有悬念和线索
5. world_state_changes: 世界格局的重要变化（势力消长、地域变化等）

【输入的章节情报】：
{intels_text}

请严格按以下 JSON 格式输出：
{{{{
  "plot_progression": "情节进展叙述",
  "character_states": {{{{
    "角色名": {{{{"境界": "...", "位置": "...", "关键物品": ["..."]}}}}
  }}}},
  "relationship_changes": [
    {{{{"char_a": "角色A", "char_b": "角色B", "change": "关系变化描述"}}}}
  ],
  "unresolved_threads": ["悬念1", "悬念2"],
  "world_state_changes": ["变化1", "变化2"]
}}}}"""


def build_arc_compress_prompt(volume_summaries_text: str, chapter_start: int, chapter_end: int) -> str:
    return f"""请将以下多个卷摘要进一步压缩为一份弧摘要（第{chapter_start}-{chapter_end}章）。

【要求】：
保留最关键的情节转折、角色状态变化和未解决线索。
格式与卷摘要相同，但 plot_progression 控制在 300-500 字。

【输入的卷摘要】：
{volume_summaries_text}

请严格按以下 JSON 格式输出：
{{{{
  "plot_progression": "弧线情节进展",
  "character_states": {{{{"角色名": {{{{"境界": "...", "位置": "...", "关键物品": ["..."]}}}}}}}},
  "relationship_changes": [{{{{"char_a": "...", "char_b": "...", "change": "..."}}}}],
  "unresolved_threads": ["..."],
  "world_state_changes": ["..."]
}}}}"""


def build_global_compress_prompt(arc_summaries_text: str) -> str:
    return f"""请将以下所有弧摘要压缩为一份全书纲要。

【要求】：
保留全书最核心的故事主线和角色发展轨迹。
plot_progression 控制在 500-800 字。

【输入的弧摘要】：
{arc_summaries_text}

请严格按以下 JSON 格式输出：
{{{{
  "plot_progression": "全书纲要",
  "character_states": {{{{"角色名": {{{{"境界": "...", "位置": "...", "关键物品": ["..."]}}}}}}}},
  "relationship_changes": [{{{{"char_a": "...", "char_b": "...", "change": "..."}}}}],
  "unresolved_threads": ["..."],
  "world_state_changes": ["..."]
}}}}"""

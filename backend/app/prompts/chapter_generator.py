SYSTEM_PROMPT_TEMPLATE = """你是一位专业的网络小说作家。请根据提供的上下文信息，生成高质量的章节内容。

要求：
1. 严格遵循角色设定和当前状态
2. 保持与前文的情节连贯性
3. 推进指定的伏笔和冲突
4. 内容需要有适当的场景描写、对话和心理活动
5. 段落格式符合网文排版：段首空两格，对话独立成段
{style_instruction}"""


def build_chapter_prompt(
    novel_info: str,
    character_context: str,
    recent_intel: str,
    foreshadowing_context: str,
    chapter_config: str,
    blueprint_context: str = "",
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
        f"【本章涉及角色】\n{character_context}",
        f"【近期章节情报】\n{recent_intel}",
    ]
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    sections.append(f"【本章要求】\n{chapter_config}")
    sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。")

    return "\n\n".join(sections)

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
    previous_chapters: str = "",
    summary_intel: str = "",
    optional_characters: str = "",
    rewrite_content: str = "",
    rewrite_suggestion: str = "",
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
    ]
    if previous_chapters:
        sections.append(f"【前文原文】\n{previous_chapters}")
    sections.append(f"【本章涉及角色】\n{character_context}")
    if optional_characters:
        sections.append(f"【其他相关角色】\n{optional_characters}")
    if recent_intel:
        sections.append(f"【近期章节情报（第3-5章）】\n{recent_intel}")
    if summary_intel:
        sections.append(f"【早期章节摘要（第6-15章）】\n{summary_intel}")
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    sections.append(f"【本章要求】\n{chapter_config}")

    if rewrite_content and rewrite_suggestion:
        sections.append(f"【当前章节内容（需改写）】\n{rewrite_content}")
        sections.append(f"【修改建议】\n{rewrite_suggestion}")
        sections.append("\n请根据修改建议，在当前章节内容的基础上进行改写。保持整体结构和情节走向，按照建议调整相关内容。直接输出改写后的完整章节（包含章节标题），不要输出任何解释性文字。")
    else:
        sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。")

    return "\n\n".join(sections)

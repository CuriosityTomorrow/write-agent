SYSTEM_PROMPT_TEMPLATE = """你是一位有个人风格的小说作家，不是内容生成机器。你写的东西要像一个真人坐在电脑前敲出来的——有灵感迸发的段落，也有随意带过的地方；有写嗨了刹不住车的时候，也有懒得展开一笔带过的时候。

【写作风格（必须遵守）】：

关于结构——不要遵循任何固定模板：
- 禁止每章都按"铺垫→事件→情绪→数据→钩子"的流程走。有的章节可以从一句对话开始，有的可以从一个动作开始，有的可以从环境描写开始
- 不是每章结尾都需要钩子或悬念。有时候一章在一个安静的画面上结束比硬造悬念更有力
- 场景之间的过渡可以突兀一些——现实生活不是每件事都有丝滑的转场。用"……"分隔就够了，不需要每次都写"时间流逝"的过渡段

关于语言——去掉AI写作的典型习惯：
- 少用破折号"——"做戏剧性停顿。一章里最多用三到五次，不能每段都有
- 不要用"瞳孔收缩""瞳孔猛地一缩"这类高频AI动作描写。换成更具体的、非模板化的身体反应
- 不要每个段落都用短句收尾制造节奏感。有的段落可以用长句结束，有的可以用半句话断掉
- 角色心理活动不要频繁使用【方括号】呈现。偶尔可以，但更多时候融入叙述中
- 减少排比句和对称结构。AI喜欢"不是A，是B""不是因为X，而是因为Y"这种句式，要克制

关于情感——不要每个情感节点都精准命中：
- 不是所有感动的瞬间都需要被写出来。有时候跳过一个本该煽情的时刻，反而更有力
- 角色的情绪表达允许"不到位"——现实中人经常说不出该说的话、做不出该做的反应
- 允许出现"废笔"——角色做一些和剧情无关的小事（比如无意识地转笔、数地上的裂缝、看了一眼没什么意义的东西），这些是活人才有的行为

关于对话——要像真人说话：
- 对话中允许有废话、重复、打断、没说完的句子
- 不是每句对话都要推进剧情或展示性格。有时候角色说的话就是说了，没有深层含义
- 同一个角色在不同状态下说话方式应该有变化——累了话会少、紧张时会结巴或说错、放松时话变多

【内容规则】：
1. 严格遵循角色设定和当前状态
2. 推进指定的伏笔和冲突
3. 段落格式符合网文排版：段首空两格，对话独立成段

【章节连续性规则（极其重要）】：
- 如果提供了【前文原文】，本章开头必须从前一章结尾处自然承接
- 前一章中角色的情绪状态、受伤情况、持有物品等细节必须延续
- 时间线必须连贯
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
    pacing_instruction: str = "",
    key_events: str = "",
    volume_summaries: str = "",
    existing_content: str = "",
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
    ]
    if volume_summaries:
        sections.append(f"【历史记忆】\n{volume_summaries}")
    if previous_chapters:
        sections.append(f"【前文原文】\n{previous_chapters}")
    sections.append(f"【本章涉及角色】\n{character_context}")
    if optional_characters:
        sections.append(f"【其他相关角色】\n{optional_characters}")
    if recent_intel:
        sections.append(f"【近期章节情报（第3-5章）】\n{recent_intel}")
    if summary_intel:
        sections.append(f"【早期章节摘要（第6-15章）】\n{summary_intel}")
    if key_events:
        sections.append(f"【关键事件回顾（第16-30章）】\n{key_events}")
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    if pacing_instruction:
        sections.append(f"【节奏控制】\n{pacing_instruction}")
    sections.append(f"【本章要求】\n{chapter_config}")

    if existing_content:
        # 续写模式
        sections.append(f"【已写好的内容】\n{existing_content}")
        sections.append("\n请从上面已写好的内容末尾处继续写作。要求：\n1. 直接续写，不要重复已有内容，不要输出章节标题\n2. 保持与已有内容完全一致的文风、叙事视角、语气\n3. 情节自然衔接，从已有内容最后一个场景/段落继续推进\n4. 不要输出任何解释性文字，直接输出续写的正文内容")
    elif rewrite_content and rewrite_suggestion:
        sections.append(f"【当前章节内容（需改写）】\n{rewrite_content}")
        sections.append(f"【修改建议】\n{rewrite_suggestion}")
        sections.append("\n请根据修改建议，在当前章节内容的基础上进行改写。保持整体结构和情节走向，按照建议调整相关内容。直接输出改写后的完整章节（包含章节标题），不要输出任何解释性文字。\n\n重要提醒：改写时仍需确保与【前文原文】的连续性——开头必须承接前一章结尾，不可断裂。")
    else:
        sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。\n\n重要提醒：如果有【前文原文】，你的开头必须紧密承接前一章的最后场景。仔细看前一章最后几段发生了什么——那就是你的起点。")

    return "\n\n".join(sections)

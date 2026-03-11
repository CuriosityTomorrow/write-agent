SYSTEM_PROMPT = """你是一位资深网络小说大纲策划师，擅长根据碎片化灵感构建完整的故事大纲。
输出纯文本格式的大纲，不要使用JSON或markdown代码块。"""

GENRE_GUIDANCE = {
    "玄幻": "注意设计力量体系层级、修炼境界划分、宗门/势力格局",
    "仙侠": "注意仙道体系、门派关系、天劫/飞升设定、道心修炼",
    "都市": "注意社会关系网络、商业/权力博弈、身份反转、现实感",
    "科幻": "注意科技设定的自洽性、社会形态、核心科技概念",
    "历史": "注意历史背景考据、朝代特色、权谋与人物命运交织",
    "游戏": "注意游戏机制设计、数值体系、玩家互动、虚实结合",
    "悬疑": "注意悬念层层递进、线索布局、真相反转、逻辑严密",
    "轻小说": "注意角色魅力、轻松幽默、场景感、人设鲜明",
}


def build_outline_from_prompt(genre: str, mode: str, user_prompt: str, suggestion: str = "") -> str:
    genre_hint = GENRE_GUIDANCE.get(genre, "")
    genre_section = f"\n【类型要点】\n{genre_hint}" if genre_hint else ""

    suggestion_section = f"\n【创作方向建议】\n{suggestion}" if suggestion.strip() else ""

    return f"""请根据以下信息，为一部{genre}类型的{mode}网络小说构思一份完整的故事大纲。

【用户灵感/想法】
{user_prompt}
{genre_section}{suggestion_section}

【大纲要求】
1. 800-1500字的纯文本大纲
2. 包含以下要素（自然融入，不要用JSON格式）：
   - 世界观与背景设定
   - 主要角色及其身份、性格、动机
   - 核心冲突与矛盾
   - 主线剧情走向（起承转合）
   - 关键转折点和高潮事件
   - 力量体系或核心设定（如适用）
3. 故事要有吸引力，开头要抓人
4. 角色关系要有张力，冲突要层层递进

请直接输出大纲文本，不要加任何前缀说明或格式标记。"""

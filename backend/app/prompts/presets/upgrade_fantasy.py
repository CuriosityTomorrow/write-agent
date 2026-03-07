from app.prompts.presets.base import BASE_PRESET

CHARACTER_RULES = """【角色行为总则】
- 角色的每一个行动必须能从其"核心性格"和"当前动机"中推导出来
- 如果情节需要角色做出违反"绝对不做"的事，必须有充分铺垫和内心挣扎
- 不同角色的对话必须有辨识度，严格遵循各自的"说话风格"
- 角色面对不同人时，按"对不同人的态度"调整言行
- 宁可让情节慢下来，也不要让角色做出不符合性格的事"""

PRESET = {
    **BASE_PRESET,
    "character_rules": CHARACTER_RULES,
    "system_prompt_addon": CHARACTER_RULES,
}

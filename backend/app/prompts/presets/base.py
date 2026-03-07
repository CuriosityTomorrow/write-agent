BASE_PRESET = {
    "pacing": {
        "cycle_length": 6,
        "cycle_pattern": ["setup", "setup", "setup", "transition", "transition", "climax"],
        "chapter_types": {
            "setup": {
                "main_events": 1,
                "sub_events": 1,
                "scene_changes_max": 1,
                "detail_focus": "世界构建、角色关系、信息铺垫",
                "hook": "引出悬念或新信息，吸引读者继续",
                "description": "铺垫章：节奏舒缓，重在细节和氛围营造",
            },
            "transition": {
                "main_events": 1,
                "sub_events": 1,
                "scene_changes_max": 1,
                "detail_focus": "冲突升级、紧张感递增、角色互动",
                "hook": "制造紧迫感，暗示即将到来的高潮",
                "description": "递进章：节奏加快，冲突逐步升级",
            },
            "climax": {
                "main_events": 2,
                "sub_events": 1,
                "scene_changes_max": 2,
                "detail_focus": "战斗/对决/揭秘的详细过程，角色关键抉择",
                "hook": "战斗结果或重大转折，引出后续影响",
                "description": "高潮章：节奏紧凑，核心冲突爆发",
            },
        },
    },
    "character_rules": "",
    "system_prompt_addon": "",
}

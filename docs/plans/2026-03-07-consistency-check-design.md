# 一致性检查功能设计

## 概述

章节保存/生成完毕后，自动比对章节内容与世界观、角色设定、大纲、时间线、伏笔状态的一致性，输出冲突列表。用户在 ChapterEditor 右侧侧边栏决定哪些需要更新设定、哪些忽略。

## 架构

独立管线，和 intel 提取串联但互不依赖：

```
章节保存/生成完毕
  → extract_chapter_intel()     （现有，不改）
  → check_consistency()          （新增，intel完成后自动触发）
  → 返回冲突列表，前端渲染到侧边栏
```

用户也可以在侧边栏点「刷新」单独重跑。

## 后端

### 新增文件

- `backend/app/prompts/consistency_checker.py` — prompt 模板
- `backend/app/schemas/consistency.py` — 请求/响应 schema

### 修改文件

- `backend/app/models/chapter.py` — ChapterIntel 新增 `consistency_conflicts` JSON 字段
- `backend/app/schemas/chapter.py` — ChapterIntelResponse 加对应字段
- `backend/app/services/writing_engine.py` — 新增 `check_consistency()` 函数
- `backend/app/api/writing.py` — 新增 `POST /novels/{id}/chapters/{cid}/check-consistency` 端点
- `backend/app/api/writing.py` — extract-intel 端点成功后自动调用 check_consistency

### Prompt 设计

`build_consistency_prompt()` 输入的参考数据（~7500 tokens）：

1. **章节原文**
2. **Novel 设定**：world_setting, golden_finger, power_system, core_conflict, protagonist_identity
3. **出场角色完整设定卡**：personality_tags, motivation, behavior_rules, speech_pattern, relationship_masks, current_location（来自上一章 intel）
4. **本章对应的大纲 plot_point**（按章节号匹配）
5. **上一章 intel**：timeline_events + character_updates（连续性比对）
6. **到期/超期伏笔**：expected_resolve_end <= 当前章节号，status 不是已回收

LLM 输出 JSON：

```json
{
  "conflicts": [
    {
      "type": "world_setting | golden_finger | power_system | character_personality | character_speech | character_location | character_motivation | outline_deviation | timeline | foreshadowing_overdue",
      "severity": "high | medium | low",
      "description": "章节中的具体内容",
      "reference": "现有设定的对应内容",
      "suggestion": "建议如何处理",
      "related_entity": "关联的角色名/伏笔ID/设定字段名（可选）"
    }
  ]
}
```

LLM 调用参数：temperature=0.2，max_tokens=3000。

### check_consistency() 逻辑

1. 从 DB 拉：Novel 设定字段、出场角色设定、上一章 intel、大纲 plot_points、超期伏笔
2. 调用 `build_consistency_prompt()` 组装
3. 独立 LLM 调用（不经过 ContextBuilder）
4. 解析 JSON，存入 `ChapterIntel.consistency_conflicts`
5. 返回冲突列表

### API

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/novels/{id}/chapters/{cid}/check-consistency | 单独触发一致性检查 |

extract-intel 端点成功后自动串联调用 check_consistency，前端也可通过上述端点单独刷新。

## 前端

### ChapterEditor 侧边栏新增区块

在现有 intel 区块下方新增「一致性检查」区块。

**分组与排序：**
- 按 severity 排序：🔴 high → 🟡 medium → 🔵 low
- 按 type 归类折叠：同类冲突归到一个可折叠组（如「角色设定冲突 (2)」）
- 无冲突的类别显示 ✅，不展开

**每条冲突的交互：**
- 显示：章节描述 + 现有设定 + 建议
- 两个按钮：「更新设定」和「忽略」

**「更新设定」流程：**
1. 点击后弹确认框，显示当前值和建议值
2. 用户可编辑建议内容
3. 确认后调对应 PUT API
4. 该条冲突标记为已处理

**「忽略」：** 移入底部「已忽略」折叠区（dismissedConflicts Set，同 dismissedSuggestions 模式），可展开反悔。

### type → API 映射

| conflict type | 更新操作 |
|---|---|
| world_setting / power_system / golden_finger | PUT /api/novels/{id} 更新对应字段 |
| character_personality / character_speech / character_location / character_motivation | PUT /api/novels/{id}/characters/{cid} 更新角色卡 |
| outline_deviation | PUT /api/novels/{id}/outline 更新 plot_points |
| timeline | 无自动更新，仅提示 |
| foreshadowing_overdue | 「标记已回收」或「延长窗口」 |

## 不做的事

- 不改 ContextBuilder / 写作上下文
- 不改现有 intel 提取的 prompt 和逻辑
- 不持久化「已忽略」状态到 DB（刷新页面重置）
- 不做多章回溯比对（只比对上一章 intel + 当前设定）

## DB 变更

ChapterIntel 新增字段：
- `consistency_conflicts` JSON nullable — 需手动 ALTER TABLE 或重建 DB

# 分层记忆 + 节奏控制 + 角色驱动 设计文档

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 升级写作引擎，支持 1000+ 章长篇网文的记忆一致性、节奏控制和角色驱动叙事。

**Architecture:** 分层记忆系统（P0-P7 + 二级压缩）解决长篇信息丢失；类型预设 + 六章周期实现节奏控制；角色行为准则 + 一致性检查实现角色驱动叙事。大事件系统通过 plot_point 扩展 + 自动铺垫计划连接节奏与伏笔。

**Tech Stack:** FastAPI, SQLAlchemy async ORM, React, TypeScript

---

## 一、分层记忆系统

### 1.1 问题

当前 ContextBuilder 的记忆覆盖范围：
- N-1 ~ N-2：全文原文（P2）
- N-3 ~ N-5：完整 intel（P4）
- N-6 ~ N-15：plot_summary 一句话（P5）
- N-16 及更早：**完全丢失**

写到第 50 章时前 34 章消失，写到第 500 章前 484 章消失。导致前期设定遗忘、世界观重复引入、前后矛盾。

### 1.2 方案：三层压缩，永不为零

核心思想：**距离越远，压缩越狠，但永不完全丢失。**

写第 1000 章时的完整记忆图：

```
P0:   小说骨架（标题/类型/世界观/主线）                ~500 tokens
P1:   必选角色完整信息                               ~600 tokens
P2:   前2章全文（第998-999章）                       ~2000-6000 tokens
P3:   伏笔系统（活跃伏笔按紧迫度排序）                ~500 tokens
P4:   前3-5章完整intel（第995-997章）                ~1500 tokens
P5:   前6-15章 plot_summary（第985-994章）           ~800 tokens
P5.5: 前16-30章关键事件（第970-984章）               ~400 tokens      ← 新增
P6:   可选角色 + 角色关系                            按预算裁剪
P7a:  最近3个卷摘要（第28-30卷）                     ~3000 tokens     ← 新增
P7b:  远期弧摘要（每5卷压缩为1个）                    ~4000 tokens     ← 新增
P7c:  全书纲要                                      ~800 tokens      ← 新增
```

### 1.3 新增层 P5.5：关键事件

覆盖 N-16 ~ N-30，从 ChapterIntel.plot_summary 取第一句话。

```python
async def _build_key_events(self, novel_id: int, current_chapter_number: int) -> str:
    """P5.5: 前16-30章，每章一个关键事件"""
    # 查 chapter_number 范围: [current-30, current-16)
    # 格式: "第70章: 韩立突破结丹期"
```

~20-30 tokens/章 × 15章 ≈ 400 tokens。

### 1.4 新增层 P7：NarrativeMemory 模型

```python
class NarrativeMemory(Base):
    __tablename__ = "narrative_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))

    memory_type: Mapped[str] = mapped_column(String(20))  # "volume" / "arc" / "global"
    chapter_start: Mapped[int] = mapped_column(Integer)
    chapter_end: Mapped[int] = mapped_column(Integer)

    plot_progression: Mapped[str] = mapped_column(Text)          # 情节进展（500-800字）
    character_states: Mapped[dict | None] = mapped_column(JSON)  # 卷末角色状态快照
    relationship_changes: Mapped[list | None] = mapped_column(JSON)
    unresolved_threads: Mapped[list | None] = mapped_column(JSON)
    world_state_changes: Mapped[list | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

### 1.5 自动压缩触发

```
每30章  → 生成 volume 摘要（30章 intel → 500-800字）
每150章 → 把最老的5个 volume 压缩为1个 arc 摘要
每450章 → 更新 global 全书纲要
```

触发点：`extract_intel()` 完成后调用 `_maybe_generate_volume_summary()`。

### 1.6 Context 加载逻辑

```python
async def _build_volume_summaries(self, novel_id, chapter_number):
    # P7a: 最近3个 volume（memory_type="volume"），按 chapter_end DESC
    # P7b: 所有 arc（memory_type="arc"），按 chapter_start ASC
    # P7c: global（memory_type="global"），最多1条
```

### 1.7 Token 预算分析

| 章节数 | P0-P6 | P7 合计 | 总计 | 32K 预算占比 |
|--------|-------|---------|------|-------------|
| 100章 | ~8,800 | ~3,000 | ~11,800 | 37% |
| 300章 | ~8,800 | ~7,800 | ~16,600 | 52% |
| 500章 | ~8,800 | ~7,800 | ~16,600 | 52% |
| 1000章 | ~8,800 | ~7,800 | ~16,600 | 52% |

P7 有确定上限（~7,800 tokens），不随章节数无限增长。

### 1.8 压缩 Prompt

新建 `prompts/volume_compressor.py`，输入30章的 intel 合集，输出 JSON 格式的摘要。

### 1.9 API 端点

| 端点 | 用途 |
|------|------|
| `POST /api/novels/{id}/generate/volume-summary` | 手动触发指定范围的摘要生成 |
| `PUT /api/novels/{id}/narrative-memories/{mid}` | 编辑摘要 |
| `GET /api/novels/{id}/narrative-memories` | 列出所有摘要 |
| `POST /api/novels/{id}/generate/range-summary` | 指定章节范围生成摘要（也用于大事件创意） |

### 1.10 前端

NovelDetail 新增"卷摘要"tab，展示所有 NarrativeMemory，支持手动编辑和触发生成。

---

## 二、大事件系统

### 2.1 定位

大事件是大纲级概念（plot_point 的扩展），不是伏笔。它决定故事走向，影响多章节奏。

### 2.2 plot_point 结构扩展

```json
{
    "chapter_range": "第90-95章",
    "title": "虚天殿探险",
    "summary": "上古修士遗迹开启，多方势力争夺...",
    "key_conflicts": "...",
    "foreshadowing_plan": ["..."],

    "event_scale": "major",
    "buildup_start_chapter": 61,
    "buildup_plan": {
        "信息植入": {"chapters": "61-70", "description": "通过NPC对话自然引入虚天殿的存在"},
        "悬念升级": {"chapters": "71-78", "description": "开启时间确定，各方势力调动"},
        "主角备战": {"chapters": "79-85", "description": "准备法宝、炼丹、拉拢盟友"},
        "临场紧张": {"chapters": "86-89", "description": "抵达外围，各方汇聚"}
    },
    "status": "铺垫中"
}
```

普通 plot_point 没有 `event_scale` 字段，默认 `"normal"`，向后兼容。

### 2.3 创建流程

1. 用户选择章节范围 → `POST /api/novels/{id}/generate/range-summary` 生成摘要
2. 用户点击"生成大事件建议" → `POST /api/novels/{id}/generate/major-event-ideas` 返回2-3个方向
3. 用户选择/修改/自写 → `POST /api/novels/{id}/major-events` 创建大事件
4. 系统自动生成铺垫计划，创建关联的 Foreshadowing 条目

用户也可跳过1-2步，直接自己创建大事件。

### 2.4 铺垫计划 → Foreshadowing

系统根据 buildup_plan 的每个阶段自动创建 Foreshadowing，走现有伏笔系统注入 prompt。

### 2.5 API 端点

| 端点 | 用途 |
|------|------|
| `POST /api/novels/{id}/generate/major-event-ideas` | 基于摘要生成大事件建议 |
| `POST /api/novels/{id}/major-events` | 创建大事件 + 自动生成铺垫计划 |
| `GET /api/novels/{id}/major-events` | 查看所有大事件 |
| `PUT /api/novels/{id}/major-events/{eid}` | 编辑大事件 |

---

## 三、类型预设架构

### 3.1 设计

按小说类型配置不同的 prompt 预设，当前只实现升级爽文。

```
prompts/presets/
  base.py               # 通用基础规则
  upgrade_fantasy.py     # 升级爽文（PACING + CHARACTER_RULES + HOOK_STRATEGY）
  # 后续扩展: mystery.py, romance.py, slice_of_life.py, ensemble.py
```

### 3.2 加载逻辑

`get_preset(genre)` → 匹配对应预设 → fallback 到 `base.py`

Novel 已有 `genre` 字段，用它匹配。

---

## 四、节奏控制系统

### 4.1 核心参数（升级爽文预设）

```python
PACING = {
    "cycle_length": 6,
    "cycle_pattern": ["setup", "setup", "setup", "transition", "transition", "climax"],
    "chapter_types": {
        "setup": {
            "main_events": 1,
            "sub_events": 1,
            "scene_changes_max": 1,
            "detail_focus": "世界构建、角色关系、信息铺垫",
            "hook": "引出悬念或新信息",
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
}
```

### 4.2 章节类型分配

两层优先级：大事件覆盖 > 六章周期。

```python
def assign_chapter_type(chapter_number, plot_points) -> str:
    # 1. 检查大事件覆盖
    for pp in plot_points:
        if pp.get("event_scale") == "major":
            target_start, target_end = parse_chapter_range(pp["chapter_range"])
            if target_start <= chapter_number <= target_end:
                return "climax"
            if target_start - 5 <= chapter_number < target_start:
                return "transition"
            buildup_start = pp.get("buildup_start_chapter", target_start - 30)
            if buildup_start <= chapter_number < target_start - 5:
                return "setup"

    # 2. 六章周期
    return PACING["cycle_pattern"][(chapter_number - 1) % 6]
```

### 4.3 Prompt 注入

`build_chapter_prompt()` 新增 `pacing_instruction` 参数。`writing_engine.py` 根据章节类型组装节奏指令：

```
【节奏控制】
本章类型：setup（铺垫章：节奏舒缓，重在细节和氛围营造）

写作约束：
- 主要事件：不超过 1 个，每个事件必须充分展开
- 次要事件：不超过 1 个
- 场景切换：最多 1 次
- 细节重点：世界构建、角色关系、信息铺垫
- 章末处理：引出悬念或新信息

⚠️ 宁可把一个事件写深写透，也不要塞太多事件。
   角色的反应、对话、心理活动、环境描写都需要充分展开。
   参考标准：每个主事件至少需要 800-1000 字的篇幅来展开。
```

### 4.4 数据模型变更

Chapter 新增字段：

```python
chapter_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "setup" / "transition" / "climax"，null 时系统自动计算
```

### 4.5 大纲生成时的节奏意识

`build_outline_prompt()` 追加节奏规划要求，让 LLM 生成 plot_points 时考虑节奏分配并标注 `event_scale`。

### 4.6 前端

ChapterEditor 中章节类型显示为下拉选择器，默认由系统自动计算，用户可手动覆盖。

---

## 五、角色驱动叙事

### 5.1 Character 模型扩展

新增 6 个字段：

```python
personality_tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # ["谨慎务实", "冷静理性"]  最多2个核心标签

motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 当前核心动机

behavior_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # {"absolute_do": [...], "absolute_dont": [...]}

speech_pattern: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 说话风格描述

growth_arc_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # "staircase" / "spiral" / "cliff" / "platform"

relationship_masks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # {"敌人": "冷酷计算", "盟友": "合作但保持警惕"}
```

### 5.2 Prompt 注入

`_format_character_full()` 从信息罗列改为行为指令格式，输出核心性格、当前动机、行为准则、说话风格、关系面具。

升级爽文预设中包含 CHARACTER_RULES 总则，注入 SYSTEM_PROMPT：

```
【角色行为总则】
- 角色的每一个行动必须能从其"核心性格"和"当前动机"中推导出来
- 如果情节需要角色做出违反"绝对不做"的事，必须有充分铺垫和内心挣扎
- 不同角色的对话必须有辨识度，严格遵循各自的"说话风格"
- 角色面对不同人时，按"对不同人的态度"调整言行
- 宁可让情节慢下来，也不要让角色做出不符合性格的事
```

### 5.3 角色一致性检查

`intel_extractor.py` 增加 `character_consistency` 输出：

```json
{
    "character_consistency": [
        {
            "name": "韩立",
            "action": "主动暴露修为",
            "rule_violated": "绝不暴露真实修为",
            "severity": "major",
            "suggestion": "补充特殊理由或修改为更隐蔽的方式"
        }
    ]
}
```

调用时将角色的 `behavior_rules` 传入 intel 提取 prompt。

`ChapterIntel` 模型新增 `character_consistency` JSON 字段。

### 5.4 动机演化提醒

`character_updates` 中新增 `motivation_shift` 字段，建议性提醒用户更新角色动机。前端展示给用户决定是否采纳。

### 5.5 角色信息初始来源

扩展 `build_outline_prompt()` 的角色输出格式，让大纲生成时同时输出 personality_tags、motivation、behavior_rules、speech_pattern、growth_arc_type、relationship_masks。

### 5.6 前端

- 角色编辑表单新增 6 个字段的编辑 UI
- ChapterEditor intel 面板新增"角色一致性"卡片，展示警告和建议

---

## 六、变更总览

### 新建文件

| 文件 | 用途 |
|------|------|
| `backend/app/models/narrative_memory.py` | NarrativeMemory 模型 |
| `backend/app/prompts/presets/base.py` | 通用预设基类 |
| `backend/app/prompts/presets/upgrade_fantasy.py` | 升级爽文预设 |
| `backend/app/prompts/volume_compressor.py` | 卷摘要压缩 prompt |
| `backend/app/prompts/major_event.py` | 大事件建议/铺垫计划 prompt |
| `backend/app/api/narrative_memory.py` | 记忆系统 API |
| `backend/app/api/major_events.py` | 大事件 API |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/app/models/character.py` | Character 新增 6 字段 |
| `backend/app/models/chapter.py` | Chapter 新增 chapter_type；ChapterIntel 新增 character_consistency |
| `backend/app/models/__init__.py` | 导出 NarrativeMemory |
| `backend/app/services/memory_system.py` | 新增 P5.5、P7 层；_build_key_events、_build_volume_summaries |
| `backend/app/services/writing_engine.py` | 节奏指令组装；卷摘要自动触发；大事件相关 |
| `backend/app/prompts/chapter_generator.py` | 新增 pacing_instruction 参数；角色行为指令格式 |
| `backend/app/prompts/outline_generator.py` | 节奏规划要求；角色驱动字段输出 |
| `backend/app/prompts/intel_extractor.py` | 角色一致性检查；motivation_shift |
| `backend/app/main.py` | 注册新路由 |
| `frontend/src/services/api.ts` | 新 API 调用 |
| `frontend/src/pages/NovelDetail.tsx` | 卷摘要 tab；大事件管理 |
| `frontend/src/pages/ChapterEditor.tsx` | 章节类型选择器；角色一致性卡片 |
| `frontend/src/pages/CreateWizard.tsx` | 角色创建表单扩展 |

# 记忆系统重构 + 伏笔优先级系统设计

> 日期：2026-03-03

## 问题

当前记忆系统 (`memory_system.py`) 仅传递前 1-2 章的情报摘要给 LLM，不读原文，导致章节间连续性不足。伏笔缺乏管理机制，无计划回收策略。

## 设计目标

1. 增强章节连续性：前 1-2 章读原文，更远章节分级传递情报
2. 伏笔智能管理：基于紧迫度的分级行动指示 + 自动回收识别
3. Token 预算自适应：根据模型 max_context 动态分配，128K+ 模型下基本不截断

---

## 一、分层记忆架构

### 上下文组装优先级

```
总预算 = max_context * 25%（硬上限兜底，128K+ 模型下通常不会触发）

P0 - 小说骨架（必须保留）
    大纲 main_plot（完整）、story_background、世界观、核心冲突、力量体系

P1 - 本章配置（必须保留）
    章纲、冲突描述、目标字数、必选角色完整档案

P2 - 前1-2章原文
    完整章节内容（含标题），超预算时从最早章节开始截取

P3 - 伏笔系统
    所有活跃伏笔，按紧迫度排序，附带行动指示

P4 - 前3-5章完整情报
    plot_summary + character_updates + relationship_changes + timeline_events

P5 - 前6-15章情节摘要
    仅 plot_summary（一行一章）

P6 - 可选角色 + 角色关系
    可选角色简要信息、角色间关系
```

截断策略：从 P6 开始丢弃，逐层向上。正常场景（前 20 章以内）基本不触发。

### token 估算方法

中文字符按 1字 ≈ 0.7 token 估算（简单 `len(text) * 0.7`），不引入 tiktoken 依赖。

### build_context 接口变更

```python
async def build_context(
    self,
    novel_id: int,
    chapter_number: int,
    required_char_ids: list[int],
    optional_char_ids: list[int],
    foreshadowing_ids: list[int] | None = None,
    max_context_tokens: int = 128000,  # 新增：模型的 max_context
) -> dict:
```

返回值新增 `"previous_chapters"` 键（前 1-2 章原文），伏笔上下文增强为带行动指示的结构。

---

## 二、伏笔优先级系统

### 2.1 Foreshadowing 模型扩展

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `foreshadowing_type` | String(10) | "短线" / "中线" / "长线" |
| `expected_resolve_start` | Integer, nullable | 预期最早回收章节 |
| `expected_resolve_end` | Integer, nullable | 预期最晚回收章节 |

### 2.2 紧迫度计算

```
当前章节 = N, 伏笔预期范围 = [start, end]

无预期范围（长线）  → "潜伏"：仅列出描述
N < start - 5      → "潜伏"：仅列出描述
start-5 ≤ N < start → "铺垫"：「请自然提及此伏笔相关细节，保持读者记忆」
start ≤ N ≤ end     → "可回收"：「如剧情合适，可以回收此伏笔」
N > end             → "紧急"：「此伏笔已超期，请在本章回收」
```

### 2.3 伏笔上下文格式（传给 LLM）

```
【伏笔追踪】
[紧急回收] #3 主角师父的真实身份（埋设于第2章，已超期）
  → 请在本章回收此伏笔
[可回收] #5 上古遗迹入口线索（埋设于第5章，预期第10-15章回收）
  → 如剧情合适，可以回收此伏笔
[铺垫] #7 神秘黑衣人的目的（埋设于第8章，预期第20-25章回收）
  → 请自然提及此伏笔相关细节，保持读者记忆
[潜伏] #9 主角血脉觉醒的预兆（埋设于第3章，长线伏笔）
```

### 2.4 自动回收识别

增强 `intel_extractor` prompt，要求 LLM 输出伏笔编号：

```json
"resolved_foreshadowings": [
  {"id": 3, "description": "主角师父的真实身份被揭示"}
]
```

`extract_chapter_intel` 处理时：根据 id 直接匹配，更新 `status="已回收"`, `resolved_chapter_id=当前章节号`。

### 2.5 伏笔来源

**来源 1：AI 自动提取（intel 提取时）**

增强 intel_extractor prompt，新伏笔输出结构化数据：

```json
"new_foreshadowings": [
  {
    "description": "主角伤疤突然发出微光",
    "type": "中线",
    "expected_resolve_chapter": 15
  }
]
```

后端自动计算 `expected_resolve_start/end`：
- 短线：chapter ± 1
- 中线：chapter ± 5
- 长线：不设范围

**来源 2：用户手动创建**

前端伏笔创建表单增加「类型」下拉和「预期回收章节」输入。

### 2.6 伏笔自动补充（建议机制）

当 intel 提取发现本章有伏笔被回收时，额外让 LLM 建议新伏笔：

```json
"suggested_foreshadowings": [
  {
    "description": "建议的新伏笔",
    "type": "中线",
    "reason": "因为刚回收了师父身份伏笔，可以延伸出新的身世之谜",
    "expected_resolve_chapter": 25
  }
]
```

- 建议存储在 `ChapterIntel.suggested_foreshadowings` JSON 字段中
- **不自动创建**为正式伏笔
- 前端情报面板中展示，用户可「采纳」或「忽略」
- 采纳后写入 `foreshadowings` 表，status="埋设"
- 此功能可通过开关控制（默认开启）

---

## 三、大纲增强

### 3.1 outline_generator prompt 调整

- `main_plot` 扩展为 1000 字上限，要求包含完整故事弧线（起承转合），明确主角成长路径和核心冲突演变
- `plot_points` 每个元素增加字段：

```json
{
  "chapter_range": "第1-5章",
  "title": "初入宗门",
  "summary": "主角拜入青云宗...",
  "key_conflicts": "与内门弟子的资源争夺",
  "foreshadowing_plan": ["埋设师父身份之谜", "暗示上古遗迹线索"]
}
```

### 3.2 ContextBuilder P0 层

始终完整传入 `main_plot`（不截断），让每一章都能参考全局故事弧线。

---

## 四、涉及的文件变更

### 后端

| 文件 | 变更 |
|------|------|
| `models/foreshadowing.py` | 新增 foreshadowing_type, expected_resolve_start, expected_resolve_end 字段 |
| `models/chapter.py` | ChapterIntel 新增 suggested_foreshadowings JSON 字段 |
| `schemas/style.py` | ForeshadowingCreate/Update schema 增加新字段 |
| `services/memory_system.py` | 重写 ContextBuilder：分层架构、token 预算、前章原文读取 |
| `services/writing_engine.py` | generate_chapter_stream 传入 max_context；extract_chapter_intel 增强伏笔匹配和建议 |
| `prompts/intel_extractor.py` | 增强 prompt：结构化伏笔输出 + 建议伏笔 |
| `prompts/outline_generator.py` | 增强 prompt：main_plot 扩展 + plot_points 增加冲突和伏笔计划 |
| `prompts/chapter_generator.py` | 增加前章原文区块 |
| `api/writing.py` | generate endpoint 接收 max_context 参数 |
| `api/chapters.py` | 伏笔 CRUD 增加新字段，新增「采纳建议伏笔」endpoint |

### 前端

| 文件 | 变更 |
|------|------|
| `pages/ChapterEditor.tsx` | 情报面板增加「建议伏笔」区域（采纳/忽略按钮） |
| `pages/NovelDetail.tsx` | 伏笔列表增加类型标签和紧迫度状态显示；伏笔创建/编辑表单增加新字段 |
| `services/api.ts` | 新增采纳伏笔 API 调用 |

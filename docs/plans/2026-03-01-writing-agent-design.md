# 写作 Agent 系统设计文档

> 日期: 2026-03-01
> 状态: 设计确认，待实施

## 1. 项目概述

一个面向中文网络小说创作的 AI 写作 Agent，支持长篇/短篇模式，内置记忆系统保证长篇连贯性，可学习模仿作者文风和叙事架构，支持多大模型切换，最终支持一键发布到主流小说平台。

## 2. 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 产品形态 | Web 应用 (前后端分离) | 多设备访问、协作方便 |
| 前端 | React + TypeScript | 团队熟悉，生态成熟 |
| 后端 | Python + FastAPI | 团队熟悉，AI 生态最好 |
| 数据库 | MySQL (Docker) | 团队熟悉，轻量部署 |
| 向量数据库 | Chroma (Phase 2) | Phase 2 RAG 时引入 |
| 模型支持 | 8 个 (可扩展) | 千问/DeepSeek/智谱/MiniMax/Gemini/Claude/GPT/Grok |
| 记忆策略 | 结构化 + RAG (分阶段) | Phase 1 结构化，Phase 2 加 RAG |

## 3. 系统架构

```
┌───────────────────────────────────────────────────────┐
│                     React 前端                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐│
│  │小说列表│ │创建向导│ │大纲编辑│ │章节编辑│ │文风库 │ │阅读 ││
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────┘│
└────────────────────────┬──────────────────────────────┘
                         │ REST API + SSE (流式输出)
┌────────────────────────┴──────────────────────────────┐
│                    FastAPI 后端                          │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │              LLM Adapter Layer                     │ │
│  │  统一接口，适配 8+ 模型 Provider                    │ │
│  │  (OpenAI 兼容类可复用基类，实际写 4 种适配器)       │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌────────────────┐  ┌─────────────────────────────┐   │
│  │  写作引擎       │  │  记忆系统                     │   │
│  │  (Pipeline)    │  │  ├─ 角色状态管理               │   │
│  │  ├─ 创意生成    │  │  ├─ 情节时间线                │   │
│  │  ├─ 大纲生成    │  │  ├─ 伏笔追踪                 │   │
│  │  ├─ 章节生成    │  │  ├─ 章节情报                  │   │
│  │  └─ 内容优化    │  │  ├─ Context Builder           │   │
│  └────────────────┘  │  └─ (Phase2) RAG 检索         │   │
│                       └─────────────────────────────┘   │
│  ┌────────────────┐  ┌─────────────────────────────┐   │
│  │  文风系统       │  │  导出/发布系统                 │   │
│  │  ├─ 叙事蓝图库  │  │  ├─ 导出 TXT/DOCX            │   │
│  │  ├─ 文笔风格库  │  │  └─ 平台适配器 (预留)         │   │
│  │  ├─ 小说解析器  │  └─────────────────────────────┘   │
│  │  └─ 风格提取器  │                                     │
│  └────────────────┘                                     │
└────────────────────────┬──────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │  MySQL + (Chroma)   │
              └─────────────────────┘
```

## 4. 数据模型

### 4.1 Novel (小说)

```
Novel
├─ id (PK)
├─ title               -- 小说名称
├─ author_name          -- 作者名称
├─ genre                -- 男频/女频
├─ mode                 -- 长篇/短篇
├─ status               -- 创作中/已完结
├─ cover_url            -- 封面图 URL
├─ synopsis             -- 简介
├─ highlights           -- 亮点
├─ world_setting        -- 世界观设定 (JSON)
├─ core_conflict        -- 核心冲突
├─ protagonist_identity -- 主角身份
├─ golden_finger        -- 金手指设定
├─ antagonist_setting   -- 反派设定
├─ power_system         -- 力量体系
├─ core_suspense        -- 核心悬念
├─ story_stage          -- 故事舞台
├─ style_tone           -- 风格基调
├─ target_chapters      -- 目标章节数
├─ selected_style_id    -- FK → WritingStyle
├─ selected_blueprint_id -- FK → NarrativeBlueprint
├─ created_at
└─ updated_at
```

### 4.2 Character (角色)

```
Character
├─ id (PK)
├─ novel_id (FK → Novel)
├─ name                 -- 角色名
├─ role                 -- 主角/配角/反派
├─ tags[]               -- 标签 (JSON array)
├─ identity             -- 身份设定
├─ personality           -- 性格设定
├─ golden_finger         -- 金手指 (如有)
├─ background            -- 背景故事
├─ current_status        -- 当前处境 (每章后更新)
├─ current_location      -- 当前位置
├─ emotional_state       -- 当前情绪状态
└─ created_at
```

### 4.3 CharacterRelationship (角色关系)

```
CharacterRelationship
├─ id (PK)
├─ novel_id (FK → Novel)
├─ character_a_id (FK → Character)
├─ character_b_id (FK → Character)
├─ relation_type         -- 盟友/敌对/暧昧/师徒/亲属/...
├─ description           -- 关系描述
├─ established_chapter_id -- 建立/变化的章节
└─ updated_at
```

### 4.4 Outline (大纲)

```
Outline
├─ id (PK)
├─ novel_id (FK → Novel)
├─ story_background      -- 故事背景
├─ main_plot             -- 主要情节
├─ plot_points           -- 情节节点列表 (JSON array)
└─ updated_at
```

### 4.5 Chapter (章节)

```
Chapter
├─ id (PK)
├─ novel_id (FK → Novel)
├─ chapter_number        -- 章节序号
├─ title                 -- 章节标题
├─ content               -- 正文内容 (TEXT)
├─ chapter_outline       -- 章纲
├─ target_word_count     -- 目标字数
├─ actual_word_count     -- 实际字数
├─ status                -- 草稿/已完成/已发布
├─ conflict_description  -- 本章人物冲突描述
├─ created_at
└─ updated_at
```

### 4.6 ChapterCharacter (章节-角色关联)

```
ChapterCharacter
├─ id (PK)
├─ chapter_id (FK → Chapter)
├─ character_id (FK → Character)
├─ is_required           -- 必选/可选
└─ role_in_chapter       -- 本章中的作用描述
```

### 4.7 ChapterIntel (章节情报)

每章写完后由 LLM 自动生成，是记忆系统的核心数据。

```
ChapterIntel
├─ id (PK)
├─ chapter_id (FK → Chapter)
├─ plot_summary               -- 情节摘要
├─ character_updates          -- 各角色状态更新 (JSON)
│   [{character_id, status_change, emotional_state, location}]
├─ relationship_changes       -- 关系变化 (JSON)
│   [{char_a, char_b, change, trigger}]
├─ new_foreshadowings         -- 新埋设的伏笔 (JSON array)
├─ resolved_foreshadowings    -- 本章解决的伏笔 (JSON array)
├─ timeline_events            -- 时间线事件 (JSON)
│   [{time, event}]
├─ next_chapter_required_chars -- 下章必现角色 (JSON array)
└─ created_at
```

### 4.8 Foreshadowing (伏笔)

```
Foreshadowing
├─ id (PK)
├─ novel_id (FK → Novel)
├─ description           -- 伏笔描述
├─ created_chapter_id    -- 埋设章节
├─ status                -- 埋设/推进中/已解决
├─ resolved_chapter_id   -- 解决章节 (nullable)
├─ progress_notes        -- 推进记录 (JSON array)
└─ created_at
```

### 4.9 NarrativeBlueprint (叙事蓝图) — 新增

```
NarrativeBlueprint
├─ id (PK)
├─ name                  -- "唐三式热血冒险" / "猫腻式权谋布局"
├─ category              -- 升级流/谋略流/热血冒险/悬疑暗线/...
├─ source_authors        -- 参考作者 (JSON array)
├─ source_works          -- 参考作品 (JSON array)
│
├─ opening_pattern       -- 开局模式 (JSON)
│   {type, description, examples}
│
├─ character_archetypes  -- 角色原型配置 (JSON)
│   {protagonist_template, companion_templates[],
│    antagonist_progression, recurring_roles[]}
│
├─ plot_cycle            -- 情节循环 (JSON)
│   {cycle_steps[], cycle_length_chapters}
│   例: ["遭遇困境","获得机缘","修炼突破","打脸对手","转场新地图"]
│
├─ stage_progression     -- 舞台升级链 (JSON array)
│   例: ["学院","城市","王国","大陆","高位面"]
│
├─ pacing                -- 节奏配置 (JSON)
│   {words_per_chapter, mini_climax_interval,
│    major_climax_positions[], satisfaction_density,
│    ending_pattern}
│
├─ foreshadowing_rhythm  -- 伏笔节奏 (JSON)
│   {short_term_span, long_term_span, density}
│
├─ generated_prompt      -- 生成的指导 prompt
├─ is_system             -- 是否系统预置
├─ created_at
└─ updated_at
```

### 4.10 WritingStyle (文笔风格)

```
WritingStyle
├─ id (PK)
├─ name                  -- "猫腻式大气磅礴"
├─ source_author         -- 参考作者
├─ source_work           -- 参考作品
│
├─ dimensions            -- 风格维度 (JSON)
│   {sentence_pattern:    {label, score, examples[]},
│    narrative_perspective: {label, score},
│    dialogue_style:       {label, score},
│    rhythm:               {label, score},
│    rhetoric:             {label, score},
│    atmosphere:           {label, score},
│    tone:                 {label, score}}
│
├─ sample_excerpts       -- 典型段落 (JSON array)
│   [{type: "对话"/"打斗"/"心理描写", text: "..."}]
│
├─ generated_prompt      -- 生成的 system prompt
├─ is_system             -- 是否系统预置
├─ created_at
└─ updated_at
```

### 4.11 StyleLibrary (文库)

```
StyleLibrary
├─ id (PK)
├─ title                 -- 上传小说标题
├─ author                -- 原作者
├─ file_path             -- 文件存储路径
├─ file_type             -- txt/epub
├─ total_words           -- 总字数
├─ total_chapters        -- 总章节数
├─ analysis_status       -- 未分析/分析中/已完成
├─ extracted_style_ids   -- 提取的文笔风格 (JSON array of IDs)
├─ extracted_blueprint_ids -- 提取的叙事蓝图 (JSON array of IDs)
├─ created_at
└─ updated_at
```

## 5. 记忆系统设计

### 5.1 核心问题

长篇小说可能有几百章，总文本量远超任何模型的上下文窗口。记忆系统需要在有限的 token 预算内，确保情节逻辑一致、文风一致、角色设定一致、世界观一致。

### 5.2 Context Builder 工作流

写第 N 章时，Context Builder 按以下步骤组装 prompt：

**Step 1: 固定上下文 (必定包含)**
- 世界观设定 (Novel.world_setting)
- 核心冲突 & 力量体系
- 全局大纲摘要
- 文笔风格 system prompt (WritingStyle.generated_prompt)
- 叙事蓝图指导 (NarrativeBlueprint.generated_prompt)

**Step 2: 角色上下文 (按本章配置)**
- 必选角色的完整角色卡 + current_status
- 可选角色的简要信息
- 本章涉及角色之间的关系网
- 上一章 ChapterIntel 的 next_chapter_required_chars

**Step 3: 情节上下文 (智能选择)**
- 前 1-2 章的完整 ChapterIntel (最近记忆)
- 前 3-5 章的情节摘要 (短期记忆)
- 更早章节中与本章相关的关键事件 (长期记忆)
- 全局情节时间线概要

**Step 4: 叙事蓝图上下文 (新增)**
- 当前处于情节循环的哪个阶段
- 距离下一个大高潮还有多少章
- 当前舞台级别，何时该升级
- 爽点分布检查：最近 N 章的爽点密度是否合理

**Step 5: 伏笔上下文**
- 本章需推进的伏笔 (用户选定)
- 所有 status=埋设/推进中 的伏笔列表

**Step 6: 本章专属上下文**
- 章纲 (chapter_outline)
- 人物冲突描述 (conflict_description)
- 目标字数

**Step 7: Token 预算管理**

| Context 分区 | 优先级 | 预算比例 |
|-------------|--------|---------|
| System Prompt (文风+叙事蓝图) | 最高 | 10-15% |
| 角色设定 + 当前状态 | 高 | 15-20% |
| 近期章节情报 (前2章) | 高 | 15-20% |
| 伏笔追踪 | 高 | 5-10% |
| 本章配置 (章纲/冲突/字数) | 高 | 5-10% |
| 叙事蓝图指导 (循环阶段/高潮节奏) | 中 | 5-10% |
| 中期章节摘要 (前3-5章) | 中 | 10-15% |
| 全局大纲 + 时间线 | 中 | 5-10% |
| RAG 检索原文 (Phase 2) | 低 | 剩余空间 |
| 生成预留空间 | - | 20-30% |

超出模型上下文窗口时，智能压缩策略：
1. 优先压缩远期章节摘要
2. 保留近期章节详细信息
3. 角色设定和伏笔永远不压缩

### 5.3 章节情报自动生成

每章写完后，系统调用 LLM 分析生成内容，提取 ChapterIntel：

```json
{
    "character_updates": [
        {
            "character_id": "xxx",
            "status_change": "发现了密码的第一段碎片，开始怀疑张薇",
            "emotional_state": "警觉、紧张",
            "location": "学校废弃实验楼"
        }
    ],
    "relationship_changes": [
        {
            "char_a": "陆明远",
            "char_b": "张薇",
            "change": "从信任变为怀疑",
            "trigger": "发现张薇在偷看密码笔记"
        }
    ],
    "new_foreshadowings": ["实验楼墙壁上的神秘符号"],
    "resolved_foreshadowings": [],
    "plot_summary": "陆明远在废弃实验楼找到第一段密码碎片...",
    "next_chapter_required_chars": ["陆明远", "张薇", "李教授"],
    "timeline_events": [
        {"time": "重生第2天上午", "event": "发现密码碎片"}
    ]
}
```

生成后自动：
- 更新各角色的 current_status / current_location / emotional_state
- 更新 CharacterRelationship (如有变化)
- 创建新的 Foreshadowing 记录 (如有新伏笔)
- 标记已解决的 Foreshadowing

### 5.4 长篇 vs 短篇模式差异

| 维度 | 长篇模式 | 短篇模式 |
|------|---------|---------|
| 章节数 | 几十到几百章 | 1-10 章 |
| 记忆系统 | 完整启用 | 简化版，可不启用伏笔追踪 |
| 大纲 | 详细多层级大纲 | 简要大纲或直接写 |
| 角色管理 | 完整角色卡 + 状态追踪 | 基础角色设定 |
| Context Builder | 多级压缩 + 智能检索 | 可直接塞全文 |
| 叙事蓝图 | 完整启用 | 可选启用 |

## 6. 文风系统设计 (两层架构)

### 6.1 架构概览

```
文风系统 = Layer 1 (叙事蓝图) + Layer 2 (文笔风格)

Layer 1: NarrativeBlueprint — "怎么编故事"
├─ 开局模式 (废柴逆袭/天才隐藏/重生觉醒/...)
├─ 角色原型 (固定配角模式、反派递进链)
├─ 情节循环 (受辱→机缘→突破→打脸→转场)
├─ 舞台升级 (学院→城市→王国→大陆→星域)
├─ 高潮分布 / 爽点密度 / 伏笔节奏
└─ 结尾模式

Layer 2: WritingStyle — "怎么写句子"
├─ 句式特征 / 叙事视角 / 对话风格
├─ 节奏 / 修辞 / 氛围 / 基调
└─ 典型段落示例

两层可自由混搭:
  叙事蓝图用唐三的 "热血冒险+舞台升级"
  + 文笔风格用猫腻的 "白描+黑色幽默"
  = 独特组合
```

### 6.2 文风提取 Pipeline

```
用户上传小说文件 (TXT/EPUB)
       │
       ▼
  文件解析器 → 分章节、清洗格式、统计字数
       │
       ▼
  采样选取:
  ├─ 开头 2 章 (文风建立期)
  ├─ 中间随机 3-5 章 (稳定文风)
  └─ 高潮章节 1-2 章 (情绪高峰)
       │
       ▼
  LLM 分析 (并行两个任务):
  ├─ Task A: 提取文笔风格 → WritingStyle
  └─ Task B: 提取叙事架构 → NarrativeBlueprint
       │
       ▼
  存入风格库 → 用户可浏览、选择、组合
```

### 6.3 风格组合选择 (前端交互)

创作时的风格配置界面：

```
叙事蓝图: [唐三式热血冒险 ▼]  ← 选一个或自定义
  - 开局模式: 废柴逆袭
  - 情节循环: 困境→机缘→突破→打脸→转场
  - 舞台升级: 学院 → 城市 → 帝国 → 大陆

文笔风格: [猫腻式大气磅礴 ▼]  ← 选一个或自定义
  微调各维度:
  - 句式: ████████░░ 0.8
  - 对话: █████████░ 0.9
  - 节奏: ██████░░░░ 0.6
```

### 6.4 可迭代设计

- 每上传一本新小说，风格库自动丰富
- 同一作者的多部作品可以合并分析，提取出更准确的"作者签名"
- 系统预置若干经典叙事蓝图 (基于研究报告)
- 用户可手动创建/编辑叙事蓝图和文笔风格

## 7. LLM Adapter Layer

### 7.1 统一接口

```python
class LLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: list[Message],
        system_prompt: str,
        config: GenerateConfig
    ) -> AsyncGenerator[str, None]:
        """流式生成"""
        ...

    @abstractmethod
    def count_tokens(self, text: str) -> int:
        """Token 计数"""
        ...

    @abstractmethod
    def max_context_length(self) -> int:
        """模型最大上下文长度"""
        ...

    @abstractmethod
    def model_name(self) -> str:
        ...
```

### 7.2 适配器实现

| 模型 | API 格式 | 适配器 |
|------|---------|--------|
| DeepSeek | OpenAI 兼容 | OpenAICompatibleProvider |
| 千问 (Qwen) | OpenAI 兼容 (DashScope) | OpenAICompatibleProvider |
| Grok | OpenAI 兼容 (xAI) | OpenAICompatibleProvider |
| GPT | OpenAI 原生 | OpenAICompatibleProvider |
| 智谱 (GLM) | 自有 SDK | ZhipuProvider |
| MiniMax | 自有 API | MiniMaxProvider |
| Gemini | Google SDK | GeminiProvider |
| Claude | Anthropic SDK | ClaudeProvider |

实际只需 4 种适配器：OpenAICompatible / Zhipu / MiniMax / Gemini / Claude。

### 7.3 配置管理

用户在前端设置各模型的 API Key，存储在后端（加密）。可为不同任务指定不同模型：
- 章节生成: Gemini 3.1 Pro (写作能力强)
- 情报提取: 较便宜的模型即可
- 风格分析: 需要分析能力强的模型

## 8. 写作引擎 Pipeline

### 8.1 Pipeline 节点

```
1. IdeaGenerator (创意生成)
   Input:  用户创作思路 + 男频/女频
   Output: 智能模板 (世界观/主角/冲突/金手指/反派/力量体系/悬念/舞台/基调)

2. OutlineGenerator (大纲生成)
   Input:  智能模板 + 章节数 + 叙事蓝图
   Output: 故事背景 + 角色设定 + 主要情节 + 亮点简介

3. ChapterGenerator (章节生成) ← 核心
   Input:  Context Builder 组装的完整 context + 本章配置
   Output: 章节标题 + 正文内容

4. IntelExtractor (情报提取)
   Input:  生成的章节内容 + 角色列表
   Output: ChapterIntel

5. ContentRefiner (内容优化) - 可选
   Input:  生成内容 + 优化指令
   Output: 优化后的内容
```

### 8.2 每步支持

- 重新生成 (全部或部分)
- 手动修改后继续
- 选择不同模型重新生成对比

## 9. 前端页面规划

### 9.1 页面列表

1. **小说列表页** - 所有小说卡片展示，搜索/筛选
2. **创建向导页** - 步骤式引导 (对应需求 1-6 步)
3. **大纲编辑页** - 故事背景/角色/情节的编辑和管理
4. **章节编辑页** - 章节配置 + 内容生成 + 情报查看
5. **阅读预览页** - 独立页面，网文排版格式预览全文
6. **文风库页** - 管理叙事蓝图和文笔风格
7. **文库页** - 上传小说、查看分析状态
8. **设置页** - 模型配置、API Key 管理

### 9.2 创建向导流程 (对应需求 1-6)

```
Step 1: 选择方向 → 男频/女频
Step 2: 输入创作思路
Step 3: AI 生成智能模板 → 可修改各项设定
Step 4: 输入作品信息 (作者名/小说名)
Step 5: 生成封面 (AI生成/系统封面/上传)
Step 6: 生成大纲
  6.1 设置章节数
  6.2 AI 生成故事背景 → 可修改
  6.3 AI 生成角色设定 → 可修改/新增
  6.4 AI 生成主要情节 → 可修改
  6.5 AI 生成亮点&简介 → 可修改
```

### 9.3 章节编辑流程 (对应需求 7-12)

```
Step 7: 配置章节角色
  - 必选角色 (上章情报自动推荐)
  - 可选角色
  7.1 输入人物关系冲突
Step 8: 配置章节伏笔 (可跳过)
Step 9: 输入目标字数
Step 10: 生成章节内容 (含标题)
Step 11: 自动输出章节情报
  - 各角色当前处境及进展
  - 角色关系变化
  - 下章必现角色
Step 12: 最终预览 → 可重新生成/修改章纲
```

## 10. 导出/发布系统

### Phase 1: 导出

- 支持导出格式：TXT、DOCX
- 网文排版格式：章节标题居中、段首缩进两格、对话分行
- 支持导出单章/多章/全文

### Phase 2: 平台发布 (待研究报告确认)

- 预留 Publisher 接口
- 各平台适配器实现
- 参考 research/chinese-novel-platforms.md 决定优先级

## 11. 分阶段实施计划

### Phase 1: 核心写作能力 (MVP)

- 后端框架搭建 (FastAPI + MySQL)
- LLM Adapter Layer (先接 2-3 个模型)
- 基础数据模型
- 创建向导流程
- 大纲生成
- 章节生成 + 结构化记忆系统
- 章节情报自动提取
- 前端基础页面
- TXT 导出

### Phase 2: 文风系统

- 文库上传 + 解析
- 文笔风格提取
- 叙事蓝图提取
- 风格库管理界面
- 预置经典叙事蓝图

### Phase 3: 增强能力

- 全部 8 个模型适配
- RAG 检索 (Chroma)
- 封面生成 (接图像模型)
- DOCX 导出
- 内容优化/重写功能

### Phase 4: 平台发布

- 根据研究报告确定目标平台
- 实现平台发布适配器
- 一键多平台发布

## 12. 项目结构 (预览)

```
write-agent/
├─ docs/
│   └─ plans/              -- 设计文档
├─ research/               -- 研究报告
├─ backend/
│   ├─ app/
│   │   ├─ main.py         -- FastAPI 入口
│   │   ├─ config.py       -- 配置
│   │   ├─ models/         -- SQLAlchemy 数据模型
│   │   ├─ schemas/        -- Pydantic schemas
│   │   ├─ api/            -- API 路由
│   │   │   ├─ novels.py
│   │   │   ├─ chapters.py
│   │   │   ├─ styles.py
│   │   │   └─ ...
│   │   ├─ services/       -- 业务逻辑
│   │   │   ├─ writing_engine.py
│   │   │   ├─ memory_system.py
│   │   │   ├─ style_system.py
│   │   │   └─ export_service.py
│   │   ├─ llm/            -- LLM 适配层
│   │   │   ├─ base.py
│   │   │   ├─ openai_compatible.py
│   │   │   ├─ gemini.py
│   │   │   ├─ claude.py
│   │   │   └─ ...
│   │   └─ prompts/        -- Prompt 模板
│   │       ├─ idea_generator.py
│   │       ├─ outline_generator.py
│   │       ├─ chapter_generator.py
│   │       └─ intel_extractor.py
│   ├─ requirements.txt
│   └─ Dockerfile
├─ frontend/
│   ├─ src/
│   │   ├─ pages/          -- 页面组件
│   │   ├─ components/     -- 通用组件
│   │   ├─ services/       -- API 调用
│   │   ├─ stores/         -- 状态管理
│   │   └─ types/          -- TypeScript 类型
│   ├─ package.json
│   └─ vite.config.ts
└─ docker-compose.yml      -- MySQL + 后端 + 前端
```

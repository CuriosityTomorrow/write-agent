# Write Agent - AI 辅助网文写作系统

AI 驱动的中文网络小说创作平台，支持从灵感构思到章节创作的全流程辅助。

## 功能特性

- **创意生成** — 输入类型和灵感，AI 生成完整的小说设定（世界观、主角、冲突、金手指等）
- **大纲规划** — 自动生成故事背景、主线情节、分章情节点和角色体系
- **章节创作** — SSE 流式生成章节内容，支持改写模式（基于修改建议重写）
- **智能记忆** — 分层记忆系统（P0-P6），自动管理前文上下文，保证章节连续性
- **伏笔追踪** — 自动识别、追踪和提醒伏笔回收，支持短线/中线/长线分类
- **情报提取** — 章节完成后自动提取角色变化、关系变化、时间线、新伏笔等
- **多模型支持** — 统一适配 DeepSeek、GPT、Claude、Gemini、Grok、通义千问、智谱 GLM 等

## 技术栈

**后端:** Python 3.11+ / FastAPI / SQLAlchemy (async) / Pydantic

**前端:** React 19 / TypeScript / TanStack Query / Tailwind CSS 4 / Vite 7

**数据库:** MySQL 8 (生产) / SQLite (开发)

**LLM:** OpenAI SDK (兼容协议) / Anthropic SDK / Google GenAI SDK

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/CuriosityTomorrow/write-agent.git
cd write-agent
```

### 2. 后端

```bash
cd backend
pip install -r requirements.txt

# 创建 .env 文件，配置至少一个 LLM API key
cat > .env << 'EOF'
DATABASE_URL=sqlite+aiosqlite:///./write_agent.db
DEEPSEEK_API_KEY=your-key-here
EOF

# 启动（数据库表会自动创建）
uvicorn app.main:app --reload --port 8000
```

### 3. 前端

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### 4. Docker（可选）

```bash
# 启动 MySQL
docker-compose up mysql -d

# .env 中改用 MySQL 连接
# DATABASE_URL=mysql+aiomysql://root:writeagent123@localhost:3306/write_agent
```

## 环境变量

在 `backend/.env` 中配置，至少设置一个 LLM provider 的 API key：

| 变量名 | 用途 |
|--------|------|
| `DATABASE_URL` | 数据库连接串 |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `DASHSCOPE_API_KEY` | 通义千问 |
| `OPENAI_API_KEY` | OpenAI GPT |
| `ANTHROPIC_API_KEY` | Claude |
| `GOOGLE_API_KEY` | Gemini |
| `XAI_API_KEY` | Grok |
| `ZHIPU_API_KEY` | 智谱 GLM |
| `DEEPROUTER_API_KEY` | DeepRouter (第三方聚合) |

## 项目结构

```
write-agent/
├── backend/
│   └── app/
│       ├── api/              # FastAPI 路由
│       │   ├── writing.py    # AI 生成端点（灵感/大纲/章节/情报）
│       │   ├── chapters.py   # 章节 CRUD + 伏笔管理
│       │   ├── novels.py     # 小说 CRUD
│       │   ├── characters.py # 角色 CRUD
│       │   └── export.py     # TXT 导出
│       ├── services/
│       │   ├── writing_engine.py  # 核心编排层
│       │   └── memory_system.py   # 分层记忆上下文构建
│       ├── llm/
│       │   ├── base.py            # LLMProvider 抽象基类
│       │   ├── registry.py        # 模型注册与路由
│       │   ├── openai_compatible.py  # OpenAI 兼容协议
│       │   ├── claude_provider.py    # Anthropic Claude
│       │   └── gemini_provider.py    # Google Gemini
│       ├── prompts/           # Prompt 模板
│       ├── models/            # SQLAlchemy ORM 模型
│       ├── schemas/           # Pydantic 请求/响应模型
│       └── config.py          # pydantic-settings 配置
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── CreateWizard.tsx   # 小说创建向导（6步）
│       │   ├── NovelDetail.tsx    # 小说详情（大纲/角色/章节/伏笔）
│       │   └── ChapterEditor.tsx  # 章节编辑器（三栏布局）
│       └── services/api.ts       # API 调用封装
├── docs/plans/         # 设计文档和实施计划
├── research/           # 网文创作研究资料
└── docker-compose.yml
```

## 核心架构

### 请求流程

```
Frontend → FastAPI Router → Writing Engine → LLM Provider → AI Model
                                  ↓
                          Memory System (ContextBuilder)
                                  ↓
                    SQLAlchemy ORM (Novel/Chapter/Character/...)
```

### 分层记忆系统

章节生成时，`ContextBuilder` 按优先级组装上下文：

| 层级 | 内容 | 说明 |
|------|------|------|
| P0 | 小说骨架 | 设定、大纲、本章配置 |
| P1 | 必须角色 | 本章必须出现的角色完整信息 |
| P2 | 前文原文 | 前 1-2 章完整内容 |
| P3 | 伏笔系统 | 活跃伏笔 + 紧迫度标签 |
| P4 | 近期情报 | 第 3-5 章的完整 intel |
| P5 | 早期摘要 | 第 6-15 章的 plot_summary |
| P6 | 可选角色 | 可能出场的角色信息 |

Token 预算：`max_context × 25%`，超出时从 P6 向上截断。

### 伏笔追踪

伏笔分为短线（3-5章）、中线（10-30章）、长线（50+章）。系统自动计算紧迫度：

- **潜伏** — 距离回收窗口还远
- **铺垫** — 接近回收窗口，提醒自然提及
- **可回收** — 已进入回收窗口
- **紧急回收** — 超过预期回收时间

情报提取时自动匹配已回收的伏笔，并建议新伏笔供用户采纳。

### 多模型适配

通过 `registry.py` 统一路由，三种 Provider 覆盖主流 AI 模型：

- **OpenAICompatibleProvider** — DeepSeek / 通义千问 / GPT / Grok / DeepRouter 等 OpenAI 兼容协议
- **ClaudeProvider** — Anthropic Claude / 智谱 GLM-5
- **GeminiProvider** — Google Gemini

Reasoning 模型（如 Gemini 3 Flash）自动放大 `max_tokens` 以适配 thinking tokens。

## API 端点

### 生成类

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/generate/idea` | 生成小说创意模板 |
| POST | `/api/generate/regenerate-field` | 无状态单字段重新生成 |
| POST | `/api/novels/{id}/generate/regenerate-field` | 有状态单字段重新生成 |
| POST | `/api/novels/{id}/generate/outline` | 生成大纲 |
| POST | `/api/novels/{id}/chapters/{cid}/generate` | 流式生成章节 (SSE) |
| POST | `/api/novels/{id}/chapters/{cid}/extract-intel` | 提取章节情报 |

### CRUD

| Method | Path | 说明 |
|--------|------|------|
| GET/POST | `/api/novels` | 小说列表/创建 |
| GET/PUT/DELETE | `/api/novels/{id}` | 小说详情/更新/删除 |
| GET/POST | `/api/novels/{id}/chapters` | 章节列表/创建 |
| GET/PUT/DELETE | `/api/novels/{id}/chapters/{cid}` | 章节详情/更新/删除 |
| GET/POST | `/api/novels/{id}/characters` | 角色列表/创建 |
| GET/POST | `/api/novels/{id}/foreshadowings` | 伏笔列表/创建 |
| GET | `/api/novels/{id}/export/txt` | 导出 TXT |
| GET | `/api/llm/models` | 可用模型列表 |
| GET | `/health` | 健康检查 |

## 添加新的 LLM 模型

如果模型兼容 OpenAI 协议，只需两步：

1. `backend/.env` 中添加 API key：
```
MY_PROVIDER_API_KEY=sk-xxx
```

2. `backend/app/config.py` 添加设置项，`backend/app/llm/registry.py` 添加配置：
```python
# config.py
MY_PROVIDER_API_KEY: str = ""

# registry.py
"my-model": {
    "class": OpenAICompatibleProvider,
    "base_url": "https://api.example.com/v1",
    "model": "model-name",
    "display": "显示名称",
    "max_context": 128000,
    "api_key_setting": "MY_PROVIDER_API_KEY",
},
```

重启后端即可在前端下拉框中看到新模型。

## License

MIT

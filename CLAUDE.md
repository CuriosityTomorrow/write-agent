# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-assisted Chinese web novel (网文) writing system. FastAPI + React SPA with multi-LLM provider support. Full workflow: idea generation → outline planning → chapter streaming → intel extraction → foreshadowing tracking.

## Development Commands

```bash
# Backend (from backend/)
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
npm run dev          # Vite dev server on :5173, proxies /api → :8000
npm run build        # tsc -b && vite build
npm run lint         # eslint .

# Database
# Development: SQLite (default in .env)
# Production: MySQL 8 via Docker
docker-compose up mysql -d
# Tables auto-created on backend startup via SQLAlchemy metadata.create_all
```

No test framework configured. No Python linter/formatter configured.

## Environment Setup

Backend reads `backend/.env` via pydantic-settings. Set whichever providers you need:

```
DATABASE_URL=sqlite+aiosqlite:///./write_agent.db

# LLM API Keys (at least one required)
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
ZHIPU_API_KEY=
DEEPROUTER_API_KEY=
```

## Architecture

### Backend (`backend/app/`)

**Request flow:** FastAPI routers (`api/`) → service layer (`services/`) → LLM adapter (`llm/`) + ORM (`models/`)

- **`api/`** — Route modules. `writing.py` handles all AI generation endpoints (idea, outline, chapter streaming, intel extraction, field regeneration). `chapters.py` handles chapter CRUD + foreshadowing CRUD. `novels.py` and `characters.py` handle their respective CRUD. `export.py` for TXT export.
- **`services/writing_engine.py`** — Core orchestrator. All generation methods take a `model_id` string to select the LLM provider. Key methods: `generate_idea`, `regenerate_single_field`, `regenerate_novel_field`, `generate_outline`, `generate_chapter_stream` (SSE), `extract_chapter_intel`.
- **`services/memory_system.py`** — `ContextBuilder` assembles novel context with layered priority (P0-P6) for chapter generation. Manages token budget (`max_context * 25%`), truncates from P6 upward when over budget. Includes foreshadowing urgency computation.
- **`llm/`** — Multi-provider adapter layer. `registry.py` maps provider IDs to provider classes. Three implementations:
  - `OpenAICompatibleProvider` — DeepSeek/Qwen/GPT/Grok/DeepRouter. Auto-detects reasoning models and multiplies `max_tokens` by 4x.
  - `ClaudeProvider` — Anthropic Claude + 智谱 GLM-5 (Claude-compatible API).
  - `GeminiProvider` — Google Gemini via `google-genai` SDK.
  - All implement `LLMProvider` base class from `base.py` (two methods: `generate` for streaming, `generate_complete` for non-streaming).
- **`prompts/`** — Prompt template modules: `idea_generator`, `outline_generator`, `chapter_generator`, `intel_extractor`. Chapter generator includes 6 explicit continuity rules in system prompt.
- **`models/`** — SQLAlchemy async ORM. Key models: Novel, Outline, Character, CharacterRelationship, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing. Chapter has cascade delete for intel and chapter_characters.
- **`schemas/`** — Pydantic request/response models.

### Frontend (`frontend/src/`)

4 pages, React Router, TanStack Query for server state, Tailwind CSS:

- **`CreateWizard.tsx`** — 6-step novel creation wizard. Uses stateless `regenerateField`.
- **`NovelDetail.tsx`** — Novel overview with 4 tabs: chapters (with delete for latest), outline (inline editing), characters (inline editing), foreshadowings (create/track). Uses stateful `regenerateNovelField`.
- **`ChapterEditor.tsx`** — 3-panel layout: left config, center content editor, right intel sidebar. SSE streaming for chapter generation. Rewrite-with-suggestion mode. Auto re-extracts intel on save.
- **`services/api.ts`** — All API calls via axios.
- **`vite.config.ts`** — Proxy `/api` → `http://localhost:8000`.

## Key Design Patterns

### regenerateField (AI-assisted editing)

Two variants for single-field AI regeneration:
- **Stateless** `POST /api/generate/regenerate-field` — No DB lookup; used in CreateWizard before novel is saved
- **Stateful** `POST /api/novels/{id}/generate/regenerate-field` — Loads full novel context from DB; used in NovelDetail

Both return `{ "value": "generated content" }`.

Frontend UI pattern: regen button → expandable suggestion input → `regenField` / `regenSuggestion` / `regenLoading` state triplet.

### Chapter Generation Flow

1. User clicks "生成章节" in ChapterEditor
2. Frontend POSTs to `/chapters/{cid}/generate` with `model_id` and optional `suggestion`
3. `writing_engine.generate_chapter_stream` calls `ContextBuilder.build_context` to assemble P0-P6 layers
4. Prompt built via `chapter_generator.build_chapter_prompt` (includes continuity rules)
5. LLM provider streams response via SSE
6. After generation, auto-triggers `extract_chapter_intel` for intel extraction
7. Intel extraction identifies resolved foreshadowings, suggests new ones

### Rewrite-with-Suggestion Mode

When chapter has existing content and user clicks "重新生成":
- Shows suggestion input bar
- Empty suggestion → full rewrite from scratch
- With suggestion → passes current content + suggestion to prompt, asks LLM to rewrite

### Memory System Layers

| Priority | Content | Purpose |
|----------|---------|---------|
| P0 | Novel skeleton | Settings, outline, chapter config |
| P1 | Required characters | Full info for must-appear characters |
| P2 | Previous chapters | Raw text of last 1-2 chapters |
| P3 | Foreshadowing system | Active foreshadowings with urgency |
| P4 | Recent intel | Full intel for chapters 3-5 back |
| P5 | Summary intel | plot_summary for chapters 6-15 back |
| P6 | Optional characters | Characters that might appear |

### Foreshadowing System

- Types: 短线 (3-5 chapters), 中线 (10-30), 长线 (50+)
- Urgency levels: 潜伏 → 铺垫 → 可回收 → 紧急回收
- Auto-recovery: intel extraction matches resolved foreshadowings by ID
- Suggested foreshadowings: AI suggests new ones, user adopts via UI

### Reasoning Model Handling

`OpenAICompatibleProvider` has `REASONING_MODELS` set. For these models, `max_tokens` is multiplied by 4x because reasoning/thinking tokens count toward the total. Without this, output gets truncated.

### Data Format Gotchas

- **`Outline.plot_points`**: JSON array where elements may be strings OR `{title, summary/description}` objects
- **`ChapterIntel.timeline_events`**: Array of `{time, event}` objects. Render with: `typeof e === 'string' ? e : \`${e.time}: ${e.event}\``
- **`Character`** domain fields: `golden_finger`, `identity`, `current_status`, `current_location`, `emotional_state`

## Adding a New LLM Provider

For OpenAI-compatible APIs, add 3 lines:

1. `config.py`: add `MY_API_KEY: str = ""`
2. `.env`: add `MY_API_KEY=sk-xxx`
3. `registry.py`: add entry to `MODEL_CONFIGS` dict

For non-OpenAI protocols, implement `LLMProvider` base class (see `claude_provider.py` or `gemini_provider.py`).

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/generate/idea | Generate novel idea template |
| POST | /api/generate/regenerate-field | Stateless single-field regen |
| POST | /api/novels/{id}/generate/regenerate-field | Stateful single-field regen |
| POST | /api/novels/{id}/generate/outline | Generate outline + characters |
| POST | /api/novels/{id}/chapters/{cid}/generate | Stream chapter (SSE) |
| POST | /api/novels/{id}/chapters/{cid}/extract-intel | Extract chapter intel |
| DELETE | /api/novels/{id}/chapters/{cid} | Delete latest chapter |
| POST | /api/novels/{id}/foreshadowings/adopt-suggestion | Adopt AI-suggested foreshadowing |
| PUT | /api/novels/{id}/outline | Update outline |
| GET | /api/llm/models | List available models |
| GET | /api/novels/{id}/export/txt | Export novel as TXT |
| GET | /health | Health check |

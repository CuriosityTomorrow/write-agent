# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-assisted Chinese web novel (网文) writing system. FastAPI + React SPA with multi-LLM provider support.

## Development Commands

```bash
# Backend (from backend/)
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
npm run dev          # Vite dev server on :5173, proxies /api → :8000
npm run build        # tsc -b && vite build
npm run lint         # eslint .

# Database (MySQL 8 via Docker)
docker-compose up mysql    # or: docker-compose up (includes backend)
# Default: mysql+aiomysql://root:writeagent123@localhost:3306/write_agent
# Tables auto-created on backend startup via SQLAlchemy metadata.create_all
```

No test framework is configured yet. No Python linter/formatter is configured.

## Environment Setup

Backend reads `.env` via pydantic-settings. Required API keys (set whichever providers you need):

```
DEEPSEEK_API_KEY, DASHSCOPE_API_KEY, OPENAI_API_KEY, XAI_API_KEY,
GOOGLE_API_KEY, ANTHROPIC_API_KEY, ZHIPU_API_KEY, MINIMAX_API_KEY
```

## Architecture

### Backend (`backend/app/`)

**Request flow:** FastAPI routers (`api/`) → service layer (`services/`) → LLM adapter (`llm/`) + ORM (`models/`)

- **`api/`** — Route modules. `writing.py` handles all AI generation endpoints. `novels.py`, `characters.py`, `chapters.py` handle CRUD. `export.py` for TXT export. Routers are registered in `main.py`.
- **`services/writing_engine.py`** — Core orchestrator. Handles idea generation, field regeneration (stateless + stateful), outline generation, chapter streaming (SSE), and intel extraction. All generation methods take a `model_id` string to select the LLM provider.
- **`services/memory_system.py`** — `ContextBuilder` assembles novel context (outline, characters, previous chapters, foreshadowings) for chapter generation prompts.
- **`llm/`** — Multi-provider adapter layer. `registry.py` maps provider IDs (e.g. `"deepseek"`, `"claude"`, `"gemini"`) to provider classes. Three provider implementations: `OpenAICompatibleProvider` (DeepSeek/Qwen/GPT/Grok), `ClaudeProvider` (Claude + 智谱 GLM-5), `GeminiProvider`. All implement `LLMProvider` base class from `base.py`.
- **`prompts/`** — Prompt template modules for each generation type (idea, outline, chapter, intel extraction).
- **`models/`** — SQLAlchemy async ORM. Key models: Novel, Outline, Character, CharacterRelationship, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing. Also has WritingStyle/NarrativeBlueprint (no API yet).

### Frontend (`frontend/src/`)

4 pages, React Router, TanStack Query for server state, Zustand available:
- **`CreateWizard.tsx`** — 6-step novel creation wizard (uses stateless regenerateField)
- **`NovelDetail.tsx`** — Novel overview with tabs: outline, characters, chapters, foreshadowings (uses stateful regenerateField)
- **`ChapterEditor.tsx`** — 3-panel layout: left config, center content editor, right intel sidebar. Chapter generation uses SSE streaming.
- **`services/api.ts`** — All API calls via axios. Vite proxy forwards `/api` to backend.

## Key Design Patterns

### regenerateField (AI-assisted editing)

Unified single-field AI regeneration with two variants:
- **Stateless** `POST /api/generate/regenerate-field` — No DB lookup; used in CreateWizard before novel is saved
- **Stateful** `POST /api/novels/{id}/generate/regenerate-field` — Loads full novel context from DB

Both return `{ "value": "generated content" }`.

Frontend UI pattern: regen button → expandable suggestion input → `regenField` / `regenSuggestion` / `regenLoading` state triplet.

### Data Format Gotchas

- **`Outline.plot_points`**: JSON array where elements may be strings OR `{title, summary/description}` objects
- **`ChapterIntel.timeline_events`**: Array of `{time, event}` objects, not strings. Render with type check: `typeof e === 'string' ? e : \`${e.time}: ${e.event}\``
- **`Character`** has domain-specific fields: `golden_finger`, `identity`, `current_status`, `current_location`, `emotional_state`

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/generate/idea | Generate novel idea template |
| POST | /api/generate/regenerate-field | Stateless single-field regen |
| POST | /api/novels/{id}/generate/regenerate-field | Stateful single-field regen |
| POST | /api/novels/{id}/generate/outline | Generate outline |
| POST | /api/novels/{id}/chapters/{cid}/generate | Stream chapter content (SSE) |
| POST | /api/novels/{id}/chapters/{cid}/extract-intel | Extract chapter intelligence |
| PUT | /api/novels/{id}/outline | Update outline |
| GET | /api/llm/models | List available LLM models |
| GET | /api/novels/{id}/export/txt | Export novel as TXT |
| GET | /health | Health check |

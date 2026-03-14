# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-assisted Chinese web novel (网文) writing system. FastAPI + React SPA with multi-LLM provider support. Full workflow: idea generation → outline planning → chapter streaming → intel extraction → foreshadowing tracking → memory compression.

## Development Commands

```bash
# Backend (from backend/), requires Python 3.11+
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
npm install
npm run dev          # Vite dev server on :5173, proxies /api → :8000
npm run build        # tsc -b && vite build
npm run lint         # eslint .

# Database
# Development: SQLite (default in .env)
# Production: MySQL 8 via Docker
docker-compose up mysql -d
# Tables auto-created on backend startup via SQLAlchemy metadata.create_all
```

No test framework configured. No Python linter/formatter configured. `alembic` is in requirements.txt but no migrations directory exists — tables are auto-created via `Base.metadata.create_all` on startup.

**Schema changes:** Since there are no Alembic migrations, adding/modifying model columns requires either manually running `ALTER TABLE` SQL against the database or deleting `write_agent.db` to recreate from scratch (loses all data).

## Environment Setup

Backend reads `backend/.env` via pydantic-settings. The default `DATABASE_URL` in `config.py` points to MySQL — override it in `.env` for SQLite dev mode (requires `pip install aiosqlite`). Set whichever LLM providers you need:

```
DATABASE_URL=sqlite+aiosqlite:///./write_agent.db   # SQLite dev override (default in config.py is MySQL)

# LLM API Keys (at least one required)
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
ZHIPU_API_KEY=
DEEPROUTER_API_KEY=
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=
```

## Architecture

### Backend (`backend/app/`)

**Request flow:** FastAPI routers (`api/`) → service layer (`services/`) → LLM adapter (`llm/`) + ORM (`models/`)

- **`api/`** — Route modules:
  - `writing.py` — AI generation endpoints (idea, outline, chapter streaming, intel extraction, field regeneration)
  - `chapters.py` — Chapter CRUD + foreshadowing CRUD
  - `novels.py`, `characters.py` — CRUD
  - `narrative_memory.py` — NarrativeMemory CRUD, volume/range summary generation
  - `major_events.py` — Major event ideas, creation with buildup plans, listing
  - `export.py` — TXT export
  - `llm_api.py` — Available model listing
- **`services/writing_engine.py`** — Core orchestrator. Key methods:
  - `generate_idea`, `regenerate_single_field`, `regenerate_novel_field` — Idea/field generation
  - `generate_outline` — Outline + character generation
  - `generate_chapter_stream` — SSE chapter streaming with pacing control
  - `extract_chapter_intel` — Intel extraction with character consistency checking
  - `check_consistency` — Post-generation consistency validation (auto-triggered after intel extraction)
  - `generate_volume_summary` — Compress chapter range into volume summary
  - `_maybe_auto_compress` — Auto-trigger compression at chapter milestones (30/150)
  - `assign_chapter_type` — Determine chapter type from major events or 6-chapter cycle
  - `build_pacing_instruction` — Generate pacing constraint text from chapter type + genre preset
- **`services/memory_system.py`** — `ContextBuilder` assembles novel context with layered priority (P0-P7) for chapter generation. Manages token budget (`max_context * 25%`), truncates from P6 upward when over budget. Includes foreshadowing urgency computation.
- **`llm/`** — Multi-provider adapter layer. `registry.py` maps provider IDs to provider classes. Three implementations:
  - `OpenAICompatibleProvider` — DeepSeek/Qwen/GPT/Grok/DeepRouter (including Gemini Flash proxy). Auto-detects reasoning models (4x `max_tokens`).
  - `ClaudeProvider` — Anthropic Claude + 智谱 GLM-5 (GLM-5 uses Anthropic-compatible API).
  - `GeminiProvider` — Google Gemini via `google-genai` SDK.
  - All implement `LLMProvider` base class from `base.py`.
  - CORS hardcoded to `http://localhost:5173` in `main.py` — update if deploying to other origins.
- **`prompts/`** — Prompt template modules:
  - `idea_generator`, `outline_generator`, `chapter_generator`, `intel_extractor` — Core generation
  - `consistency_checker` — Chapter-vs-settings validation prompts (10 conflict types, 3 severity levels)
  - `volume_compressor` — Volume/arc/global compression prompts
  - `major_event` — Range summary, event ideas, buildup plan prompts
  - `presets/` — Genre-specific configuration: `base.py` (default), `upgrade_fantasy.py` (升级爽文). Loaded via `get_preset(genre)`.
- **`models/`** — SQLAlchemy async ORM. Key models: Novel, Outline, Character, CharacterRelationship, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing, NarrativeMemory. Chapter has cascade delete for intel and chapter_characters.
- **`schemas/`** — Pydantic request/response models including `narrative_memory.py`.

### Frontend (`frontend/src/`)

4 pages, React Router, TanStack Query for server state, React `useState` for local component state, Tailwind CSS 4:

- **`NovelList.tsx`** — Home page listing all novels.
- **`CreateWizard.tsx`** — 6-step novel creation wizard with AI-assisted creative idea generation (prompt-guided).
- **`NovelDetail.tsx`** — Novel overview with 6 tabs: chapters, outline, characters, foreshadowings, 卷摘要 (volume summaries), 大事件 (major events). Character edit form includes collapsible "角色驱动设定" section + AI regen button. Foreshadowing cards have edit/delete buttons.
- **`ChapterEditor.tsx`** — 3-panel layout: left config (with chapter_type selector + editable chapter outline), center content editor, right intel sidebar (character consistency card + detected new characters card + suggested foreshadowings with adopt/dismiss + consistency check section with conflict management). SSE streaming.
- **`services/api.ts`** — All API calls via axios.

## Key Design Patterns

### regenerateField (AI-assisted editing)

Two variants for single-field AI regeneration:
- **Stateless** `POST /api/generate/regenerate-field` — No DB lookup; used in CreateWizard
- **Stateful** `POST /api/novels/{id}/generate/regenerate-field` — Loads full novel context from DB

Both return `{ "value": "generated content" }`.

Frontend UI pattern: regen button → expandable suggestion input → `regenField` / `regenSuggestion` / `regenLoading` state triplet.

### Memory System Layers (P0-P7)

| Priority | Content | Purpose |
|----------|---------|---------|
| P0 | Novel skeleton | Settings, outline, chapter config |
| P1 | Required characters | Full info with behavior rules, personality tags |
| P2 | Previous 2 chapters | Raw text for style/plot continuity |
| P3 | Foreshadowing system | Active foreshadowings with urgency |
| P4 | Recent intel (3-5 ch) | Full intel for nearby chapters |
| P5 | Summary intel (6-15 ch) | plot_summary only |
| P5.5 | Key events (16-30 ch) | First sentence of plot_summary |
| P6 | Optional characters | Characters that might appear |
| P7 | Volume summaries | P7a recent 3 volumes + P7b arc summaries + P7c global summary |

Token budget capped at ~16,600 tokens for P7 even at 1000+ chapters.

### Pacing Control

- **Genre presets** (`prompts/presets/`): Define cycle pattern, chapter types, character rules
- **6-chapter cycle**: 3 setup + 2 transition + 1 climax (configurable per genre)
- **Major event override**: Major events in outline override the default cycle
- **Chapter types**: `setup` (1 main event, detail-heavy), `transition` (1 main event, tension building), `climax` (2 main events, action-focused)
- **`assign_chapter_type()`**: Checks major events first, falls back to cycle

### Character-Driven Narrative

Character model extended fields:
- `personality_tags` (JSON, max 2) — Core personality
- `motivation` (Text) — Current driving force
- `behavior_rules` (JSON) — `{absolute_do: [], absolute_dont: []}` — Injected into every chapter prompt
- `speech_pattern` (Text) — How they talk
- `growth_arc_type` (String) — staircase/spiral/cliff/platform
- `relationship_masks` (JSON) — Different attitudes toward different people

Intel extraction checks character actions against behavior_rules, outputs `character_consistency` violations.

### Auto-Compression (NarrativeMemory)

- Every 30 chapters: auto-generates volume summary from chapter intel
- Every 150 chapters: auto-generates arc summary from volume summaries
- Stored in `NarrativeMemory` model with `memory_type`: "volume" / "arc" / "global"
- Triggered in `extract_chapter_intel` → `_maybe_auto_compress`

### Major Events System

- Plot points with `event_scale: "major"` get special treatment
- Creation flow: range summary → AI suggests events → user selects → AI generates buildup plan → auto-creates foreshadowings
- Buildup plan stored in plot_point JSON, affects `assign_chapter_type()` for pacing override

### Foreshadowing System

- Types: 短线 (3-5 chapters), 中线 (10-30), 长线 (50+)
- Urgency levels: 潜伏 → 铺垫 → 可回收 → 紧急回收
- Auto-recovery: intel extraction matches resolved foreshadowings by ID
- Suggested foreshadowings: AI suggests new ones, user adopts via UI

### Consistency Check System

LLM-powered validation that compares generated chapter content against established novel settings. Auto-triggered after intel extraction; also available as manual endpoint.

- **Conflict types** (10): `world_setting`, `golden_finger`, `power_system`, `character_personality`, `character_speech`, `character_location`, `character_motivation`, `outline_deviation`, `timeline`, `foreshadowing_overdue`
- **Severity levels**: `high` (core world/power violations), `medium` (character/outline deviations), `low` (timeline/foreshadowing)
- **Storage**: `ChapterIntel.consistency_conflicts` JSON field — array of `{type, severity, description, reference, suggestion, related_entity}`
- **Frontend workflow**: Active conflicts sorted by severity → three actions per conflict:
  - "Update Setting" — edit & push fix to novel/character settings (→ resolved)
  - "Chapter Pending" — mark for manual chapter revision (→ pending)
  - "Dismiss" — ignore (→ dismissed, collapsible)
- **Prompt module**: `prompts/consistency_checker.py` — assembles novel settings, characters, timeline, overdue foreshadowings as reference context

### Reasoning Model Handling

`OpenAICompatibleProvider` has `REASONING_MODELS` set. For these models, `max_tokens` is multiplied by 4x because reasoning/thinking tokens count toward the total.

### Data Format Gotchas

- **`Outline.plot_points`**: JSON array where elements may be strings OR `{title, summary, event_scale, chapter_type_hint, ...}` objects
- **`ChapterIntel.timeline_events`**: Array of `{time, event}` objects. Render with type check.
- **`Character`** domain fields: `golden_finger`, `identity`, `current_status`, `current_location`, `emotional_state`
- **`ChapterIntel.character_consistency`**: Array of `{name, action, rule_violated, severity, suggestion}` — may be null/empty
- **`ChapterIntel.detected_new_characters`**: Array of `{name, role, identity, first_appearance_context}` — new characters not in known list
- **`ChapterIntel.consistency_conflicts`**: Array of `{type, severity, description, reference, suggestion, related_entity}` — may be null/empty

## Adding a New LLM Provider

For OpenAI-compatible APIs, add 3 lines:

1. `config.py`: add `MY_API_KEY: str = ""`
2. `.env`: add `MY_API_KEY=sk-xxx`
3. `registry.py`: add entry to `MODEL_CONFIGS` dict

For non-OpenAI protocols, implement `LLMProvider` base class.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| **Novels** | | |
| GET/POST | /api/novels | List / Create novel |
| GET/PUT/DELETE | /api/novels/{id} | Read / Update / Delete novel |
| GET/PUT | /api/novels/{id}/outline | Read / Update outline |
| GET | /api/novels/{id}/export/txt | Export novel as TXT |
| **Chapters** | | |
| GET/POST | /api/novels/{id}/chapters | List / Create chapter |
| GET/PUT/DELETE | /api/novels/{id}/chapters/{cid} | Read / Update / Delete chapter |
| GET | /api/novels/{id}/chapters/{cid}/intel | Get chapter intel |
| **Characters** | | |
| GET/POST | /api/novels/{id}/characters | List / Create character |
| PUT/DELETE | /api/novels/{id}/characters/{cid} | Update / Delete character |
| **Foreshadowings** | | |
| GET/POST | /api/novels/{id}/foreshadowings | List / Create foreshadowing |
| PUT/DELETE | /api/novels/{id}/foreshadowings/{fsId} | Update / Delete foreshadowing |
| POST | /api/novels/{id}/foreshadowings/adopt-suggestion | Adopt AI-suggested foreshadowing |
| **AI Generation** | | |
| POST | /api/generate/idea | Generate novel idea template |
| POST | /api/generate/regenerate-field | Stateless single-field regen |
| POST | /api/generate/outline-from-prompt | Generate outline from user prompt |
| POST | /api/novels/{id}/generate/regenerate-field | Stateful single-field regen |
| POST | /api/novels/{id}/generate/outline | Generate outline + characters |
| POST | /api/novels/{id}/generate/extract-from-outline | Extract plot points from outline text |
| POST | /api/novels/{id}/generate/character | AI-generate a character |
| POST | /api/novels/{id}/chapters/{cid}/generate | Stream chapter (SSE) |
| POST | /api/novels/{id}/chapters/{cid}/extract-intel | Extract chapter intel |
| POST | /api/novels/{id}/chapters/{cid}/check-consistency | Check chapter consistency |
| **Memory & Events** | | |
| GET | /api/novels/{id}/narrative-memories | List narrative memories |
| PUT | /api/novels/{id}/narrative-memories/{mid} | Update narrative memory |
| POST | /api/novels/{id}/generate/volume-summary | Generate volume summary |
| POST | /api/novels/{id}/generate/range-summary | Generate range summary |
| GET | /api/novels/{id}/major-events | List major events |
| POST | /api/novels/{id}/major-events | Create major event with buildup |
| POST | /api/novels/{id}/major-events/generate-ideas | Generate event ideas |
| **System** | | |
| GET | /api/llm/models | List available models |
| GET | /health | Health check |

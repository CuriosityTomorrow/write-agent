# 分层记忆 + 节奏控制 + 角色驱动 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 升级写作引擎，支持 1000+ 章长篇网文的记忆一致性、节奏控制和角色驱动叙事。

**Architecture:** 新增 NarrativeMemory 模型 + 预设系统 + 记忆分层 + 节奏指令注入 + 角色行为准则 + 大事件系统。后端修改为主，前端跟进 UI。

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async, React 18, TypeScript, TanStack Query

**Design doc:** `docs/plans/2026-03-07-memory-pacing-character-design.md`

**Note:** No test framework is configured. Each task uses manual verification (restart backend + curl/browser). Database tables auto-create on startup via `Base.metadata.create_all`.

---

## Phase 1: Models & Schemas

### Task 1: NarrativeMemory model

**Files:**
- Create: `backend/app/models/narrative_memory.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model file**

```python
# backend/app/models/narrative_memory.py
from datetime import datetime

from sqlalchemy import String, Text, Integer, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NarrativeMemory(Base):
    __tablename__ = "narrative_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    memory_type: Mapped[str] = mapped_column(String(20))  # "volume" / "arc" / "global"
    chapter_start: Mapped[int] = mapped_column(Integer)
    chapter_end: Mapped[int] = mapped_column(Integer)

    plot_progression: Mapped[str] = mapped_column(Text)
    character_states: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    relationship_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    unresolved_threads: Mapped[list | None] = mapped_column(JSON, nullable=True)
    world_state_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    novel = relationship("Novel", back_populates="narrative_memories")
```

**Step 2: Add relationship to Novel model**

In `backend/app/models/novel.py`, add to the `Novel` class (after the `foreshadowings` relationship, line 39):

```python
    narrative_memories = relationship("NarrativeMemory", back_populates="novel", cascade="all, delete-orphan")
```

**Step 3: Update `__init__.py`**

In `backend/app/models/__init__.py`, add import and export:

```python
from app.models.narrative_memory import NarrativeMemory
```

Add `"NarrativeMemory"` to the `__all__` list.

**Step 4: Verify**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
# Wait for startup, check no errors
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

**Step 5: Commit**

```bash
git add backend/app/models/narrative_memory.py backend/app/models/novel.py backend/app/models/__init__.py
git commit -m "feat: add NarrativeMemory model for volume/arc/global summaries"
```

---

### Task 2: Character model extensions

**Files:**
- Modify: `backend/app/models/character.py`
- Modify: `backend/app/schemas/character.py`

**Step 1: Add 6 new fields to Character model**

In `backend/app/models/character.py`, add after `emotional_state` (line 23), before `created_at`:

```python
    personality_tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    behavior_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    speech_pattern: Mapped[str | None] = mapped_column(Text, nullable=True)
    growth_arc_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    relationship_masks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

**Step 2: Update CharacterCreate schema**

In `backend/app/schemas/character.py`, add to `CharacterCreate` (after `background`):

```python
    personality_tags: list[str] | None = None
    motivation: str | None = None
    behavior_rules: dict | None = None
    speech_pattern: str | None = None
    growth_arc_type: str | None = None
    relationship_masks: dict | None = None
```

**Step 3: Update CharacterUpdate schema**

Add the same 6 fields to `CharacterUpdate`.

**Step 4: Update CharacterResponse schema**

Add the same 6 fields to `CharacterResponse`.

**Step 5: Verify**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

**Step 6: Commit**

```bash
git add backend/app/models/character.py backend/app/schemas/character.py
git commit -m "feat: add character-driven fields (personality_tags, motivation, behavior_rules, speech_pattern, growth_arc_type, relationship_masks)"
```

---

### Task 3: Chapter and ChapterIntel extensions

**Files:**
- Modify: `backend/app/models/chapter.py`
- Modify: `backend/app/schemas/chapter.py`

**Step 1: Add chapter_type to Chapter model**

In `backend/app/models/chapter.py`, add after `conflict_description` (line 21), before `created_at`:

```python
    chapter_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
```

**Step 2: Add character_consistency to ChapterIntel model**

In `backend/app/models/chapter.py`, add to `ChapterIntel` after `suggested_foreshadowings` (line 54), before `created_at`:

```python
    character_consistency: Mapped[list | None] = mapped_column(JSON, nullable=True)
```

**Step 3: Update ChapterCreate schema**

In `backend/app/schemas/chapter.py`, add to `ChapterCreate`:

```python
    chapter_type: str | None = None
```

**Step 4: Update ChapterUpdate schema**

Add `chapter_type: str | None = None` to `ChapterUpdate`.

**Step 5: Update ChapterResponse schema**

Add `chapter_type: str | None = None` to `ChapterResponse`.

**Step 6: Update ChapterIntelResponse schema**

Add `character_consistency: list | None = None` to `ChapterIntelResponse`.

**Step 7: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
git add backend/app/models/chapter.py backend/app/schemas/chapter.py
git commit -m "feat: add Chapter.chapter_type and ChapterIntel.character_consistency fields"
```

---

## Phase 2: Presets & Prompts

### Task 4: Presets architecture

**Files:**
- Create: `backend/app/prompts/presets/__init__.py`
- Create: `backend/app/prompts/presets/base.py`
- Create: `backend/app/prompts/presets/upgrade_fantasy.py`

**Step 1: Create `__init__.py`**

```python
# backend/app/prompts/presets/__init__.py
from app.prompts.presets.base import BASE_PRESET
from app.prompts.presets.upgrade_fantasy import PRESET as UPGRADE_FANTASY_PRESET

_GENRE_MAP = {
    "玄幻": UPGRADE_FANTASY_PRESET,
    "仙侠": UPGRADE_FANTASY_PRESET,
    "奇幻": UPGRADE_FANTASY_PRESET,
    "武侠": UPGRADE_FANTASY_PRESET,
}


def get_preset(genre: str) -> dict:
    """根据小说类型返回对应的预设配置，找不到则 fallback 到 BASE_PRESET"""
    return _GENRE_MAP.get(genre, BASE_PRESET)
```

**Step 2: Create `base.py`**

```python
# backend/app/prompts/presets/base.py
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
```

**Step 3: Create `upgrade_fantasy.py`**

```python
# backend/app/prompts/presets/upgrade_fantasy.py
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
```

**Step 4: Verify**

```bash
cd backend && python -c "from app.prompts.presets import get_preset; p = get_preset('玄幻'); print(p['pacing']['cycle_length'])"
# Expected: 6
```

**Step 5: Commit**

```bash
git add backend/app/prompts/presets/
git commit -m "feat: presets architecture with upgrade_fantasy preset (pacing + character rules)"
```

---

### Task 5: Volume compressor prompt

**Files:**
- Create: `backend/app/prompts/volume_compressor.py`

**Step 1: Create prompt template**

```python
# backend/app/prompts/volume_compressor.py
SYSTEM_PROMPT = """你是一位小说编辑。请将多章情报压缩为一份结构化摘要。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_volume_compress_prompt(intels_text: str, chapter_start: int, chapter_end: int) -> str:
    return f"""请将以下第{chapter_start}-{chapter_end}章的情报压缩为一份卷摘要。

【要求】：
1. plot_progression: 500-800字的情节进展叙述，包含所有关键转折点，按时间顺序
2. character_states: 截至本卷末每个主要角色的状态（包含境界/位置/持有关键物品）
3. relationship_changes: 本卷中发生的所有重要关系变化
4. unresolved_threads: 截至本卷末尚未解决的所有悬念和线索
5. world_state_changes: 世界格局的重要变化（势力消长、地域变化等）

【输入的章节情报】：
{intels_text}

请严格按以下 JSON 格式输出：
{{
  "plot_progression": "情节进展叙述",
  "character_states": {{
    "角色名": {{"境界": "...", "位置": "...", "关键物品": ["..."]}}
  }},
  "relationship_changes": [
    {{"char_a": "角色A", "char_b": "角色B", "change": "关系变化描述"}}
  ],
  "unresolved_threads": ["悬念1", "悬念2"],
  "world_state_changes": ["变化1", "变化2"]
}}"""


def build_arc_compress_prompt(volume_summaries_text: str, chapter_start: int, chapter_end: int) -> str:
    return f"""请将以下多个卷摘要进一步压缩为一份弧摘要（第{chapter_start}-{chapter_end}章）。

【要求】：
保留最关键的情节转折、角色状态变化和未解决线索。
格式与卷摘要相同，但 plot_progression 控制在 300-500 字。

【输入的卷摘要】：
{volume_summaries_text}

请严格按以下 JSON 格式输出：
{{
  "plot_progression": "弧线情节进展",
  "character_states": {{"角色名": {{"境界": "...", "位置": "...", "关键物品": ["..."]}}}},
  "relationship_changes": [{{"char_a": "...", "char_b": "...", "change": "..."}}],
  "unresolved_threads": ["..."],
  "world_state_changes": ["..."]
}}"""


def build_global_compress_prompt(arc_summaries_text: str) -> str:
    return f"""请将以下所有弧摘要压缩为一份全书纲要。

【要求】：
保留全书最核心的故事主线和角色发展轨迹。
plot_progression 控制在 500-800 字。

【输入的弧摘要】：
{arc_summaries_text}

请严格按以下 JSON 格式输出：
{{
  "plot_progression": "全书纲要",
  "character_states": {{"角色名": {{"境界": "...", "位置": "...", "关键物品": ["..."]}}}},
  "relationship_changes": [{{"char_a": "...", "char_b": "...", "change": "..."}}],
  "unresolved_threads": ["..."],
  "world_state_changes": ["..."]
}}"""
```

**Step 2: Commit**

```bash
git add backend/app/prompts/volume_compressor.py
git commit -m "feat: volume/arc/global compression prompt templates"
```

---

### Task 6: Major event prompts

**Files:**
- Create: `backend/app/prompts/major_event.py`

**Step 1: Create prompt template**

```python
# backend/app/prompts/major_event.py
SYSTEM_PROMPT = """你是一位网络小说策划师。请根据提供的信息完成任务。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_range_summary_prompt(intels_text: str, chapter_start: int, chapter_end: int) -> str:
    """用于生成指定章节范围的摘要（供用户快速回顾）"""
    return f"""请将以下第{chapter_start}-{chapter_end}章的情报整理为一份简明摘要，帮助作者快速回顾这段剧情。

【要求】：
- summary: 300-500字，按时间顺序叙述主要情节
- key_characters: 这段剧情中活跃的主要角色及其当前状态
- active_threads: 目前正在进行中的悬念和线索

【章节情报】：
{intels_text}

请严格按以下 JSON 格式输出：
{{
  "summary": "情节摘要",
  "key_characters": [{{"name": "角色名", "status": "当前状态"}}],
  "active_threads": ["线索1", "线索2"]
}}"""


def build_major_event_ideas_prompt(
    range_summary: str,
    novel_info: str,
    current_chapter: int,
) -> str:
    """基于摘要生成大事件建议"""
    return f"""基于以下小说信息和近期剧情摘要，提出 2-3 个可能的大事件方向。

大事件是需要 20-50 章铺垫、能够推动故事进入新阶段的重大剧情弧线。

【小说信息】
{novel_info}

【近期剧情摘要】
{range_summary}

【当前章节】第{current_chapter}章

请严格按以下 JSON 格式输出：
{{
  "ideas": [
    {{
      "title": "事件标题",
      "description": "事件描述（100-200字）",
      "suggested_chapter_range": "第X-Y章",
      "suggested_buildup_chapters": 30,
      "reasoning": "为什么适合在这个节点引入（50字以内）"
    }}
  ]
}}"""


def build_buildup_plan_prompt(
    event_title: str,
    event_description: str,
    buildup_start: int,
    target_start: int,
    target_end: int,
    novel_info: str,
) -> str:
    """为大事件生成铺垫计划"""
    buildup_length = target_start - buildup_start
    return f"""请为以下大事件生成分阶段铺垫计划。

【大事件】{event_title}
【事件描述】{event_description}
【铺垫起始】第{buildup_start}章
【事件爆发】第{target_start}-{target_end}章
【铺垫长度】约{buildup_length}章

【小说信息】
{novel_info}

请将铺垫分为 3-4 个阶段，每个阶段说明：
- 这个阶段应该在哪些章节
- 应该铺垫什么内容
- 应该创建什么伏笔

请严格按以下 JSON 格式输出：
{{
  "buildup_plan": {{
    "阶段名": {{
      "chapters": "第X-Y章",
      "description": "这个阶段应该做什么",
      "foreshadowings": [
        {{
          "description": "伏笔描述",
          "type": "短线/中线/长线"
        }}
      ]
    }}
  }}
}}"""
```

**Step 2: Commit**

```bash
git add backend/app/prompts/major_event.py
git commit -m "feat: major event prompt templates (range-summary, ideas, buildup-plan)"
```

---

## Phase 3: Memory System Backend

### Task 7: ContextBuilder — P5.5 and P7 layers

**Files:**
- Modify: `backend/app/services/memory_system.py`

**Step 1: Add P5.5 `_build_key_events` method**

Add after `_build_summary_intel` (after line 293):

```python
    async def _build_key_events(self, novel_id: int, current_chapter_number: int) -> str:
        """P5.5: 前16-30章，每章一个关键事件（plot_summary 第一句）"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number - 15,
                Chapter.chapter_number >= current_chapter_number - 30,
            )
            .order_by(Chapter.chapter_number)
        )
        chapters = result.scalars().all()
        if not chapters:
            return ""
        parts = []
        for ch in chapters:
            intel_result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = intel_result.scalar_one_or_none()
            if intel and intel.plot_summary:
                # 取第一句话作为关键事件
                first_sentence = intel.plot_summary.split("。")[0] + "。"
                parts.append(f"第{ch.chapter_number}章: {first_sentence}")
        return "\n".join(parts) if parts else ""
```

**Step 2: Add P7 `_build_volume_summaries` method**

Add after `_build_key_events`:

```python
    async def _build_volume_summaries(self, novel_id: int, chapter_number: int) -> str:
        """P7: 加载卷摘要（P7a近期 + P7b弧摘要 + P7c全书纲要）"""
        from app.models.narrative_memory import NarrativeMemory

        parts = []

        # P7c: 全书纲要（最多1条）
        result = await self.db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "global",
            )
        )
        global_mem = result.scalar_one_or_none()
        if global_mem:
            parts.append(f"【全书纲要（第{global_mem.chapter_start}-{global_mem.chapter_end}章）】\n{global_mem.plot_progression}")

        # P7b: 弧摘要
        result = await self.db.execute(
            select(NarrativeMemory)
            .where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "arc",
            )
            .order_by(NarrativeMemory.chapter_start)
        )
        for arc in result.scalars().all():
            parts.append(f"【弧摘要（第{arc.chapter_start}-{arc.chapter_end}章）】\n{arc.plot_progression}")

        # P7a: 最近3个卷摘要
        result = await self.db.execute(
            select(NarrativeMemory)
            .where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
            )
            .order_by(NarrativeMemory.chapter_end.desc())
            .limit(3)
        )
        recent_volumes = list(reversed(result.scalars().all()))
        for vol in recent_volumes:
            vol_parts = [f"【卷摘要（第{vol.chapter_start}-{vol.chapter_end}章）】"]
            vol_parts.append(f"情节: {vol.plot_progression}")
            if vol.character_states:
                for name, state in vol.character_states.items():
                    state_str = ", ".join(f"{k}: {v}" for k, v in state.items()) if isinstance(state, dict) else str(state)
                    vol_parts.append(f"  {name}: {state_str}")
            if vol.unresolved_threads:
                vol_parts.append(f"未解决线索: {'、'.join(vol.unresolved_threads)}")
            parts.append("\n".join(vol_parts))

        return "\n\n".join(parts) if parts else ""
```

**Step 3: Update `build_context` to include P5.5 and P7**

In `build_context()`, add after P5 block (after line 91) and before P6:

```python
        # P5.5: 前16-30章关键事件
        p5_5 = await self._build_key_events(novel_id, chapter_number)
        if p5_5 and used_tokens + estimate_tokens(p5_5) <= token_budget:
            layers["key_events"] = p5_5
            used_tokens += estimate_tokens(p5_5)
        else:
            layers["key_events"] = ""
```

After P6 block (after line 98), before blueprint/style:

```python
        # P7: 卷摘要
        p7 = await self._build_volume_summaries(novel_id, chapter_number)
        if p7 and used_tokens + estimate_tokens(p7) <= token_budget:
            layers["volume_summaries"] = p7
            used_tokens += estimate_tokens(p7)
        else:
            layers["volume_summaries"] = ""
```

**Step 4: Verify**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

**Step 5: Commit**

```bash
git add backend/app/services/memory_system.py
git commit -m "feat: add P5.5 key events layer and P7 volume summaries to ContextBuilder"
```

---

### Task 8: Volume summary generation + auto-trigger

**Files:**
- Modify: `backend/app/services/writing_engine.py`

**Step 1: Add volume summary generation function**

Add these imports at the top of `writing_engine.py`:

```python
from app.models.narrative_memory import NarrativeMemory
from app.prompts import volume_compressor
```

Add after `extract_chapter_intel` function (after line 530):

```python
async def generate_volume_summary(
    novel_id: int,
    chapter_start: int,
    chapter_end: int,
    model_id: str,
    db: AsyncSession,
) -> dict:
    """生成指定章节范围的卷摘要"""
    # 收集所有章节 intel
    result = await db.execute(
        select(Chapter)
        .where(
            Chapter.novel_id == novel_id,
            Chapter.chapter_number >= chapter_start,
            Chapter.chapter_number <= chapter_end,
        )
        .order_by(Chapter.chapter_number)
    )
    chapters = result.scalars().all()

    intels_parts = []
    for ch in chapters:
        intel_result = await db.execute(
            select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
        )
        intel = intel_result.scalar_one_or_none()
        if intel:
            parts = [f"第{ch.chapter_number}章 {ch.title or ''}:"]
            parts.append(f"  情节: {intel.plot_summary or ''}")
            if intel.character_updates:
                for cu in intel.character_updates:
                    parts.append(f"  角色: {cu.get('name', '')} - {cu.get('status_change', '')}")
            if intel.relationship_changes:
                for rc in intel.relationship_changes:
                    parts.append(f"  关系: {rc.get('char_a', '')}↔{rc.get('char_b', '')}: {rc.get('change', '')}")
            intels_parts.append("\n".join(parts))

    if not intels_parts:
        raise ValueError(f"No intel found for chapters {chapter_start}-{chapter_end}")

    intels_text = "\n\n".join(intels_parts)

    provider = get_provider(model_id)
    prompt = volume_compressor.build_volume_compress_prompt(intels_text, chapter_start, chapter_end)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=volume_compressor.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=3000, stream=False),
    )
    summary_data = _parse_json(response)

    # 检查是否已存在同范围的摘要
    existing = await db.execute(
        select(NarrativeMemory).where(
            NarrativeMemory.novel_id == novel_id,
            NarrativeMemory.memory_type == "volume",
            NarrativeMemory.chapter_start == chapter_start,
            NarrativeMemory.chapter_end == chapter_end,
        )
    )
    mem = existing.scalar_one_or_none()
    if mem:
        # 更新
        mem.plot_progression = summary_data.get("plot_progression", "")
        mem.character_states = summary_data.get("character_states")
        mem.relationship_changes = summary_data.get("relationship_changes")
        mem.unresolved_threads = summary_data.get("unresolved_threads")
        mem.world_state_changes = summary_data.get("world_state_changes")
    else:
        # 新建
        volume_number = chapter_end // 30
        mem = NarrativeMemory(
            novel_id=novel_id,
            memory_type="volume",
            chapter_start=chapter_start,
            chapter_end=chapter_end,
            plot_progression=summary_data.get("plot_progression", ""),
            character_states=summary_data.get("character_states"),
            relationship_changes=summary_data.get("relationship_changes"),
            unresolved_threads=summary_data.get("unresolved_threads"),
            world_state_changes=summary_data.get("world_state_changes"),
        )
        db.add(mem)

    await db.commit()
    return summary_data


async def _maybe_auto_compress(novel_id: int, chapter_number: int, model_id: str, db: AsyncSession):
    """在 intel 提取后自动检查是否需要生成卷摘要/弧摘要"""
    # 每30章生成一次卷摘要
    if chapter_number % 30 == 0:
        volume_start = chapter_number - 29
        existing = await db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
                NarrativeMemory.chapter_start == volume_start,
            )
        )
        if not existing.scalar_one_or_none():
            await generate_volume_summary(novel_id, volume_start, chapter_number, model_id, db)

    # 每150章生成一次弧摘要
    if chapter_number % 150 == 0:
        arc_start = chapter_number - 149
        # 收集这个弧内的所有卷摘要
        result = await db.execute(
            select(NarrativeMemory).where(
                NarrativeMemory.novel_id == novel_id,
                NarrativeMemory.memory_type == "volume",
                NarrativeMemory.chapter_start >= arc_start,
                NarrativeMemory.chapter_end <= chapter_number,
            ).order_by(NarrativeMemory.chapter_start)
        )
        volumes = result.scalars().all()
        if volumes:
            summaries_text = "\n\n".join(
                f"第{v.chapter_start}-{v.chapter_end}章:\n{v.plot_progression}"
                for v in volumes
            )
            provider = get_provider(model_id)
            prompt = volume_compressor.build_arc_compress_prompt(summaries_text, arc_start, chapter_number)
            response = await provider.generate_complete(
                messages=[Message(role="user", content=prompt)],
                system_prompt=volume_compressor.SYSTEM_PROMPT,
                config=GenerateConfig(temperature=0.3, max_tokens=2000, stream=False),
            )
            arc_data = _parse_json(response)
            arc_mem = NarrativeMemory(
                novel_id=novel_id,
                memory_type="arc",
                chapter_start=arc_start,
                chapter_end=chapter_number,
                plot_progression=arc_data.get("plot_progression", ""),
                character_states=arc_data.get("character_states"),
                relationship_changes=arc_data.get("relationship_changes"),
                unresolved_threads=arc_data.get("unresolved_threads"),
                world_state_changes=arc_data.get("world_state_changes"),
            )
            db.add(arc_mem)
            await db.commit()
```

**Step 2: Hook auto-compress into `extract_chapter_intel`**

At the end of `extract_chapter_intel`, before `return intel_data` (line 530), add:

```python
    # 自动压缩检查
    await _maybe_auto_compress(chapter.novel_id, chapter.chapter_number, model_id, db)
```

**Step 3: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
git add backend/app/services/writing_engine.py
git commit -m "feat: volume summary generation + auto-compression trigger after intel extraction"
```

---

### Task 9: Chapter generator prompt integration

**Files:**
- Modify: `backend/app/prompts/chapter_generator.py`

**Step 1: Add pacing and memory parameters to `build_chapter_prompt`**

Update the function signature and body. Add `pacing_instruction`, `key_events`, `volume_summaries` parameters:

```python
def build_chapter_prompt(
    novel_info: str,
    character_context: str,
    recent_intel: str,
    foreshadowing_context: str,
    chapter_config: str,
    blueprint_context: str = "",
    previous_chapters: str = "",
    summary_intel: str = "",
    optional_characters: str = "",
    rewrite_content: str = "",
    rewrite_suggestion: str = "",
    pacing_instruction: str = "",
    key_events: str = "",
    volume_summaries: str = "",
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
    ]
    if volume_summaries:
        sections.append(f"【历史记忆】\n{volume_summaries}")
    if previous_chapters:
        sections.append(f"【前文原文】\n{previous_chapters}")
    sections.append(f"【本章涉及角色】\n{character_context}")
    if optional_characters:
        sections.append(f"【其他相关角色】\n{optional_characters}")
    if recent_intel:
        sections.append(f"【近期章节情报（第3-5章）】\n{recent_intel}")
    if summary_intel:
        sections.append(f"【早期章节摘要（第6-15章）】\n{summary_intel}")
    if key_events:
        sections.append(f"【关键事件回顾（第16-30章）】\n{key_events}")
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    if pacing_instruction:
        sections.append(f"【节奏控制】\n{pacing_instruction}")
    sections.append(f"【本章要求】\n{chapter_config}")

    if rewrite_content and rewrite_suggestion:
        sections.append(f"【当前章节内容（需改写）】\n{rewrite_content}")
        sections.append(f"【修改建议】\n{rewrite_suggestion}")
        sections.append("\n请根据修改建议，在当前章节内容的基础上进行改写。保持整体结构和情节走向，按照建议调整相关内容。直接输出改写后的完整章节（包含章节标题），不要输出任何解释性文字。\n\n重要提醒：改写时仍需确保与【前文原文】的连续性——开头必须承接前一章结尾，不可断裂。")
    else:
        sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。\n\n重要提醒：如果有【前文原文】，你的开头必须紧密承接前一章的最后场景。仔细看前一章最后几段发生了什么——那就是你的起点。")

    return "\n\n".join(sections)
```

**Step 2: Verify & Commit**

```bash
cd backend && python -c "from app.prompts.chapter_generator import build_chapter_prompt; print('OK')"
git add backend/app/prompts/chapter_generator.py
git commit -m "feat: chapter_generator prompt supports pacing, key_events, volume_summaries sections"
```

---

### Task 10: NarrativeMemory + Range Summary API

**Files:**
- Create: `backend/app/api/narrative_memory.py`
- Create: `backend/app/schemas/narrative_memory.py`
- Modify: `backend/app/main.py`

**Step 1: Create schemas**

```python
# backend/app/schemas/narrative_memory.py
from pydantic import BaseModel
from datetime import datetime


class NarrativeMemoryResponse(BaseModel):
    id: int
    novel_id: int
    memory_type: str
    chapter_start: int
    chapter_end: int
    plot_progression: str
    character_states: dict | None = None
    relationship_changes: list | None = None
    unresolved_threads: list | None = None
    world_state_changes: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NarrativeMemoryUpdate(BaseModel):
    plot_progression: str | None = None
    character_states: dict | None = None
    relationship_changes: list | None = None
    unresolved_threads: list | None = None
    world_state_changes: list | None = None


class GenerateVolumeSummaryRequest(BaseModel):
    chapter_start: int
    chapter_end: int
    model_id: str = "deepseek"


class GenerateRangeSummaryRequest(BaseModel):
    chapter_start: int
    chapter_end: int
    model_id: str = "deepseek"
```

**Step 2: Create API router**

```python
# backend/app/api/narrative_memory.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Chapter, ChapterIntel
from app.models.narrative_memory import NarrativeMemory
from app.schemas.narrative_memory import (
    NarrativeMemoryResponse, NarrativeMemoryUpdate,
    GenerateVolumeSummaryRequest, GenerateRangeSummaryRequest,
)
from app.services import writing_engine
from app.llm import get_provider, Message, GenerateConfig
from app.prompts import major_event

router = APIRouter(prefix="/api/novels/{novel_id}", tags=["narrative-memory"])


@router.get("/narrative-memories", response_model=list[NarrativeMemoryResponse])
async def list_narrative_memories(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NarrativeMemory)
        .where(NarrativeMemory.novel_id == novel_id)
        .order_by(NarrativeMemory.chapter_start)
    )
    return result.scalars().all()


@router.put("/narrative-memories/{mem_id}", response_model=NarrativeMemoryResponse)
async def update_narrative_memory(
    novel_id: int, mem_id: int, data: NarrativeMemoryUpdate, db: AsyncSession = Depends(get_db)
):
    mem = await db.get(NarrativeMemory, mem_id)
    if not mem or mem.novel_id != novel_id:
        raise HTTPException(404, "NarrativeMemory not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(mem, key, value)
    await db.commit()
    await db.refresh(mem)
    return mem


@router.post("/generate/volume-summary")
async def api_generate_volume_summary(
    novel_id: int, data: GenerateVolumeSummaryRequest, db: AsyncSession = Depends(get_db)
):
    result = await writing_engine.generate_volume_summary(
        novel_id, data.chapter_start, data.chapter_end, data.model_id, db
    )
    return result


@router.post("/generate/range-summary")
async def api_generate_range_summary(
    novel_id: int, data: GenerateRangeSummaryRequest, db: AsyncSession = Depends(get_db)
):
    """生成指定章节范围的摘要（用于回顾或大事件创意）"""
    # 收集 intel
    result = await db.execute(
        select(Chapter)
        .where(
            Chapter.novel_id == novel_id,
            Chapter.chapter_number >= data.chapter_start,
            Chapter.chapter_number <= data.chapter_end,
        )
        .order_by(Chapter.chapter_number)
    )
    chapters = result.scalars().all()

    intels_parts = []
    for ch in chapters:
        intel_result = await db.execute(
            select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
        )
        intel = intel_result.scalar_one_or_none()
        if intel:
            intels_parts.append(f"第{ch.chapter_number}章: {intel.plot_summary or ''}")

    if not intels_parts:
        raise HTTPException(400, "No intel found in specified range")

    intels_text = "\n".join(intels_parts)
    prompt = major_event.build_range_summary_prompt(intels_text, data.chapter_start, data.chapter_end)
    provider = get_provider(data.model_id)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=2000, stream=False),
    )
    from app.services.writing_engine import _parse_json
    return _parse_json(response)
```

**Step 3: Register router in `main.py`**

Add at the bottom of `main.py`, before the health check:

```python
from app.api.narrative_memory import router as narrative_memory_router
app.include_router(narrative_memory_router)
```

**Step 4: Verify**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
# Test list endpoint (should return empty array)
curl http://localhost:8000/api/novels/1/narrative-memories
```

**Step 5: Commit**

```bash
git add backend/app/schemas/narrative_memory.py backend/app/api/narrative_memory.py backend/app/main.py
git commit -m "feat: NarrativeMemory API (list, update, generate volume-summary, range-summary)"
```

---

## Phase 4: Pacing Control

### Task 11: Pacing functions + writing_engine integration

**Files:**
- Modify: `backend/app/services/writing_engine.py`

**Step 1: Add pacing helper functions**

Add after the imports, before `FIELD_LABELS`:

```python
from app.prompts.presets import get_preset
import re as _re


def _parse_chapter_range(chapter_range: str) -> tuple[int, int]:
    """解析 '第90-95章' 格式为 (90, 95)"""
    m = _re.search(r'(\d+)\s*[-~]\s*(\d+)', chapter_range)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = _re.search(r'(\d+)', chapter_range)
    if m:
        n = int(m.group(1))
        return n, n
    return 0, 0


def assign_chapter_type(chapter_number: int, plot_points: list | None, genre: str) -> str:
    """根据大事件覆盖或六章周期分配章节类型"""
    # 1. 检查大事件覆盖
    for pp in (plot_points or []):
        if not isinstance(pp, dict) or pp.get("event_scale") != "major":
            continue
        target_start, target_end = _parse_chapter_range(pp.get("chapter_range", ""))
        if target_start <= 0:
            continue
        # 爆发阶段
        if target_start <= chapter_number <= target_end:
            return "climax"
        # 临场紧张（爆发前5章）
        if target_start - 5 <= chapter_number < target_start:
            return "transition"
        # 铺垫阶段
        buildup_start = pp.get("buildup_start_chapter", target_start - 30)
        if buildup_start <= chapter_number < target_start - 5:
            return "setup"

    # 2. 六章周期
    preset = get_preset(genre)
    pattern = preset["pacing"]["cycle_pattern"]
    cycle_pos = (chapter_number - 1) % len(pattern)
    return pattern[cycle_pos]


def build_pacing_instruction(chapter_type: str, genre: str) -> str:
    """根据章节类型生成节奏指令文本"""
    preset = get_preset(genre)
    config = preset["pacing"]["chapter_types"].get(chapter_type)
    if not config:
        return ""
    return f"""本章类型：{chapter_type}（{config['description']}）

写作约束：
- 主要事件：不超过 {config['main_events']} 个，每个事件必须充分展开
- 次要事件：不超过 {config['sub_events']} 个
- 场景切换：最多 {config['scene_changes_max']} 次
- 细节重点：{config['detail_focus']}
- 章末处理：{config['hook']}

⚠️ 宁可把一个事件写深写透，也不要塞太多事件。
   角色的反应、对话、心理活动、环境描写都需要充分展开。
   参考标准：每个主事件至少需要 800-1000 字的篇幅来展开。"""
```

**Step 2: Integrate into `generate_chapter_stream`**

In `generate_chapter_stream`, after building `ctx` (line 385) and before chapter_config assembly (line 388), add:

```python
    # 获取小说信息和大纲
    novel = await db.get(Novel, novel_id)
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    plot_points = outline.plot_points if outline else None

    # 确定章节类型
    effective_type = chapter.chapter_type or assign_chapter_type(
        chapter.chapter_number, plot_points, novel.genre
    )
    pacing_instruction = build_pacing_instruction(effective_type, novel.genre)
```

Then update the `chapter_generator.build_chapter_prompt` call to pass the new parameters:

```python
    prompt = chapter_generator.build_chapter_prompt(
        novel_info=ctx["novel_info"],
        character_context=ctx["character_context"],
        recent_intel=ctx["recent_intel"],
        foreshadowing_context=ctx["foreshadowing_context"],
        chapter_config="\n".join(chapter_config_parts),
        blueprint_context=ctx["blueprint_context"],
        previous_chapters=ctx["previous_chapters"],
        summary_intel=ctx["summary_intel"],
        optional_characters=ctx["optional_characters"],
        rewrite_content=chapter.content if suggestion else "",
        rewrite_suggestion=suggestion,
        pacing_instruction=pacing_instruction,
        key_events=ctx.get("key_events", ""),
        volume_summaries=ctx.get("volume_summaries", ""),
    )
```

**Step 3: Add character rules to system prompt**

In `generate_chapter_stream`, update the system_prompt construction to include preset addon:

```python
    preset = get_preset(novel.genre)
    preset_addon = preset.get("system_prompt_addon", "")
    style_instruction = ""
    if ctx["style_prompt"]:
        style_instruction = f"\n\n【文笔风格要求】\n{ctx['style_prompt']}"
    if preset_addon:
        style_instruction += f"\n\n{preset_addon}"

    system_prompt = chapter_generator.SYSTEM_PROMPT_TEMPLATE.format(style_instruction=style_instruction)
```

**Step 4: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
git add backend/app/services/writing_engine.py
git commit -m "feat: pacing control - chapter type assignment, pacing instructions, preset integration"
```

---

### Task 12: Outline generator updates

**Files:**
- Modify: `backend/app/prompts/outline_generator.py`

**Step 1: Add pacing awareness and character-driven fields to outline prompt**

Replace the entire `build_outline_prompt` function:

```python
def build_outline_prompt(novel_settings: dict, target_chapters: int, blueprint_prompt: str = "") -> str:
    blueprint_section = f"\n【叙事蓝图指导】\n{blueprint_prompt}" if blueprint_prompt else ""

    return f"""请根据以下小说设定，生成一个约 {target_chapters} 章的故事大纲。

【小说设定】
- 类型: {novel_settings.get('genre', '')}
- 世界观: {novel_settings.get('world_setting', '')}
- 主角: {novel_settings.get('protagonist_identity', '')}
- 核心冲突: {novel_settings.get('core_conflict', '')}
- 金手指: {novel_settings.get('golden_finger', '')}
- 反派: {novel_settings.get('antagonist_setting', '')}
- 力量体系: {novel_settings.get('power_system', '')}
- 核心悬念: {novel_settings.get('core_suspense', '')}
- 舞台: {novel_settings.get('story_stage', '')}
- 基调: {novel_settings.get('style_tone', '')}
{blueprint_section}

【节奏规划要求】
- 每6章为一个小周期：3章铺垫 + 2章递进 + 1章高潮
- 每个 plot_point 的章节跨度建议为 10-30 章
- 需要长期铺垫的重大弧线请标注 "event_scale": "major"

请严格按以下 JSON 格式输出：
{{
  "story_background": "故事背景，300字以内",
  "characters": [
    {{
      "name": "角色名",
      "role": "主角/配角/反派",
      "identity": "身份设定",
      "personality": "性格特征（详细描述）",
      "tags": ["标签1", "标签2"],
      "personality_tags": ["核心性格标签1", "核心性格标签2"],
      "motivation": "当前核心动机",
      "behavior_rules": {{
        "absolute_do": ["一定会做的事1", "一定会做的事2"],
        "absolute_dont": ["绝对不做的事1", "绝对不做的事2"]
      }},
      "speech_pattern": "说话风格描述",
      "growth_arc_type": "staircase/spiral/cliff/platform",
      "relationship_masks": {{
        "敌人": "对敌人的态度",
        "盟友": "对盟友的态度"
      }}
    }}
  ],
  "main_plot": "完整故事弧线（起承转合），包含主角成长路径和核心冲突演变，1000字以内",
  "plot_points": [
    {{
      "chapter_range": "第1-10章",
      "title": "阶段标题",
      "summary": "这个阶段的情节概述",
      "key_conflicts": "本阶段的核心冲突",
      "foreshadowing_plan": ["计划埋设的伏笔1", "计划埋设的伏笔2"],
      "event_scale": "normal 或 major",
      "chapter_type_hint": "这个阶段整体偏铺垫/递进/高潮"
    }}
  ],
  "highlights": "作品亮点，200字以内",
  "synopsis": "作品简介，200字以内"
}}"""
```

**Step 2: Update outline save logic in writing.py**

In `backend/app/api/writing.py`, `api_generate_outline` function (line 86-95), update the character save loop to include new fields:

```python
    for char_data in result.get("characters", []):
        char = Character(
            novel_id=novel_id,
            name=char_data["name"],
            role=char_data.get("role", "配角"),
            identity=char_data.get("identity"),
            personality=char_data.get("personality"),
            tags=char_data.get("tags"),
            personality_tags=char_data.get("personality_tags"),
            motivation=char_data.get("motivation"),
            behavior_rules=char_data.get("behavior_rules"),
            speech_pattern=char_data.get("speech_pattern"),
            growth_arc_type=char_data.get("growth_arc_type"),
            relationship_masks=char_data.get("relationship_masks"),
        )
        db.add(char)
```

**Step 3: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
git add backend/app/prompts/outline_generator.py backend/app/api/writing.py
git commit -m "feat: outline generator with pacing awareness and character-driven fields"
```

---

## Phase 5: Character-Driven

### Task 13: Character prompt format + intel consistency check

**Files:**
- Modify: `backend/app/services/memory_system.py`
- Modify: `backend/app/prompts/intel_extractor.py`
- Modify: `backend/app/services/writing_engine.py`

**Step 1: Rewrite `_format_character_full` in `memory_system.py`**

Replace the existing method (lines 177-191):

```python
    def _format_character_full(self, char: Character) -> str:
        lines = [f"【{char.name}（{char.role}）】"]
        if char.identity:
            lines.append(f"身份: {char.identity}")
        if char.golden_finger:
            lines.append(f"金手指: {char.golden_finger}")
        if char.current_status:
            lines.append(f"当前状态: {char.current_status}")
        if char.current_location:
            lines.append(f"当前位置: {char.current_location}")
        if char.personality_tags:
            lines.append(f"核心性格: {' + '.join(char.personality_tags)}")
        elif char.personality:
            lines.append(f"性格: {char.personality}")
        if char.motivation:
            lines.append(f"当前动机: {char.motivation}")
        if char.behavior_rules:
            rules = char.behavior_rules
            if rules.get("absolute_do"):
                lines.append("一定会做:")
                for r in rules["absolute_do"]:
                    lines.append(f"  - {r}")
            if rules.get("absolute_dont"):
                lines.append("绝对不做:")
                for r in rules["absolute_dont"]:
                    lines.append(f"  - {r}")
        if char.speech_pattern:
            lines.append(f"说话风格: {char.speech_pattern}")
        if char.relationship_masks:
            lines.append("对不同人的态度:")
            for target, mask in char.relationship_masks.items():
                lines.append(f"  - 对{target}: {mask}")
        return "\n".join(lines)
```

**Step 2: Update intel extractor prompt**

In `backend/app/prompts/intel_extractor.py`, update `build_intel_prompt` to accept behavior rules and add consistency check output:

```python
def build_intel_prompt(
    chapter_content: str,
    character_names: list[str],
    active_foreshadowings: list[dict] | None = None,
    character_behavior_rules: dict[str, dict] | None = None,
) -> str:
    chars = "、".join(character_names)

    fs_section = ""
    if active_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}" for f in active_foreshadowings]
        fs_section = f"\n\n当前活跃伏笔（用 id 引用）：\n" + "\n".join(fs_lines)

    rules_section = ""
    if character_behavior_rules:
        rules_lines = ["\n\n角色行为准则（用于一致性检查）："]
        for name, rules in character_behavior_rules.items():
            rules_lines.append(f"  {name}:")
            for do in rules.get("absolute_do", []):
                rules_lines.append(f"    一定会做: {do}")
            for dont in rules.get("absolute_dont", []):
                rules_lines.append(f"    绝对不做: {dont}")
        rules_section = "\n".join(rules_lines)

    consistency_output = ""
    if character_behavior_rules:
        consistency_output = """,
  "character_consistency": [
    {
      "name": "角色名",
      "action": "本章中的具体行为",
      "rule_violated": "违反了哪条行为准则（没有违反则不输出该角色）",
      "severity": "minor/major",
      "suggestion": "如何修正或补充理由"
    }
  ]"""

    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}{fs_section}{rules_section}

【章节内容】
{chapter_content}

请严格按以下 JSON 格式输出：
{{
  "plot_summary": "本章情节摘要，200字以内",
  "character_updates": [
    {{
      "name": "角色名",
      "status_change": "本章中该角色的处境变化",
      "emotional_state": "当前情绪状态",
      "location": "当前位置",
      "motivation_shift": "如果角色动机可能发生变化，在此说明建议（没有变化则留空字符串）"
    }}
  ],
  "relationship_changes": [
    {{
      "char_a": "角色A",
      "char_b": "角色B",
      "change": "关系变化描述",
      "trigger": "触发原因"
    }}
  ],
  "new_foreshadowings": [
    {{
      "description": "新埋设的伏笔描述",
      "type": "短线/中线/长线",
      "expected_resolve_chapter": 0
    }}
  ],
  "resolved_foreshadowings": [
    {{
      "id": 0,
      "description": "回收的伏笔描述"
    }}
  ],
  "suggested_foreshadowings": [
    {{
      "description": "建议新增的伏笔",
      "type": "短线/中线/长线",
      "reason": "建议理由",
      "expected_resolve_chapter": 0
    }}
  ],
  "timeline_events": [
    {{
      "time": "故事内时间",
      "event": "事件描述"
    }}
  ],
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]{consistency_output}
}}

注意：
- resolved_foreshadowings 中请使用活跃伏笔列表中的 id 进行引用
- new_foreshadowings 中 type 为 "短线"(3-5章回收)/"中线"(10-30章)/"长线"(50+章)
- suggested_foreshadowings 仅在有伏笔被回收时才建议新伏笔，否则留空数组
- expected_resolve_chapter 填写预估的回收章节号
- motivation_shift 仅在角色经历重大事件可能导致动机转变时填写
- character_consistency 仅输出有违反行为准则的角色，全部符合则留空数组"""
```

**Step 3: Pass behavior_rules to intel extractor in writing_engine.py**

In `extract_chapter_intel` (around line 459), build the behavior_rules dict and pass it:

```python
    # 构建角色行为准则（用于一致性检查）
    char_behavior_rules = {}
    for c in characters:
        if c.behavior_rules:
            char_behavior_rules[c.name] = c.behavior_rules

    provider = get_provider(model_id)
    prompt = intel_extractor.build_intel_prompt(
        chapter.content, char_names, active_foreshadowings,
        character_behavior_rules=char_behavior_rules if char_behavior_rules else None,
    )
```

**Step 4: Save character_consistency in intel**

In `extract_chapter_intel`, update the ChapterIntel creation (around line 468) to include:

```python
    intel = ChapterIntel(
        chapter_id=chapter_id,
        plot_summary=intel_data.get("plot_summary"),
        character_updates=intel_data.get("character_updates"),
        relationship_changes=intel_data.get("relationship_changes"),
        new_foreshadowings=intel_data.get("new_foreshadowings"),
        resolved_foreshadowings=intel_data.get("resolved_foreshadowings"),
        timeline_events=intel_data.get("timeline_events"),
        next_chapter_required_chars=intel_data.get("next_chapter_required_chars"),
        suggested_foreshadowings=intel_data.get("suggested_foreshadowings"),
        character_consistency=intel_data.get("character_consistency"),
    )
```

**Step 5: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
git add backend/app/services/memory_system.py backend/app/prompts/intel_extractor.py backend/app/services/writing_engine.py
git commit -m "feat: character-driven narrative - behavior prompt format, intel consistency check"
```

---

## Phase 6: Major Events

### Task 14: Major events API

**Files:**
- Create: `backend/app/api/major_events.py`
- Modify: `backend/app/main.py`

**Step 1: Create the API router**

```python
# backend/app/api/major_events.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Outline, Character, Foreshadowing
from app.llm import get_provider, Message, GenerateConfig
from app.prompts import major_event
from app.services.memory_system import ContextBuilder

router = APIRouter(prefix="/api/novels/{novel_id}/major-events", tags=["major-events"])


class MajorEventIdeasRequest(BaseModel):
    range_summary: str  # 前端先调 range-summary 拿到的摘要文本
    model_id: str = "deepseek"


class MajorEventCreate(BaseModel):
    title: str
    description: str
    target_chapter_start: int
    target_chapter_end: int
    buildup_start_chapter: int
    model_id: str = "deepseek"


def _parse_json(text: str) -> dict:
    import json, re
    text = text.strip()
    m = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


@router.post("/generate-ideas")
async def generate_major_event_ideas(
    novel_id: int, data: MajorEventIdeasRequest, db: AsyncSession = Depends(get_db)
):
    """基于摘要生成大事件方向建议"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")

    # 构建小说信息
    novel_info = f"类型: {novel.genre}\n世界观: {novel.world_setting or ''}\n主角: {novel.protagonist_identity or ''}\n力量体系: {novel.power_system or ''}"

    # 获取当前章节数
    from sqlalchemy import func
    from app.models import Chapter
    result = await db.execute(
        select(func.max(Chapter.chapter_number)).where(Chapter.novel_id == novel_id)
    )
    current_chapter = result.scalar() or 1

    provider = get_provider(data.model_id)
    prompt = major_event.build_major_event_ideas_prompt(
        data.range_summary, novel_info, current_chapter
    )
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.7, max_tokens=2000, stream=False),
    )
    return _parse_json(response)


@router.post("")
async def create_major_event(
    novel_id: int, data: MajorEventCreate, db: AsyncSession = Depends(get_db)
):
    """创建大事件：更新大纲 plot_point + 生成铺垫计划 + 自动创建伏笔"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")

    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if not outline:
        raise HTTPException(400, "No outline found")

    # 生成铺垫计划
    novel_info = f"类型: {novel.genre}\n世界观: {novel.world_setting or ''}\n主角: {novel.protagonist_identity or ''}\n力量体系: {novel.power_system or ''}"

    provider = get_provider(data.model_id)
    prompt = major_event.build_buildup_plan_prompt(
        data.title, data.description,
        data.buildup_start_chapter, data.target_chapter_start, data.target_chapter_end,
        novel_info,
    )
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.5, max_tokens=2000, stream=False),
    )
    plan_data = _parse_json(response)
    buildup_plan = plan_data.get("buildup_plan", {})

    # 构建新的 plot_point
    new_plot_point = {
        "chapter_range": f"第{data.target_chapter_start}-{data.target_chapter_end}章",
        "title": data.title,
        "summary": data.description,
        "key_conflicts": data.description,
        "foreshadowing_plan": [],
        "event_scale": "major",
        "buildup_start_chapter": data.buildup_start_chapter,
        "buildup_plan": buildup_plan,
        "status": "铺垫中",
    }

    # 更新大纲
    plot_points = outline.plot_points or []
    plot_points.append(new_plot_point)
    outline.plot_points = plot_points
    # SQLAlchemy JSON 需要标记为已修改
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(outline, "plot_points")

    # 自动创建伏笔
    created_foreshadowings = []
    for stage_name, stage in buildup_plan.items():
        for fs_data in stage.get("foreshadowings", []):
            fs = Foreshadowing(
                novel_id=novel_id,
                description=f"[{data.title}] {fs_data.get('description', '')}",
                status="埋设",
                foreshadowing_type=fs_data.get("type", "中线"),
                expected_resolve_start=data.target_chapter_start,
                expected_resolve_end=data.target_chapter_end,
            )
            db.add(fs)
            created_foreshadowings.append(fs_data.get("description", ""))

    await db.commit()

    return {
        "plot_point": new_plot_point,
        "created_foreshadowings": created_foreshadowings,
    }


@router.get("")
async def list_major_events(novel_id: int, db: AsyncSession = Depends(get_db)):
    """列出所有大事件（从 plot_points 中筛选 event_scale=major）"""
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if not outline or not outline.plot_points:
        return []
    return [pp for pp in outline.plot_points if isinstance(pp, dict) and pp.get("event_scale") == "major"]
```

**Step 2: Register router in `main.py`**

Add to `main.py`:

```python
from app.api.major_events import router as major_events_router
app.include_router(major_events_router)
```

**Step 3: Verify & Commit**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/novels/1/major-events
# Expected: [] (empty array)
git add backend/app/api/major_events.py backend/app/main.py
git commit -m "feat: major events API (generate ideas, create with buildup plan, list)"
```

---

## Phase 7: Frontend

### Task 15: Frontend API service additions

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: Add new API calls**

Add to `frontend/src/services/api.ts`:

```typescript
// Narrative Memory
export const listNarrativeMemories = (novelId: number) => api.get(`/novels/${novelId}/narrative-memories`)
export const updateNarrativeMemory = (novelId: number, memId: number, data: any) => api.put(`/novels/${novelId}/narrative-memories/${memId}`, data)
export const generateVolumeSummary = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/volume-summary`, data)
export const generateRangeSummary = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/range-summary`, data)

// Major Events
export const listMajorEvents = (novelId: number) => api.get(`/novels/${novelId}/major-events`)
export const generateMajorEventIdeas = (novelId: number, data: any) => api.post(`/novels/${novelId}/major-events/generate-ideas`, data)
export const createMajorEvent = (novelId: number, data: any) => api.post(`/novels/${novelId}/major-events`, data)
```

**Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: frontend API service additions for narrative memory and major events"
```

---

### Task 16: NovelDetail — Volume Summaries tab

**Files:**
- Modify: `frontend/src/pages/NovelDetail.tsx`

This is a larger UI task. Add a new "卷摘要" tab to the existing tabs in NovelDetail.

**Key changes:**
1. Add `listNarrativeMemories`, `generateVolumeSummary` imports from api.ts
2. Add a new tab option "卷摘要" to the tab list
3. Create a `VolumeSummariesTab` component that:
   - Lists all NarrativeMemory entries grouped by type (global > arc > volume)
   - Each entry shows: type badge, chapter range, plot_progression (expandable)
   - "生成卷摘要" button with chapter_start/chapter_end inputs
   - Edit button that opens a modal for editing plot_progression

**Implementation approach:** Read the existing tab structure in NovelDetail.tsx (it uses a tabs state variable with tab panels), then add the new tab following the same pattern. Use TanStack Query's `useQuery` for listing and `useMutation` for generate/update.

**Detailed implementation is context-dependent on the existing tab structure.** The implementer should:
1. Read `NovelDetail.tsx` to understand the tab pattern
2. Add "卷摘要" as a new tab option
3. Build the tab content using the same styling conventions
4. Wire up the API calls

**Commit:**
```bash
git add frontend/src/pages/NovelDetail.tsx
git commit -m "feat: NovelDetail volume summaries tab with generate and edit"
```

---

### Task 17: ChapterEditor — chapter type selector + consistency card

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`

**Key changes:**
1. Add chapter_type dropdown selector to the left config panel (setup/transition/climax + auto)
2. When creating or updating a chapter, include `chapter_type` in the request
3. In the right intel sidebar, add "角色一致性" card that renders `character_consistency` from intel data
   - Green checkmark for no violations
   - Yellow warning card for each violation with: character name, action, violated rule, severity, suggestion

**Implementation approach:** Read ChapterEditor.tsx to understand the layout. The left panel already has chapter config fields (chapter_outline, conflict_description, target_word_count). Add chapter_type as a select dropdown. The right panel already shows intel data. Add a new section for consistency.

**Commit:**
```bash
git add frontend/src/pages/ChapterEditor.tsx
git commit -m "feat: ChapterEditor chapter type selector and character consistency card"
```

---

### Task 18: Character form extensions

**Files:**
- Modify: `frontend/src/pages/NovelDetail.tsx` (character edit section)
- Modify: `frontend/src/pages/CreateWizard.tsx` (if character creation is there)

**Key changes:**
1. Character edit form: add fields for personality_tags (tag input), motivation (textarea), behavior_rules (structured input for absolute_do/absolute_dont lists), speech_pattern (textarea), growth_arc_type (select), relationship_masks (key-value input)
2. These should be in a collapsible "角色驱动设定" section to not overwhelm the UI

**Implementation approach:** The character forms likely use controlled inputs. Add new form fields following the existing pattern. For behavior_rules, a simple approach: two textarea fields (one for absolute_do, one for absolute_dont), where each line is one rule.

**Commit:**
```bash
git add frontend/src/pages/NovelDetail.tsx frontend/src/pages/CreateWizard.tsx
git commit -m "feat: character form extensions with behavior rules, motivation, speech pattern"
```

---

### Task 19: NovelDetail — Major Events management

**Files:**
- Modify: `frontend/src/pages/NovelDetail.tsx`

**Key changes:**
1. Add a "大事件" tab or section (could be under the existing outline tab)
2. Show list of major events with: title, chapter range, buildup status, expand to see buildup plan
3. "创建大事件" flow:
   - Step 1: Select chapter range for summary → call generateRangeSummary
   - Step 2: Show summary → click "生成建议" → call generateMajorEventIdeas
   - Step 3: Select/edit → fill in details → call createMajorEvent
4. Show auto-created foreshadowings in the response

**This is the most complex frontend task.** A step-by-step modal wizard is recommended.

**Commit:**
```bash
git add frontend/src/pages/NovelDetail.tsx
git commit -m "feat: major events management UI with creation wizard"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1: Models | 1-3 | NarrativeMemory model, Character +6 fields, Chapter/Intel extensions |
| 2: Prompts | 4-6 | Presets architecture, volume compressor, major event prompts |
| 3: Memory | 7-10 | P5.5/P7 layers, auto-compression, chapter prompt integration, API |
| 4: Pacing | 11-12 | Chapter type assignment, pacing instructions, outline updates |
| 5: Character | 13 | Prompt format rewrite, intel consistency check |
| 6: Major Events | 14 | Major events API with buildup plan + auto-foreshadowing |
| 7: Frontend | 15-19 | API service, volume summaries tab, chapter type selector, character form, major events UI |

**Total: 19 tasks**

After all tasks, do a full integration test:
1. Create a new novel → generate outline (should include character-driven fields)
2. Create chapters → generate chapter (should include pacing instructions in prompt)
3. Extract intel → check for character_consistency in response
4. After 30 chapters of intel → verify auto volume summary generation
5. Create a major event → verify buildup foreshadowings created

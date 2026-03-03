# 记忆系统重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构章节生成的记忆系统，增强连续性（前章原文 + 分级情报），实现伏笔优先级管理和自动回收。

**Architecture:** 重写 `ContextBuilder` 为分层架构（P0-P6），扩展 Foreshadowing 模型增加类型/预期回收字段，增强 intel 提取 prompt 实现结构化伏笔输出和建议伏笔。

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), SQLAlchemy async ORM, SQLite (dev)

---

### Task 1: 扩展 Foreshadowing 模型

**Files:**
- Modify: `backend/app/models/foreshadowing.py`
- Modify: `backend/app/schemas/style.py`

**Step 1: 添加 Foreshadowing 新字段**

在 `backend/app/models/foreshadowing.py` 的 `Foreshadowing` 类中，`progress_notes` 字段后添加：

```python
    foreshadowing_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 短线/中线/长线
    expected_resolve_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_resolve_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

**Step 2: 更新 Pydantic schemas**

在 `backend/app/schemas/style.py` 中：

`ForeshadowingCreate` 添加：
```python
    foreshadowing_type: str | None = None
    expected_resolve_start: int | None = None
    expected_resolve_end: int | None = None
```

`ForeshadowingUpdate` 添加：
```python
    description: str | None = None
    foreshadowing_type: str | None = None
    expected_resolve_start: int | None = None
    expected_resolve_end: int | None = None
```

`ForeshadowingResponse` 添加：
```python
    foreshadowing_type: str | None = None
    expected_resolve_start: int | None = None
    expected_resolve_end: int | None = None
```

**Step 3: 更新 foreshadowing update endpoint**

在 `backend/app/api/chapters.py` 的 `update_foreshadowing` 函数中，在 `if data.progress_note:` 块之前添加对新字段的处理：

```python
    for field in ("description", "foreshadowing_type", "expected_resolve_start", "expected_resolve_end"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(fs, field, val)
```

**Step 4: 验证数据库自动迁移**

重启后端，确认表已自动新增字段（SQLAlchemy metadata.create_all）。如果 SQLite 不支持 ALTER TABLE ADD COLUMN（它支持），需要删库重建。

Run: `curl http://localhost:8000/health` → `{"status":"ok"}`

**Step 5: Commit**

```bash
git add backend/app/models/foreshadowing.py backend/app/schemas/style.py backend/app/api/chapters.py
git commit -m "feat: extend Foreshadowing model with type and expected resolve range"
```

---

### Task 2: 扩展 ChapterIntel 模型

**Files:**
- Modify: `backend/app/models/chapter.py`
- Modify: `backend/app/schemas/chapter.py`

**Step 1: 添加 suggested_foreshadowings 字段**

在 `backend/app/models/chapter.py` 的 `ChapterIntel` 类中，`next_chapter_required_chars` 字段后添加：

```python
    suggested_foreshadowings: Mapped[list | None] = mapped_column(JSON, nullable=True)
```

**Step 2: 更新 ChapterIntelResponse schema**

在 `backend/app/schemas/chapter.py` 的 `ChapterIntelResponse` 中，`next_chapter_required_chars` 后添加：

```python
    suggested_foreshadowings: list | None = None
```

**Step 3: Commit**

```bash
git add backend/app/models/chapter.py backend/app/schemas/chapter.py
git commit -m "feat: add suggested_foreshadowings field to ChapterIntel"
```

---

### Task 3: 重写 ContextBuilder 分层记忆

**Files:**
- Modify: `backend/app/services/memory_system.py`

这是核心改动。完整重写 `ContextBuilder.build_context` 及其内部方法。

**Step 1: 添加 token 估算和紧迫度计算工具函数**

在 `ContextBuilder` 类之前添加：

```python
def estimate_tokens(text: str) -> int:
    """中文字符 ≈ 0.7 token，ASCII ≈ 0.25 token"""
    if not text:
        return 0
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 0.7 + other_chars * 0.25)


def compute_foreshadowing_urgency(
    current_chapter: int,
    fs: "Foreshadowing",
) -> tuple[str, str]:
    """返回 (紧迫度标签, 行动指示)"""
    start = fs.expected_resolve_start
    end = fs.expected_resolve_end

    if start is None or end is None:
        return "潜伏", ""

    if current_chapter > end:
        return "紧急回收", "请在本章回收此伏笔"
    elif current_chapter >= start:
        return "可回收", "如剧情合适，可以回收此伏笔"
    elif current_chapter >= start - 5:
        return "铺垫", "请自然提及此伏笔相关细节，保持读者记忆"
    else:
        return "潜伏", ""
```

**Step 2: 重写 `build_context` 方法签名和主逻辑**

```python
    async def build_context(
        self,
        novel_id: int,
        chapter_number: int,
        required_char_ids: list[int],
        optional_char_ids: list[int],
        foreshadowing_ids: list[int] | None = None,
        max_context_tokens: int = 128000,
    ) -> dict:
        """分层组装写作上下文，按优先级 P0-P6"""
        novel = await self.db.get(Novel, novel_id)
        token_budget = int(max_context_tokens * 0.25)
        used_tokens = 0

        layers = {}

        # P0: 小说骨架（必须保留）
        p0 = await self._build_novel_info(novel)
        layers["novel_info"] = p0
        used_tokens += estimate_tokens(p0)

        # P1: 本章配置 + 必选角色（必须保留，由 caller 组装）
        p1 = await self._build_character_context(novel_id, required_char_ids, [])
        layers["character_context"] = p1
        used_tokens += estimate_tokens(p1)

        # P2: 前 1-2 章原文
        p2 = await self._build_previous_chapters(novel_id, chapter_number)
        layers["previous_chapters"] = p2
        used_tokens += estimate_tokens(p2)

        # P3: 伏笔系统
        p3 = await self._build_foreshadowing_context(novel_id, chapter_number, foreshadowing_ids)
        layers["foreshadowing_context"] = p3
        used_tokens += estimate_tokens(p3)

        # P4: 前 3-5 章完整情报
        p4 = await self._build_full_intel(novel_id, chapter_number)
        layers["recent_intel"] = p4
        used_tokens += estimate_tokens(p4)

        # P5: 前 6-15 章情节摘要
        p5 = await self._build_summary_intel(novel_id, chapter_number)
        if used_tokens + estimate_tokens(p5) <= token_budget:
            layers["summary_intel"] = p5
            used_tokens += estimate_tokens(p5)
        else:
            layers["summary_intel"] = ""

        # P6: 可选角色 + 角色关系
        p6 = await self._build_character_context(novel_id, [], optional_char_ids)
        if used_tokens + estimate_tokens(p6) <= token_budget:
            layers["optional_characters"] = p6
            used_tokens += estimate_tokens(p6)
        else:
            layers["optional_characters"] = ""

        # 保持旧接口兼容
        layers["blueprint_context"] = await self._build_blueprint_context(novel)
        layers["style_prompt"] = await self._build_style_prompt(novel)

        return layers
```

**Step 3: 添加 `_build_previous_chapters` 方法**

在 `_build_novel_info` 方法之后添加：

```python
    async def _build_previous_chapters(self, novel_id: int, current_chapter_number: int) -> str:
        """获取前 1-2 章完整原文"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.novel_id == novel_id, Chapter.chapter_number < current_chapter_number)
            .order_by(Chapter.chapter_number.desc())
            .limit(2)
        )
        chapters = list(reversed(result.scalars().all()))
        if not chapters:
            return "（这是第一章，暂无前文）"

        parts = []
        for ch in chapters:
            header = f"--- 第{ch.chapter_number}章 {ch.title or ''} ---"
            content = ch.content or "（无内容）"
            parts.append(f"{header}\n{content}")
        return "\n\n".join(parts)
```

**Step 4: 重写 `_build_foreshadowing_context` 方法**

替换现有的 `_build_foreshadowing_context`：

```python
    async def _build_foreshadowing_context(
        self, novel_id: int, current_chapter: int, selected_ids: list[int] | None
    ) -> str:
        """构建伏笔上下文，按紧迫度排序并附带行动指示"""
        result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.novel_id == novel_id,
                Foreshadowing.status.in_(["埋设", "推进中"]),
            )
        )
        active = result.scalars().all()
        if not active:
            return ""

        # 计算紧迫度并排序（紧急 > 可回收 > 铺垫 > 潜伏）
        urgency_order = {"紧急回收": 0, "可回收": 1, "铺垫": 2, "潜伏": 3}
        items = []
        for f in active:
            urgency, instruction = compute_foreshadowing_urgency(current_chapter, f)
            items.append((urgency_order.get(urgency, 3), urgency, instruction, f))
        items.sort(key=lambda x: x[0])

        parts = ["当前活跃伏笔:"]
        for _, urgency, instruction, f in items:
            selected_marker = "【本章推进】" if selected_ids and f.id in selected_ids else ""
            range_info = ""
            if f.expected_resolve_start and f.expected_resolve_end:
                range_info = f"，预期第{f.expected_resolve_start}-{f.expected_resolve_end}章回收"
            elif f.foreshadowing_type == "长线":
                range_info = "，长线伏笔"

            line = f"  [{urgency}] #{f.id} {f.description}（埋设于第{f.created_chapter_id or '?'}章{range_info}）{selected_marker}"
            if instruction:
                line += f"\n    → {instruction}"
            parts.append(line)
        return "\n".join(parts)
```

**Step 5: 添加 `_build_full_intel` 和 `_build_summary_intel` 方法**

替换现有的 `_build_recent_intel`：

```python
    async def _build_full_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """前 3-5 章：完整情报（plot_summary + character_updates + relationship_changes + timeline_events）"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number,
                Chapter.chapter_number >= current_chapter_number - 5,
                Chapter.chapter_number < current_chapter_number - 2,  # 前 1-2 章已读原文
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
            if not intel:
                continue

            parts.append(f"--- 第{ch.chapter_number}章 {ch.title or ''} ---")
            parts.append(f"情节: {intel.plot_summary or ''}")
            if intel.character_updates:
                for cu in intel.character_updates:
                    updates = []
                    if cu.get("status_change"):
                        updates.append(f"状态: {cu['status_change']}")
                    if cu.get("emotional_state"):
                        updates.append(f"情绪: {cu['emotional_state']}")
                    if cu.get("location"):
                        updates.append(f"位置: {cu['location']}")
                    if updates:
                        parts.append(f"  {cu.get('name', '')}: {', '.join(updates)}")
            if intel.relationship_changes:
                for rc in intel.relationship_changes:
                    parts.append(f"  关系变化: {rc.get('char_a', '')}↔{rc.get('char_b', '')}: {rc.get('change', '')}")
            if intel.timeline_events:
                for te in intel.timeline_events:
                    if isinstance(te, dict):
                        parts.append(f"  时间线: {te.get('time', '')}: {te.get('event', '')}")

        return "\n".join(parts) if parts else ""

    async def _build_summary_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """前 6-15 章：仅情节摘要"""
        result = await self.db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == novel_id,
                Chapter.chapter_number < current_chapter_number - 5,
                Chapter.chapter_number >= current_chapter_number - 15,
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
                parts.append(f"第{ch.chapter_number}章摘要: {intel.plot_summary}")

        return "\n".join(parts) if parts else ""
```

**Step 6: 更新 `_build_novel_info` 确保完整传入 main_plot**

替换现有 `_build_novel_info`：

```python
    async def _build_novel_info(self, novel: Novel) -> str:
        parts = [f"小说: {novel.title}", f"类型: {novel.genre}", f"模式: {novel.mode}"]
        if novel.world_setting:
            parts.append(f"世界观: {novel.world_setting}")
        if novel.core_conflict:
            parts.append(f"核心冲突: {novel.core_conflict}")
        if novel.power_system:
            parts.append(f"力量体系: {novel.power_system}")
        if novel.protagonist_identity:
            parts.append(f"主角: {novel.protagonist_identity}")

        # 加载完整大纲（不截断 main_plot）
        result = await self.db.execute(select(Outline).where(Outline.novel_id == novel.id))
        outline = result.scalar_one_or_none()
        if outline:
            if outline.story_background:
                parts.append(f"故事背景: {outline.story_background}")
            if outline.main_plot:
                parts.append(f"主线情节: {outline.main_plot}")
        return "\n".join(parts)
```

**Step 7: 删除不再使用的 `_build_recent_intel` 方法**

删除整个 `_build_recent_intel` 方法（已被 `_build_full_intel` + `_build_summary_intel` 替代）。

**Step 8: Commit**

```bash
git add backend/app/services/memory_system.py
git commit -m "feat: rewrite ContextBuilder with layered memory architecture (P0-P6)"
```

---

### Task 4: 更新 chapter_generator prompt 模板

**Files:**
- Modify: `backend/app/prompts/chapter_generator.py`

**Step 1: 添加前章原文区块**

修改 `build_chapter_prompt` 函数，在参数列表添加 `previous_chapters: str = ""` 和 `summary_intel: str = ""`，并在 sections 组装中加入：

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
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
    ]
    if previous_chapters:
        sections.append(f"【前文原文】\n{previous_chapters}")
    sections.append(f"【本章涉及角色】\n{character_context}")
    if optional_characters:
        sections.append(f"【其他相关角色】\n{optional_characters}")
    if recent_intel:
        sections.append(f"【近期章节情报（第3-5章）】\n{recent_intel}")
    if summary_intel:
        sections.append(f"【早期章节摘要（第6-15章）】\n{summary_intel}")
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    sections.append(f"【本章要求】\n{chapter_config}")
    sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。")

    return "\n\n".join(sections)
```

**Step 2: Commit**

```bash
git add backend/app/prompts/chapter_generator.py
git commit -m "feat: add previous chapters and summary intel sections to chapter prompt"
```

---

### Task 5: 更新 writing_engine 对接新 ContextBuilder

**Files:**
- Modify: `backend/app/services/writing_engine.py`

**Step 1: 更新 `generate_chapter_stream` 传入 max_context 和使用新上下文**

修改 `generate_chapter_stream` 函数签名和内部逻辑：

在创建 provider 后，获取 max_context：
```python
    provider = get_provider(model_id)
    max_context = provider.max_context_length()
```

更新 `builder.build_context` 调用，传入 `max_context_tokens=max_context`：
```python
    ctx = await builder.build_context(
        novel_id=novel_id,
        chapter_number=chapter.chapter_number,
        required_char_ids=required_ids,
        optional_char_ids=optional_ids,
        max_context_tokens=max_context,
    )
```

更新 `chapter_generator.build_chapter_prompt` 调用，传入新字段：
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
    )
```

**Step 2: Commit**

```bash
git add backend/app/services/writing_engine.py
git commit -m "feat: pass max_context and new context layers to chapter generation"
```

---

### Task 6: 增强 intel_extractor prompt

**Files:**
- Modify: `backend/app/prompts/intel_extractor.py`

**Step 1: 重写 `build_intel_prompt`**

更新函数签名为 `build_intel_prompt(chapter_content, character_names, active_foreshadowings=None)`。

`active_foreshadowings` 是 `[{"id": 3, "description": "..."}]` 列表，用于让 LLM 按 id 匹配回收。

```python
def build_intel_prompt(
    chapter_content: str,
    character_names: list[str],
    active_foreshadowings: list[dict] | None = None,
) -> str:
    chars = "、".join(character_names)

    fs_section = ""
    if active_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}" for f in active_foreshadowings]
        fs_section = f"\n\n当前活跃伏笔（用 id 引用）：\n" + "\n".join(fs_lines)

    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}{fs_section}

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
      "location": "当前位置"
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
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]
}}

注意：
- resolved_foreshadowings 中请使用活跃伏笔列表中的 id 进行引用
- new_foreshadowings 中 type 为 "短线"(3-5章回收)/"中线"(10-30章)/"长线"(50+章)
- suggested_foreshadowings 仅在有伏笔被回收时才建议新伏笔，否则留空数组
- expected_resolve_chapter 填写预估的回收章节号"""
```

**Step 2: Commit**

```bash
git add backend/app/prompts/intel_extractor.py
git commit -m "feat: enhance intel extractor prompt with structured foreshadowing output"
```

---

### Task 7: 增强 `extract_chapter_intel` 伏笔处理

**Files:**
- Modify: `backend/app/services/writing_engine.py`

**Step 1: 更新 `extract_chapter_intel` 函数**

在函数开头获取活跃伏笔列表并传给 prompt：

```python
    # 获取活跃伏笔列表
    fs_result = await db.execute(
        select(Foreshadowing).where(
            Foreshadowing.novel_id == chapter.novel_id,
            Foreshadowing.status.in_(["埋设", "推进中"]),
        )
    )
    active_foreshadowings = [
        {"id": f.id, "description": f.description}
        for f in fs_result.scalars().all()
    ]
```

更新 `build_intel_prompt` 调用：
```python
    prompt = intel_extractor.build_intel_prompt(chapter.content, char_names, active_foreshadowings)
```

**Step 2: 替换伏笔创建逻辑**

替换 `# 创建新伏笔` 部分，改为处理结构化数据：

```python
    # 创建新伏笔（结构化数据）
    for fs_data in intel_data.get("new_foreshadowings", []):
        desc = fs_data if isinstance(fs_data, str) else fs_data.get("description", "")
        fs_type = fs_data.get("type", "中线") if isinstance(fs_data, dict) else "中线"
        expected_ch = fs_data.get("expected_resolve_chapter") if isinstance(fs_data, dict) else None

        # 计算回收范围
        resolve_start, resolve_end = None, None
        if expected_ch and isinstance(expected_ch, int) and expected_ch > 0:
            if fs_type == "短线":
                resolve_start = max(1, expected_ch - 1)
                resolve_end = expected_ch + 1
            elif fs_type == "中线":
                resolve_start = max(1, expected_ch - 5)
                resolve_end = expected_ch + 5
            # 长线不设范围

        fs = Foreshadowing(
            novel_id=chapter.novel_id,
            description=desc,
            created_chapter_id=chapter.chapter_number,
            status="埋设",
            foreshadowing_type=fs_type,
            expected_resolve_start=resolve_start,
            expected_resolve_end=resolve_end,
        )
        db.add(fs)
```

**Step 3: 添加自动回收识别逻辑**

在 `# 创建新伏笔` 块之前添加：

```python
    # 自动回收伏笔（按 id 匹配）
    for resolved in intel_data.get("resolved_foreshadowings", []):
        fs_id = resolved.get("id") if isinstance(resolved, dict) else None
        if fs_id:
            fs = await db.get(Foreshadowing, fs_id)
            if fs and fs.novel_id == chapter.novel_id and fs.status != "已回收":
                fs.status = "已回收"
                fs.resolved_chapter_id = chapter.chapter_number
```

**Step 4: 保存 suggested_foreshadowings 到 intel**

在创建 `ChapterIntel` 对象时添加 `suggested_foreshadowings` 字段：

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
    )
```

**Step 5: Commit**

```bash
git add backend/app/services/writing_engine.py
git commit -m "feat: enhance intel extraction with auto foreshadowing recovery and suggestions"
```

---

### Task 8: 增强 outline_generator prompt

**Files:**
- Modify: `backend/app/prompts/outline_generator.py`

**Step 1: 更新 prompt**

修改 `build_outline_prompt` 中的 JSON 格式要求，将 `main_plot` 扩展到 1000 字，`plot_points` 增加 `key_conflicts` 和 `foreshadowing_plan`：

将 `"main_plot": "主要情节概述，500字以内"` 改为：
```
"main_plot": "完整故事弧线（起承转合），包含主角成长路径和核心冲突演变，1000字以内"
```

将 `plot_points` 格式改为：
```json
  "plot_points": [
    {
      "chapter_range": "第1-10章",
      "title": "阶段标题",
      "summary": "这个阶段的情节概述",
      "key_conflicts": "本阶段的核心冲突",
      "foreshadowing_plan": ["计划埋设的伏笔1", "计划埋设的伏笔2"]
    }
  ],
```

**Step 2: Commit**

```bash
git add backend/app/prompts/outline_generator.py
git commit -m "feat: enhance outline prompt with expanded main_plot and foreshadowing plans"
```

---

### Task 9: 新增采纳建议伏笔 API

**Files:**
- Modify: `backend/app/api/chapters.py`
- Modify: `backend/app/services/api.ts`

**Step 1: 添加采纳建议伏笔 endpoint**

在 `backend/app/api/chapters.py` 的 `fs_router` 部分末尾添加：

```python
class AdoptSuggestionRequest(BaseModel):
    description: str
    foreshadowing_type: str = "中线"
    expected_resolve_chapter: int | None = None


@fs_router.post("/adopt-suggestion", response_model=ForeshadowingResponse)
async def adopt_suggested_foreshadowing(
    novel_id: int,
    data: AdoptSuggestionRequest,
    db: AsyncSession = Depends(get_db),
):
    """将 AI 建议的伏笔采纳为正式伏笔"""
    resolve_start, resolve_end = None, None
    if data.expected_resolve_chapter and data.expected_resolve_chapter > 0:
        if data.foreshadowing_type == "短线":
            resolve_start = max(1, data.expected_resolve_chapter - 1)
            resolve_end = data.expected_resolve_chapter + 1
        elif data.foreshadowing_type == "中线":
            resolve_start = max(1, data.expected_resolve_chapter - 5)
            resolve_end = data.expected_resolve_chapter + 5

    fs = Foreshadowing(
        novel_id=novel_id,
        description=data.description,
        status="埋设",
        foreshadowing_type=data.foreshadowing_type,
        expected_resolve_start=resolve_start,
        expected_resolve_end=resolve_end,
    )
    db.add(fs)
    await db.commit()
    await db.refresh(fs)
    return fs
```

需要在文件顶部添加 `from pydantic import BaseModel` import。

**Step 2: 添加前端 API 调用**

在 `frontend/src/services/api.ts` 的 `// Foreshadowings` 部分添加：

```typescript
export const createForeshadowing = (novelId: number, data: any) => api.post(`/novels/${novelId}/foreshadowings`, data)
export const updateForeshadowing = (novelId: number, fsId: number, data: any) => api.put(`/novels/${novelId}/foreshadowings/${fsId}`, data)
export const adoptSuggestedForeshadowing = (novelId: number, data: any) => api.post(`/novels/${novelId}/foreshadowings/adopt-suggestion`, data)
```

**Step 3: Commit**

```bash
git add backend/app/api/chapters.py frontend/src/services/api.ts
git commit -m "feat: add adopt-suggestion endpoint and foreshadowing API functions"
```

---

### Task 10: 前端 - ChapterEditor 建议伏笔 UI

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`

**Step 1: 添加 import 和状态**

在 import 行添加 `adoptSuggestedForeshadowing`：

```typescript
import {
  getChapter, updateChapter, getChapterIntel,
  listCharacters, listForeshadowings, extractIntel, getModels,
  adoptSuggestedForeshadowing,
} from '../services/api'
```

**Step 2: 在情报面板中添加建议伏笔区域**

在右侧面板 `intel.next_chapter_required_chars` 区块之后、闭合的 `</div>` 之前，添加建议伏笔区域：

```tsx
              {intel.suggested_foreshadowings && intel.suggested_foreshadowings.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">AI 建议的伏笔</label>
                  <div className="mt-1 space-y-1">
                    {intel.suggested_foreshadowings.map((sf: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-purple-50 rounded">
                        <p>{sf.description}</p>
                        {sf.reason && <p className="text-gray-400 mt-0.5">理由: {sf.reason}</p>}
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={async () => {
                              await adoptSuggestedForeshadowing(novelId, {
                                description: sf.description,
                                foreshadowing_type: sf.type || '中线',
                                expected_resolve_chapter: sf.expected_resolve_chapter,
                              })
                              queryClient.invalidateQueries({ queryKey: ['foreshadowings', novelId] })
                            }}
                            className="text-purple-600 hover:text-purple-800"
                          >
                            采纳
                          </button>
                          <button className="text-gray-400 hover:text-gray-600">忽略</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
```

**Step 3: Commit**

```bash
git add frontend/src/pages/ChapterEditor.tsx
git commit -m "feat: add suggested foreshadowing UI in chapter editor intel panel"
```

---

### Task 11: 前端 - NovelDetail 伏笔增强

**Files:**
- Modify: `frontend/src/pages/NovelDetail.tsx`

**Step 1: 添加 import**

在 import 中添加 `createForeshadowing, updateForeshadowing`：

```typescript
import {
  getNovel, getOutline, listCharacters, listChapters,
  listForeshadowings, createCharacter, createChapter, updateCharacter,
  updateOutline, regenerateNovelField, getModels, exportTxt,
  createForeshadowing, updateForeshadowing,
} from '../services/api'
```

**Step 2: 添加伏笔创建表单状态**

在组件顶部的状态声明部分添加：

```typescript
  const [showNewFs, setShowNewFs] = useState(false)
  const [newFsDesc, setNewFsDesc] = useState('')
  const [newFsType, setNewFsType] = useState('中线')
  const [newFsResolveChapter, setNewFsResolveChapter] = useState<number | ''>('')
```

**Step 3: 替换伏笔追踪 tab 内容**

替换 `{activeTab === 'foreshadowings' && (` 到其闭合 `)}` 的整个区块：

```tsx
      {activeTab === 'foreshadowings' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">伏笔追踪</h2>
            <button
              onClick={() => setShowNewFs(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              添加伏笔
            </button>
          </div>
          {showNewFs && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <textarea
                value={newFsDesc}
                onChange={e => setNewFsDesc(e.target.value)}
                placeholder="伏笔描述"
                className="w-full border rounded p-2 text-sm resize-none h-16"
              />
              <div className="flex gap-3 items-center">
                <div>
                  <label className="text-xs text-gray-500 mr-1">类型:</label>
                  <select value={newFsType} onChange={e => setNewFsType(e.target.value)} className="border rounded px-2 py-1 text-sm">
                    <option value="短线">短线 (3-5章)</option>
                    <option value="中线">中线 (10-30章)</option>
                    <option value="长线">长线 (50+章)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mr-1">预期回收章节:</label>
                  <input
                    type="number"
                    value={newFsResolveChapter}
                    onChange={e => setNewFsResolveChapter(e.target.value ? Number(e.target.value) : '')}
                    placeholder="可选"
                    className="border rounded px-2 py-1 text-sm w-20"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!newFsDesc.trim()) return
                    const resolveStart = newFsResolveChapter ? (newFsType === '短线' ? Math.max(1, Number(newFsResolveChapter) - 1) : newFsType === '中线' ? Math.max(1, Number(newFsResolveChapter) - 5) : undefined) : undefined
                    const resolveEnd = newFsResolveChapter ? (newFsType === '短线' ? Number(newFsResolveChapter) + 1 : newFsType === '中线' ? Number(newFsResolveChapter) + 5 : undefined) : undefined
                    await createForeshadowing(novelId, {
                      description: newFsDesc,
                      foreshadowing_type: newFsType,
                      expected_resolve_start: resolveStart,
                      expected_resolve_end: resolveEnd,
                    })
                    queryClient.invalidateQueries({ queryKey: ['foreshadowings', novelId] })
                    setShowNewFs(false)
                    setNewFsDesc('')
                    setNewFsType('中线')
                    setNewFsResolveChapter('')
                  }}
                  className="bg-blue-600 text-white px-4 py-1 rounded text-sm"
                >
                  添加
                </button>
                <button onClick={() => setShowNewFs(false)} className="text-gray-500 text-sm">取消</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {foreshadowings?.map((f: any) => (
              <div key={f.id} className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${
                f.status === '已回收' ? 'border-green-500' : f.status === '推进中' ? 'border-yellow-500' : 'border-blue-500'
              }`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm">{f.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {f.foreshadowing_type && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{f.foreshadowing_type}</span>
                      )}
                      {f.created_chapter_id && <span className="text-xs text-gray-400">埋设于第{f.created_chapter_id}章</span>}
                      {f.expected_resolve_start && f.expected_resolve_end && (
                        <span className="text-xs text-gray-400">预期第{f.expected_resolve_start}-{f.expected_resolve_end}章回收</span>
                      )}
                      {f.resolved_chapter_id && <span className="text-xs text-green-600">回收于第{f.resolved_chapter_id}章</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ml-2 whitespace-nowrap ${
                    f.status === '已回收' ? 'bg-green-100 text-green-700' :
                    f.status === '推进中' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{f.status}</span>
                </div>
              </div>
            ))}
            {(!foreshadowings || foreshadowings.length === 0) && <p className="text-gray-400 text-center py-8">暂无伏笔记录</p>}
          </div>
        </div>
      )}
```

**Step 4: Commit**

```bash
git add frontend/src/pages/NovelDetail.tsx
git commit -m "feat: enhance foreshadowing tab with create form, type labels, and resolve info"
```

---

### Task 12: 端到端验证

**Step 1: 重启后端**

停止并重启 uvicorn，确认无报错。可能需要删除旧 SQLite 数据库让新字段生效（`metadata.create_all` 不会 ALTER 已有表）：

```bash
# 如果新字段未生效，需要：
rm backend/write_agent.db
# 然后重启 uvicorn
```

**Step 2: 验证 API**

```bash
curl http://localhost:8000/health
curl http://localhost:8000/docs  # 检查新 endpoint 出现
```

**Step 3: 前端功能验证**

1. 打开 http://localhost:5173
2. 进入小说详情 → 伏笔追踪 tab → 测试手动创建伏笔（含类型和预期回收章节）
3. 新建章节 → 生成章节内容 → 确认情报提取包含结构化伏笔
4. 检查右侧情报面板的「建议伏笔」区域是否正常展示和采纳

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete memory system redesign with layered context and foreshadowing priority"
```

Plan complete and saved to `docs/plans/2026-03-03-memory-system-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?

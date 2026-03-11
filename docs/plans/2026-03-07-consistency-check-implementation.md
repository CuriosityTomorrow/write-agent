# 一致性检查功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 章节保存/生成后自动比对内容与设定的一致性，在 ChapterEditor 侧边栏展示冲突列表，用户可选择更新设定或忽略。

**Architecture:** 独立的 LLM 管线（不经过 ContextBuilder），与 intel 提取串联。新增 prompt 模板、service 函数、API 端点、前端 UI 区块。数据存入 ChapterIntel.consistency_conflicts JSON 字段。

**Tech Stack:** FastAPI + SQLAlchemy async / React + TanStack Query + Tailwind CSS 4

---

### Task 1: 后端 Model + Schema

**Files:**
- Modify: `backend/app/models/chapter.py:43-60` (ChapterIntel)
- Modify: `backend/app/schemas/chapter.py:42-56` (ChapterIntelResponse)

**Step 1: ChapterIntel 新增字段**

在 `backend/app/models/chapter.py` 的 ChapterIntel 类中，`detected_new_characters` 之后加：

```python
    consistency_conflicts: Mapped[list | None] = mapped_column(JSON, nullable=True)
```

**Step 2: Schema 新增字段**

在 `backend/app/schemas/chapter.py` 的 ChapterIntelResponse 中，`detected_new_characters` 之后加：

```python
    consistency_conflicts: list | None = None
```

**Step 3: 手动更新 DB**

开发环境用 SQLite，执行：

```bash
cd backend && python -c "
import sqlite3
conn = sqlite3.connect('write_agent.db')
try:
    conn.execute('ALTER TABLE chapter_intels ADD COLUMN consistency_conflicts JSON')
    conn.commit()
    print('OK')
except Exception as e:
    print(f'Already exists or error: {e}')
conn.close()
"
```

**Step 4: Commit**

```bash
git add backend/app/models/chapter.py backend/app/schemas/chapter.py
git commit -m "feat: add consistency_conflicts field to ChapterIntel"
```

---

### Task 2: Prompt 模板

**Files:**
- Create: `backend/app/prompts/consistency_checker.py`

**Step 1: 创建 prompt 文件**

```python
SYSTEM_PROMPT = """你是一位小说一致性审核专家。请仔细比对章节内容与提供的设定参考数据，找出所有不一致之处。
输出必须是严格的 JSON 格式，不要包含其他文字。"""


def build_consistency_prompt(
    chapter_content: str,
    chapter_number: int,
    novel_settings: dict,
    characters: list[dict],
    plot_point: str | None,
    prev_intel: dict | None,
    overdue_foreshadowings: list[dict] | None,
) -> str:
    # 小说设定
    settings_parts = []
    field_labels = {
        "world_setting": "世界观",
        "golden_finger": "金手指",
        "power_system": "力量体系",
        "core_conflict": "核心冲突",
        "protagonist_identity": "主角身份",
    }
    for key, label in field_labels.items():
        val = novel_settings.get(key)
        if val:
            settings_parts.append(f"  {label}: {val}")
    settings_section = "\n".join(settings_parts) if settings_parts else "  （无）"

    # 角色设定卡
    char_parts = []
    for c in characters:
        lines = [f"  【{c['name']}】 {c.get('role', '')}"]
        if c.get("personality_tags"):
            lines.append(f"    性格标签: {', '.join(c['personality_tags'])}")
        if c.get("personality"):
            lines.append(f"    性格: {c['personality']}")
        if c.get("motivation"):
            lines.append(f"    动机: {c['motivation']}")
        if c.get("speech_pattern"):
            lines.append(f"    说话方式: {c['speech_pattern']}")
        if c.get("behavior_rules"):
            rules = c["behavior_rules"]
            for do in rules.get("absolute_do", []):
                lines.append(f"    一定会做: {do}")
            for dont in rules.get("absolute_dont", []):
                lines.append(f"    绝对不做: {dont}")
        if c.get("relationship_masks"):
            for target, attitude in c["relationship_masks"].items():
                lines.append(f"    对{target}: {attitude}")
        if c.get("prev_location"):
            lines.append(f"    上一章位置: {c['prev_location']}")
        if c.get("prev_emotional_state"):
            lines.append(f"    上一章情绪: {c['prev_emotional_state']}")
        char_parts.append("\n".join(lines))
    char_section = "\n\n".join(char_parts) if char_parts else "  （无）"

    # 大纲
    outline_section = f"  本章大纲: {plot_point}" if plot_point else "  （无）"

    # 上一章时间线
    timeline_section = "  （无）"
    if prev_intel and prev_intel.get("timeline_events"):
        tl = [f"  {e['time']}: {e['event']}" for e in prev_intel["timeline_events"] if isinstance(e, dict)]
        if tl:
            timeline_section = "\n".join(tl)

    # 超期伏笔
    fs_section = "  （无）"
    if overdue_foreshadowings:
        fs_lines = [f"  #{f['id']}: {f['description']}（应在第{f['expected_resolve_end']}章前回收）" for f in overdue_foreshadowings]
        fs_section = "\n".join(fs_lines)

    return f"""请比对以下第{chapter_number}章内容与参考设定，找出所有不一致之处。

【参考设定】

小说世界观:
{settings_section}

角色设定:
{char_section}

大纲:
{outline_section}

上一章时间线:
{timeline_section}

超期未回收伏笔:
{fs_section}

【第{chapter_number}章内容】
{chapter_content}

请严格按以下 JSON 格式输出：
{{
  "conflicts": [
    {{
      "type": "world_setting/golden_finger/power_system/character_personality/character_speech/character_location/character_motivation/outline_deviation/timeline/foreshadowing_overdue",
      "severity": "high/medium/low",
      "description": "章节中的具体内容描述",
      "reference": "现有设定中的对应内容",
      "suggestion": "建议如何处理（修改章节 或 更新设定）",
      "related_entity": "关联的角色名/伏笔ID/设定字段名"
    }}
  ]
}}

注意：
- 如果没有任何不一致，返回 {{"conflicts": []}}
- severity: high=违反核心世界观/力量体系/金手指, medium=角色言行/大纲偏离, low=时间线/伏笔
- type 必须是上面列出的枚举值之一
- description 引用章节中的原文或具体描述
- reference 引用设定中的原文
- related_entity: 角色冲突填角色名，伏笔冲突填伏笔ID，设定冲突填字段名（world_setting/golden_finger/power_system）
- 仅输出真正的不一致，角色的正常成长变化不算冲突（如动机因剧情转变）"""
```

**Step 2: Commit**

```bash
git add backend/app/prompts/consistency_checker.py
git commit -m "feat: add consistency checker prompt template"
```

---

### Task 3: Service 函数

**Files:**
- Modify: `backend/app/services/writing_engine.py`

**Step 1: 新增 import**

在 `writing_engine.py` 顶部的 prompts import 行后加：

```python
from app.prompts import consistency_checker
```

**Step 2: 新增 check_consistency 函数**

在 `extract_chapter_intel` 函数之后添加：

```python
async def check_consistency(chapter_id: int, model_id: str, db: AsyncSession) -> list:
    """比对章节内容与设定的一致性"""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or not chapter.content:
        raise ValueError("Chapter not found or has no content")

    novel = await db.get(Novel, chapter.novel_id)

    # Novel 设定
    novel_settings = {
        "world_setting": novel.world_setting,
        "golden_finger": novel.golden_finger,
        "power_system": novel.power_system,
        "core_conflict": novel.core_conflict,
        "protagonist_identity": novel.protagonist_identity,
    }

    # 出场角色完整设定卡
    result = await db.execute(
        select(Character).where(Character.novel_id == chapter.novel_id)
    )
    all_characters = result.scalars().all()

    # 上一章 intel（取角色状态）
    prev_intel_data = None
    if chapter.chapter_number > 1:
        prev_chapter_result = await db.execute(
            select(Chapter).where(
                Chapter.novel_id == chapter.novel_id,
                Chapter.chapter_number == chapter.chapter_number - 1,
            )
        )
        prev_chapter = prev_chapter_result.scalar_one_or_none()
        if prev_chapter:
            prev_intel_result = await db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == prev_chapter.id)
            )
            prev_intel_obj = prev_intel_result.scalar_one_or_none()
            if prev_intel_obj:
                prev_intel_data = {
                    "timeline_events": prev_intel_obj.timeline_events,
                    "character_updates": prev_intel_obj.character_updates,
                }

    # 构建角色设定卡（含上一章状态）
    prev_char_states = {}
    if prev_intel_data and prev_intel_data.get("character_updates"):
        for cu in prev_intel_data["character_updates"]:
            if isinstance(cu, dict):
                prev_char_states[cu.get("name", "")] = cu

    char_dicts = []
    for c in all_characters:
        d = {
            "name": c.name,
            "role": c.role,
            "personality": c.personality,
            "personality_tags": c.personality_tags,
            "motivation": c.motivation,
            "behavior_rules": c.behavior_rules,
            "speech_pattern": c.speech_pattern,
            "relationship_masks": c.relationship_masks,
        }
        prev = prev_char_states.get(c.name, {})
        d["prev_location"] = prev.get("location") or c.current_location
        d["prev_emotional_state"] = prev.get("emotional_state") or c.emotional_state
        char_dicts.append(d)

    # 大纲 plot_point
    outline_result = await db.execute(
        select(Outline).where(Outline.novel_id == chapter.novel_id)
    )
    outline = outline_result.scalar_one_or_none()
    plot_point = None
    if outline and outline.plot_points:
        idx = chapter.chapter_number - 1
        if idx < len(outline.plot_points):
            pp = outline.plot_points[idx]
            if isinstance(pp, dict):
                plot_point = pp.get("summary") or pp.get("title", "")
            else:
                plot_point = str(pp)

    # 超期伏笔
    fs_result = await db.execute(
        select(Foreshadowing).where(
            Foreshadowing.novel_id == chapter.novel_id,
            Foreshadowing.status.notin_(["已回收", "已解决"]),
            Foreshadowing.expected_resolve_end.isnot(None),
            Foreshadowing.expected_resolve_end <= chapter.chapter_number,
        )
    )
    overdue_fs = [
        {"id": f.id, "description": f.description, "expected_resolve_end": f.expected_resolve_end}
        for f in fs_result.scalars().all()
    ]

    # 调 LLM
    provider = get_provider(model_id)
    prompt = consistency_checker.build_consistency_prompt(
        chapter_content=chapter.content,
        chapter_number=chapter.chapter_number,
        novel_settings=novel_settings,
        characters=char_dicts,
        plot_point=plot_point,
        prev_intel=prev_intel_data,
        overdue_foreshadowings=overdue_fs if overdue_fs else None,
    )
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=consistency_checker.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.2, max_tokens=3000, stream=False),
    )
    result_data = _parse_json(response)
    conflicts = result_data.get("conflicts", [])

    # 存入 ChapterIntel
    intel_result = await db.execute(
        select(ChapterIntel).where(ChapterIntel.chapter_id == chapter_id)
    )
    intel = intel_result.scalar_one_or_none()
    if intel:
        intel.consistency_conflicts = conflicts
        await db.commit()

    return conflicts
```

**Step 3: Commit**

```bash
git add backend/app/services/writing_engine.py
git commit -m "feat: add check_consistency service function"
```

---

### Task 4: API 端点

**Files:**
- Modify: `backend/app/api/writing.py:155-163`

**Step 1: 新增独立端点**

在 `api_extract_intel` 函数之后添加：

```python
@router.post("/novels/{novel_id}/chapters/{chapter_id}/check-consistency")
async def api_check_consistency(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    conflicts = await writing_engine.check_consistency(chapter_id, data.model_id, db)
    return {"conflicts": conflicts}
```

**Step 2: extract-intel 端点串联调用**

修改现有的 `api_extract_intel` 函数，在 `return result` 之前加一步：

```python
@router.post("/novels/{novel_id}/chapters/{chapter_id}/extract-intel")
async def api_extract_intel(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.extract_chapter_intel(chapter_id, data.model_id, db)
    # 自动触发一致性检查
    try:
        conflicts = await writing_engine.check_consistency(chapter_id, data.model_id, db)
        result["consistency_conflicts"] = conflicts
    except Exception:
        result["consistency_conflicts"] = None
    return result
```

**Step 3: Commit**

```bash
git add backend/app/api/writing.py
git commit -m "feat: add check-consistency endpoint and auto-trigger after intel extraction"
```

---

### Task 5: 前端 API 函数

**Files:**
- Modify: `frontend/src/services/api.ts`

**Step 1: 新增 API 调用**

在 `extractIntel` 之后添加：

```typescript
export const checkConsistency = (novelId: number, chapterId: number, data: any) =>
  api.post(`/novels/${novelId}/chapters/${chapterId}/check-consistency`, data)
```

**Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add checkConsistency API function"
```

---

### Task 6: 前端 UI — 一致性检查区块

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`

**Step 1: 新增 import 和 state**

在文件顶部的 api import 中加 `checkConsistency`：

```typescript
import {
  getChapter, updateChapter, getChapterIntel,
  listCharacters, listForeshadowings, extractIntel, getModels,
  adoptSuggestedForeshadowing, createCharacter, checkConsistency,
} from '../services/api'
```

在已有 state 声明区域（`addingChar` 之后）加：

```typescript
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<number>>(new Set())
  const [checkingConsistency, setCheckingConsistency] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [updatingConflict, setUpdatingConflict] = useState<number | null>(null)
```

**Step 2: 新增刷新函数**

在 `handleSave` 之后添加：

```typescript
  const handleCheckConsistency = async () => {
    if (!selectedModel) return
    setCheckingConsistency(true)
    setDismissedConflicts(new Set())
    try {
      await checkConsistency(novelId, chapterId, { model_id: selectedModel })
      refetchIntel()
    } catch {}
    setCheckingConsistency(false)
  }
```

**Step 3: 渲染一致性检查区块**

在右侧侧边栏 `{/* Detected New Characters */}` 区块之后、`</div>` 闭合之前（约 line 496 处），插入一致性检查区块：

```tsx
              {/* Consistency Check */}
              <div className="border-t pt-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500 font-medium">一致性检查</label>
                  <button
                    onClick={handleCheckConsistency}
                    disabled={checkingConsistency || !selectedModel}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {checkingConsistency ? '检查中...' : '刷新'}
                  </button>
                </div>

                {(() => {
                  const conflicts = intel?.consistency_conflicts
                  if (!conflicts) return (
                    <div className="text-xs text-gray-400">提取情报后自动检查</div>
                  )
                  if (conflicts.length === 0) return (
                    <div className="text-xs p-2 bg-green-50 text-green-700 rounded">
                      &#10003; 未发现一致性冲突
                    </div>
                  )

                  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
                  const severityEmoji: Record<string, string> = { high: '🔴', medium: '🟡', low: '🔵' }
                  const severityLabel: Record<string, string> = { high: '严重', medium: '注意', low: '提示' }
                  const typeLabel: Record<string, string> = {
                    world_setting: '世界观', golden_finger: '金手指', power_system: '力量体系',
                    character_personality: '角色性格', character_speech: '说话方式',
                    character_location: '角色位置', character_motivation: '角色动机',
                    outline_deviation: '大纲偏离', timeline: '时间线', foreshadowing_overdue: '伏笔超期',
                  }

                  const visible = conflicts
                    .map((c: any, i: number) => ({ ...c, _idx: i }))
                    .filter((_: any, i: number) => !dismissedConflicts.has(i))
                    .sort((a: any, b: any) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))

                  const ignored = conflicts.filter((_: any, i: number) => dismissedConflicts.has(i))

                  return (
                    <div className="space-y-2">
                      {visible.length === 0 && (
                        <div className="text-xs text-gray-400">所有冲突已处理</div>
                      )}
                      {visible.map((cf: any) => (
                        <div key={cf._idx} className={`text-xs p-2 rounded border ${
                          cf.severity === 'high' ? 'bg-red-50 border-red-200' :
                          cf.severity === 'medium' ? 'bg-amber-50 border-amber-200' :
                          'bg-blue-50 border-blue-200'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">
                              {severityEmoji[cf.severity]} {typeLabel[cf.type] || cf.type}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              cf.severity === 'high' ? 'bg-red-100 text-red-700' :
                              cf.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{severityLabel[cf.severity]}</span>
                          </div>
                          {cf.description && <div className="text-gray-700 mb-0.5">章节: {cf.description}</div>}
                          {cf.reference && <div className="text-gray-500 mb-0.5">设定: {cf.reference}</div>}
                          {cf.suggestion && <div className="text-gray-500 mb-1">建议: {cf.suggestion}</div>}
                          <div className="flex gap-2 mt-1">
                            {cf.type !== 'timeline' && (
                              <button
                                disabled={updatingConflict === cf._idx}
                                className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                              >
                                {updatingConflict === cf._idx ? '更新中...' : '更新设定'}
                              </button>
                            )}
                            <button
                              onClick={() => setDismissedConflicts(prev => new Set(prev).add(cf._idx))}
                              className="text-gray-400 hover:text-gray-600"
                            >忽略</button>
                          </div>
                        </div>
                      ))}

                      {ignored.length > 0 && (
                        <div className="border-t pt-2 mt-2">
                          <button
                            onClick={() => setShowIgnored(!showIgnored)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            已忽略 ({ignored.length}) {showIgnored ? '▲' : '▼'}
                          </button>
                          {showIgnored && (
                            <div className="mt-1 space-y-1">
                              {conflicts.map((cf: any, i: number) => {
                                if (!dismissedConflicts.has(i)) return null
                                return (
                                  <div key={i} className="text-xs p-1.5 bg-gray-50 rounded flex justify-between items-center">
                                    <span className="text-gray-400 truncate">
                                      {severityEmoji[cf.severity]} {typeLabel[cf.type]}: {cf.description?.slice(0, 30)}...
                                    </span>
                                    <button
                                      onClick={() => setDismissedConflicts(prev => {
                                        const next = new Set(prev)
                                        next.delete(i)
                                        return next
                                      })}
                                      className="text-xs text-blue-500 hover:text-blue-700 ml-2 shrink-0"
                                    >恢复</button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
```

**Step 4: Commit**

```bash
git add frontend/src/pages/ChapterEditor.tsx frontend/src/services/api.ts
git commit -m "feat: consistency check UI in ChapterEditor sidebar"
```

---

### Task 7: 「更新设定」交互

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`
- Modify: `frontend/src/services/api.ts`（如果 updateNovel/updateCharacter 还没 export）

**Step 1: 确认 api.ts 已有所需函数**

需要用到 `updateNovel`, `updateCharacter`, `updateOutline`。检查 `api.ts` 中是否已 export，缺的补上。

**Step 2: 实现 handleUpdateSetting 函数**

在 `handleCheckConsistency` 之后添加：

```typescript
  const handleUpdateSetting = async (conflict: any, idx: number) => {
    const msg = `当前设定:\n${conflict.reference}\n\n建议更新为:\n${conflict.suggestion}\n\n确认更新？（可直接编辑建议内容）`
    const userInput = prompt(msg, conflict.suggestion)
    if (!userInput) return

    setUpdatingConflict(idx)
    try {
      const type = conflict.type as string
      const entity = conflict.related_entity as string

      if (['world_setting', 'golden_finger', 'power_system'].includes(type)) {
        await updateNovel(novelId, { [type]: userInput })
      } else if (type.startsWith('character_') && entity) {
        const char = (characters || []).find((c: any) => c.name === entity)
        if (char) {
          const fieldMap: Record<string, string> = {
            character_personality: 'personality',
            character_speech: 'speech_pattern',
            character_location: 'current_location',
            character_motivation: 'motivation',
          }
          const field = fieldMap[type]
          if (field) {
            await updateCharacter(novelId, char.id, { [field]: userInput })
            queryClient.invalidateQueries({ queryKey: ['characters', novelId] })
          }
        }
      } else if (type === 'outline_deviation') {
        // 大纲偏离只提示，不自动修改 plot_points 结构
        alert('请前往大纲页面手动更新')
      } else if (type === 'foreshadowing_overdue') {
        alert('请前往伏笔管理页面处理')
      }

      // 更新成功后自动忽略这条
      setDismissedConflicts(prev => new Set(prev).add(idx))
    } catch (e) {
      alert('更新失败')
    }
    setUpdatingConflict(null)
  }
```

**Step 3: 绑定按钮**

将 Task 6 中「更新设定」按钮的 onClick 改为：

```tsx
<button
  onClick={() => handleUpdateSetting(cf, cf._idx)}
  disabled={updatingConflict === cf._idx}
  className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
>
  {updatingConflict === cf._idx ? '更新中...' : '更新设定'}
</button>
```

**Step 4: import 确认**

确保 ChapterEditor 顶部的 api import 包含 `updateNovel`, `updateCharacter`：

```typescript
import {
  getChapter, updateChapter, getChapterIntel,
  listCharacters, listForeshadowings, extractIntel, getModels,
  adoptSuggestedForeshadowing, createCharacter, checkConsistency,
  updateNovel, updateCharacter,
} from '../services/api'
```

**Step 5: Commit**

```bash
git add frontend/src/pages/ChapterEditor.tsx frontend/src/services/api.ts
git commit -m "feat: update-setting action for consistency conflicts"
```

---

### Task 8: 端到端验证

**Step 1: 启动后端**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

确认无 import 报错。

**Step 2: 启动前端**

```bash
cd frontend && npm run dev
```

确认编译无报错。

**Step 3: 手动测试流程**

1. 打开一个已有章节的 ChapterEditor
2. 点击「保存」或「生成」，观察 intel 提取后是否自动出现一致性检查区块
3. 确认冲突卡片按严重度排序，颜色正确
4. 点「忽略」，确认移入底部折叠区
5. 点「恢复」，确认回到列表
6. 点「更新设定」，确认 prompt 弹出且内容正确
7. 确认更新后，对应字段被修改
8. 点侧边栏「刷新」按钮，确认单独触发一致性检查

**Step 4: 最终 Commit**

确认一切正常后，如有遗漏修正一并提交。

# 章节生成中断与续写 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让用户可以中途停止章节生成、编辑内容、然后从断点继续生成。

**Architecture:** 前端加 AbortController 中断 SSE 流 + "继续生成"按钮；后端 generate 接口加 `existing_content` 参数，chapter_generator prompt 加续写指令块。前端 append 新内容到已有内容末尾。

**Tech Stack:** React (ChapterEditor.tsx), FastAPI (writing.py, writing_engine.py), Prompt (chapter_generator.py), Pydantic (chapter.py schemas)

**Note:** 本项目无测试框架，跳过 TDD 步骤。每个 Task 完成后手动验证。

---

### Task 1: 后端 Schema — 加 existing_content 参数

**Files:**
- Modify: `backend/app/schemas/chapter.py:60-62`

**Step 1: 修改 GenerateChapterRequest**

```python
class GenerateChapterRequest(BaseModel):
    model_id: str = "deepseek"
    suggestion: str = ""
    existing_content: str = ""
```

**Step 2: 验证**

启动后端，确认无报错。

**Step 3: Commit**

```bash
git add backend/app/schemas/chapter.py
git commit -m "feat: add existing_content field to GenerateChapterRequest"
```

---

### Task 2: 后端 Prompt — 加续写指令块

**Files:**
- Modify: `backend/app/prompts/chapter_generator.py:19-66`

**Step 1: 给 build_chapter_prompt 加 existing_content 参数**

在函数签名中加 `existing_content: str = ""`，然后在末尾逻辑中处理三种情况：

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
    existing_content: str = "",
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

    if existing_content:
        # 续写模式
        sections.append(f"【已写好的内容】\n{existing_content}")
        sections.append("\n请从上面已写好的内容末尾处继续写作。要求：\n1. 直接续写，不要重复已有内容，不要输出章节标题\n2. 保持与已有内容完全一致的文风、叙事视角、语气\n3. 情节自然衔接，从已有内容最后一个场景/段落继续推进\n4. 不要输出任何解释性文字，直接输出续写的正文内容")
    elif rewrite_content and rewrite_suggestion:
        sections.append(f"【当前章节内容（需改写）】\n{rewrite_content}")
        sections.append(f"【修改建议】\n{rewrite_suggestion}")
        sections.append("\n请根据修改建议，在当前章节内容的基础上进行改写。保持整体结构和情节走向，按照建议调整相关内容。直接输出改写后的完整章节（包含章节标题），不要输出任何解释性文字。\n\n重要提醒：改写时仍需确保与【前文原文】的连续性——开头必须承接前一章结尾，不可断裂。")
    else:
        sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。\n\n重要提醒：如果有【前文原文】，你的开头必须紧密承接前一章的最后场景。仔细看前一章最后几段发生了什么——那就是你的起点。")

    return "\n\n".join(sections)
```

**Step 2: 验证**

后端无报错即可。

**Step 3: Commit**

```bash
git add backend/app/prompts/chapter_generator.py
git commit -m "feat: add continuation mode to chapter_generator prompt"
```

---

### Task 3: 后端 Service — generate_chapter_stream 支持续写

**Files:**
- Modify: `backend/app/services/writing_engine.py:553-659`

**Step 1: 函数签名加 existing_content 参数**

在 `writing_engine.py:553` 的 `generate_chapter_stream` 函数签名中加 `existing_content: str = ""`。

**Step 2: 传递 existing_content 到 prompt builder**

在 `writing_engine.py:630` 的 `build_chapter_prompt` 调用中加 `existing_content=existing_content`。

**Step 3: 修改内容保存逻辑**

在 `writing_engine.py:646-659`，续写时保存的内容应该是 existing_content + 新生成的内容：

```python
    full_content = ""
    async for chunk in provider.generate(
        messages=[Message(role="user", content=prompt)],
        system_prompt=system_prompt,
        config=GenerateConfig(temperature=0.8, max_tokens=8000),
    ):
        full_content += chunk
        yield chunk

    # 生成完毕后更新章节内容
    final_content = existing_content + full_content if existing_content else full_content
    chapter.content = final_content
    chapter.actual_word_count = len(final_content)
    chapter.status = "已完成"
    await db.commit()
```

**Step 4: 验证**

后端无报错即可。

**Step 5: Commit**

```bash
git add backend/app/services/writing_engine.py
git commit -m "feat: generate_chapter_stream supports existing_content for continuation"
```

---

### Task 4: 后端 API — 透传 existing_content

**Files:**
- Modify: `backend/app/api/writing.py:140-152`

**Step 1: 在 api_generate_chapter 中透传参数**

```python
@router.post("/novels/{novel_id}/chapters/{chapter_id}/generate")
async def api_generate_chapter(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    async def event_stream():
        async for chunk in writing_engine.generate_chapter_stream(
            novel_id, chapter_id, data.model_id, db,
            suggestion=data.suggestion,
            existing_content=data.existing_content,
        ):
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**Step 2: 验证**

后端无报错即可。

**Step 3: Commit**

```bash
git add backend/app/api/writing.py
git commit -m "feat: pass existing_content through generate chapter API"
```

---

### Task 5: 前端 — AbortController + 停止按钮 + 续写逻辑

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`

**Step 1: 加 AbortController ref**

在组件顶部（`contentRef` 旁边）加：

```typescript
const abortRef = useRef<AbortController | null>(null)
```

**Step 2: 重写 generateChapter 函数，支持三种模式**

替换原来的 `generateChapter` 函数（第83-129行）：

```typescript
const generateChapter = async (suggestion: string = '', continueFromExisting: boolean = false) => {
    if (!selectedModel) {
      alert('请先选择 AI 模型')
      return
    }

    const abortController = new AbortController()
    abortRef.current = abortController

    setGenerating(true)
    setShowRegenInput(false)
    setRegenSuggestion('')

    const existingContent = continueFromExisting ? content : ''
    if (!continueFromExisting) {
      setContent('')
    }

    let wasAborted = false

    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: selectedModel,
          suggestion,
          chapter_type: chapterType === 'auto' ? undefined : chapterType,
          existing_content: existingContent || undefined,
        }),
        signal: abortController.signal,
      })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = existingContent
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              fullContent += data.content
              setContent(fullContent)
            } catch {}
          }
        }
      }
      // Auto extract intel only if not aborted
      setSaved(false)
      setExtracting(true)
      await extractIntel(novelId, chapterId, { model_id: selectedModel })
      refetchIntel()
      setExtracting(false)
      queryClient.invalidateQueries({ queryKey: ['chapter', novelId, chapterId] })
    } catch (e: any) {
      if (e.name === 'AbortError') {
        wasAborted = true
        setSaved(false)
      } else {
        alert('生成失败，请重试')
      }
    }
    abortRef.current = null
    setGenerating(false)
  }

  const stopGenerating = () => {
    abortRef.current?.abort()
  }
```

**Step 3: 修改按钮区域**

替换顶栏按钮区域（第232-244行附近）。把原来的单个生成按钮改为多按钮逻辑：

```tsx
{generating ? (
  <button
    onClick={stopGenerating}
    className="bg-red-500 text-white px-4 py-1.5 rounded text-sm hover:bg-red-600"
  >
    停止生成
  </button>
) : content ? (
  <>
    <button
      onClick={() => generateChapter('', true)}
      className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
    >
      继续生成
    </button>
    <button
      onClick={() => setShowRegenInput(!showRegenInput)}
      className="bg-gray-500 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-600"
    >
      重新生成
    </button>
  </>
) : (
  <button
    onClick={() => generateChapter()}
    className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
  >
    生成章节
  </button>
)}
```

**Step 4: 去掉 textarea 的 readOnly**

第363行，把 `readOnly={generating}` 删掉，让用户在生成时也能看到内容（虽然生成中编辑会被覆盖，但至少停止后立即可编辑）。

**Step 5: 验证**

1. 打开 ChapterEditor，无内容时显示「生成章节」
2. 点生成，显示「停止生成」，SSE 流式输出
3. 点停止，流中断，textarea 可编辑，显示「继续生成」+「重新生成」
4. 编辑内容后点「继续生成」，新内容 append 到末尾
5. 生成完整结束（不中断）后自动提取 intel
6. 中断后不提取 intel

**Step 6: Commit**

```bash
git add frontend/src/pages/ChapterEditor.tsx
git commit -m "feat: stop/continue generation with AbortController and continuation mode"
```

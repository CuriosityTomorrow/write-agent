import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getChapter, updateChapter, getChapterIntel,
  listCharacters, listForeshadowings, extractIntel, getModels,
  adoptSuggestedForeshadowing, createCharacter, checkConsistency,
  updateNovel, updateCharacter,
} from '../services/api'

interface Model {
  id: string
  name: string
  available: boolean
}

export default function ChapterEditor() {
  const { novelId: nid, chapterId: cid } = useParams<{ novelId: string; chapterId: string }>()
  const novelId = Number(nid)
  const chapterId = Number(cid)
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [content, setContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [saved, setSaved] = useState(true)
  const [showRegenInput, setShowRegenInput] = useState(false)
  const [regenSuggestion, setRegenSuggestion] = useState('')
  const [chapterType, setChapterType] = useState<string>('auto')
  const [chapterOutline, setChapterOutline] = useState('')
  const [outlineEdited, setOutlineEdited] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set())
  const [addingChar, setAddingChar] = useState<string | null>(null)
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<number>>(new Set())
  const [resolvedConflicts, setResolvedConflicts] = useState<Set<number>>(new Set())
  const [pendingRevisions, setPendingRevisions] = useState<Set<number>>(new Set())
  const [checkingConsistency, setCheckingConsistency] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [showPending, setShowPending] = useState(true)
  const [updatingConflict, setUpdatingConflict] = useState<number | null>(null)

  const { data: chapter } = useQuery({
    queryKey: ['chapter', novelId, chapterId],
    queryFn: () => getChapter(novelId, chapterId).then(r => r.data),
  })
  const { data: intel, refetch: refetchIntel } = useQuery({
    queryKey: ['intel', novelId, chapterId],
    queryFn: () => getChapterIntel(novelId, chapterId).then(r => r.data),
  })
  const { data: characters } = useQuery({
    queryKey: ['characters', novelId],
    queryFn: () => listCharacters(novelId).then(r => r.data),
  })
  const { data: foreshadowings } = useQuery({
    queryKey: ['foreshadowings', novelId],
    queryFn: () => listForeshadowings(novelId).then(r => r.data),
  })

  useEffect(() => {
    getModels().then(r => {
      const available = r.data.models?.filter((m: Model) => m.available) || []
      setModels(available)
      if (available.length > 0) setSelectedModel(available[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (chapter?.content) {
      setContent(chapter.content)
    }
    if (chapter?.chapter_type) {
      setChapterType(chapter.chapter_type)
    }
    if (chapter?.chapter_outline !== undefined) {
      setChapterOutline(chapter.chapter_outline || '')
    }
  }, [chapter])

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
      // Auto extract intel only if completed (not aborted)
      setSaved(false)
      setExtracting(true)
      await extractIntel(novelId, chapterId, { model_id: selectedModel })
      refetchIntel()
      setExtracting(false)
      queryClient.invalidateQueries({ queryKey: ['chapter', novelId, chapterId] })
    } catch (e: any) {
      if (e.name === 'AbortError') {
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

  const handleSave = async () => {
    await updateChapter(novelId, chapterId, {
      content,
      ...(outlineEdited ? { chapter_outline: chapterOutline || null } : {}),
      chapter_type: chapterType === 'auto' ? null : chapterType,
    })
    setSaved(true)
    queryClient.invalidateQueries({ queryKey: ['chapter', novelId, chapterId] })
    // 保存后自动重新提取章节情报
    if (selectedModel && content.trim()) {
      setExtracting(true)
      try {
        await extractIntel(novelId, chapterId, { model_id: selectedModel })
        refetchIntel()
      } catch {}
      setExtracting(false)
    }
  }

  const handleCheckConsistency = async () => {
    if (!selectedModel) return
    setCheckingConsistency(true)
    setDismissedConflicts(new Set())
    setResolvedConflicts(new Set())
    setPendingRevisions(new Set())
    try {
      await checkConsistency(novelId, chapterId, { model_id: selectedModel })
      refetchIntel()
    } catch {}
    setCheckingConsistency(false)
  }

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
        alert('请前往大纲页面手动更新')
      } else if (type === 'foreshadowing_overdue') {
        alert('请前往伏笔管理页面处理')
      } else if (type === 'timeline') {
        alert('时间线冲突已记录，请在章节内容中核实修正')
      }

      setResolvedConflicts(prev => new Set(prev).add(idx))
    } catch (e) {
      alert('更新失败')
    }
    setUpdatingConflict(null)
  }

  const handleContentChange = (val: string) => {
    setContent(val)
    setSaved(false)
  }

  const wordCount = content.length

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/novel/${novelId}`} className="text-sm text-blue-600 hover:underline">← 返回</Link>
          <span className="font-medium">第{chapter?.chapter_number || '?'}章</span>
          <span className="text-sm text-gray-500">{wordCount} 字</span>
          {!saved && <span className="text-xs text-orange-500">未保存</span>}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
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
          <button
            onClick={handleSave}
            disabled={saved}
            className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>

      {/* Regen suggestion bar */}
      {showRegenInput && (
        <div className="bg-yellow-50 border-b px-4 py-2 flex items-center gap-3">
          <input
            value={regenSuggestion}
            onChange={e => setRegenSuggestion(e.target.value)}
            placeholder="输入修改建议（留空则完全重写）"
            className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => { if (e.key === 'Enter') generateChapter(regenSuggestion) }}
            autoFocus
          />
          <button
            onClick={() => generateChapter(regenSuggestion)}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            {regenSuggestion.trim() ? '改写' : '重写'}
          </button>
          <button
            onClick={() => { setShowRegenInput(false); setRegenSuggestion('') }}
            className="text-gray-500 text-sm hover:text-gray-700"
          >
            取消
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Config */}
        <div className="w-64 bg-gray-50 border-r p-4 overflow-y-auto">
          <h3 className="font-medium text-sm mb-3">章节配置</h3>

          <div className="mb-4">
            <label className="text-xs text-gray-500">章节大纲</label>
            <textarea
              value={chapterOutline}
              onChange={e => { setChapterOutline(e.target.value); setOutlineEdited(true); setSaved(false) }}
              placeholder="输入章节大纲..."
              className="w-full mt-1 border rounded px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />
          </div>

          {chapter?.conflict_description && (
            <div className="mb-4">
              <label className="text-xs text-gray-500">本章冲突</label>
              <p className="text-sm mt-1">{chapter.conflict_description}</p>
            </div>
          )}

          <div className="mb-4">
            <label className="text-xs text-gray-500">目标字数</label>
            <p className="text-sm mt-1">{chapter?.target_word_count || 3000} 字</p>
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-1">章节类型</label>
            <select
              value={chapterType}
              onChange={e => { setChapterType(e.target.value); setSaved(false) }}
              className="w-full border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="auto">自动</option>
              <option value="setup">铺垫</option>
              <option value="transition">递进</option>
              <option value="climax">高潮</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-2">角色列表</label>
            <div className="space-y-1">
              {characters?.map((c: any) => (
                <div key={c.id} className="text-xs p-1.5 bg-white rounded flex justify-between">
                  <span>{c.name}</span>
                  <span className="text-gray-400">{c.role}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-2">活跃伏笔</label>
            <div className="space-y-1">
              {foreshadowings?.filter((f: any) => f.status !== '已解决').map((f: any) => (
                <div key={f.id} className="text-xs p-1.5 bg-white rounded">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${f.status === '推进中' ? 'bg-yellow-400' : 'bg-blue-400'}`}></span>
                  {f.description}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {generating && (
            <div className="mb-2 text-sm text-blue-600 animate-pulse">AI 正在生成中...</div>
          )}
          {extracting && (
            <div className="mb-2 text-sm text-green-600 animate-pulse">正在提取章节情报...</div>
          )}
          <textarea
            ref={contentRef}
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            placeholder="章节内容将在这里显示。点击「生成章节」开始创作..."
            className="w-full h-full min-h-[600px] p-4 text-base leading-relaxed resize-none focus:outline-none bg-white rounded-lg shadow-sm"
          />
        </div>

        {/* Right panel: Intel */}
        <div className="w-72 bg-gray-50 border-l p-4 overflow-y-auto">
          <h3 className="font-medium text-sm mb-3">章节情报</h3>

          {!intel ? (
            <p className="text-xs text-gray-400">生成章节后将自动提取情报</p>
          ) : (
            <div className="space-y-4">
              {intel.plot_summary && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">情节摘要</label>
                  <p className="text-sm mt-1">{intel.plot_summary}</p>
                </div>
              )}

              {intel.character_updates && intel.character_updates.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">角色变化</label>
                  <div className="mt-1 space-y-1">
                    {intel.character_updates.map((cu: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-white rounded">
                        <strong>{cu.name}</strong>
                        {cu.status_change && <div>状态: {cu.status_change}</div>}
                        {cu.emotional_state && <div>情绪: {cu.emotional_state}</div>}
                        {cu.location && <div>位置: {cu.location}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {intel.relationship_changes && intel.relationship_changes.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">关系变化</label>
                  <div className="mt-1 space-y-1">
                    {intel.relationship_changes.map((rc: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-white rounded">
                        {rc.char_a} ↔ {rc.char_b}: {rc.change}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {intel.new_foreshadowings && intel.new_foreshadowings.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">新伏笔</label>
                  <div className="mt-1 space-y-1">
                    {intel.new_foreshadowings.map((f: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-blue-50 rounded">
                        {typeof f === 'string' ? f : f.description}
                        {typeof f === 'object' && f.type && <span className="ml-1 text-gray-400">({f.type})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {intel.timeline_events && intel.timeline_events.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">时间线事件</label>
                  <div className="mt-1 space-y-1">
                    {intel.timeline_events.map((e: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-white rounded">
                        {typeof e === 'string' ? e : `${e.time}: ${e.event}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {intel.next_chapter_required_chars && intel.next_chapter_required_chars.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">下章必现角色</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {intel.next_chapter_required_chars.map((name: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {intel.suggested_foreshadowings && intel.suggested_foreshadowings.filter((_: any, i: number) => !dismissedSuggestions.has(i)).length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">AI 建议的伏笔</label>
                  <div className="mt-1 space-y-1">
                    {intel.suggested_foreshadowings.map((sf: any, i: number) => {
                      if (dismissedSuggestions.has(i)) return null
                      return (
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
                              setDismissedSuggestions(prev => new Set(prev).add(i))
                            }}
                            className="text-purple-600 hover:text-purple-800"
                          >
                            采纳
                          </button>
                          <button
                            onClick={() => setDismissedSuggestions(prev => new Set(prev).add(i))}
                            className="text-gray-400 hover:text-gray-600"
                          >忽略</button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Character Consistency */}
              <div>
                <label className="text-xs text-gray-500 font-medium">角色一致性</label>
                {!intel.character_consistency || intel.character_consistency.length === 0 ? (
                  <div className="mt-1 text-xs p-2 bg-green-50 text-green-700 rounded">
                    &#10003; 角色行为一致
                  </div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {intel.character_consistency.map((cc: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <strong className="text-amber-800">{cc.name}</strong>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            cc.severity === 'major'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {cc.severity === 'major' ? '严重' : '轻微'}
                          </span>
                        </div>
                        {cc.action && <div className="text-gray-600">行为: {cc.action}</div>}
                        {cc.rule_violated && <div className="text-amber-700">违反: {cc.rule_violated}</div>}
                        {cc.suggestion && <div className="text-gray-500 mt-0.5">建议: {cc.suggestion}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detected New Characters */}
              {intel.detected_new_characters && intel.detected_new_characters.length > 0 && (() => {
                const charNames = new Set((characters || []).map((c: any) => c.name))
                const newChars = intel.detected_new_characters.filter((nc: any) => !charNames.has(nc.name))
                if (newChars.length === 0) return null
                return (
                  <div>
                    <label className="text-xs text-emerald-700 font-medium">发现新角色</label>
                    <div className="mt-1 space-y-1">
                      {newChars.map((nc: any, i: number) => (
                        <div key={i} className="text-xs p-2 bg-emerald-50 border border-emerald-200 rounded">
                          <div className="flex items-center justify-between mb-1">
                            <strong className="text-emerald-800">{nc.name}</strong>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                              {nc.role || '龙套'}
                            </span>
                          </div>
                          {nc.identity && <div className="text-gray-600">身份: {nc.identity}</div>}
                          {nc.first_appearance_context && <div className="text-gray-500 mt-0.5">初登场: {nc.first_appearance_context}</div>}
                          <button
                            onClick={async () => {
                              setAddingChar(nc.name)
                              try {
                                await createCharacter(novelId, {
                                  name: nc.name,
                                  gender: nc.gender || null,
                                  role: nc.role || '龙套',
                                  identity: nc.identity || '',
                                })
                                queryClient.invalidateQueries({ queryKey: ['characters', novelId] })
                              } catch {}
                              setAddingChar(null)
                            }}
                            disabled={addingChar === nc.name}
                            className="mt-1.5 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                          >
                            {addingChar === nc.name ? '添加中...' : '添加到角色表'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

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
                    .filter((_: any, i: number) => !dismissedConflicts.has(i) && !resolvedConflicts.has(i) && !pendingRevisions.has(i))
                    .sort((a: any, b: any) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))

                  const ignored = conflicts.filter((_: any, i: number) => dismissedConflicts.has(i))
                  const resolved = conflicts.filter((_: any, i: number) => resolvedConflicts.has(i))
                  const pending = conflicts.filter((_: any, i: number) => pendingRevisions.has(i))

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
                              <button
                                onClick={() => handleUpdateSetting(cf, cf._idx)}
                                disabled={updatingConflict === cf._idx}
                                className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                              >
                                {updatingConflict === cf._idx ? '更新中...' : '更新设定'}
                              </button>
                            <button
                              onClick={() => setPendingRevisions(prev => new Set(prev).add(cf._idx))}
                              className="text-orange-500 hover:text-orange-700"
                            >章节待改</button>
                            <button
                              onClick={() => setDismissedConflicts(prev => new Set(prev).add(cf._idx))}
                              className="text-gray-400 hover:text-gray-600"
                            >忽略</button>
                          </div>
                        </div>
                      ))}

                      {resolved.length > 0 && (
                        <div className="border-t pt-2 mt-2">
                          <button
                            onClick={() => setShowResolved(!showResolved)}
                            className="text-xs text-green-500 hover:text-green-700"
                          >
                            已处理 ({resolved.length}) {showResolved ? '▲' : '▼'}
                          </button>
                          {showResolved && (
                            <div className="mt-1 space-y-1">
                              {conflicts.map((cf: any, i: number) => {
                                if (!resolvedConflicts.has(i)) return null
                                return (
                                  <div key={i} className="text-xs p-1.5 bg-green-50 rounded flex justify-between items-center">
                                    <span className="text-green-600 truncate">
                                      ✓ {typeLabel[cf.type]}: {cf.description?.slice(0, 30)}...
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {pending.length > 0 && (
                        <div className="border-t pt-2 mt-2">
                          <button
                            onClick={() => setShowPending(!showPending)}
                            className="text-xs text-orange-500 hover:text-orange-700"
                          >
                            章节待改 ({pending.length}) {showPending ? '▲' : '▼'}
                          </button>
                          {showPending && (
                            <div className="mt-1 space-y-1">
                              {conflicts.map((cf: any, i: number) => {
                                if (!pendingRevisions.has(i)) return null
                                return (
                                  <div key={i} className="text-xs p-1.5 bg-orange-50 border border-orange-200 rounded">
                                    <div className="flex justify-between items-start">
                                      <span className="text-orange-700">
                                        ✎ {typeLabel[cf.type]}: {cf.description?.slice(0, 40)}
                                      </span>
                                    </div>
                                    {cf.reference && <div className="text-gray-500 mt-0.5">设定: {cf.reference}</div>}
                                    <div className="flex gap-2 mt-1">
                                      <button
                                        onClick={() => {
                                          setPendingRevisions(prev => { const n = new Set(prev); n.delete(i); return n })
                                          setResolvedConflicts(prev => new Set(prev).add(i))
                                        }}
                                        className="text-green-600 hover:text-green-800"
                                      >已修改</button>
                                      <button
                                        onClick={() => {
                                          setPendingRevisions(prev => { const n = new Set(prev); n.delete(i); return n })
                                        }}
                                        className="text-blue-500 hover:text-blue-700"
                                      >撤回</button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

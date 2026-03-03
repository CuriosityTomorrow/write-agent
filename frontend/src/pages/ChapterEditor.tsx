import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getChapter, updateChapter, getChapterIntel,
  listCharacters, listForeshadowings, extractIntel, getModels,
  adoptSuggestedForeshadowing,
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

  const [content, setContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [saved, setSaved] = useState(true)
  const [showRegenInput, setShowRegenInput] = useState(false)
  const [regenSuggestion, setRegenSuggestion] = useState('')

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
  }, [chapter])

  const generateChapter = async (suggestion: string = '') => {
    if (!selectedModel) {
      alert('请先选择 AI 模型')
      return
    }
    setGenerating(true)
    setShowRegenInput(false)
    setRegenSuggestion('')
    setContent('')
    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: selectedModel, suggestion }),
      })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
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
      // Auto extract intel
      setExtracting(true)
      await extractIntel(novelId, chapterId, { model_id: selectedModel })
      refetchIntel()
      setExtracting(false)
      queryClient.invalidateQueries({ queryKey: ['chapter', novelId, chapterId] })
    } catch (e) {
      alert('生成失败，请重试')
    }
    setGenerating(false)
  }

  const handleSave = async () => {
    await updateChapter(novelId, chapterId, { content })
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
          <button
            onClick={() => {
              if (content && !generating) {
                setShowRegenInput(!showRegenInput)
              } else {
                generateChapter()
              }
            }}
            disabled={generating}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? '生成中...' : content ? '重新生成' : '生成章节'}
          </button>
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

          {chapter?.chapter_outline && (
            <div className="mb-4">
              <label className="text-xs text-gray-500">章节大纲</label>
              <p className="text-sm mt-1">{chapter.chapter_outline}</p>
            </div>
          )}

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
            readOnly={generating}
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

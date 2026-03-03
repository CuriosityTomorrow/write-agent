import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNovel, getOutline, listCharacters, listChapters,
  listForeshadowings, createCharacter, createChapter, updateCharacter,
  updateOutline, regenerateNovelField, getModels, exportTxt,
  createForeshadowing,
} from '../services/api'

export default function NovelDetail() {
  const { id } = useParams<{ id: string }>()
  const novelId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'outline' | 'characters' | 'chapters' | 'foreshadowings'>('chapters')
  const [showNewChar, setShowNewChar] = useState(false)
  const [newCharName, setNewCharName] = useState('')
  const [newCharRole, setNewCharRole] = useState('配角')
  const [newCharIdentity, setNewCharIdentity] = useState('')
  const [showNewChapter, setShowNewChapter] = useState(false)
  const [newChapterOutline, setNewChapterOutline] = useState('')
  const [newChapterWordCount, setNewChapterWordCount] = useState(3000)

  // Models for AI features
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    getModels().then(r => {
      const available = r.data.models?.filter((m: any) => m.available) || []
      setModels(available)
      if (available.length > 0) setSelectedModel(available[0].id)
    }).catch(() => {})
  }, [])

  // Outline editing (Task 3)
  const [outlineEditing, setOutlineEditing] = useState(false)
  const [editOutline, setEditOutline] = useState<any>(null)
  const [outlineRegenField, setOutlineRegenField] = useState<string | null>(null)
  const [outlineRegenSuggestion, setOutlineRegenSuggestion] = useState('')
  const [outlineRegenLoading, setOutlineRegenLoading] = useState(false)
  const [outlineSaving, setOutlineSaving] = useState(false)

  // Chapter AI generation (Task 4)
  const [chapterAiLoading, setChapterAiLoading] = useState(false)
  const [showChapterAiSuggestion, setShowChapterAiSuggestion] = useState(false)
  const [chapterAiSuggestion, setChapterAiSuggestion] = useState('')

  // Foreshadowing creation
  const [showNewFs, setShowNewFs] = useState(false)
  const [newFsDesc, setNewFsDesc] = useState('')
  const [newFsType, setNewFsType] = useState('中线')
  const [newFsResolveChapter, setNewFsResolveChapter] = useState<number | ''>('')

  // Character editing (Task 5)
  const [editingCharId, setEditingCharId] = useState<number | null>(null)
  const [editChar, setEditChar] = useState<any>(null)
  const [charSaving, setCharSaving] = useState(false)

  const { data: novel } = useQuery({ queryKey: ['novel', novelId], queryFn: () => getNovel(novelId).then(r => r.data) })
  const { data: outline } = useQuery({ queryKey: ['outline', novelId], queryFn: () => getOutline(novelId).then(r => r.data) })
  const { data: characters } = useQuery({ queryKey: ['characters', novelId], queryFn: () => listCharacters(novelId).then(r => r.data) })
  const { data: chapters } = useQuery({ queryKey: ['chapters', novelId], queryFn: () => listChapters(novelId).then(r => r.data) })
  const { data: foreshadowings } = useQuery({ queryKey: ['foreshadowings', novelId], queryFn: () => listForeshadowings(novelId).then(r => r.data) })

  const addCharMutation = useMutation({
    mutationFn: () => createCharacter(novelId, { name: newCharName, role: newCharRole, identity: newCharIdentity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', novelId] })
      setShowNewChar(false)
      setNewCharName('')
      setNewCharRole('配角')
      setNewCharIdentity('')
    },
  })

  const addChapterMutation = useMutation({
    mutationFn: () => createChapter(novelId, { chapter_outline: newChapterOutline, target_word_count: newChapterWordCount }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', novelId] })
      setShowNewChapter(false)
      setNewChapterOutline('')
      navigate(`/novel/${String(novelId)}/chapter/${String(res.data.id)}`)
    },
  })

  // --- Outline editing handlers ---
  const startEditOutline = () => {
    if (outline) {
      setEditOutline({
        story_background: outline.story_background || '',
        main_plot: outline.main_plot || '',
        plot_points: outline.plot_points ? [...outline.plot_points] : [],
      })
      setOutlineEditing(true)
    }
  }

  const cancelEditOutline = () => {
    setOutlineEditing(false)
    setEditOutline(null)
    setOutlineRegenField(null)
    setOutlineRegenSuggestion('')
  }

  const saveOutline = async () => {
    if (!editOutline) return
    setOutlineSaving(true)
    try {
      await updateOutline(novelId, editOutline)
      queryClient.invalidateQueries({ queryKey: ['outline', novelId] })
      setOutlineEditing(false)
      setEditOutline(null)
    } catch { alert('保存失败') }
    setOutlineSaving(false)
  }

  const handleOutlineRegen = async (fieldName: string) => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    setOutlineRegenLoading(true)
    try {
      let currentValue = ''
      if (fieldName === 'plot_points') {
        currentValue = JSON.stringify(editOutline?.plot_points || [], null, 2)
      } else {
        currentValue = editOutline?.[fieldName] || ''
      }
      const res = await regenerateNovelField(novelId, {
        field_name: fieldName,
        current_value: currentValue,
        suggestion: outlineRegenSuggestion,
        model_id: selectedModel,
      })
      if (fieldName === 'plot_points') {
        try {
          const parsed = JSON.parse(res.data.value)
          setEditOutline((prev: any) => ({ ...prev, plot_points: parsed }))
        } catch {
          setEditOutline((prev: any) => ({ ...prev, plot_points: res.data.value }))
        }
      } else {
        setEditOutline((prev: any) => ({ ...prev, [fieldName]: res.data.value }))
      }
      setOutlineRegenField(null)
      setOutlineRegenSuggestion('')
    } catch { alert('重新生成失败') }
    setOutlineRegenLoading(false)
  }

  // --- Chapter AI outline handler ---
  const handleChapterAiGenerate = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    setChapterAiLoading(true)
    try {
      const chapterNumber = (chapters?.length || 0) + 1
      const res = await regenerateNovelField(novelId, {
        field_name: 'chapter_outline',
        current_value: newChapterOutline,
        suggestion: chapterAiSuggestion,
        model_id: selectedModel,
        chapter_number: chapterNumber,
      })
      setNewChapterOutline(res.data.value)
      setShowChapterAiSuggestion(false)
      setChapterAiSuggestion('')
    } catch { alert('AI 生成失败') }
    setChapterAiLoading(false)
  }

  // --- Character editing handlers ---
  const startEditChar = (c: any) => {
    setEditingCharId(c.id)
    setEditChar({
      name: c.name || '',
      role: c.role || '配角',
      identity: c.identity || '',
      personality: c.personality || '',
      background: c.background || '',
      golden_finger: c.golden_finger || '',
    })
  }

  const cancelEditChar = () => {
    setEditingCharId(null)
    setEditChar(null)
  }

  const saveChar = async () => {
    if (!editChar || !editingCharId) return
    setCharSaving(true)
    try {
      await updateCharacter(novelId, editingCharId, editChar)
      queryClient.invalidateQueries({ queryKey: ['characters', novelId] })
      setEditingCharId(null)
      setEditChar(null)
    } catch { alert('保存失败') }
    setCharSaving(false)
  }

  if (!novel) return <div className="max-w-6xl mx-auto p-6">加载中...</div>

  const tabs = [
    { key: 'chapters', label: '章节管理' },
    { key: 'outline', label: '大纲' },
    { key: 'characters', label: '角色' },
    { key: 'foreshadowings', label: '伏笔追踪' },
  ] as const

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/" className="text-sm text-blue-600 hover:underline mb-2 inline-block">&larr; 返回列表</Link>
          <h1 className="text-2xl font-bold">{novel.title}</h1>
          <p className="text-sm text-gray-500">{novel.author_name} &middot; {novel.genre} &middot; {novel.mode} &middot; {novel.status}</p>
          {novel.synopsis && <p className="text-sm text-gray-600 mt-2">{novel.synopsis}</p>}
        </div>
        <a
          href={exportTxt(novelId)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
        >
          导出 TXT
        </a>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chapters tab */}
      {activeTab === 'chapters' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">章节列表 ({chapters?.length || 0})</h2>
            <button
              onClick={() => setShowNewChapter(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              新建章节
            </button>
          </div>
          {showNewChapter && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">章节大纲</label>
                    <button
                      onClick={() => {
                        if (showChapterAiSuggestion) { setShowChapterAiSuggestion(false); setChapterAiSuggestion('') }
                        else { setShowChapterAiSuggestion(true) }
                      }}
                      disabled={chapterAiLoading}
                      className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                    >
                      {chapterAiLoading ? 'AI 生成中...' : showChapterAiSuggestion ? '取消 AI' : 'AI 生成'}
                    </button>
                  </div>
                  {showChapterAiSuggestion && (
                    <div className="mb-2">
                      {models.length > 0 && (
                        <div className="mb-2">
                          <label className="text-xs text-gray-500 mr-1">模型:</label>
                          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="border rounded px-2 py-0.5 text-xs">
                            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={chapterAiSuggestion}
                          onChange={e => setChapterAiSuggestion(e.target.value)}
                          placeholder="输入要求或建议（可选，留空则自动生成）"
                          className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                          onKeyDown={e => { if (e.key === 'Enter') handleChapterAiGenerate() }}
                        />
                        <button
                          onClick={handleChapterAiGenerate}
                          disabled={chapterAiLoading}
                          className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {chapterAiLoading ? '生成中...' : '生成'}
                        </button>
                      </div>
                    </div>
                  )}
                  <textarea
                    value={newChapterOutline}
                    onChange={e => setNewChapterOutline(e.target.value)}
                    placeholder="描述本章要写的内容，或点击右上角「AI 生成」..."
                    className="w-full border rounded p-2 text-sm resize-none h-20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">目标字数</label>
                  <input type="number" value={newChapterWordCount} onChange={e => setNewChapterWordCount(Number(e.target.value))} className="border rounded p-2 text-sm w-32" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addChapterMutation.mutate()} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">创建并进入编辑</button>
                  <button onClick={() => { setShowNewChapter(false); setShowChapterAiSuggestion(false) }} className="text-gray-500 text-sm">取消</button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {chapters?.map((ch: any) => (
              <Link
                key={ch.id}
                to={`/novel/${String(novelId)}/chapter/${String(ch.id)}`}
                className="block bg-white rounded-lg p-4 shadow-sm hover:shadow transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">第{ch.chapter_number}章</span>
                    {ch.title && <span className="ml-2 text-gray-600">{ch.title}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {ch.actual_word_count && <span>{ch.actual_word_count}字</span>}
                    <span className={ch.status === '已完成' ? 'text-green-600' : 'text-yellow-600'}>{ch.status}</span>
                  </div>
                </div>
                {ch.chapter_outline && <p className="text-sm text-gray-500 mt-1 truncate">{ch.chapter_outline}</p>}
              </Link>
            ))}
            {(!chapters || chapters.length === 0) && <p className="text-gray-400 text-center py-8">暂无章节，点击"新建章节"开始写作</p>}
          </div>
        </div>
      )}

      {/* Outline tab */}
      {activeTab === 'outline' && outline && !outlineEditing && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-end mb-4">
            <button onClick={startEditOutline} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">编辑</button>
          </div>
          {outline.story_background && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-600 text-sm">故事背景</h3>
              <p className="mt-1">{outline.story_background}</p>
            </div>
          )}
          {outline.main_plot && (
            <div className="mb-4">
              <h3 className="font-medium text-gray-600 text-sm">主线情节</h3>
              <p className="mt-1">{outline.main_plot}</p>
            </div>
          )}
          {outline.plot_points && (
            <div>
              <h3 className="font-medium text-gray-600 text-sm">情节点</h3>
              <div className="mt-1 space-y-1">
                {outline.plot_points.map((p: any, i: number) => (
                  <div key={i} className="text-sm">{i + 1}. {typeof p === 'string' ? p : p.description || p.summary || JSON.stringify(p)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Outline tab - edit mode */}
      {activeTab === 'outline' && outlineEditing && editOutline && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">编辑大纲</h2>
            <div className="flex items-center gap-3">
              {models.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mr-1">模型:</label>
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="border rounded px-2 py-1 text-xs">
                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={saveOutline} disabled={outlineSaving} className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
                {outlineSaving ? '保存中...' : '保存'}
              </button>
              <button onClick={cancelEditOutline} className="text-gray-500 text-sm hover:text-gray-700">取消</button>
            </div>
          </div>

          {/* story_background */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-sm text-gray-600">故事背景</h3>
              <button
                onClick={() => { setOutlineRegenField(outlineRegenField === 'story_background' ? null : 'story_background'); setOutlineRegenSuggestion('') }}
                disabled={outlineRegenLoading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {outlineRegenField === 'story_background' ? '取消' : '重新生成'}
              </button>
            </div>
            <textarea
              value={editOutline.story_background}
              onChange={e => setEditOutline((prev: any) => ({ ...prev, story_background: e.target.value }))}
              className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            {outlineRegenField === 'story_background' && (
              <div className="mt-1 flex gap-2">
                <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegen('story_background') }} />
                <button onClick={() => handleOutlineRegen('story_background')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
              </div>
            )}
          </div>

          {/* main_plot */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-sm text-gray-600">主线情节</h3>
              <button
                onClick={() => { setOutlineRegenField(outlineRegenField === 'main_plot' ? null : 'main_plot'); setOutlineRegenSuggestion('') }}
                disabled={outlineRegenLoading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {outlineRegenField === 'main_plot' ? '取消' : '重新生成'}
              </button>
            </div>
            <textarea
              value={editOutline.main_plot}
              onChange={e => setEditOutline((prev: any) => ({ ...prev, main_plot: e.target.value }))}
              className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            {outlineRegenField === 'main_plot' && (
              <div className="mt-1 flex gap-2">
                <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegen('main_plot') }} />
                <button onClick={() => handleOutlineRegen('main_plot')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
              </div>
            )}
          </div>

          {/* plot_points */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-sm text-gray-600">情节点</h3>
              <button
                onClick={() => { setOutlineRegenField(outlineRegenField === 'plot_points' ? null : 'plot_points'); setOutlineRegenSuggestion('') }}
                disabled={outlineRegenLoading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {outlineRegenField === 'plot_points' ? '取消' : '重新生成全部'}
              </button>
            </div>
            {outlineRegenField === 'plot_points' && (
              <div className="mb-2 flex gap-2">
                <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegen('plot_points') }} />
                <button onClick={() => handleOutlineRegen('plot_points')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
              </div>
            )}
            <div className="space-y-2">
              {Array.isArray(editOutline.plot_points) && editOutline.plot_points.map((p: any, i: number) => (
                <div key={i} className="bg-gray-50 rounded p-2">
                  {typeof p === 'string' ? (
                    <input
                      value={p}
                      onChange={e => {
                        const updated = [...editOutline.plot_points]
                        updated[i] = e.target.value
                        setEditOutline((prev: any) => ({ ...prev, plot_points: updated }))
                      }}
                      className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="space-y-1">
                      <input
                        value={p.title || ''}
                        onChange={e => {
                          const updated = [...editOutline.plot_points]
                          updated[i] = { ...p, title: e.target.value }
                          setEditOutline((prev: any) => ({ ...prev, plot_points: updated }))
                        }}
                        placeholder="标题"
                        className="w-full border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <textarea
                        value={p.summary || p.description || ''}
                        onChange={e => {
                          const updated = [...editOutline.plot_points]
                          updated[i] = { ...p, summary: e.target.value }
                          setEditOutline((prev: any) => ({ ...prev, plot_points: updated }))
                        }}
                        placeholder="概要"
                        className="w-full border rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Characters tab */}
      {activeTab === 'characters' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">角色列表 ({characters?.length || 0})</h2>
            <button onClick={() => setShowNewChar(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              添加角色
            </button>
          </div>
          {showNewChar && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <input value={newCharName} onChange={e => setNewCharName(e.target.value)} placeholder="角色名" className="border rounded p-2 text-sm w-full" />
              <select value={newCharRole} onChange={e => setNewCharRole(e.target.value)} className="border rounded p-2 text-sm">
                <option value="主角">主角</option>
                <option value="配角">配角</option>
                <option value="反派">反派</option>
                <option value="龙套">龙套</option>
              </select>
              <input value={newCharIdentity} onChange={e => setNewCharIdentity(e.target.value)} placeholder="身份描述" className="border rounded p-2 text-sm w-full" />
              <div className="flex gap-2">
                <button onClick={() => addCharMutation.mutate()} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">添加</button>
                <button onClick={() => setShowNewChar(false)} className="text-gray-500 text-sm">取消</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters?.map((c: any) => (
              <div key={c.id} className="bg-white rounded-lg p-4 shadow-sm">
                {editingCharId === c.id && editChar ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">角色名</label>
                      <input value={editChar.name} onChange={e => setEditChar((prev: any) => ({ ...prev, name: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">角色类型</label>
                      <select value={editChar.role} onChange={e => setEditChar((prev: any) => ({ ...prev, role: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm">
                        <option value="主角">主角</option>
                        <option value="配角">配角</option>
                        <option value="反派">反派</option>
                        <option value="龙套">龙套</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">身份</label>
                      <input value={editChar.identity} onChange={e => setEditChar((prev: any) => ({ ...prev, identity: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" placeholder="身份描述" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">性格</label>
                      <textarea value={editChar.personality} onChange={e => setEditChar((prev: any) => ({ ...prev, personality: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="性格描述" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">背景</label>
                      <textarea value={editChar.background} onChange={e => setEditChar((prev: any) => ({ ...prev, background: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="角色背景" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">金手指</label>
                      <textarea value={editChar.golden_finger} onChange={e => setEditChar((prev: any) => ({ ...prev, golden_finger: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="金手指/特殊能力" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveChar} disabled={charSaving} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                        {charSaving ? '保存中...' : '保存'}
                      </button>
                      <button onClick={cancelEditChar} className="text-gray-500 text-xs hover:text-gray-700">取消</button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <div className="flex justify-between">
                      <h3 className="font-medium">{c.name}</h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEditChar(c)} className="text-xs text-blue-600 hover:text-blue-800">编辑</button>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          c.role === '主角' ? 'bg-blue-100 text-blue-700' :
                          c.role === '反派' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{c.role}</span>
                      </div>
                    </div>
                    {c.identity && <p className="text-sm text-gray-600 mt-1">{c.identity}</p>}
                    {c.personality && <p className="text-sm text-gray-500 mt-1">性格: {c.personality}</p>}
                    {c.background && <p className="text-sm text-gray-500 mt-1">背景: {c.background}</p>}
                    {c.golden_finger && <p className="text-sm text-gray-500 mt-1">金手指: {c.golden_finger}</p>}
                    {c.current_status && <p className="text-sm text-gray-500">状态: {c.current_status}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Foreshadowings tab */}
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
    </div>
  )
}

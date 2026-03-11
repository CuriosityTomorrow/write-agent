import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNovel, getOutline, listCharacters, listChapters, deleteNovel,
  listForeshadowings, createCharacter, createChapter, deleteChapter, updateCharacter,
  updateOutline, regenerateNovelField, getModels, exportTxt,
  createForeshadowing, updateForeshadowing, deleteForeshadowing,
  listNarrativeMemories, generateVolumeSummary,
  listMajorEvents, generateMajorEventIdeas, createMajorEvent, generateRangeSummary,
  generateCharacter,
} from '../services/api'

export default function NovelDetail() {
  const { id } = useParams<{ id: string }>()
  const novelId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'outline' | 'characters' | 'chapters' | 'foreshadowings' | 'memories' | 'majorEvents'>('chapters')
  const [showNewChar, setShowNewChar] = useState(false)
  const [newCharName, setNewCharName] = useState('')
  const [newCharGender, setNewCharGender] = useState('男')
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
  const [editingFsId, setEditingFsId] = useState<number | null>(null)
  const [editFsDesc, setEditFsDesc] = useState('')
  const [editFsType, setEditFsType] = useState('中线')
  const [editFsStatus, setEditFsStatus] = useState('埋设')

  // Character editing (Task 5)
  const [editingCharId, setEditingCharId] = useState<number | null>(null)
  const [editChar, setEditChar] = useState<any>(null)
  const [charAiPrompt, setCharAiPrompt] = useState('')
  const [charAiLoading, setCharAiLoading] = useState(false)
  const [showCharAiInput, setShowCharAiInput] = useState(false)
  const [charSaving, setCharSaving] = useState(false)
  const [charDriverExpanded, setCharDriverExpanded] = useState(false)

  // Task 16: Volume Summaries
  const [volSumChapterStart, setVolSumChapterStart] = useState<number | ''>(1)
  const [volSumChapterEnd, setVolSumChapterEnd] = useState<number | ''>(10)
  const [volSumLoading, setVolSumLoading] = useState(false)
  const [memoryExpanded, setMemoryExpanded] = useState<number | null>(null)

  // Task 19: Major Events
  const [majorEventExpanded, setMajorEventExpanded] = useState<number | null>(null)
  const [showMajorEventCreate, setShowMajorEventCreate] = useState(false)
  const [meChapterStart, setMeChapterStart] = useState<number | ''>(1)
  const [meChapterEnd, setMeChapterEnd] = useState<number | ''>(10)
  const [meRangeSummary, setMeRangeSummary] = useState('')
  const [meRangeSummaryLoading, setMeRangeSummaryLoading] = useState(false)
  const [meSuggestions, setMeSuggestions] = useState<any[]>([])
  const [meSuggestionsLoading, setMeSuggestionsLoading] = useState(false)
  const [meTitle, setMeTitle] = useState('')
  const [meDescription, setMeDescription] = useState('')
  const [meTargetChapters, setMeTargetChapters] = useState('')
  const [meBuildupStart, setMeBuildupStart] = useState<number | ''>(1)
  const [meCreating, setMeCreating] = useState(false)
  const [meCreateResult, setMeCreateResult] = useState<any>(null)
  const [meEditingIndex, setMeEditingIndex] = useState<number | null>(null)
  const [meEditForm, setMeEditForm] = useState<any>(null)
  const [meSaving, setMeSaving] = useState(false)

  const { data: novel } = useQuery({ queryKey: ['novel', novelId], queryFn: () => getNovel(novelId).then(r => r.data) })
  const { data: outline } = useQuery({ queryKey: ['outline', novelId], queryFn: () => getOutline(novelId).then(r => r.data) })
  const { data: characters } = useQuery({ queryKey: ['characters', novelId], queryFn: () => listCharacters(novelId).then(r => r.data) })
  const { data: chapters } = useQuery({ queryKey: ['chapters', novelId], queryFn: () => listChapters(novelId).then(r => r.data) })
  const { data: foreshadowings } = useQuery({ queryKey: ['foreshadowings', novelId], queryFn: () => listForeshadowings(novelId).then(r => r.data) })

  const addCharMutation = useMutation({
    mutationFn: () => createCharacter(novelId, { name: newCharName, gender: newCharGender, role: newCharRole, identity: newCharIdentity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', novelId] })
      setShowNewChar(false)
      setNewCharName('')
      setNewCharGender('男')
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

  // --- Major Event editing handlers ---
  const handleSaveMajorEvent = async (eventIndex: number) => {
    if (!outline || !meEditForm) return
    setMeSaving(true)
    try {
      // Find the actual index in plot_points (majorEvents are filtered from plot_points where event_scale=major)
      const allPoints = outline.plot_points || []
      let majorIdx = -1
      let realIdx = -1
      for (let i = 0; i < allPoints.length; i++) {
        if (typeof allPoints[i] === 'object' && allPoints[i].event_scale === 'major') {
          majorIdx++
          if (majorIdx === eventIndex) { realIdx = i; break }
        }
      }
      if (realIdx >= 0) {
        const updated = [...allPoints]
        updated[realIdx] = { ...updated[realIdx], ...meEditForm }
        await updateOutline(novelId, { plot_points: updated })
        queryClient.invalidateQueries({ queryKey: ['outline', novelId] })
        queryClient.invalidateQueries({ queryKey: ['majorEvents', novelId] })
      }
      setMeEditingIndex(null)
      setMeEditForm(null)
    } catch { alert('保存失败') }
    setMeSaving(false)
  }

  const handleDeleteMajorEvent = async (eventIndex: number) => {
    if (!outline) return
    if (!confirm('确定删除此大事件？')) return
    setMeSaving(true)
    try {
      const allPoints = outline.plot_points || []
      let majorIdx = -1
      let realIdx = -1
      for (let i = 0; i < allPoints.length; i++) {
        if (typeof allPoints[i] === 'object' && allPoints[i].event_scale === 'major') {
          majorIdx++
          if (majorIdx === eventIndex) { realIdx = i; break }
        }
      }
      if (realIdx >= 0) {
        const updated = allPoints.filter((_: any, i: number) => i !== realIdx)
        await updateOutline(novelId, { plot_points: updated })
        queryClient.invalidateQueries({ queryKey: ['outline', novelId] })
        queryClient.invalidateQueries({ queryKey: ['majorEvents', novelId] })
      }
      setMeEditingIndex(null)
      setMeEditForm(null)
    } catch { alert('删除失败') }
    setMeSaving(false)
  }

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
      gender: c.gender || '男',
      role: c.role || '配角',
      identity: c.identity || '',
      personality: c.personality || '',
      background: c.background || '',
      golden_finger: c.golden_finger || '',
      personality_tags: Array.isArray(c.personality_tags) ? c.personality_tags.join(', ') : (c.personality_tags || ''),
      motivation: c.motivation || '',
      behavior_rules_do: Array.isArray(c.behavior_rules?.absolute_do) ? c.behavior_rules.absolute_do.join('\n') : '',
      behavior_rules_dont: Array.isArray(c.behavior_rules?.absolute_dont) ? c.behavior_rules.absolute_dont.join('\n') : '',
      speech_pattern: c.speech_pattern || '',
      growth_arc_type: c.growth_arc_type || '',
      relationship_masks: c.relationship_masks
        ? (typeof c.relationship_masks === 'object'
          ? Object.entries(c.relationship_masks).map(([k, v]) => `${k}: ${v}`).join('\n')
          : c.relationship_masks)
        : '',
    })
    setCharDriverExpanded(false)
  }

  const handleCharAiRegen = async () => {
    if (!editChar || !editingCharId || !selectedModel) { alert('请先选择 AI 模型'); return }
    setCharAiLoading(true)
    try {
      const existingCharacter = {
        name: editChar.name,
        gender: editChar.gender,
        role: editChar.role,
        identity: editChar.identity,
        personality: editChar.personality,
        background: editChar.background,
        golden_finger: editChar.golden_finger,
        motivation: editChar.motivation,
        speech_pattern: editChar.speech_pattern,
        growth_arc_type: editChar.growth_arc_type,
      }
      const res = await generateCharacter(novelId, {
        prompt: charAiPrompt || '根据现有信息全面优化这个角色',
        model_id: selectedModel,
        existing_character: existingCharacter,
      })
      const d = res.data
      setEditChar((prev: any) => ({
        ...prev,
        name: d.name || prev.name,
        role: d.role || prev.role,
        identity: d.identity || prev.identity,
        personality: d.personality || prev.personality,
        background: d.background || prev.background,
        golden_finger: d.golden_finger || prev.golden_finger,
        personality_tags: Array.isArray(d.personality_tags) ? d.personality_tags.join(', ') : (prev.personality_tags || ''),
        motivation: d.motivation || prev.motivation,
        behavior_rules_do: Array.isArray(d.behavior_rules?.absolute_do) ? d.behavior_rules.absolute_do.join('\n') : prev.behavior_rules_do,
        behavior_rules_dont: Array.isArray(d.behavior_rules?.absolute_dont) ? d.behavior_rules.absolute_dont.join('\n') : prev.behavior_rules_dont,
        speech_pattern: d.speech_pattern || prev.speech_pattern,
        growth_arc_type: d.growth_arc_type || prev.growth_arc_type,
        relationship_masks: d.relationship_masks && typeof d.relationship_masks === 'object'
          ? Object.entries(d.relationship_masks).map(([k, v]) => `${k}: ${v}`).join('\n')
          : prev.relationship_masks,
      }))
      setShowCharAiInput(false)
      setCharAiPrompt('')
      setCharDriverExpanded(true)
    } catch { alert('AI 生成失败，请重试') }
    setCharAiLoading(false)
  }

  const cancelEditChar = () => {
    setEditingCharId(null)
    setEditChar(null)
    setShowCharAiInput(false)
    setCharAiPrompt('')
  }

  const saveChar = async () => {
    if (!editChar || !editingCharId) return
    setCharSaving(true)
    try {
      const personalityTags = editChar.personality_tags
        ? editChar.personality_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []
      const behaviorRules = {
        absolute_do: editChar.behavior_rules_do ? editChar.behavior_rules_do.split('\n').map((l: string) => l.trim()).filter(Boolean) : [],
        absolute_dont: editChar.behavior_rules_dont ? editChar.behavior_rules_dont.split('\n').map((l: string) => l.trim()).filter(Boolean) : [],
      }
      const relationshipMasks: Record<string, string> = {}
      if (editChar.relationship_masks) {
        editChar.relationship_masks.split('\n').forEach((line: string) => {
          const idx = line.indexOf(':')
          if (idx > 0) {
            relationshipMasks[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
          }
        })
      }
      const payload = {
        name: editChar.name,
        gender: editChar.gender,
        role: editChar.role,
        identity: editChar.identity,
        personality: editChar.personality,
        background: editChar.background,
        golden_finger: editChar.golden_finger,
        personality_tags: personalityTags,
        motivation: editChar.motivation,
        behavior_rules: behaviorRules,
        speech_pattern: editChar.speech_pattern,
        growth_arc_type: editChar.growth_arc_type || null,
        relationship_masks: relationshipMasks,
      }
      await updateCharacter(novelId, editingCharId, payload)
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
    { key: 'memories', label: '卷摘要' },
    { key: 'majorEvents', label: '大事件' },
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
        <div className="flex items-center gap-2">
          <a
            href={exportTxt(novelId)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
          >
            导出 TXT
          </a>
          <button
            onClick={async () => {
              if (!confirm(`确定删除《${novel.title}》？所有章节、大纲、角色、伏笔等关联数据都将被永久删除，此操作不可撤销。`)) return
              try {
                await deleteNovel(novelId)
                navigate('/')
              } catch { alert('删除失败') }
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm"
          >
            删除小说
          </button>
        </div>
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
            {chapters?.map((ch: any, idx: number) => (
              <div key={ch.id} className="bg-white rounded-lg p-4 shadow-sm hover:shadow transition flex items-center gap-2">
                <Link
                  to={`/novel/${String(novelId)}/chapter/${String(ch.id)}`}
                  className="flex-1 min-w-0"
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
                {idx === (chapters?.length || 0) - 1 && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!confirm(`确定删除第${ch.chapter_number}章？此操作不可撤销。`)) return
                      await deleteChapter(novelId, ch.id)
                      queryClient.removeQueries({ queryKey: ['chapter', novelId, ch.id] })
                      queryClient.removeQueries({ queryKey: ['intel', novelId, ch.id] })
                      queryClient.invalidateQueries({ queryKey: ['chapters', novelId] })
                    }}
                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 shrink-0"
                    title="删除最新章节"
                  >
                    删除
                  </button>
                )}
              </div>
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
              <div className="flex gap-2">
                <select value={newCharGender} onChange={e => setNewCharGender(e.target.value)} className="border rounded p-2 text-sm">
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
                <select value={newCharRole} onChange={e => setNewCharRole(e.target.value)} className="border rounded p-2 text-sm flex-1">
                  <option value="主角">主角</option>
                  <option value="配角">配角</option>
                  <option value="反派">反派</option>
                  <option value="龙套">龙套</option>
                </select>
              </div>
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
                      <div className="flex gap-2">
                        <select value={editChar.gender} onChange={e => setEditChar((prev: any) => ({ ...prev, gender: e.target.value }))} className="border rounded px-2 py-1 text-sm w-16">
                          <option value="男">男</option>
                          <option value="女">女</option>
                        </select>
                        <select value={editChar.role} onChange={e => setEditChar((prev: any) => ({ ...prev, role: e.target.value }))} className="border rounded px-2 py-1 text-sm flex-1">
                          <option value="主角">主角</option>
                          <option value="配角">配角</option>
                          <option value="反派">反派</option>
                          <option value="龙套">龙套</option>
                        </select>
                      </div>
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
                    {/* Task 18: Collapsible character driver section */}
                    <div className="border-t pt-2 mt-2">
                      <button
                        onClick={() => setCharDriverExpanded(!charDriverExpanded)}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                      >
                        {charDriverExpanded ? '收起角色驱动设定 ▲' : '展开角色驱动设定 ▼'}
                      </button>
                      {charDriverExpanded && (
                        <div className="space-y-2 mt-2">
                          <div>
                            <label className="text-xs text-gray-500">性格标签（逗号分隔）</label>
                            <input value={editChar.personality_tags} onChange={e => setEditChar((prev: any) => ({ ...prev, personality_tags: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" placeholder="例：冷静, 果断, 腹黑" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">动机</label>
                            <textarea value={editChar.motivation} onChange={e => setEditChar((prev: any) => ({ ...prev, motivation: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="角色的核心驱动力" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">行为准则 — 一定会做（每行一条）</label>
                            <textarea value={editChar.behavior_rules_do} onChange={e => setEditChar((prev: any) => ({ ...prev, behavior_rules_do: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="保护同伴&#10;信守承诺" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">行为准则 — 绝对不做（每行一条）</label>
                            <textarea value={editChar.behavior_rules_dont} onChange={e => setEditChar((prev: any) => ({ ...prev, behavior_rules_dont: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="背叛朋友&#10;伤害无辜" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">语言风格</label>
                            <textarea value={editChar.speech_pattern} onChange={e => setEditChar((prev: any) => ({ ...prev, speech_pattern: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} placeholder="描述角色的说话方式、口头禅等" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">成长弧线类型</label>
                            <select value={editChar.growth_arc_type} onChange={e => setEditChar((prev: any) => ({ ...prev, growth_arc_type: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm">
                              <option value="">未设定</option>
                              <option value="staircase">阶梯型 (staircase)</option>
                              <option value="spiral">螺旋型 (spiral)</option>
                              <option value="cliff">断崖型 (cliff)</option>
                              <option value="platform">平台型 (platform)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">关系面具（每行一条，格式：名字: 态度）</label>
                            <textarea value={editChar.relationship_masks} onChange={e => setEditChar((prev: any) => ({ ...prev, relationship_masks: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={3} placeholder="张三: 表面恭敬，内心警惕&#10;李四: 真心信赖" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <button
                        onClick={() => { setShowCharAiInput(!showCharAiInput); setCharAiPrompt('') }}
                        disabled={charAiLoading}
                        className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      >
                        {showCharAiInput ? '取消 AI 生成' : 'AI 重新生成'}
                      </button>
                      {showCharAiInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={charAiPrompt}
                            onChange={e => setCharAiPrompt(e.target.value)}
                            placeholder="修改意见（如：让性格更阴沉、加强战斗能力描述），留空则全面优化"
                            className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                            onKeyDown={e => {
                              if (e.key !== 'Enter' || charAiLoading) return
                              e.preventDefault()
                              handleCharAiRegen()
                            }}
                            autoFocus
                          />
                          <button
                            onClick={handleCharAiRegen}
                            disabled={charAiLoading}
                            className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {charAiLoading ? '生成中...' : '生成'}
                          </button>
                        </div>
                      )}
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
                        }`}>{c.gender ? `${c.gender}·${c.role}` : c.role}</span>
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
                {editingFsId === f.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editFsDesc}
                      onChange={e => setEditFsDesc(e.target.value)}
                      className="w-full border rounded p-2 text-sm resize-none h-16"
                    />
                    <div className="flex gap-3 items-center">
                      <div>
                        <label className="text-xs text-gray-500 mr-1">类型:</label>
                        <select value={editFsType} onChange={e => setEditFsType(e.target.value)} className="border rounded px-2 py-1 text-sm">
                          <option value="短线">短线</option>
                          <option value="中线">中线</option>
                          <option value="长线">长线</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mr-1">状态:</label>
                        <select value={editFsStatus} onChange={e => setEditFsStatus(e.target.value)} className="border rounded px-2 py-1 text-sm">
                          <option value="埋设">埋设</option>
                          <option value="推进中">推进中</option>
                          <option value="已回收">已回收</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await updateForeshadowing(novelId, f.id, {
                            description: editFsDesc,
                            foreshadowing_type: editFsType,
                            status: editFsStatus,
                          })
                          queryClient.invalidateQueries({ queryKey: ['foreshadowings', novelId] })
                          setEditingFsId(null)
                        }}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                      >
                        保存
                      </button>
                      <button onClick={() => setEditingFsId(null)} className="text-gray-500 text-sm">取消</button>
                    </div>
                  </div>
                ) : (
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
                    <div className="flex items-center gap-2 ml-2">
                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        f.status === '已回收' ? 'bg-green-100 text-green-700' :
                        f.status === '推进中' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{f.status}</span>
                      <button
                        onClick={() => {
                          setEditingFsId(f.id)
                          setEditFsDesc(f.description)
                          setEditFsType(f.foreshadowing_type || '中线')
                          setEditFsStatus(f.status || '埋设')
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        编辑
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('确定删除这条伏笔？')) return
                          await deleteForeshadowing(novelId, f.id)
                          queryClient.invalidateQueries({ queryKey: ['foreshadowings', novelId] })
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(!foreshadowings || foreshadowings.length === 0) && <p className="text-gray-400 text-center py-8">暂无伏笔记录</p>}
          </div>
        </div>
      )}

      {/* Task 16: Volume Summaries tab */}
      {activeTab === 'memories' && <MemoriesTab
        novelId={novelId}
        selectedModel={selectedModel}
        models={models}
        setSelectedModel={setSelectedModel}
        volSumChapterStart={volSumChapterStart}
        setVolSumChapterStart={setVolSumChapterStart}
        volSumChapterEnd={volSumChapterEnd}
        setVolSumChapterEnd={setVolSumChapterEnd}
        volSumLoading={volSumLoading}
        setVolSumLoading={setVolSumLoading}
        memoryExpanded={memoryExpanded}
        setMemoryExpanded={setMemoryExpanded}
        queryClient={queryClient}
      />}

      {/* Task 19: Major Events tab */}
      {activeTab === 'majorEvents' && <MajorEventsTab
        novelId={novelId}
        selectedModel={selectedModel}
        models={models}
        setSelectedModel={setSelectedModel}
        majorEventExpanded={majorEventExpanded}
        setMajorEventExpanded={setMajorEventExpanded}
        showMajorEventCreate={showMajorEventCreate}
        setShowMajorEventCreate={setShowMajorEventCreate}
        meChapterStart={meChapterStart}
        setMeChapterStart={setMeChapterStart}
        meChapterEnd={meChapterEnd}
        setMeChapterEnd={setMeChapterEnd}
        meRangeSummary={meRangeSummary}
        setMeRangeSummary={setMeRangeSummary}
        meRangeSummaryLoading={meRangeSummaryLoading}
        setMeRangeSummaryLoading={setMeRangeSummaryLoading}
        meSuggestions={meSuggestions}
        setMeSuggestions={setMeSuggestions}
        meSuggestionsLoading={meSuggestionsLoading}
        setMeSuggestionsLoading={setMeSuggestionsLoading}
        meTitle={meTitle}
        setMeTitle={setMeTitle}
        meDescription={meDescription}
        setMeDescription={setMeDescription}
        meTargetChapters={meTargetChapters}
        setMeTargetChapters={setMeTargetChapters}
        meBuildupStart={meBuildupStart}
        setMeBuildupStart={setMeBuildupStart}
        meCreating={meCreating}
        setMeCreating={setMeCreating}
        meCreateResult={meCreateResult}
        setMeCreateResult={setMeCreateResult}
        meEditingIndex={meEditingIndex}
        setMeEditingIndex={setMeEditingIndex}
        meEditForm={meEditForm}
        setMeEditForm={setMeEditForm}
        meSaving={meSaving}
        handleSaveMajorEvent={handleSaveMajorEvent}
        handleDeleteMajorEvent={handleDeleteMajorEvent}
        queryClient={queryClient}
      />}
    </div>
  )
}

/* =====================================================
   Task 16: Volume Summaries (卷摘要) Tab Component
   ===================================================== */
function MemoriesTab({ novelId, selectedModel, models, setSelectedModel, volSumChapterStart, setVolSumChapterStart, volSumChapterEnd, setVolSumChapterEnd, volSumLoading, setVolSumLoading, memoryExpanded, setMemoryExpanded, queryClient }: any) {
  const { data: memories } = useQuery({
    queryKey: ['narrativeMemories', novelId],
    queryFn: () => listNarrativeMemories(novelId).then(r => r.data),
  })

  const grouped = {
    global: (memories || []).filter((m: any) => m.type === 'global'),
    arc: (memories || []).filter((m: any) => m.type === 'arc'),
    volume: (memories || []).filter((m: any) => m.type === 'volume'),
  }

  const typeBadge = (type: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      global: { label: '全局', cls: 'bg-purple-100 text-purple-700' },
      arc: { label: '弧', cls: 'bg-blue-100 text-blue-700' },
      volume: { label: '卷', cls: 'bg-green-100 text-green-700' },
    }
    const info = map[type] || { label: type, cls: 'bg-gray-100 text-gray-700' }
    return <span className={`text-xs px-1.5 py-0.5 rounded ${info.cls}`}>{info.label}</span>
  }

  const handleGenerateVolumeSummary = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    if (!volSumChapterStart || !volSumChapterEnd) { alert('请输入章节范围'); return }
    setVolSumLoading(true)
    try {
      await generateVolumeSummary(novelId, {
        chapter_start: Number(volSumChapterStart),
        chapter_end: Number(volSumChapterEnd),
        model_id: selectedModel,
      })
      queryClient.invalidateQueries({ queryKey: ['narrativeMemories', novelId] })
    } catch { alert('生成卷摘要失败') }
    setVolSumLoading(false)
  }

  return (
    <div>
      {/* Generate section */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">生成卷摘要</span>
          {models.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mr-1">模型:</label>
              <select value={selectedModel} onChange={(e: any) => setSelectedModel(e.target.value)} className="border rounded px-2 py-0.5 text-xs">
                {models.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500">起始章:</label>
            <input type="number" value={volSumChapterStart} onChange={(e: any) => setVolSumChapterStart(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-0.5 text-xs w-16" min={1} />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500">结束章:</label>
            <input type="number" value={volSumChapterEnd} onChange={(e: any) => setVolSumChapterEnd(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-0.5 text-xs w-16" min={1} />
          </div>
          <button
            onClick={handleGenerateVolumeSummary}
            disabled={volSumLoading}
            className="bg-purple-600 text-white px-4 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50"
          >
            {volSumLoading ? '生成中...' : '生成卷摘要'}
          </button>
        </div>
      </div>

      {/* Grouped entries */}
      {(['global', 'arc', 'volume'] as const).map(type => (
        grouped[type].length > 0 && (
          <div key={type} className="mb-4">
            <h3 className="font-medium text-sm text-gray-600 mb-2">
              {type === 'global' ? '全局摘要' : type === 'arc' ? '弧摘要' : '卷摘要'} ({grouped[type].length})
            </h3>
            <div className="space-y-2">
              {grouped[type].map((m: any) => {
                const isExpanded = memoryExpanded === m.id
                const plotText = m.plot_progression || ''
                const displayText = isExpanded ? plotText : (plotText.length > 200 ? plotText.slice(0, 200) + '...' : plotText)
                return (
                  <div key={m.id} className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      {typeBadge(m.type)}
                      {(m.chapter_start != null && m.chapter_end != null) && (
                        <span className="text-xs text-gray-500">第{m.chapter_start}-{m.chapter_end}章</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{displayText}</p>
                    {plotText.length > 200 && (
                      <button
                        onClick={() => setMemoryExpanded(isExpanded ? null : m.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                      >
                        {isExpanded ? '收起' : '展开全部'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      ))}
      {(!memories || memories.length === 0) && <p className="text-gray-400 text-center py-8">暂无摘要记录，使用上方功能生成卷摘要</p>}
    </div>
  )
}

/* =====================================================
   Task 19: Major Events (大事件) Tab Component
   ===================================================== */
function MajorEventsTab({ novelId, selectedModel, models, setSelectedModel, majorEventExpanded, setMajorEventExpanded, showMajorEventCreate, setShowMajorEventCreate, meChapterStart, setMeChapterStart, meChapterEnd, setMeChapterEnd, meRangeSummary, setMeRangeSummary, meRangeSummaryLoading, setMeRangeSummaryLoading, meSuggestions, setMeSuggestions, meSuggestionsLoading, setMeSuggestionsLoading, meTitle, setMeTitle, meDescription, setMeDescription, meTargetChapters, setMeTargetChapters, meBuildupStart, setMeBuildupStart, meCreating, setMeCreating, meCreateResult, setMeCreateResult, meEditingIndex, setMeEditingIndex, meEditForm, setMeEditForm, meSaving, handleSaveMajorEvent, handleDeleteMajorEvent, queryClient }: any) {
  const { data: majorEvents } = useQuery({
    queryKey: ['majorEvents', novelId],
    queryFn: () => listMajorEvents(novelId).then(r => r.data),
  })

  const handleGenerateRangeSummary = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    if (!meChapterStart || !meChapterEnd) { alert('请输入章节范围'); return }
    setMeRangeSummaryLoading(true)
    try {
      const res = await generateRangeSummary(novelId, {
        chapter_start: Number(meChapterStart),
        chapter_end: Number(meChapterEnd),
        model_id: selectedModel,
      })
      setMeRangeSummary(res.data.summary || res.data.value || JSON.stringify(res.data))
    } catch { alert('生成范围摘要失败') }
    setMeRangeSummaryLoading(false)
  }

  const handleGenerateSuggestions = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    if (!meRangeSummary) { alert('请先生成范围摘要'); return }
    setMeSuggestionsLoading(true)
    try {
      const res = await generateMajorEventIdeas(novelId, {
        summary: meRangeSummary,
        model_id: selectedModel,
      })
      setMeSuggestions(res.data.ideas || res.data.suggestions || (Array.isArray(res.data) ? res.data : [res.data]))
    } catch { alert('生成建议失败') }
    setMeSuggestionsLoading(false)
  }

  const handleCreateMajorEvent = async () => {
    if (!meTitle.trim()) { alert('请输入事件标题'); return }
    setMeCreating(true)
    try {
      const targetChaptersList = meTargetChapters
        ? meTargetChapters.split(',').map((s: string) => Number(s.trim())).filter(Boolean)
        : []
      const res = await createMajorEvent(novelId, {
        title: meTitle,
        description: meDescription,
        target_chapters: targetChaptersList,
        buildup_start_chapter: meBuildupStart ? Number(meBuildupStart) : undefined,
      })
      setMeCreateResult(res.data)
      queryClient.invalidateQueries({ queryKey: ['majorEvents', novelId] })
      queryClient.invalidateQueries({ queryKey: ['foreshadowings', novelId] })
    } catch { alert('创建大事件失败') }
    setMeCreating(false)
  }

  const resetCreateFlow = () => {
    setShowMajorEventCreate(false)
    setMeRangeSummary('')
    setMeSuggestions([])
    setMeTitle('')
    setMeDescription('')
    setMeTargetChapters('')
    setMeBuildupStart(1)
    setMeCreateResult(null)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">大事件管理</h2>
        <button
          onClick={() => setShowMajorEventCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          创建大事件
        </button>
      </div>

      {/* Create flow */}
      {showMajorEventCreate && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-sm">创建大事件</h3>
            <button onClick={resetCreateFlow} className="text-gray-500 text-xs hover:text-gray-700">取消</button>
          </div>

          {/* Model selector */}
          {models.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mr-1">模型:</label>
              <select value={selectedModel} onChange={(e: any) => setSelectedModel(e.target.value)} className="border rounded px-2 py-0.5 text-xs">
                {models.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Step 1: Range Summary */}
          <div className="border-l-2 border-blue-400 pl-3">
            <p className="text-xs font-medium text-gray-600 mb-2">第一步：生成范围摘要</p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">起始章:</label>
                <input type="number" value={meChapterStart} onChange={(e: any) => setMeChapterStart(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-0.5 text-xs w-16" min={1} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">结束章:</label>
                <input type="number" value={meChapterEnd} onChange={(e: any) => setMeChapterEnd(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-0.5 text-xs w-16" min={1} />
              </div>
              <button
                onClick={handleGenerateRangeSummary}
                disabled={meRangeSummaryLoading}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {meRangeSummaryLoading ? '生成中...' : '生成范围摘要'}
              </button>
            </div>
            {meRangeSummary && (
              <div className="mt-2 bg-white rounded p-2 text-sm text-gray-700 whitespace-pre-wrap border">
                {meRangeSummary}
              </div>
            )}
          </div>

          {/* Step 2: Generate Suggestions */}
          {meRangeSummary && (
            <div className="border-l-2 border-purple-400 pl-3">
              <p className="text-xs font-medium text-gray-600 mb-2">第二步：AI 生成建议</p>
              <button
                onClick={handleGenerateSuggestions}
                disabled={meSuggestionsLoading}
                className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50"
              >
                {meSuggestionsLoading ? '生成中...' : '生成建议'}
              </button>
              {meSuggestions.length > 0 && (
                <div className="mt-2 space-y-2">
                  {meSuggestions.map((s: any, i: number) => (
                    <div
                      key={i}
                      className="bg-white rounded p-3 border cursor-pointer hover:border-purple-400 transition"
                      onClick={() => {
                        setMeTitle(s.title || '')
                        setMeDescription(s.description || (typeof s === 'string' ? s : ''))
                      }}
                    >
                      <p className="text-sm font-medium">{s.title || `建议 ${i + 1}`}</p>
                      {s.description && <p className="text-xs text-gray-600 mt-1">{s.description}</p>}
                      <p className="text-xs text-purple-500 mt-1">点击采用此建议</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Create Form */}
          {meRangeSummary && (
            <div className="border-l-2 border-green-400 pl-3">
              <p className="text-xs font-medium text-gray-600 mb-2">第三步：填写并创建</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">事件标题</label>
                  <input value={meTitle} onChange={(e: any) => setMeTitle(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="大事件标题" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">事件描述</label>
                  <textarea value={meDescription} onChange={(e: any) => setMeDescription(e.target.value)} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={3} placeholder="详细描述这个大事件" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">目标章节（逗号分隔，例: 15,16,17）</label>
                  <input value={meTargetChapters} onChange={(e: any) => setMeTargetChapters(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="15,16,17" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">铺垫起始章节</label>
                  <input type="number" value={meBuildupStart} onChange={(e: any) => setMeBuildupStart(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-1 text-sm w-24" min={1} />
                </div>
                <button
                  onClick={handleCreateMajorEvent}
                  disabled={meCreating}
                  className="bg-green-600 text-white px-4 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {meCreating ? '创建中...' : '创建'}
                </button>
              </div>
              {meCreateResult && (
                <div className="mt-3 bg-green-50 rounded p-3 border border-green-200">
                  <p className="text-sm font-medium text-green-800">大事件已创建</p>
                  {meCreateResult.foreshadowings && meCreateResult.foreshadowings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-green-700 font-medium">已创建伏笔:</p>
                      <ul className="mt-1 space-y-1">
                        {meCreateResult.foreshadowings.map((f: any, i: number) => (
                          <li key={i} className="text-xs text-green-600">- {f.description || f.content || JSON.stringify(f)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Events list */}
      <div className="space-y-3">
        {(majorEvents || []).map((ev: any, idx: number) => {
          const isExpanded = majorEventExpanded === idx
          const isEditing = meEditingIndex === idx
          return (
            <div key={idx} className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{ev.title}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      ev.status === '已完成' ? 'bg-green-100 text-green-700' :
                      ev.status === '进行中' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{ev.status || '铺垫中'}</span>
                  </div>
                  {ev.chapter_range && <p className="text-xs text-gray-500 mt-0.5">章节范围: {ev.chapter_range}</p>}
                  {ev.buildup_start_chapter && <p className="text-xs text-gray-500 mt-0.5">铺垫起始: 第{ev.buildup_start_chapter}章</p>}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => { setMeEditingIndex(isEditing ? null : idx); setMeEditForm(isEditing ? null : { ...ev }) }}
                    className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                  >
                    {isEditing ? '取消编辑' : '编辑'}
                  </button>
                  <button
                    onClick={() => setMajorEventExpanded(isExpanded ? null : idx)}
                    className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    {isExpanded ? '收起' : '详情'}
                  </button>
                </div>
              </div>

              {/* Edit form */}
              {isEditing && meEditForm && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">标题</label>
                    <input value={meEditForm.title || ''} onChange={e => setMeEditForm({ ...meEditForm, title: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">描述</label>
                    <textarea value={meEditForm.summary || ''} onChange={e => setMeEditForm({ ...meEditForm, summary: e.target.value })} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">章节范围</label>
                      <input value={meEditForm.chapter_range || ''} onChange={e => setMeEditForm({ ...meEditForm, chapter_range: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" placeholder="如：第50-60章" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">状态</label>
                      <select value={meEditForm.status || '铺垫中'} onChange={e => setMeEditForm({ ...meEditForm, status: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">
                        <option value="铺垫中">铺垫中</option>
                        <option value="进行中">进行中</option>
                        <option value="已完成">已完成</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">核心冲突</label>
                    <textarea value={meEditForm.key_conflicts || ''} onChange={e => setMeEditForm({ ...meEditForm, key_conflicts: e.target.value })} className="w-full border rounded px-2 py-1 text-sm resize-none" rows={2} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleSaveMajorEvent(idx)}
                      disabled={meSaving}
                      className="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {meSaving ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={() => handleDeleteMajorEvent(idx)}
                      disabled={meSaving}
                      className="text-red-500 hover:text-red-700 px-3 py-1 text-sm disabled:opacity-50"
                    >
                      删除此事件
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded details (when not editing) */}
              {isExpanded && !isEditing && (
                <div className="mt-3 space-y-2">
                  {ev.summary && (
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                      <p className="text-xs font-medium text-gray-500 mb-1">事件概要:</p>
                      {ev.summary}
                    </div>
                  )}
                  {ev.key_conflicts && (
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                      <p className="text-xs font-medium text-gray-500 mb-1">核心冲突:</p>
                      {ev.key_conflicts}
                    </div>
                  )}
                  {ev.foreshadowing_plan && ev.foreshadowing_plan.length > 0 && (
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700">
                      <p className="text-xs font-medium text-gray-500 mb-1">伏笔计划:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {ev.foreshadowing_plan.map((f: any, fi: number) => (
                          <li key={fi}>{typeof f === 'string' ? f : f.description || JSON.stringify(f)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ev.buildup_plan && (
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      <p className="text-xs font-medium text-gray-500 mb-1">铺垫计划:</p>
                      {typeof ev.buildup_plan === 'string' ? ev.buildup_plan : JSON.stringify(ev.buildup_plan, null, 2)}
                    </div>
                  )}
                  {!ev.summary && !ev.buildup_plan && !ev.key_conflicts && (
                    <p className="text-sm text-gray-400 italic">暂无详细信息</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {(!majorEvents || majorEvents.length === 0) && <p className="text-gray-400 text-center py-8">暂无大事件，点击"创建大事件"开始规划</p>}
      </div>
    </div>
  )
}

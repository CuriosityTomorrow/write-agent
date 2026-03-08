import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createNovel, regenerateField, regenerateNovelField,
  updateOutline, updateCharacter, getModels,
  generateOutlineFromPrompt, extractFromOutline, generateCharacter,
} from '../services/api'

const GENRES = ['玄幻', '仙侠', '都市', '科幻', '历史', '游戏', '悬疑', '轻小说']
const MODES = ['男频', '女频', '短篇']
const STEPS = ['大纲创作', '细化设定']

interface Model {
  id: string
  name: string
  available: boolean
}

interface CharacterData {
  id?: number
  name: string
  role: string
  identity: string
  personality: string
  tags: string[]
  personality_tags: string[]
  motivation: string
  behavior_rules: { absolute_do: string[]; absolute_dont: string[] }
  speech_pattern: string
  growth_arc_type: string
  relationship_masks: Record<string, string>
}

interface PlotPoint {
  chapter_range?: string
  title: string
  summary: string
  key_conflicts?: string
  foreshadowing_plan?: string[]
  event_scale?: string
  chapter_type_hint?: string
}

export default function CreateWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  // Page 1 state
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [targetChapters, setTargetChapters] = useState(100)
  const [genre, setGenre] = useState('玄幻')
  const [mode, setMode] = useState('男频')
  const [outlinePrompt, setOutlinePrompt] = useState('')
  const [outlineText, setOutlineText] = useState('')
  const [outlineGenerating, setOutlineGenerating] = useState(false)
  const [showAiSuggestion, setShowAiSuggestion] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [titleLoading, setTitleLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Page 2 state
  const [novelId, setNovelId] = useState<number | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [storyBackground, setStoryBackground] = useState('')
  const [mainPlot, setMainPlot] = useState('')
  const [characters, setCharacters] = useState<CharacterData[]>([])
  const [plotPoints, setPlotPoints] = useState<PlotPoint[]>([])
  const [_synopsis, setSynopsis] = useState('')
  const [_highlights, setHighlights] = useState('')
  const [expandedCharIndex, setExpandedCharIndex] = useState<number | null>(null)

  // Regen state (shared pattern)
  const [regenField, setRegenField] = useState<string | null>(null)
  const [regenSuggestion, setRegenSuggestion] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)

  // Character AI generation
  const [showAddCharPrompt, setShowAddCharPrompt] = useState(false)
  const [addCharPrompt, setAddCharPrompt] = useState('')
  const [addCharLoading, setAddCharLoading] = useState(false)
  const [charRegenIndex, setCharRegenIndex] = useState<number | null>(null)
  const [charRegenPrompt, setCharRegenPrompt] = useState('')
  const [charRegenLoading, setCharRegenLoading] = useState(false)

  useEffect(() => {
    getModels().then(r => {
      const available = r.data.models?.filter((m: Model) => m.available) || []
      setModels(available)
      if (available.length > 0) setSelectedModel(available[0].id)
    }).catch(() => {})
  }, [])

  // --- Page 1 Handlers ---

  const handleGenerateTitle = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    setTitleLoading(true)
    try {
      const context = outlineText || outlinePrompt || `一部${genre}类型的${mode}网文`
      const res = await regenerateField({
        field_name: 'title',
        current_value: title,
        creative_idea: context,
        genre,
        suggestion: '',
        model_id: selectedModel,
      })
      setTitle(res.data.value)
    } catch { alert('生成失败，请重试') }
    setTitleLoading(false)
  }

  const handleGenerateOutline = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    if (!outlinePrompt.trim()) { alert('请先输入灵感想法'); return }
    setOutlineGenerating(true)
    try {
      const res = await generateOutlineFromPrompt({
        genre,
        mode,
        user_prompt: outlinePrompt,
        suggestion: aiSuggestion,
        model_id: selectedModel,
      })
      setOutlineText(res.data.outline)
      setShowAiSuggestion(false)
      setAiSuggestion('')
    } catch { alert('生成大纲失败，请重试') }
    setOutlineGenerating(false)
  }

  const handleConfirmOutline = async () => {
    if (!title.trim() || !authorName.trim() || !outlineText.trim()) return
    setConfirmLoading(true)
    try {
      // 1. Create novel (minimal fields)
      const novelRes = await createNovel({
        title,
        author_name: authorName,
        genre,
        mode,
        target_chapters: targetChapters,
      })
      const nid = novelRes.data.id
      setNovelId(nid)

      // 2. Save raw_outline
      await updateOutline(nid, { raw_outline: outlineText })

      // 3. Extract structured data
      setStep(1)
      setExtracting(true)
      const extractRes = await extractFromOutline(nid, {
        outline_text: outlineText,
        model_id: selectedModel,
      })
      applyExtractedData(extractRes.data)
      setExtracting(false)
    } catch {
      alert('创建失败，请重试')
      setExtracting(false)
    }
    setConfirmLoading(false)
  }

  const applyExtractedData = (data: any) => {
    setStoryBackground(data.story_background || '')
    setMainPlot(data.main_plot || '')
    setSynopsis(data.synopsis || '')
    setHighlights(data.highlights || '')
    setCharacters((data.characters || []).map((c: any) => ({
      ...c,
      tags: c.tags || [],
      personality_tags: c.personality_tags || [],
      behavior_rules: c.behavior_rules || { absolute_do: [], absolute_dont: [] },
      relationship_masks: c.relationship_masks || {},
    })))
    setPlotPoints((data.plot_points || []).map((p: any) => (
      typeof p === 'string' ? { title: '', summary: p } : p
    )))
  }

  // --- Page 2 Handlers ---

  const handleRegenerate = async (fieldName: string) => {
    if (!novelId || !selectedModel) return
    setRegenLoading(true)
    try {
      let currentValue = ''
      if (fieldName === 'story_background') currentValue = storyBackground
      else if (fieldName === 'main_plot') currentValue = mainPlot
      else if (fieldName === 'plot_points') currentValue = JSON.stringify(plotPoints, null, 2)

      const res = await regenerateNovelField(novelId, {
        field_name: fieldName,
        current_value: currentValue,
        suggestion: regenSuggestion,
        model_id: selectedModel,
      })

      if (fieldName === 'story_background') setStoryBackground(res.data.value)
      else if (fieldName === 'main_plot') setMainPlot(res.data.value)
      else if (fieldName === 'plot_points') {
        try {
          const parsed = JSON.parse(res.data.value)
          setPlotPoints(parsed.map((p: any) => typeof p === 'string' ? { title: '', summary: p } : p))
        } catch {
          // fallback: keep as-is
        }
      }
      setRegenField(null)
      setRegenSuggestion('')
    } catch { alert('重新生成失败，请重试') }
    setRegenLoading(false)
  }

  const handleReExtract = async () => {
    if (!novelId || !selectedModel) return
    setExtracting(true)
    try {
      const extractRes = await extractFromOutline(novelId, {
        outline_text: outlineText,
        model_id: selectedModel,
      })
      applyExtractedData(extractRes.data)
    } catch { alert('重新提取失败，请重试') }
    setExtracting(false)
  }

  const handleConfirmComplete = async () => {
    if (!novelId) return
    setConfirmLoading(true)
    try {
      // Save outline fields
      await updateOutline(novelId, {
        story_background: storyBackground,
        main_plot: mainPlot,
        plot_points: plotPoints,
      })
      // Save characters
      for (const c of characters) {
        if (c.id) {
          await updateCharacter(novelId, c.id, c)
        }
      }
      navigate(`/novel/${novelId}`)
    } catch { alert('保存失败，请重试') }
    setConfirmLoading(false)
  }

  const handleGoBack = () => {
    setStep(0)
  }

  const handleAddCharacterAI = async () => {
    if (!novelId || !selectedModel || !addCharPrompt.trim()) return
    setAddCharLoading(true)
    try {
      const res = await generateCharacter(novelId, {
        prompt: addCharPrompt,
        model_id: selectedModel,
      })
      const newChar = {
        ...res.data,
        tags: res.data.tags || [],
        personality_tags: res.data.personality_tags || [],
        behavior_rules: res.data.behavior_rules || { absolute_do: [], absolute_dont: [] },
        relationship_masks: res.data.relationship_masks || {},
      }
      setCharacters([...characters, newChar])
      setExpandedCharIndex(characters.length)
      setShowAddCharPrompt(false)
      setAddCharPrompt('')
    } catch { alert('AI 生成角色失败，请重试') }
    setAddCharLoading(false)
  }

  const handleRegenCharacter = async (index: number) => {
    if (!novelId || !selectedModel) return
    setCharRegenLoading(true)
    try {
      const res = await generateCharacter(novelId, {
        prompt: charRegenPrompt || '全面优化这个角色',
        model_id: selectedModel,
        existing_character: characters[index],
      })
      const updated = [...characters]
      updated[index] = {
        ...updated[index],
        ...res.data,
        id: updated[index].id,
        tags: res.data.tags || [],
        personality_tags: res.data.personality_tags || [],
        behavior_rules: res.data.behavior_rules || { absolute_do: [], absolute_dont: [] },
        relationship_masks: res.data.relationship_masks || {},
      }
      setCharacters(updated)
      setCharRegenIndex(null)
      setCharRegenPrompt('')
    } catch { alert('AI 重新生成失败，请重试') }
    setCharRegenLoading(false)
  }

  // --- Regen UI helper ---
  const renderRegenButton = (fieldName: string, _label: string) => (
    <button
      onClick={() => { setRegenField(regenField === fieldName ? null : fieldName); setRegenSuggestion('') }}
      disabled={regenLoading}
      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
    >
      {regenField === fieldName ? '取消' : '重新生成'}
    </button>
  )

  const renderRegenInput = (fieldName: string) => (
    regenField === fieldName ? (
      <div className="mt-1 flex gap-2">
        <input
          value={regenSuggestion}
          onChange={e => setRegenSuggestion(e.target.value)}
          placeholder="输入修改建议（可选，留空则直接重新生成）"
          className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={e => { if (e.key === 'Enter') handleRegenerate(fieldName) }}
          autoFocus
        />
        <button
          onClick={() => handleRegenerate(fieldName)}
          disabled={regenLoading}
          className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {regenLoading ? '生成中...' : '生成'}
        </button>
      </div>
    ) : null
  )

  const canConfirmOutline = title.trim() && authorName.trim() && outlineText.trim()

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">创建新小说</h1>

      {/* Step indicator + Model selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                i <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {i + 1}
              </div>
              <span className={`ml-1 text-sm ${i <= step ? 'text-blue-600' : 'text-gray-400'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`w-12 h-0.5 mx-2 ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        {models.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">AI 模型：</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {/* ====== Page 1: 大纲创作 ====== */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">大纲创作</h2>

            {/* Basic info row */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">小说名称</label>
                  <button
                    onClick={handleGenerateTitle}
                    disabled={titleLoading}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    {titleLoading ? '生成中...' : 'AI 帮我想'}
                  </button>
                </div>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="小说名称"
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">作者名</label>
                <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="笔名"
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">目标章节数</label>
                <input
                  type="number"
                  value={targetChapters}
                  onChange={e => setTargetChapters(Number(e.target.value))}
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Genre + Mode chips */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">类型</label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map(g => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${genre === g ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-blue-400'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">模式</label>
              <div className="flex gap-2">
                {MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${mode === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-blue-400'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* 灵感输入 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">灵感输入</label>
                <div className="flex items-center gap-2">
                  {showAiSuggestion && (
                    <button
                      onClick={() => { setShowAiSuggestion(false); setAiSuggestion('') }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      取消
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (showAiSuggestion) {
                        handleGenerateOutline()
                      } else if (outlinePrompt.trim()) {
                        setShowAiSuggestion(true)
                      } else {
                        handleGenerateOutline()
                      }
                    }}
                    disabled={outlineGenerating || (!outlinePrompt.trim() && !showAiSuggestion)}
                    className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {outlineGenerating ? 'AI 生成中...' : showAiSuggestion ? '确认生成' : 'AI 生成大纲'}
                  </button>
                </div>
              </div>
              {showAiSuggestion && (
                <div className="mb-2">
                  <input
                    value={aiSuggestion}
                    onChange={e => setAiSuggestion(e.target.value)}
                    placeholder="给 AI 一些方向提示（可选，如：侧重权谋、加入系统元素...）"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={e => { if (e.key === 'Enter') handleGenerateOutline() }}
                    autoFocus
                  />
                </div>
              )}
              <textarea
                value={outlinePrompt}
                onChange={e => setOutlinePrompt(e.target.value)}
                placeholder="写下你的碎片化灵感、核心创意、关键设定...&#10;例如：末世背景，主角有预知能力，在避难所中争夺生存资源..."
                className="w-full h-28 border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 小说大纲 */}
            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">小说大纲</label>
              <textarea
                value={outlineText}
                onChange={e => setOutlineText(e.target.value)}
                placeholder="在此编写或由 AI 生成完整大纲...&#10;你也可以直接手写大纲，无需使用 AI 生成"
                className="w-full h-64 border rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 确认大纲 */}
            <button
              onClick={handleConfirmOutline}
              disabled={!canConfirmOutline || confirmLoading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {confirmLoading ? '创建中...' : '确认大纲，进入细化设定'}
            </button>
            {!canConfirmOutline && (
              <p className="text-xs text-gray-400 mt-2 text-center">请填写小说名称、作者名，并编写或生成大纲后继续</p>
            )}
          </div>
        )}

        {/* ====== Page 2: 细化设定 ====== */}
        {step === 1 && (
          <div>
            {/* Extracting overlay */}
            {extracting && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-4" />
                <p className="text-lg text-gray-600">AI 正在分析大纲，提取结构化设定...</p>
                <p className="text-sm text-gray-400 mt-2">这可能需要 10-30 秒</p>
              </div>
            )}

            {!extracting && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">细化设定</h2>
                  <button
                    onClick={handleReExtract}
                    className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                  >
                    AI 重新提取全部
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">AI 已从大纲中提取以下结构化数据，你可以编辑或重新生成各部分</p>

                {/* 故事背景 */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-sm text-gray-700">故事背景</h3>
                    {renderRegenButton('story_background', '故事背景')}
                  </div>
                  <textarea
                    value={storyBackground}
                    onChange={e => setStoryBackground(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                  {renderRegenInput('story_background')}
                </div>

                {/* 主线情节 */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-sm text-gray-700">主线情节</h3>
                    {renderRegenButton('main_plot', '主线情节')}
                  </div>
                  <textarea
                    value={mainPlot}
                    onChange={e => setMainPlot(e.target.value)}
                    className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                  />
                  {renderRegenInput('main_plot')}
                </div>

                {/* 角色 */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm text-gray-700">角色 ({characters.length})</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setCharacters([...characters, {
                            name: '新角色', role: '配角', identity: '', personality: '',
                            tags: [], personality_tags: [], motivation: '',
                            behavior_rules: { absolute_do: [], absolute_dont: [] },
                            speech_pattern: '', growth_arc_type: 'staircase', relationship_masks: {},
                          }])
                          setExpandedCharIndex(characters.length)
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        手动添加
                      </button>
                      <button
                        onClick={() => setShowAddCharPrompt(!showAddCharPrompt)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showAddCharPrompt ? '取消' : '+ AI 生成角色'}
                      </button>
                    </div>
                  </div>
                  {showAddCharPrompt && (
                    <div className="mb-3 flex gap-2">
                      <input
                        value={addCharPrompt}
                        onChange={e => setAddCharPrompt(e.target.value)}
                        placeholder="描述角色，如：一个亦正亦邪的神秘老者，隐藏实力的扫地僧类型"
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={e => { if (e.key === 'Enter') handleAddCharacterAI() }}
                        autoFocus
                      />
                      <button
                        onClick={handleAddCharacterAI}
                        disabled={addCharLoading || !addCharPrompt.trim()}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {addCharLoading ? '生成中...' : '生成'}
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {characters.map((c, i) => (
                      <div key={i} className="border rounded-lg p-3 bg-gray-50">
                        {/* Collapsed: name, role, identity */}
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedCharIndex(expandedCharIndex === i ? null : i)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{c.name}</span>
                            <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{c.role}</span>
                            <span className="text-xs text-gray-500">{c.identity}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{expandedCharIndex === i ? '收起' : '展开'}</span>
                            <button
                              onClick={e => { e.stopPropagation(); setCharacters(characters.filter((_, j) => j !== i)); if (expandedCharIndex === i) setExpandedCharIndex(null) }}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              删除
                            </button>
                          </div>
                        </div>

                        {/* Expanded: all fields */}
                        {expandedCharIndex === i && (
                          <div className="mt-3 space-y-3 border-t pt-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">名称</label>
                                <input
                                  value={c.name}
                                  onChange={e => { const u = [...characters]; u[i] = { ...c, name: e.target.value }; setCharacters(u) }}
                                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">角色</label>
                                <select
                                  value={c.role}
                                  onChange={e => { const u = [...characters]; u[i] = { ...c, role: e.target.value }; setCharacters(u) }}
                                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="主角">主角</option>
                                  <option value="配角">配角</option>
                                  <option value="反派">反派</option>
                                  <option value="龙套">龙套</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">身份</label>
                              <input
                                value={c.identity || ''}
                                onChange={e => { const u = [...characters]; u[i] = { ...c, identity: e.target.value }; setCharacters(u) }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">性格</label>
                              <textarea
                                value={c.personality || ''}
                                onChange={e => { const u = [...characters]; u[i] = { ...c, personality: e.target.value }; setCharacters(u) }}
                                className="w-full border rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                                rows={2}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">动机</label>
                              <input
                                value={c.motivation || ''}
                                onChange={e => { const u = [...characters]; u[i] = { ...c, motivation: e.target.value }; setCharacters(u) }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">性格标签（逗号分隔）</label>
                                <input
                                  value={(c.personality_tags || []).join(', ')}
                                  onChange={e => { const u = [...characters]; u[i] = { ...c, personality_tags: e.target.value.split(/[,，]\s*/).filter(Boolean) }; setCharacters(u) }}
                                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="如：坚韧, 腹黑"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">成长弧线类型</label>
                                <select
                                  value={c.growth_arc_type || 'staircase'}
                                  onChange={e => { const u = [...characters]; u[i] = { ...c, growth_arc_type: e.target.value }; setCharacters(u) }}
                                  className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="staircase">阶梯型 (staircase)</option>
                                  <option value="spiral">螺旋型 (spiral)</option>
                                  <option value="cliff">断崖型 (cliff)</option>
                                  <option value="platform">平台型 (platform)</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">说话风格</label>
                              <input
                                value={c.speech_pattern || ''}
                                onChange={e => { const u = [...characters]; u[i] = { ...c, speech_pattern: e.target.value }; setCharacters(u) }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">一定会做的事（逗号分隔）</label>
                              <input
                                value={(c.behavior_rules?.absolute_do || []).join(', ')}
                                onChange={e => {
                                  const u = [...characters]
                                  u[i] = { ...c, behavior_rules: { ...c.behavior_rules, absolute_do: e.target.value.split(/[,，]\s*/).filter(Boolean) } }
                                  setCharacters(u)
                                }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">绝对不做的事（逗号分隔）</label>
                              <input
                                value={(c.behavior_rules?.absolute_dont || []).join(', ')}
                                onChange={e => {
                                  const u = [...characters]
                                  u[i] = { ...c, behavior_rules: { ...c.behavior_rules, absolute_dont: e.target.value.split(/[,，]\s*/).filter(Boolean) } }
                                  setCharacters(u)
                                }}
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            {/* AI regen for this character */}
                            <div className="border-t pt-3 mt-1">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => { setCharRegenIndex(charRegenIndex === i ? null : i); setCharRegenPrompt('') }}
                                  disabled={charRegenLoading}
                                  className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                                >
                                  {charRegenIndex === i ? '取消' : 'AI 重新生成此角色'}
                                </button>
                              </div>
                              {charRegenIndex === i && (
                                <div className="mt-2 flex gap-2">
                                  <input
                                    value={charRegenPrompt}
                                    onChange={e => setCharRegenPrompt(e.target.value)}
                                    placeholder="输入修改要求（如：让性格更阴险、加强与主角的对立），留空则全面优化"
                                    className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    onKeyDown={e => { if (e.key === 'Enter') handleRegenCharacter(i) }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleRegenCharacter(i)}
                                    disabled={charRegenLoading}
                                    className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {charRegenLoading ? '生成中...' : '生成'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 情节点 */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm text-gray-700">情节点 ({plotPoints.length})</h3>
                    {renderRegenButton('plot_points', '情节点')}
                  </div>
                  {renderRegenInput('plot_points')}
                  <div className="space-y-2 mt-2">
                    {plotPoints.map((p, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {p.chapter_range && (
                            <span className="text-xs text-gray-400">{p.chapter_range}</span>
                          )}
                          {p.event_scale === 'major' && (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">大事件</span>
                          )}
                        </div>
                        <input
                          value={p.title || ''}
                          onChange={e => {
                            const u = [...plotPoints]
                            u[i] = { ...p, title: e.target.value }
                            setPlotPoints(u)
                          }}
                          placeholder="标题"
                          className="w-full border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1"
                        />
                        <textarea
                          value={p.summary || ''}
                          onChange={e => {
                            const u = [...plotPoints]
                            u[i] = { ...p, summary: e.target.value }
                            setPlotPoints(u)
                          }}
                          placeholder="概要"
                          className="w-full border rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleGoBack}
                    className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleConfirmComplete}
                    disabled={confirmLoading}
                    className="flex-1 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    {confirmLoading ? '保存中...' : '确认完成，进入小说详情'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

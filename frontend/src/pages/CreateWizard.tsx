import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNovel, generateIdea, generateOutline, regenerateField, regenerateNovelField, updateOutline, getModels } from '../services/api'

const GENRES = ['玄幻', '仙侠', '都市', '科幻', '历史', '游戏', '悬疑', '轻小说']
const MODES = ['男频', '女频', '短篇']

interface IdeaResult {
  world_setting?: string
  protagonist_identity?: string
  core_conflict?: string
  golden_finger?: string
  antagonist_setting?: string
  power_system?: string
  core_suspense?: string
  style_tone?: string
}

interface Model {
  id: string
  name: string
  available: boolean
}

export default function CreateWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  // Step 1
  const [mode, setMode] = useState('男频')
  const [genre, setGenre] = useState('玄幻')

  // Step 2
  const [creativeIdea, setCreativeIdea] = useState('')

  // Step 3 - AI generated
  const [ideaResult, setIdeaResult] = useState<IdeaResult>({})

  // AI generate creative idea
  const [ideaLoading, setIdeaLoading] = useState(false)
  const [showIdeaPrompt, setShowIdeaPrompt] = useState(false)
  const [ideaPrompt, setIdeaPrompt] = useState('')

  const handleGenerateCreativeIdea = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    setIdeaLoading(true)
    try {
      const res = await regenerateField({
        field_name: 'creative_idea',
        current_value: creativeIdea,
        creative_idea: creativeIdea || `一部${genre}类型的${mode}网文`,
        genre,
        suggestion: ideaPrompt,
        model_id: selectedModel,
      })
      setCreativeIdea(res.data.value)
      setShowIdeaPrompt(false)
      setIdeaPrompt('')
    } catch { alert('生成失败，请重试') }
    setIdeaLoading(false)
  }

  // Regenerate field
  const [regenField, setRegenField] = useState<string | null>(null)
  const [regenSuggestion, setRegenSuggestion] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)

  const handleRegenerate = async (fieldKey: string) => {
    setRegenLoading(true)
    try {
      const res = await regenerateField({
        field_name: fieldKey,
        current_value: (ideaResult as any)[fieldKey] || '',
        creative_idea: creativeIdea,
        genre,
        suggestion: regenSuggestion,
        model_id: selectedModel,
      })
      setIdeaResult(prev => ({ ...prev, [fieldKey]: res.data.value }))
      setRegenField(null)
      setRegenSuggestion('')
    } catch {
      alert('重新生成失败，请重试')
    }
    setRegenLoading(false)
  }

  // Step 4
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [targetChapters, setTargetChapters] = useState(100)

  // AI generate title
  const [titleLoading, setTitleLoading] = useState(false)

  const handleGenerateTitle = async () => {
    if (!selectedModel) { alert('请先选择 AI 模型'); return }
    setTitleLoading(true)
    try {
      const context = Object.entries(ideaResult)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      const res = await regenerateField({
        field_name: 'title',
        current_value: title,
        creative_idea: `【创意想法】\n${creativeIdea}\n\n【已生成的设定】\n${context}`,
        genre,
        suggestion: '',
        model_id: selectedModel,
      })
      setTitle(res.data.value)
    } catch { alert('生成失败，请重试') }
    setTitleLoading(false)
  }

  // Step 5 - outline
  const [outlineResult, setOutlineResult] = useState<any>(null)
  const [novelId, setNovelId] = useState<number | null>(null)

  // Outline editing (step 4)
  const [outlineRegenField, setOutlineRegenField] = useState<string | null>(null)
  const [outlineRegenSuggestion, setOutlineRegenSuggestion] = useState('')
  const [outlineRegenLoading, setOutlineRegenLoading] = useState(false)

  const handleOutlineRegenerate = async (fieldName: string) => {
    if (!novelId || !selectedModel) return
    setOutlineRegenLoading(true)
    try {
      let currentValue = ''
      if (fieldName === 'plot_points') {
        currentValue = JSON.stringify(outlineResult?.plot_points || [], null, 2)
      } else {
        currentValue = outlineResult?.[fieldName] || ''
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
          setOutlineResult((prev: any) => ({ ...prev, plot_points: parsed }))
        } catch {
          setOutlineResult((prev: any) => ({ ...prev, plot_points: res.data.value }))
        }
      } else {
        setOutlineResult((prev: any) => ({ ...prev, [fieldName]: res.data.value }))
      }
      setOutlineRegenField(null)
      setOutlineRegenSuggestion('')
    } catch {
      alert('重新生成失败，请重试')
    }
    setOutlineRegenLoading(false)
  }

  const handleConfirmOutline = async () => {
    if (!novelId || !outlineResult) return
    setLoading(true)
    try {
      await updateOutline(novelId, {
        story_background: outlineResult.story_background,
        main_plot: outlineResult.main_plot,
        plot_points: outlineResult.plot_points,
      })
      setStep(5)
    } catch {
      alert('保存大纲失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    getModels().then(r => {
      const available = r.data.models?.filter((m: Model) => m.available) || []
      setModels(available)
      if (available.length > 0) setSelectedModel(available[0].id)
    }).catch(() => {})
  }, [])

  const steps = ['选择方向', '创意输入', 'AI 生成模板', '作品信息', '生成大纲', '完成']

  const handleGenerateIdea = async () => {
    setLoading(true)
    try {
      const res = await generateIdea({ genre, creative_idea: creativeIdea, model_id: selectedModel })
      setIdeaResult(res.data)
      setStep(2)
    } catch (_e) {
      alert('生成失败，请重试')
    }
    setLoading(false)
  }

  const handleGenerateOutline = async () => {
    setLoading(true)
    try {
      // Create novel first
      const novelData = {
        title,
        author_name: authorName,
        genre,
        mode,
        world_setting: ideaResult.world_setting,
        protagonist_identity: ideaResult.protagonist_identity,
        core_conflict: ideaResult.core_conflict,
        golden_finger: ideaResult.golden_finger,
        antagonist_setting: ideaResult.antagonist_setting,
        power_system: ideaResult.power_system,
        core_suspense: ideaResult.core_suspense,
        style_tone: ideaResult.style_tone,
        target_chapters: targetChapters,
      }
      const novelRes = await createNovel(novelData)
      const nid = novelRes.data.id
      setNovelId(nid)

      // Generate outline
      const outlineRes = await generateOutline(nid, { target_chapters: targetChapters, model_id: selectedModel })
      setOutlineResult(outlineRes.data)
      setStep(4)
    } catch (_e) {
      alert('生成大纲失败，请重试')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">创建新小说</h1>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              i <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={`ml-1 text-sm ${i <= step ? 'text-blue-600' : 'text-gray-400'}`}>{s}</span>
            {i < steps.length - 1 && <div className={`w-8 h-0.5 mx-2 ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Model selector */}
      {step < 5 && models.length > 0 && (
        <div className="mb-4">
          <label className="text-sm text-gray-600">AI 模型：</label>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="ml-2 border rounded px-2 py-1 text-sm"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        {/* Step 0: Genre */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">选择创作方向</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">模式</label>
              <div className="flex gap-3">
                {MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-2 rounded-lg border ${mode === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-blue-400'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">类型</label>
              <div className="flex flex-wrap gap-3">
                {GENRES.map(g => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-4 py-2 rounded-lg border ${genre === g ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-blue-400'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setStep(1)} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              下一步
            </button>
          </div>
        )}

        {/* Step 1: Creative idea */}
        {step === 1 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">输入你的创意想法</h2>
              <button
                onClick={() => { showIdeaPrompt ? handleGenerateCreativeIdea() : setShowIdeaPrompt(true) }}
                disabled={ideaLoading}
                className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {ideaLoading ? 'AI 思考中...' : showIdeaPrompt ? '确认生成' : 'AI 帮我想'}
              </button>
            </div>
            {showIdeaPrompt && (
              <div className="mb-3 flex gap-2">
                <input
                  value={ideaPrompt}
                  onChange={e => setIdeaPrompt(e.target.value)}
                  placeholder="给 AI 一些方向提示，如：丧尸末日、系统流、都市求生..."
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerateCreativeIdea() }}
                  autoFocus
                />
                <button
                  onClick={() => { setShowIdeaPrompt(false); setIdeaPrompt('') }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2"
                >
                  取消
                </button>
              </div>
            )}
            <textarea
              value={creativeIdea}
              onChange={e => setCreativeIdea(e.target.value)}
              placeholder="描述你想写的故事核心创意，或点击右上角「AI 帮我想」自动生成..."
              className="w-full h-40 border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(0)} className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                上一步
              </button>
              <button
                onClick={handleGenerateIdea}
                disabled={!creativeIdea.trim() || loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'AI 生成中...' : 'AI 生成模板'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: AI generated template */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">AI 生成的创作模板</h2>
            <p className="text-sm text-gray-500 mb-4">你可以修改以下内容</p>
            <div className="space-y-4">
              {[
                { key: 'world_setting', label: '世界观设定' },
                { key: 'protagonist_identity', label: '主角身份' },
                { key: 'core_conflict', label: '核心冲突' },
                { key: 'golden_finger', label: '金手指' },
                { key: 'antagonist_setting', label: '反派设定' },
                { key: 'power_system', label: '力量体系' },
                { key: 'core_suspense', label: '核心悬念' },
                { key: 'style_tone', label: '风格基调' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">{label}</label>
                    <button
                      onClick={() => { setRegenField(regenField === key ? null : key); setRegenSuggestion('') }}
                      disabled={regenLoading}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {regenField === key ? '取消' : '重新生成'}
                    </button>
                  </div>
                  <textarea
                    value={(ideaResult as any)[key] || ''}
                    onChange={e => setIdeaResult(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                  {regenField === key && (
                    <div className="mt-1 flex gap-2">
                      <input
                        value={regenSuggestion}
                        onChange={e => setRegenSuggestion(e.target.value)}
                        placeholder="输入修改建议（可选，留空则直接重新生成）"
                        className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onKeyDown={e => { if (e.key === 'Enter') handleRegenerate(key) }}
                      />
                      <button
                        onClick={() => handleRegenerate(key)}
                        disabled={regenLoading}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {regenLoading ? '生成中...' : '生成'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(1)} className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                上一步
              </button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                确认模板
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Novel info */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">作品信息</h2>
            <div className="space-y-4">
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
                  placeholder="请输入小说名称，或点击右上角 AI 帮你取名"
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">作者名</label>
                <input
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder="请输入笔名"
                  className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">目标章节数</label>
                <input
                  type="number"
                  value={targetChapters}
                  onChange={e => setTargetChapters(Number(e.target.value))}
                  className="w-32 border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(2)} className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                上一步
              </button>
              <button
                onClick={handleGenerateOutline}
                disabled={!title.trim() || !authorName.trim() || loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'AI 生成大纲中...' : '生成大纲'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Outline (editable) */}
        {step === 4 && outlineResult && (
          <div>
            <h2 className="text-lg font-semibold mb-4">大纲编辑</h2>
            <p className="text-sm text-gray-500 mb-4">你可以手动编辑或使用 AI 重新生成各字段</p>

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
                value={outlineResult.story_background || ''}
                onChange={e => setOutlineResult((prev: any) => ({ ...prev, story_background: e.target.value }))}
                className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              {outlineRegenField === 'story_background' && (
                <div className="mt-1 flex gap-2">
                  <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegenerate('story_background') }} />
                  <button onClick={() => handleOutlineRegenerate('story_background')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
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
                value={outlineResult.main_plot || ''}
                onChange={e => setOutlineResult((prev: any) => ({ ...prev, main_plot: e.target.value }))}
                className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              {outlineRegenField === 'main_plot' && (
                <div className="mt-1 flex gap-2">
                  <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegenerate('main_plot') }} />
                  <button onClick={() => handleOutlineRegenerate('main_plot')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
                </div>
              )}
            </div>

            {/* characters (read-only preview) */}
            {outlineResult.characters && (
              <div className="mb-4">
                <h3 className="font-medium text-sm text-gray-600">角色</h3>
                <div className="space-y-2 mt-1">
                  {outlineResult.characters.map((c: any, i: number) => (
                    <div key={i} className="text-sm p-2 bg-gray-50 rounded">
                      <strong>{c.name}</strong> ({c.role}) - {c.identity}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* plot_points (editable) */}
            {outlineResult.plot_points && (
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
                    <input value={outlineRegenSuggestion} onChange={e => setOutlineRegenSuggestion(e.target.value)} placeholder="输入修改建议（可选）" className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={e => { if (e.key === 'Enter') handleOutlineRegenerate('plot_points') }} />
                    <button onClick={() => handleOutlineRegenerate('plot_points')} disabled={outlineRegenLoading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">{outlineRegenLoading ? '生成中...' : '生成'}</button>
                  </div>
                )}
                <div className="space-y-2 mt-1">
                  {outlineResult.plot_points.map((p: any, i: number) => (
                    <div key={i} className="bg-gray-50 rounded p-2">
                      {typeof p === 'string' ? (
                        <input
                          value={p}
                          onChange={e => {
                            const updated = [...outlineResult.plot_points]
                            updated[i] = e.target.value
                            setOutlineResult((prev: any) => ({ ...prev, plot_points: updated }))
                          }}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="space-y-1">
                          <input
                            value={p.title || ''}
                            onChange={e => {
                              const updated = [...outlineResult.plot_points]
                              updated[i] = { ...p, title: e.target.value }
                              setOutlineResult((prev: any) => ({ ...prev, plot_points: updated }))
                            }}
                            placeholder="标题"
                            className="w-full border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <textarea
                            value={p.summary || p.description || ''}
                            onChange={e => {
                              const updated = [...outlineResult.plot_points]
                              updated[i] = { ...p, summary: e.target.value }
                              setOutlineResult((prev: any) => ({ ...prev, plot_points: updated }))
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
            )}

            <button
              onClick={handleConfirmOutline}
              disabled={loading}
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? '保存中...' : '确认大纲，开始写作'}
            </button>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#9989;</div>
            <h2 className="text-xl font-semibold mb-2">创建完成！</h2>
            <p className="text-gray-500 mb-6">你的小说《{title}》已创建成功，现在可以开始写作了</p>
            <button
              onClick={() => navigate(`/novel/${novelId}`)}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg"
            >
              进入小说详情
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

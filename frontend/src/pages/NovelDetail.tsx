import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getNovel, getOutline, listCharacters, listChapters,
  listForeshadowings, createCharacter, createChapter, exportTxt,
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
                  <label className="block text-sm font-medium mb-1">章节大纲</label>
                  <textarea
                    value={newChapterOutline}
                    onChange={e => setNewChapterOutline(e.target.value)}
                    placeholder="描述本章要写的内容..."
                    className="w-full border rounded p-2 text-sm resize-none h-20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">目标字数</label>
                  <input type="number" value={newChapterWordCount} onChange={e => setNewChapterWordCount(Number(e.target.value))} className="border rounded p-2 text-sm w-32" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addChapterMutation.mutate()} className="bg-blue-600 text-white px-4 py-1 rounded text-sm">创建并进入编辑</button>
                  <button onClick={() => setShowNewChapter(false)} className="text-gray-500 text-sm">取消</button>
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
      {activeTab === 'outline' && outline && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
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
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {outline.plot_points.map((p: any, i: number) => (
                  <div key={i} className="text-sm">{i + 1}. {typeof p === 'string' ? p : p.description || JSON.stringify(p)}</div>
                ))}
              </div>
            </div>
          )}
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
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {characters?.map((c: any) => (
              <div key={c.id} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex justify-between">
                  <h3 className="font-medium">{c.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    c.role === '主角' ? 'bg-blue-100 text-blue-700' :
                    c.role === '反派' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{c.role}</span>
                </div>
                {c.identity && <p className="text-sm text-gray-600 mt-1">{c.identity}</p>}
                {c.personality && <p className="text-sm text-gray-500 mt-1">性格: {c.personality}</p>}
                {c.current_status && <p className="text-sm text-gray-500">状态: {c.current_status}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Foreshadowings tab */}
      {activeTab === 'foreshadowings' && (
        <div>
          <h2 className="font-semibold mb-4">伏笔追踪</h2>
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {foreshadowings?.map((f: any) => (
              <div key={f.id} className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${
                f.status === '已解决' ? 'border-green-500' : f.status === '推进中' ? 'border-yellow-500' : 'border-blue-500'
              }`}>
                <div className="flex justify-between items-start">
                  <p className="text-sm">{f.description}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ml-2 whitespace-nowrap ${
                    f.status === '已解决' ? 'bg-green-100 text-green-700' :
                    f.status === '推进中' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{f.status}</span>
                </div>
                {f.created_chapter_id && <p className="text-xs text-gray-400 mt-1">埋设于第{f.created_chapter_id}章</p>}
              </div>
            ))}
            {(!foreshadowings || foreshadowings.length === 0) && <p className="text-gray-400 text-center py-8">暂无伏笔记录</p>}
          </div>
        </div>
      )}
    </div>
  )
}

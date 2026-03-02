import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listNovels } from '../services/api'

export default function NovelList() {
  const { data, isLoading } = useQuery({ queryKey: ['novels'], queryFn: () => listNovels().then(r => r.data) })

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的小说</h1>
        <Link to="/create" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          创建新小说
        </Link>
      </div>
      {isLoading ? (
        <p>加载中...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((novel: any) => (
            <Link key={novel.id} to={`/novel/${novel.id}`} className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition">
              <h3 className="font-bold text-lg">{novel.title}</h3>
              <p className="text-sm text-gray-500">{novel.author_name} · {novel.genre} · {novel.mode}</p>
              <p className="text-sm text-gray-400 mt-1">{novel.status}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

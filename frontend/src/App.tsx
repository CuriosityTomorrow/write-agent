import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NovelList from './pages/NovelList'
import NovelDetail from './pages/NovelDetail'
import ChapterEditor from './pages/ChapterEditor'
import CreateWizard from './pages/CreateWizard'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<NovelList />} />
            <Route path="/create" element={<CreateWizard />} />
            <Route path="/novel/:id" element={<NovelDetail />} />
            <Route path="/novel/:novelId/chapter/:chapterId" element={<ChapterEditor />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

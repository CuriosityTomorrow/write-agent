import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Novel
export const listNovels = () => api.get('/novels')
export const createNovel = (data: any) => api.post('/novels', data)
export const getNovel = (id: number) => api.get(`/novels/${id}`)
export const updateNovel = (id: number, data: any) => api.put(`/novels/${id}`, data)
export const deleteNovel = (id: number) => api.delete(`/novels/${id}`)

// Outline
export const getOutline = (novelId: number) => api.get(`/novels/${novelId}/outline`)
export const updateOutline = (novelId: number, data: any) => api.put(`/novels/${novelId}/outline`, data)

// Characters
export const listCharacters = (novelId: number) => api.get(`/novels/${novelId}/characters`)
export const createCharacter = (novelId: number, data: any) => api.post(`/novels/${novelId}/characters`, data)
export const updateCharacter = (novelId: number, charId: number, data: any) => api.put(`/novels/${novelId}/characters/${charId}`, data)

// Chapters
export const listChapters = (novelId: number) => api.get(`/novels/${novelId}/chapters`)
export const createChapter = (novelId: number, data: any) => api.post(`/novels/${novelId}/chapters`, data)
export const getChapter = (novelId: number, chapterId: number) => api.get(`/novels/${novelId}/chapters/${chapterId}`)
export const updateChapter = (novelId: number, chapterId: number, data: any) => api.put(`/novels/${novelId}/chapters/${chapterId}`, data)
export const getChapterIntel = (novelId: number, chapterId: number) => api.get(`/novels/${novelId}/chapters/${chapterId}/intel`)

// Foreshadowings
export const listForeshadowings = (novelId: number) => api.get(`/novels/${novelId}/foreshadowings`)

// Writing
export const generateIdea = (data: any) => api.post('/generate/idea', data)
export const generateOutline = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/outline`, data)
export const extractIntel = (novelId: number, chapterId: number, data: any) => api.post(`/novels/${novelId}/chapters/${chapterId}/extract-intel`, data)

// LLM
export const getModels = () => api.get('/llm/models')

// Export
export const exportTxt = (novelId: number) => `/api/novels/${novelId}/export/txt`

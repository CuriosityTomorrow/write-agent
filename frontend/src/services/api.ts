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
export const deleteChapter = (novelId: number, chapterId: number) => api.delete(`/novels/${novelId}/chapters/${chapterId}`)
export const getChapterIntel = (novelId: number, chapterId: number) => api.get(`/novels/${novelId}/chapters/${chapterId}/intel`)

// Foreshadowings
export const listForeshadowings = (novelId: number) => api.get(`/novels/${novelId}/foreshadowings`)
export const createForeshadowing = (novelId: number, data: any) => api.post(`/novels/${novelId}/foreshadowings`, data)
export const updateForeshadowing = (novelId: number, fsId: number, data: any) => api.put(`/novels/${novelId}/foreshadowings/${fsId}`, data)
export const deleteForeshadowing = (novelId: number, fsId: number) => api.delete(`/novels/${novelId}/foreshadowings/${fsId}`)
export const adoptSuggestedForeshadowing = (novelId: number, data: any) => api.post(`/novels/${novelId}/foreshadowings/adopt-suggestion`, data)

// Writing
export const generateIdea = (data: any) => api.post('/generate/idea', data)
export const regenerateField = (data: any) => api.post('/generate/regenerate-field', data)
export const regenerateNovelField = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/regenerate-field`, data)
export const generateOutline = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/outline`, data)
export const extractIntel = (novelId: number, chapterId: number, data: any) => api.post(`/novels/${novelId}/chapters/${chapterId}/extract-intel`, data)
export const checkConsistency = (novelId: number, chapterId: number, data: any) => api.post(`/novels/${novelId}/chapters/${chapterId}/check-consistency`, data)
export const generateOutlineFromPrompt = (data: any) => api.post('/generate/outline-from-prompt', data)
export const extractFromOutline = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/extract-from-outline`, data)
export const generateCharacter = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/character`, data)

// Narrative Memory
export const listNarrativeMemories = (novelId: number) => api.get(`/novels/${novelId}/narrative-memories`)
export const updateNarrativeMemory = (novelId: number, memId: number, data: any) => api.put(`/novels/${novelId}/narrative-memories/${memId}`, data)
export const generateVolumeSummary = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/volume-summary`, data)
export const generateRangeSummary = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/range-summary`, data)

// Major Events
export const listMajorEvents = (novelId: number) => api.get(`/novels/${novelId}/major-events`)
export const generateMajorEventIdeas = (novelId: number, data: any) => api.post(`/novels/${novelId}/major-events/generate-ideas`, data)
export const createMajorEvent = (novelId: number, data: any) => api.post(`/novels/${novelId}/major-events`, data)

// LLM
export const getModels = () => api.get('/llm/models')

// Export
export const exportTxt = (novelId: number) => `/api/novels/${novelId}/export/txt`

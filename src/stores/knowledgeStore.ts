import { create } from 'zustand'
import type { KnowledgeFile } from '../types'
import {
  saveKnowledgeFilesToLocal,
  loadKnowledgeFilesFromLocal,
  deleteKnowledgeFileFromLocal,
} from '../utils/storage'

interface KnowledgeState {
  knowledgeFiles: KnowledgeFile[]
  isLoaded: boolean
  setKnowledgeFiles: (knowledges: KnowledgeFile[]) => void
  addKnowledgeFile: (knowledge: KnowledgeFile) => void
  updateKnowledgeFile: (id: string, updates: Partial<KnowledgeFile>) => void
  deleteKnowledgeFile: (id: string) => void
  loadKnowledgeFiles: () => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  knowledgeFiles: [],
  isLoaded: false,

  setKnowledgeFiles: (knowledgeFiles) => {
    set({ knowledgeFiles })
    // 自动保存到本地
    saveKnowledgeFilesToLocal(knowledgeFiles)
  },

  addKnowledgeFile: (knowledge) =>
    set((state) => {
      const newKnowledges = [knowledge, ...state.knowledgeFiles]
      // 异步保存到本地
      saveKnowledgeFilesToLocal(newKnowledges)
      return { knowledgeFiles: newKnowledges }
    }),

  updateKnowledgeFile: (id, updates) =>
    set((state) => {
      const newKnowledges = state.knowledgeFiles.map((knowledge) =>
        knowledge.id === id ? { ...knowledge, ...updates } : knowledge
      )
      // 异步保存到本地
      saveKnowledgeFilesToLocal(newKnowledges)
      return { knowledgeFiles: newKnowledges }
    }),

  deleteKnowledgeFile: (id) =>
    set((state) => {
      const knowledgeToDelete = state.knowledgeFiles.find((knowledge) => knowledge.id === id)
      const newKnowledges = state.knowledgeFiles.filter((knowledge) => knowledge.id !== id)
      // 异步删除文件并保存列表
      if (knowledgeToDelete) {
        deleteKnowledgeFileFromLocal(knowledgeToDelete.name)
      }
      return { knowledgeFiles: newKnowledges }
    }),

  loadKnowledgeFiles: async () => {
    // 从本地加载
    const loadedKnowledges = await loadKnowledgeFilesFromLocal()

    if (loadedKnowledges && loadedKnowledges.length > 0) {
      set({ knowledgeFiles: loadedKnowledges, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ knowledgeFiles: [], isLoaded: true })
    }
  },
}))
import { create } from 'zustand'
import type { KnowledgeFile } from '../types'
import {
  saveKnowledgeFilesToLocal,
  saveSingleKnowledgeFileToLocal,
  loadKnowledgeFilesFromLocal,
  deleteKnowledgeFileFromLocal,
} from '../utils/storage'

interface KnowledgeState {
  knowledgeFiles: KnowledgeFile[]
  isLoaded: boolean
  setKnowledgeFiles: (knowledges: KnowledgeFile[]) => void
  addKnowledgeFile: (knowledge: KnowledgeFile) => Promise<boolean>
  updateKnowledgeFile: (id: string, updates: Partial<KnowledgeFile>) => Promise<boolean>
  deleteKnowledgeFile: (id: string) => Promise<boolean>
  loadKnowledgeFiles: () => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  knowledgeFiles: [],
  isLoaded: false,

  setKnowledgeFiles: (knowledgeFiles) => {
    set({ knowledgeFiles })
    // 自动保存到本地
    saveKnowledgeFilesToLocal(knowledgeFiles)
  },

  addKnowledgeFile: async (knowledge) => {
    const success = await saveSingleKnowledgeFileToLocal(knowledge)
    if (success) {
      set({ knowledgeFiles: [knowledge, ...get().knowledgeFiles] })
    }
    return success
  },

  updateKnowledgeFile: async (id, updates) => {
    const newKnowledges = get().knowledgeFiles.map((knowledge) =>
      knowledge.id === id ? { ...knowledge, ...updates } : knowledge
    )
    const updated = newKnowledges.find((k) => k.id === id)
    let success = true
    if (updated) {
      success = await saveSingleKnowledgeFileToLocal(updated)
    }
    if (success) {
      set({ knowledgeFiles: newKnowledges })
    }
    return success
  },

  deleteKnowledgeFile: async (id) => {
    const knowledgeToDelete = get().knowledgeFiles.find((knowledge) => knowledge.id === id)
    if (!knowledgeToDelete) return true
    const deletePath = knowledgeToDelete.filepath ||
      (knowledgeToDelete.category
        ? `${knowledgeToDelete.category}/${knowledgeToDelete.name}`
        : knowledgeToDelete.name)
    const success = await deleteKnowledgeFileFromLocal(deletePath)
    if (success) {
      set({ knowledgeFiles: get().knowledgeFiles.filter((knowledge) => knowledge.id !== id) })
    }
    return success
  },

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
import { create } from 'zustand'
import type { AbilityFile } from '../types'
import {
  saveAbilityFilesToLocal,
  loadAbilityFilesFromLocal,
  deleteAbilityFileFromLocal,
} from '../utils/storage'

interface AbilityState {
  abilityFiles: AbilityFile[]
  isLoaded: boolean
  setAbilityFiles: (abilities: AbilityFile[]) => void
  addAbilityFile: (ability: AbilityFile) => void
  updateAbilityFile: (id: string, updates: Partial<AbilityFile>) => void
  deleteAbilityFile: (id: string) => void
  loadAbilityFiles: () => Promise<void>
}

export const useAbilityStore = create<AbilityState>((set) => ({
  abilityFiles: [],
  isLoaded: false,

  setAbilityFiles: (abilityFiles) => {
    set({ abilityFiles })
    // 自动保存到本地
    saveAbilityFilesToLocal(abilityFiles)
  },

  addAbilityFile: (ability) =>
    set((state) => {
      const newAbilities = [ability, ...state.abilityFiles]
      // 异步保存到本地
      saveAbilityFilesToLocal(newAbilities)
      return { abilityFiles: newAbilities }
    }),

  updateAbilityFile: (id, updates) =>
    set((state) => {
      const newAbilities = state.abilityFiles.map((ability) =>
        ability.id === id ? { ...ability, ...updates } : ability
      )
      // 异步保存到本地
      saveAbilityFilesToLocal(newAbilities)
      return { abilityFiles: newAbilities }
    }),

  deleteAbilityFile: (id) =>
    set((state) => {
      const abilityToDelete = state.abilityFiles.find((ability) => ability.id === id)
      const newAbilities = state.abilityFiles.filter((ability) => ability.id !== id)
      // 异步删除文件并保存列表
      if (abilityToDelete) {
        deleteAbilityFileFromLocal(abilityToDelete.name)
      }
      return { abilityFiles: newAbilities }
    }),

  loadAbilityFiles: async () => {
    // 从本地加载
    const loadedAbilities = await loadAbilityFilesFromLocal()

    if (loadedAbilities && loadedAbilities.length > 0) {
      set({ abilityFiles: loadedAbilities, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ abilityFiles: [], isLoaded: true })
    }
  },
}))
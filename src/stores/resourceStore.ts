import { create } from 'zustand'
import type { ResourceFile } from '../types'
import {
  saveResourceFilesToLocal,
  loadResourceFilesFromLocal,
} from '../utils/storage'

interface ResourceState {
  resourceFiles: ResourceFile[]
  isLoaded: boolean
  setResourceFiles: (resources: ResourceFile[]) => void
  addResourceFile: (resource: ResourceFile) => void
  updateResourceFile: (id: string, updates: Partial<ResourceFile>) => void
  deleteResourceFile: (id: string) => void
  loadResourceFiles: () => Promise<void>
}

export const useResourceStore = create<ResourceState>((set) => ({
  resourceFiles: [],
  isLoaded: false,

  setResourceFiles: (resourceFiles) => {
    set({ resourceFiles })
    // 自动保存到本地
    saveResourceFilesToLocal(resourceFiles)
  },

  addResourceFile: (resource) =>
    set((state) => {
      const newResources = [resource, ...state.resourceFiles]
      // 异步保存到本地
      saveResourceFilesToLocal(newResources)
      return { resourceFiles: newResources }
    }),

  updateResourceFile: (id, updates) =>
    set((state) => {
      const newResources = state.resourceFiles.map((resource) =>
        resource.id === id ? { ...resource, ...updates } : resource
      )
      // 异步保存到本地
      saveResourceFilesToLocal(newResources)
      return { resourceFiles: newResources }
    }),

  deleteResourceFile: (id) =>
    set((state) => {
      const newResources = state.resourceFiles.filter((resource) => resource.id !== id)
      // 异步保存到本地
      saveResourceFilesToLocal(newResources)
      return { resourceFiles: newResources }
    }),

  loadResourceFiles: async () => {
    // 从本地加载
    const loadedResources = await loadResourceFilesFromLocal()

    if (loadedResources && loadedResources.length > 0) {
      set({ resourceFiles: loadedResources, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ resourceFiles: [], isLoaded: true })
    }
  },
}))

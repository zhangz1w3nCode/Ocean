import { create } from 'zustand'
import type { ResourceFile } from '../types'
import {
  saveResourceFilesToLocal,
  saveSingleResourceFileToLocal,
  loadSingleResourceFileFromLocal,
  loadResourceFilesFromLocal,
  deleteResourceFileFromLocal,
} from '../utils/storage'

interface ResourceState {
  resourceFiles: ResourceFile[]
  isLoaded: boolean
  setResourceFiles: (resources: ResourceFile[]) => void
  addResourceFile: (resource: ResourceFile) => Promise<boolean>
  updateResourceFile: (id: string, updates: Partial<ResourceFile>) => Promise<boolean>
  deleteResourceFile: (id: string) => Promise<boolean>
  loadResourceFiles: () => Promise<void>
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  resourceFiles: [],
  isLoaded: false,

  setResourceFiles: (resourceFiles) => {
    set({ resourceFiles })
    // 自动保存到本地
    saveResourceFilesToLocal(resourceFiles)
  },

  addResourceFile: async (resource) => {
    const success = await saveSingleResourceFileToLocal(resource)
    if (success) {
      const diskResource = await loadSingleResourceFileFromLocal(resource.name)
      if (diskResource) {
        set({ resourceFiles: [{ ...diskResource, id: resource.id }, ...get().resourceFiles] })
      } else {
        set({ resourceFiles: [resource, ...get().resourceFiles] })
      }
    }
    return success
  },

  updateResourceFile: async (id, updates) => {
    const resource = get().resourceFiles.find(r => r.id === id)
    if (!resource) return false
    const updatedResource = { ...resource, ...updates }
    const success = await saveSingleResourceFileToLocal(updatedResource)
    if (success) {
      const diskResource = await loadSingleResourceFileFromLocal(resource.name)
      if (diskResource) {
        set({ resourceFiles: get().resourceFiles.map(r => r.id === id ? { ...diskResource, id: r.id, createdAt: r.createdAt } : r) })
      } else {
        set({ resourceFiles: get().resourceFiles.map(r => r.id === id ? updatedResource : r) })
      }
    }
    return success
  },

  deleteResourceFile: async (id) => {
    const resourceToDelete = get().resourceFiles.find(r => r.id === id)
    if (!resourceToDelete) return true
    const success = await deleteResourceFileFromLocal(resourceToDelete.name)
    if (success) {
      set({ resourceFiles: get().resourceFiles.filter(r => r.id !== id) })
    }
    return success
  },

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

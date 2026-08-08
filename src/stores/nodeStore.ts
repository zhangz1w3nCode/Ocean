import { create } from 'zustand'
import type { NodeDefinition } from '../types'
import {
  saveNodeFilesToLocal,
  saveSingleNodeFileToLocal,
  loadSingleNodeFileFromLocal,
  loadNodeFilesFromLocal,
  deleteNodeFileFromLocal,
} from '../utils/storage'

interface NodeState {
  nodeDefinitions: NodeDefinition[]
  isLoaded: boolean
  setNodeDefinitions: (nodes: NodeDefinition[]) => void
  addNodeDefinition: (node: NodeDefinition) => Promise<boolean>
  updateNodeDefinition: (id: string, updates: Partial<NodeDefinition>) => Promise<boolean>
  deleteNodeDefinition: (id: string) => Promise<boolean>
  loadNodeDefinitions: () => Promise<void>
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodeDefinitions: [],
  isLoaded: false,

  setNodeDefinitions: (nodeDefinitions) => {
    set({ nodeDefinitions })
    // 自动保存到本地（Markdown 格式）
    saveNodeFilesToLocal(nodeDefinitions)
  },

  addNodeDefinition: async (node) => {
    const success = await saveSingleNodeFileToLocal(node)
    if (success) {
      const diskNode = await loadSingleNodeFileFromLocal(node.name)
      if (diskNode) {
        set({ nodeDefinitions: [{ ...diskNode, id: node.id }, ...get().nodeDefinitions] })
      } else {
        set({ nodeDefinitions: [node, ...get().nodeDefinitions] })
      }
    }
    return success
  },

  updateNodeDefinition: async (id, updates) => {
    const node = get().nodeDefinitions.find(n => n.id === id)
    if (!node) return false
    const updatedNode = { ...node, ...updates }
    const success = await saveSingleNodeFileToLocal(updatedNode)
    if (success) {
      const diskNode = await loadSingleNodeFileFromLocal(node.name)
      if (diskNode) {
        set({ nodeDefinitions: get().nodeDefinitions.map(n => n.id === id ? { ...diskNode, id: n.id, createdAt: n.createdAt } : n) })
      } else {
        set({ nodeDefinitions: get().nodeDefinitions.map(n => n.id === id ? updatedNode : n) })
      }
    }
    return success
  },

  deleteNodeDefinition: async (id) => {
    const nodeToDelete = get().nodeDefinitions.find((node) => node.id === id)
    if (!nodeToDelete) return true
    const success = await deleteNodeFileFromLocal(nodeToDelete.name)
    if (success) {
      set({ nodeDefinitions: get().nodeDefinitions.filter((node) => node.id !== id) })
    }
    return success
  },

  loadNodeDefinitions: async () => {
    // 从本地加载（Markdown 格式）
    const loadedDefinitions = await loadNodeFilesFromLocal()

    if (loadedDefinitions && loadedDefinitions.length > 0) {
      set({ nodeDefinitions: loadedDefinitions, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ nodeDefinitions: [], isLoaded: true })
    }
  },
}))
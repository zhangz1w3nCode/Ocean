import { create } from 'zustand'
import type { NodeDefinition } from '../types'
import {
  saveNodeFilesToLocal,
  loadNodeFilesFromLocal,
  deleteNodeFileFromLocal,
} from '../utils/storage'

interface NodeState {
  nodeDefinitions: NodeDefinition[]
  isLoaded: boolean
  setNodeDefinitions: (nodes: NodeDefinition[]) => void
  addNodeDefinition: (node: NodeDefinition) => void
  updateNodeDefinition: (id: string, updates: Partial<NodeDefinition>) => void
  deleteNodeDefinition: (id: string) => void
  loadNodeDefinitions: () => Promise<void>
}

export const useNodeStore = create<NodeState>((set) => ({
  nodeDefinitions: [],
  isLoaded: false,

  setNodeDefinitions: (nodeDefinitions) => {
    set({ nodeDefinitions })
    // 自动保存到本地（Markdown 格式）
    saveNodeFilesToLocal(nodeDefinitions)
  },

  addNodeDefinition: (node) =>
    set((state) => {
      const newDefinitions = [node, ...state.nodeDefinitions]
      // 异步保存到本地（Markdown 格式）
      saveNodeFilesToLocal(newDefinitions)
      return { nodeDefinitions: newDefinitions }
    }),

  updateNodeDefinition: (id, updates) =>
    set((state) => {
      const newDefinitions = state.nodeDefinitions.map((node) =>
        node.id === id ? { ...node, ...updates } : node
      )
      // 异步保存到本地（Markdown 格式）
      saveNodeFilesToLocal(newDefinitions)
      return { nodeDefinitions: newDefinitions }
    }),

  deleteNodeDefinition: (id) =>
    set((state) => {
      const nodeToDelete = state.nodeDefinitions.find((node) => node.id === id)
      const newDefinitions = state.nodeDefinitions.filter((node) => node.id !== id)
      // 异步保存到本地（Markdown 格式）
      saveNodeFilesToLocal(newDefinitions)
      // 删除对应的 MD 文件
      if (nodeToDelete) {
        deleteNodeFileFromLocal(nodeToDelete.name)
      }
      return { nodeDefinitions: newDefinitions }
    }),

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
import { create } from 'zustand'
import type { Workflow } from '../types'
import type { ReactFlowNode, ReactFlowEdge } from '../types/flow'
import {
  saveWorkflowFileToLocal,
  loadWorkflowFilesFromLocal,
  deleteWorkflowFileFromLocal,
  // 新增文件夹操作方法
  saveWorkflowToFolder,
  loadAllWorkflowFolders,
  deleteWorkflowFolder,
  renameWorkflowFolder,
  loadWorkflowFromFolder,
} from '../utils/storage'

interface WorkflowState {
  workflows: Workflow[]
  isLoaded: boolean
  useFolderStructure: boolean // 是否使用新的文件夹结构
  setWorkflows: (workflows: Workflow[]) => void
  addWorkflow: (workflow: Workflow) => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  getWorkflowById: (id: string) => Workflow | undefined
  getWorkflowByName: (name: string) => Workflow | undefined
  reloadWorkflowById: (id: string) => Promise<void>
  saveWorkflowData: (id: string, nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => Promise<boolean>
  loadWorkflows: () => Promise<void>
  // 新增文件夹操作方法
  setUseFolderStructure: (use: boolean) => void
  renameWorkflow: (id: string, newName: string) => Promise<boolean>
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  isLoaded: false,
  useFolderStructure: true, // 默认使用新的文件夹结构

  setWorkflows: (workflows) => {
    set({ workflows })
  },

  setUseFolderStructure: (use) => {
    set({ useFolderStructure: use })
  },

  addWorkflow: (workflow) =>
    set((state) => {
      const newWorkflows = [workflow, ...state.workflows]
      return { workflows: newWorkflows }
    }),

  updateWorkflow: (id, updates) =>
    set((state) => {
      const newWorkflows = state.workflows.map((wf) =>
        wf.id === id ? { ...wf, ...updates, updatedAt: new Date().toISOString() } : wf
      )
      return { workflows: newWorkflows }
    }),

  deleteWorkflow: (id) =>
    set((state) => {
      const workflow = state.workflows.find((wf) => wf.id === id)
      const newWorkflows = state.workflows.filter((wf) => wf.id !== id)
      // 删除对应的文件或文件夹
      if (workflow) {
        if (workflow.hasMetadata) {
          // 使用文件夹结构
          deleteWorkflowFolder(workflow.name)
        } else {
          // 使用旧的 MD 文件
          deleteWorkflowFileFromLocal(workflow.name)
        }
      }
      return { workflows: newWorkflows }
    }),

  getWorkflowById: (id) => get().workflows.find((wf) => wf.id === id),

  getWorkflowByName: (name) => get().workflows.find((wf) => wf.name === name),

  reloadWorkflowById: async (id) => {
    const workflow = get().workflows.find((wf) => wf.id === id)
    if (!workflow || !workflow.hasMetadata) return

    try {
      const fresh = await loadWorkflowFromFolder(workflow.name)
      if (fresh) {
        // 保留原始 id（从列表加载时的 id），避免 WORKFLOW.md 中无 id 字段导致匹配不上
        fresh.id = workflow.id
        set((state) => ({
          workflows: state.workflows.map((wf) => (wf.id === id ? fresh : wf)),
        }))
      }
    } catch (error) {
      console.error('重新加载工作流失败:', error)
    }
  },

  saveWorkflowData: async (id, nodes, edges) => {
    try {
      const workflow = get().getWorkflowById(id)
      if (!workflow) return false

      const updatedWorkflow = {
        ...workflow,
        nodes: [...nodes],
        edges: [...edges],
        nodeCount: nodes.length,
        updatedAt: new Date().toISOString(),
        hasMetadata: true, // 标记为使用新的文件夹结构
      }

      // 更新 store
      set((state) => ({
        workflows: state.workflows.map((wf) =>
          wf.id === id ? updatedWorkflow : wf
        ),
      }))

      // 根据配置选择保存方式
      if (get().useFolderStructure || workflow.hasMetadata) {
        // 使用新的文件夹结构保存
        await saveWorkflowToFolder(updatedWorkflow, nodes, edges)
      } else {
        // 使用旧的 MD 文件保存
        await saveWorkflowFileToLocal(workflow, nodes, edges)
      }

      return true
    } catch (error) {
      console.error('保存工作流失败:', error)
      return false
    }
  },

  loadWorkflows: async () => {
    // 优先尝试加载新的文件夹结构
    if (get().useFolderStructure) {
      const folderWorkflows = await loadAllWorkflowFolders()
      if (folderWorkflows && folderWorkflows.length > 0) {
        set({ workflows: folderWorkflows, isLoaded: true })
        return
      }
    }

    // 如果没有找到文件夹结构，尝试加载旧的 MD 文件
    const loadedWorkflows = await loadWorkflowFilesFromLocal()

    if (loadedWorkflows && loadedWorkflows.length > 0) {
      // 自动迁移：将旧版MD文件转换为新的文件夹结构
      console.log('检测到旧版工作流文件,开始自动迁移到文件夹结构...')

      for (const workflow of loadedWorkflows) {
        // 标记为使用新的文件夹结构
        workflow.hasMetadata = true

        // 保存到新的文件夹结构
        await saveWorkflowToFolder(workflow, workflow.nodes || [], workflow.edges || [])

        // 删除旧的MD文件
        await deleteWorkflowFileFromLocal(workflow.name)

        console.log(`已迁移工作流: ${workflow.name}`)
      }

      // 更新store
      set({ workflows: loadedWorkflows, isLoaded: true, useFolderStructure: true })
      console.log('工作流迁移完成!')
    } else {
      // 没有本地数据，使用空数组
      set({ workflows: [], isLoaded: true })
    }
  },

  renameWorkflow: async (id, newName) => {
    try {
      const workflow = get().getWorkflowById(id)
      if (!workflow) return false

      const oldName = workflow.name

      // 更新 store
      set((state) => ({
        workflows: state.workflows.map((wf) =>
          wf.id === id ? { ...wf, name: newName, updatedAt: new Date().toISOString() } : wf
        ),
      }))

      // 重命名文件或文件夹
      if (workflow.hasMetadata) {
        await renameWorkflowFolder(oldName, newName)
      }

      return true
    } catch (error) {
      console.error('重命名工作流失败:', error)
      return false
    }
  },
}))
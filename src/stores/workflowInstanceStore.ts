import { create } from 'zustand'
import type { WorkflowInstance, InstanceArtifact } from '../types'
import { isElectron } from '../utils/storage'

interface WorkflowInstanceState {
  instances: WorkflowInstance[]
  isLoaded: boolean
  selectedInstance: WorkflowInstance | null
  processContent: string
  artifacts: InstanceArtifact[]
  isLoadingDetail: boolean
  loadInstances: () => Promise<void>
  selectInstance: (instance: WorkflowInstance | null) => void
  loadInstanceDetail: (instance: WorkflowInstance) => Promise<void>
}

export const useWorkflowInstanceStore = create<WorkflowInstanceState>((set, get) => ({
  instances: [],
  isLoaded: false,
  selectedInstance: null,
  processContent: '',
  artifacts: [],
  isLoadingDetail: false,

  loadInstances: async () => {
    if (!isElectron()) {
      set({ isLoaded: true })
      return
    }
    try {
      const result = await window.electronAPI!.listWorkflowInstances()
      if (result.success) {
        set({ instances: result.instances || [], isLoaded: true })
      } else {
        console.error('加载工作流实例失败:', result.error)
        set({ isLoaded: true })
      }
    } catch (error) {
      console.error('加载工作流实例失败:', error)
      set({ isLoaded: true })
    }
  },

  selectInstance: (instance) => {
    set({ selectedInstance: instance })
    if (instance) {
      get().loadInstanceDetail(instance)
    } else {
      set({ processContent: '', artifacts: [] })
    }
  },

  loadInstanceDetail: async (instance) => {
    if (!isElectron()) return
    set({ isLoadingDetail: true })
    try {
      const [processResult, artifactsResult] = await Promise.all([
        window.electronAPI!.readInstanceFile(instance.workflowName, instance.instanceId, 'process.md'),
        window.electronAPI!.listInstanceArtifacts(instance.workflowName, instance.instanceId),
      ])
      set({
        processContent: processResult.success ? processResult.content : '无法读取 process.md',
        artifacts: artifactsResult.success ? artifactsResult.artifacts || [] : [],
        isLoadingDetail: false,
      })
    } catch (error) {
      console.error('加载实例详情失败:', error)
      set({ isLoadingDetail: false })
    }
  },
}))

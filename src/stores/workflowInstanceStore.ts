import { create } from 'zustand'
import type { WorkflowInstance, InstanceArtifact, InstanceTraceEvent } from '../types'
import { isElectron } from '../utils/storage'

interface InstanceDetail {
  processRaw: string
  mermaid: string
  trace: InstanceTraceEvent[]
  artifacts: InstanceArtifact[]
  traceLog: string
  instanceMd: string
}

interface WorkflowInstanceState {
  instances: WorkflowInstance[]
  isLoaded: boolean
  isLoadingDetail: boolean
  selectedInstance: WorkflowInstance | null
  detail: InstanceDetail | null
  selectedArtifact: InstanceArtifact | null
  loadInstances: () => Promise<void>
  selectInstance: (instance: WorkflowInstance | null) => void
  loadInstanceDetail: (instance: WorkflowInstance) => Promise<void>
  selectArtifact: (artifact: InstanceArtifact | null) => void
  clearDetail: () => void
}

export const useWorkflowInstanceStore = create<WorkflowInstanceState>((set, get) => ({
  instances: [],
  isLoaded: false,
  isLoadingDetail: false,
  selectedInstance: null,
  detail: null,
  selectedArtifact: null,

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
    set({ selectedInstance: instance, detail: null, selectedArtifact: null })
    if (instance) {
      get().loadInstanceDetail(instance)
    }
  },

  loadInstanceDetail: async (instance) => {
    if (!isElectron()) return
    set({ isLoadingDetail: true })
    try {
      const result = await window.electronAPI!.readInstanceDetail(instance.workflowName, instance.instanceId)
      if (result.success && result.detail) {
        set({ detail: result.detail, isLoadingDetail: false })
      } else {
        console.error('加载实例详情失败:', result.error)
        set({ isLoadingDetail: false })
      }
    } catch (error) {
      console.error('加载实例详情失败:', error)
      set({ isLoadingDetail: false })
    }
  },

  selectArtifact: (artifact) => {
    set({ selectedArtifact: artifact })
  },

  clearDetail: () => {
    set({ selectedInstance: null, detail: null, selectedArtifact: null })
  },
}))

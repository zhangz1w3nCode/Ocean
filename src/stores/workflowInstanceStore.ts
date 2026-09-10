import { create } from 'zustand'
import type { WorkflowInstance, InstanceArtifact, InstanceTraceEvent } from '../types'
import { isElectron } from '../utils/storage'

interface InstanceDetail {
  trace: InstanceTraceEvent[]
  artifacts: InstanceArtifact[]
  traceLog: string
  instanceMd: string
  flowData: { nodes: any[]; edges: any[] } | null
  completedNodes: string[]
  currentName: string
  wfStatus: string
  wfStep: number
  wfLoopCount: number
  wfRetryCount: number
  contextMd: string
}

interface WorkflowInstanceState {
  instances: WorkflowInstance[]
  isLoaded: boolean
  isLoadingDetail: boolean
  openTabs: WorkflowInstance[]
  activeTabId: string | null
  selectedInstance: WorkflowInstance | null
  detail: InstanceDetail | null
  selectedArtifact: InstanceArtifact | null
  isLiveRefresh: boolean
  _unsubDelta: (() => void) | null
  listSearchQuery: string
  listFilterWorkflow: string
  listFilterStatus: string
  listSortOrder: 'desc' | 'asc'
  loadInstances: () => Promise<void>
  selectInstance: (instance: WorkflowInstance | null) => void
  loadInstanceDetail: (instance: WorkflowInstance) => Promise<void>
  selectArtifact: (artifact: InstanceArtifact | null) => void
  closeTab: (instanceId: string) => void
  switchTab: (instanceId: string) => void
  reorderTabs: (newOrder: WorkflowInstance[]) => void
  showList: () => void
  clearDetail: () => void
  startLiveRefresh: () => void
  stopLiveRefresh: () => void
  reset: () => void,
}

export const useWorkflowInstanceStore = create<WorkflowInstanceState>((set, get) => ({
  instances: [],
  isLoaded: false,
  isLoadingDetail: false,
  openTabs: [],
  activeTabId: null,
  selectedInstance: null,
  detail: null,
  selectedArtifact: null,
  isLiveRefresh: false,

  _unsubDelta: null as (() => void) | null,
  listSearchQuery: '',
  listFilterWorkflow: '',
  listFilterStatus: '',
  listSortOrder: 'desc' as 'desc' | 'asc',

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
    if (!instance) {
      get().showList()
      return
    }
    const { openTabs } = get()
    const exists = openTabs.find(t => t.instanceId === instance.instanceId)
    const newTabs = exists ? openTabs : [...openTabs, instance]
    get().stopLiveRefresh()
    set({ openTabs: newTabs, activeTabId: instance.instanceId, selectedInstance: instance, detail: null, selectedArtifact: null })
    get().loadInstanceDetail(instance)
  },

  loadInstanceDetail: async (instance) => {
    if (!isElectron()) return
    // 轮询刷新时不再置 isLoadingDetail：详情页是 `isLoadingDetail ? 加载中 : 渲染图`，
    // 每次置 true 会让 ReactFlow 整棵卸载再重挂载，把用户正在看的画布视角打回初始状态
    if (!get().detail) set({ isLoadingDetail: true })
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


  closeTab: (instanceId) => {
    const { openTabs, activeTabId } = get()
    const newTabs = openTabs.filter(t => t.instanceId !== instanceId)
    if (activeTabId === instanceId) {
      const closedIndex = openTabs.findIndex(t => t.instanceId === instanceId)
      const neighbor = newTabs[closedIndex] || newTabs[closedIndex - 1] || null
      if (neighbor) {
        get().stopLiveRefresh()
        set({ openTabs: newTabs, activeTabId: neighbor.instanceId, selectedInstance: neighbor, detail: null, selectedArtifact: null })
        get().loadInstanceDetail(neighbor)
      } else {
        get().stopLiveRefresh()
        set({ openTabs: [], activeTabId: null, selectedInstance: null, detail: null, selectedArtifact: null })
      }
    } else {
      set({ openTabs: newTabs })
    }
  },

  switchTab: (instanceId) => {
    const { openTabs } = get()
    const tab = openTabs.find(t => t.instanceId === instanceId)
    if (!tab) return
    get().stopLiveRefresh()
    set({ activeTabId: instanceId, selectedInstance: tab, detail: null, selectedArtifact: null })
    get().loadInstanceDetail(tab)
  },

  reorderTabs: (newOrder) => {
    set({ openTabs: newOrder })
  },

  showList: () => {
    get().stopLiveRefresh()
    set({ activeTabId: null, selectedInstance: null, detail: null, selectedArtifact: null })
  },

  clearDetail: () => {
    get().showList()
  },

  startLiveRefresh: () => {
    get().stopLiveRefresh()
    const inst = get().selectedInstance
    if (!inst) return
    // 订阅主进程 fs.watch 推送：文件真正变化时才收到增量 delta（替代 1s 全量轮询）
    window.electronAPI?.subscribeInstanceDetail?.(inst.workflowName, inst.instanceId).then(res => {
      if (res?.success && res.detail) set({ detail: res.detail, isLoadingDetail: false })
    })
    const unsub = window.electronAPI?.onInstanceDetailDelta?.(delta => {
      // 结构共享：仅用 delta 覆盖变化字段，未变字段保持原引用 → memo 子组件跳过重渲染
      set(state => ({ detail: state.detail ? { ...state.detail, ...delta } : state.detail }))
    })
    set({ isLiveRefresh: true, _unsubDelta: unsub ?? null })
  },

  stopLiveRefresh: () => {
    const unsub = get()._unsubDelta
    if (unsub) unsub()
    window.electronAPI?.unsubscribeInstanceDetail?.()
    set({ isLiveRefresh: false, _unsubDelta: null })
  },

  reset: () => {
    get().stopLiveRefresh()
    set({ instances: [], isLoaded: false, openTabs: [], activeTabId: null, selectedInstance: null, detail: null, selectedArtifact: null })
  },
}))

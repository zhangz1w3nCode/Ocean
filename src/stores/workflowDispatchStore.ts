import { create } from 'zustand'
import { isElectron } from '../utils/storage'

export type DispatchStatus = 'running' | 'completed' | 'failed' | 'aborted' | 'stopped'

export interface DispatchRunView {
  invoke: string
  node: string
  type: string
  started_at: string
  finished_at?: string
  attempts: number
  outcome: 'completed' | 'chosen' | 'rejected' | 'agent_failed' | 'aborted'
  artifact?: string
  branch?: string
  error?: string
}

export interface DispatchRecordView {
  instance_id: string
  workflow: string
  initial_input?: string
  agent: { type: string; executable?: string; model?: string }
  session_id: string
  status: DispatchStatus
  pid: number
  started_at: string
  finished_at?: string
  updated_at: string
  current_node?: string
  current_invoke?: string
  steps: number
  last_error?: string
  runs: DispatchRunView[]
}

export interface StartDispatchPayload {
  workflow: string
  input: string
  model?: string
  executable?: string
  nodeTimeoutMs?: number
  maxAttempts?: number
}

interface DispatchState {
  records: DispatchRecordView[]
  isLoaded: boolean
  selectedKey: string | null
  load: () => Promise<void>
  select: (workflow: string, instanceId: string) => void
  close: () => void
  applyUpdate: (record: DispatchRecordView) => void
  start: (payload: StartDispatchPayload) => Promise<{ success: boolean; error?: string; instanceId?: string }>
  stop: (instanceId: string) => Promise<{ success: boolean; error?: string }>
}

const keyOf = (workflow: string, instanceId: string): string => `${workflow}/${instanceId}`

export const useDispatchStore = create<DispatchState>((set, get) => ({
  records: [],
  isLoaded: false,
  selectedKey: null,

  load: async () => {
    if (!isElectron()) {
      set({ isLoaded: true })
      return
    }
    try {
      const result = await window.electronAPI!.listWorkflowDispatches()
      if (result.success) {
        set({ records: (result.records || []) as DispatchRecordView[], isLoaded: true })
      } else {
        set({ isLoaded: true })
      }
    } catch (error) {
      console.error('加载调度记录失败:', error)
      set({ isLoaded: true })
    }
  },

  select: (workflow, instanceId) => set({ selectedKey: keyOf(workflow, instanceId) }),
  close: () => set({ selectedKey: null }),

  applyUpdate: (record) => {
    set((state) => {
      const idx = state.records.findIndex(
        (r) => r.instance_id === record.instance_id && r.workflow === record.workflow,
      )
      const next = state.records.slice()
      if (idx >= 0) next[idx] = record
      else next.unshift(record)
      next.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      return { records: next }
    })
  },

  start: async (payload) => {
    if (!isElectron()) return { success: false, error: '调度仅在桌面端可用' }
    try {
      const result = await window.electronAPI!.startWorkflowDispatch({
        workflow: payload.workflow,
        input: payload.input,
        agentType: 'pi',
        model: payload.model || undefined,
        executable: payload.executable || undefined,
        nodeTimeoutMs: payload.nodeTimeoutMs,
        maxAttempts: payload.maxAttempts,
      })
      if (result.success) {
        await get().load()
        if (result.workflow && result.instanceId) {
          set({ selectedKey: keyOf(result.workflow, result.instanceId) })
        }
      }
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },

  stop: async (instanceId) => {
    if (!isElectron()) return { success: false, error: '调度仅在桌面端可用' }
    try {
      return await window.electronAPI!.stopWorkflowDispatch(instanceId)
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
}))

export const dispatchSelectedRecord = (state: DispatchState): DispatchRecordView | null => {
  if (!state.selectedKey) return null
  return state.records.find((r) => keyOf(r.workflow, r.instance_id) === state.selectedKey) ?? null
}
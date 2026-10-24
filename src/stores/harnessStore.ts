// Harness 会话 store：会话列表、活跃会话运行时、pi RPC 事件路由与多会话隔离。
// 事件经 33ms 批量刷新写入节点化消息模型（text_delta 高频流式不逐帧重渲）。
import { create } from 'zustand'
import type { HarnessWorktree, HarnessSessionSummary, HarnessCommand } from '../types'

export type HarnessSessionStatus = 'connecting' | 'ready' | 'streaming' | 'error' | 'closed'

export interface HarnessImageAttachment {
  type: 'image'
  data: string
  mimeType: string
}

export interface UserNode {
  kind: 'user'
  id: string
  text: string
  images?: HarnessImageAttachment[]
  timestamp: number
}

export interface SteeringNode {
  kind: 'steering'
  id: string
  text: string
  timestamp: number
}

export interface ReasoningNode {
  kind: 'reasoning'
  id: string
  text: string
  streaming: boolean
  msg?: number
}

export interface AssistantNode {
  kind: 'assistant'
  id: string
  text: string
  streaming: boolean
  usage?: Record<string, unknown> | null
  stopReason?: string | null
  errorMessage?: string | null
  msg?: number
}

export interface ToolNode {
  kind: 'tool'
  id: string
  toolCallId: string
  toolName: string
  args: Record<string, unknown> | null
  status: 'running' | 'done' | 'error'
  partialText: string
  resultText: string
  isError: boolean
  startedAt: number
  endedAt: number | null
}

export interface ApprovalNode {
  kind: 'approval'
  id: string
  requestId: string
  method: string
  title: string
  detail: string
  options: string[] | null
  resolved: boolean
  timestamp: number
}

export interface SystemNode {
  kind: 'system'
  id: string
  variant: 'compaction' | 'retry' | 'turn-error' | 'process' | 'parse-error' | 'notify'
  text: string
  isError?: boolean
  timestamp: number
}

export type HarnessNode =
  | UserNode
  | SteeringNode
  | ReasoningNode
  | AssistantNode
  | ToolNode
  | ApprovalNode
  | SystemNode

export interface HarnessCommandItem {
  name: string
  description?: string
  source: string
}

export interface HarnessSessionRuntime {
  sessionId: string
  worktreePath: string
  sessionFile: string | null
  status: HarnessSessionStatus
  error: string | null
  nodes: HarnessNode[]
  isStreaming: boolean
  isCompacting: boolean
  sessionName: string | null
  model: { id: string; name: string } | null
  modelList: { id: string; name: string; provider: string }[]
  thinkingLevel: string | null
  availableThinkingLevels: string[]
  stats: { totalTokens: number; cost: number; contextPercent: number | null } | null
  pendingApproval: ApprovalNode | null
  pendingSteering: string[]
  commands: HarnessCommandItem[]
  startedAt: number
  // 当前流式消息序号：message_start 递增；text/thinking 节点按序号隔离，避免跨消息拼接
  currentMsgSeq: number
}

const DIALOG_METHODS = new Set(['select', 'confirm', 'input', 'editor'])

let nodeSeq = 0
const nextNodeId = () => `n${++nodeSeq}`

function emptyRuntime(sessionId: string, worktreePath: string): HarnessSessionRuntime {
  return {
    sessionId,
    worktreePath,
    sessionFile: null,
    status: 'connecting',
    error: null,
    nodes: [],
    isStreaming: false,
    isCompacting: false,
    sessionName: null,
    model: null,
    modelList: [],
    thinkingLevel: null,
    availableThinkingLevels: [],
    stats: null,
    pendingApproval: null,
    pendingSteering: [],
    commands: [],
    startedAt: Date.now(),
    currentMsgSeq: 0,
  }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: 'text'; text: string } => !!b && (b as { type?: string }).type === 'text')
      .map((b) => b.text)
      .join('')
  }
  return ''
}

function hydrateFromMessages(rt: HarnessSessionRuntime, messages: unknown[]): void {
  const nodes: HarnessNode[] = []
  for (const raw of messages) {
    const msg = raw as { role?: string; content?: unknown; usage?: Record<string, unknown>; stopReason?: string }
    if (msg.role === 'user') {
      const blocks = Array.isArray(msg.content)
        ? (msg.content as { type?: string; data?: string; mimeType?: string }[]).filter((b) => b.type === 'image')
        : []
      nodes.push({
        kind: 'user',
        id: nextNodeId(),
        text: contentToText(msg.content),
        images: blocks.map((b) => ({ type: 'image' as const, data: String(b.data ?? ''), mimeType: String(b.mimeType ?? 'image/png') })),
        timestamp: Date.now(),
      })
    } else if (msg.role === 'assistant') {
      const blocks = Array.isArray(msg.content) ? (msg.content as { type?: string }[]) : []
      for (const b of blocks) {
        if (b.type === 'thinking') {
          nodes.push({
            kind: 'reasoning',
            id: nextNodeId(),
            text: (b as { thinking?: string }).thinking ?? '',
            streaming: false,
          })
        } else if (b.type === 'text') {
          nodes.push({
            kind: 'assistant',
            id: nextNodeId(),
            text: (b as { text?: string }).text ?? '',
            streaming: false,
            usage: msg.usage ?? null,
            stopReason: msg.stopReason ?? null,
          })
        } else if (b.type === 'toolCall') {
          const tc = b as { id?: string; name?: string; arguments?: Record<string, unknown> }
          nodes.push({
            kind: 'tool',
            id: nextNodeId(),
            toolCallId: String(tc.id ?? ''),
            toolName: String(tc.name ?? 'unknown'),
            args: tc.arguments ?? null,
            status: 'done',
            partialText: '',
            resultText: '',
            isError: false,
            startedAt: Date.now(),
            endedAt: Date.now(),
          })
        }
      }
    } else if (msg.role === 'toolResult') {
      const tr = msg as { toolCallId?: string; toolName?: string; content?: unknown; isError?: boolean }
      const text = contentToText(tr.content)
      const existing = nodes.find(
        (n): n is ToolNode => n.kind === 'tool' && n.toolCallId === String(tr.toolCallId ?? '')
      )
      if (existing) {
        existing.resultText = text
        existing.isError = !!tr.isError
        existing.status = tr.isError ? 'error' : 'done'
        existing.endedAt = Date.now()
      } else {
        nodes.push({
          kind: 'tool',
          id: nextNodeId(),
          toolCallId: String(tr.toolCallId ?? ''),
          toolName: String(tr.toolName ?? 'unknown'),
          args: null,
          status: tr.isError ? 'error' : 'done',
          partialText: '',
          resultText: text,
          isError: !!tr.isError,
          startedAt: Date.now(),
          endedAt: Date.now(),
        })
      }
    }
  }
  rt.nodes = nodes
}

function lastNode<K extends HarnessNode['kind']>(
  rt: HarnessSessionRuntime,
  kind: K
): Extract<HarnessNode, { kind: K }> | undefined {
  for (let i = rt.nodes.length - 1; i >= 0; i--) {
    const node = rt.nodes[i]
    if ((node.kind as string) === (kind as string)) {
      return node as Extract<HarnessNode, { kind: K }>
    }
  }
  return undefined
}

// pi RPC 事件 -> 节点模型 reducer（直接变更 draft，外层负责拷贝与提交）
function applyEvent(rt: HarnessSessionRuntime, ev: Record<string, unknown>): void {
  const etype = String(ev.type)

  if (etype === 'response') {
    const command = String(ev.command ?? '')
    const success = ev.success === true
    const data = (ev.data ?? {}) as Record<string, unknown>
    if (!success) {
      rt.error = String(ev.error ?? '命令失败')
      return
    }
    rt.error = null
    if (command === 'get_state') {
      rt.isStreaming = !!data.isStreaming
      rt.isCompacting = !!data.isCompacting
      rt.sessionFile = (data.sessionFile as string) ?? rt.sessionFile
      rt.sessionName = (data.sessionName as string) ?? rt.sessionName
      const model = data.model as { id?: string; name?: string } | null | undefined
      if (model) rt.model = { id: String(model.id ?? ''), name: String(model.name ?? '') }
      rt.thinkingLevel = (data.thinkingLevel as string) ?? rt.thinkingLevel
      if (rt.status === 'connecting') rt.status = 'ready'
    } else if (command === 'get_session_stats') {
      const tokens = (data.tokens ?? {}) as Record<string, unknown>
      const contextUsage = (data.contextUsage ?? null) as { percent?: number | null } | null
      rt.stats = {
        totalTokens: Number(tokens.total ?? 0),
        cost: Number(data.cost ?? 0),
        contextPercent: contextUsage ? (contextUsage.percent ?? null) : null,
      }
    } else if (command === 'get_commands') {
      rt.commands = ((data.commands ?? []) as HarnessCommandItem[]).map((c) => ({
        name: String(c.name),
        description: c.description ? String(c.description) : undefined,
        source: String(c.source ?? ''),
      }))
    } else if (command === 'get_messages') {
      hydrateFromMessages(rt, (data.messages ?? []) as unknown[])
      if (rt.status === 'connecting') rt.status = 'ready'
    } else if (command === 'get_available_models') {
      rt.modelList = ((data.models ?? []) as { id?: string; name?: string; provider?: string }[]).map((m) => ({
        id: String(m.id ?? ''),
        name: String(m.name ?? ''),
        provider: String(m.provider ?? ''),
      }))
    } else if (command === 'get_available_thinking_levels') {
      rt.availableThinkingLevels = ((data.levels ?? []) as string[]).map(String)
    } else if (command === 'set_session_name') {
      // 名称经下一次 get_state 回填
    }
    return
  }

  switch (etype) {
    case 'agent_start': {
      rt.status = 'streaming'
      rt.isStreaming = true
      return
    }
    case 'agent_settled': {
      rt.isStreaming = false
      if (rt.status === 'streaming' || rt.status === 'connecting') rt.status = 'ready'
      return
    }
    case 'turn_start':
    case 'turn_end':
      return
    case 'message_start': {
      // 每条消息（含 assistant）开启新序号：后续 text/thinking 节点按序号隔离
      rt.currentMsgSeq += 1
      return
    }
    case 'message_update': {
      const ame = (ev.assistantMessageEvent ?? {}) as {
        type?: string
        delta?: string
        thinking?: string
      }
      if (ame.type === 'thinking_delta' || ame.type === 'thinking_start') {
        let node = lastNode(rt, 'reasoning')
        if (!node || node.msg !== rt.currentMsgSeq) {
          node = { kind: 'reasoning', id: nextNodeId(), text: '', streaming: true, msg: rt.currentMsgSeq }
          rt.nodes.push(node)
        }
        if (ame.type === 'thinking_delta' && ame.delta) node.text += ame.delta
        return
      }
      if (ame.type === 'text_delta' || ame.type === 'text_start' || ame.type === 'text_end') {
        let node = lastNode(rt, 'assistant')
        if (!node || node.msg !== rt.currentMsgSeq) {
          node = { kind: 'assistant', id: nextNodeId(), text: '', streaming: true, usage: null, stopReason: null, errorMessage: null, msg: rt.currentMsgSeq }
          rt.nodes.push(node)
        }
        if (ame.type === 'text_delta' && ame.delta) node.text += ame.delta
        return
      }
      if (ame.type === 'thinking_end') {
        const node = lastNode(rt, 'reasoning')
        if (node && node.msg === rt.currentMsgSeq) node.streaming = false
        return
      }
      if (ame.type === 'done') {
        const reasoning = lastNode(rt, 'reasoning')
        if (reasoning && reasoning.msg === rt.currentMsgSeq) reasoning.streaming = false
        const assistant = lastNode(rt, 'assistant')
        if (assistant && assistant.msg === rt.currentMsgSeq) assistant.streaming = false
        return
      }
      return
    }
    case 'message_end': {
      const message = (ev.message ?? {}) as {
        role?: string
        content?: unknown
        usage?: Record<string, unknown>
        stopReason?: string
        errorMessage?: string
      }
      const reasoning = lastNode(rt, 'reasoning')
      if (reasoning && reasoning.msg === rt.currentMsgSeq) {
        reasoning.streaming = false
        const thinking = Array.isArray(message.content)
          ? (message.content as { type?: string; thinking?: string }[]).find((b) => b.type === 'thinking')
          : undefined
        if (thinking?.thinking) reasoning.text = thinking.thinking
      }
      const assistant = lastNode(rt, 'assistant')
      if (assistant && assistant.msg === rt.currentMsgSeq) {
        assistant.streaming = false
        assistant.usage = message.usage ?? null
        assistant.stopReason = message.stopReason ?? null
        assistant.errorMessage = message.errorMessage ?? null
      }
      return
    }
    case 'tool_execution_start': {
      rt.nodes.push({
        kind: 'tool',
        id: nextNodeId(),
        toolCallId: String(ev.toolCallId ?? ''),
        toolName: String(ev.toolName ?? 'unknown'),
        args: (ev.args ?? null) as Record<string, unknown> | null,
        status: 'running',
        partialText: '',
        resultText: '',
        isError: false,
        startedAt: Date.now(),
        endedAt: null,
      })
      return
    }
    case 'tool_execution_update': {
      const partial = (ev.partialResult ?? {}) as { content?: unknown }
      const text = contentToText(partial.content)
      const node = rt.nodes.find(
        (n): n is ToolNode => n.kind === 'tool' && n.toolCallId === String(ev.toolCallId ?? '')
      )
      if (node) node.partialText = text
      return
    }
    case 'tool_execution_end': {
      const result = (ev.result ?? {}) as { content?: unknown }
      const text = contentToText(result.content)
      const node = rt.nodes.find(
        (n): n is ToolNode => n.kind === 'tool' && n.toolCallId === String(ev.toolCallId ?? '')
      )
      if (node) {
        node.status = ev.isError ? 'error' : 'done'
        node.resultText = text
        node.isError = !!ev.isError
        node.endedAt = Date.now()
      }
      return
    }
    case 'queue_update': {
      rt.pendingSteering = ((ev.steering ?? []) as string[]).map(String)
      return
    }
    case 'compaction_start': {
      rt.isCompacting = true
      rt.nodes.push({
        kind: 'system',
        id: nextNodeId(),
        variant: 'compaction',
        text: `上下文压缩中（${String(ev.reason ?? 'manual')}）…`,
        timestamp: Date.now(),
      })
      return
    }
    case 'compaction_end': {
      rt.isCompacting = false
      const result = (ev.result ?? null) as { tokensBefore?: number; estimatedTokensAfter?: number } | null
      const node = lastNode(rt, 'system')
      if (node && node.kind === 'system' && node.variant === 'compaction') {
        node.text = result
          ? `上下文已压缩：${result.tokensBefore ?? '?'} → ~${result.estimatedTokensAfter ?? '?'} tokens`
          : '上下文压缩完成'
      }
      return
    }
    case 'auto_retry_start': {
      rt.nodes.push({
        kind: 'system',
        id: nextNodeId(),
        variant: 'retry',
        text: `瞬时错误自动重试（${String(ev.attempt ?? '?')}/${String(ev.maxAttempts ?? '?')}，${String(ev.delayMs ?? 0)}ms 后）：${String(ev.errorMessage ?? '')}`.slice(0, 300),
        timestamp: Date.now(),
      })
      return
    }
    case 'auto_retry_end': {
      if (ev.success === true) {
        const node = lastNode(rt, 'system')
        if (node && node.kind === 'system' && node.variant === 'retry') node.text += ' — 重试成功'
      }
      return
    }
    case 'extension_ui_request': {
      const method = String(ev.method ?? '')
      if (DIALOG_METHODS.has(method)) {
        const approval: ApprovalNode = {
          kind: 'approval',
          id: nextNodeId(),
          requestId: String(ev.id ?? ''),
          method,
          title: String(ev.title ?? ''),
          detail: method === 'confirm' ? String(ev.message ?? '') : '',
          options: Array.isArray(ev.options) ? (ev.options as string[]).map(String) : null,
          resolved: false,
          timestamp: Date.now(),
        }
        rt.nodes.push(approval)
        rt.pendingApproval = approval
        return
      }
      if (method === 'notify') {
        rt.nodes.push({
          kind: 'system',
          id: nextNodeId(),
          variant: 'notify',
          text: String(ev.message ?? ''),
          isError: ev.notifyType === 'error',
          timestamp: Date.now(),
        })
        return
      }
      // setStatus / setWidget / setTitle / set_editor_text 等其余 fire-and-forget 方法忽略（不回包）
      return
    }
    case 'process_exit': {
      rt.status = 'closed'
      rt.isStreaming = false
      rt.nodes.push({
        kind: 'system',
        id: nextNodeId(),
        variant: 'process',
        text: `会话进程已退出（code=${String(ev.code ?? 'null')}）`,
        timestamp: Date.now(),
      })
      return
    }
    case 'process_error': {
      rt.status = 'error'
      rt.error = String(ev.error ?? '进程错误')
      rt.nodes.push({
        kind: 'system',
        id: nextNodeId(),
        variant: 'process',
        text: `会话进程错误：${rt.error}`,
        isError: true,
        timestamp: Date.now(),
      })
      return
    }
    case 'jsonl_parse_error': {
      rt.nodes.push({
        kind: 'system',
        id: nextNodeId(),
        variant: 'parse-error',
        text: `事件解析失败：${String(ev.raw ?? '')}`,
        isError: true,
        timestamp: Date.now(),
      })
      return
    }
    default:
      // 未知事件类型不丢弃由后端透传，这里静默忽略
      return
  }
}

interface HarnessStore {
  available: boolean | null
  detectError: string | null
  detectVersion: string | null
  worktrees: HarnessWorktree[]
  worktreesError: string | null
  branches: string[]
  currentBranch: string | null
  sessionsByWorktree: Record<string, HarnessSessionSummary[]>
  runtimes: Record<string, HarnessSessionRuntime>
  activeSessionId: string | null
  initialized: boolean

  init: () => void
  detect: () => Promise<void>
  refreshWorktrees: () => Promise<void>
  loadBranches: () => Promise<void>
  createWorktree: (name: string, branch?: string, baseBranch?: string) => Promise<{ success: boolean; error?: string; path?: string; branch?: string }>
  refreshSessions: (worktreePath: string) => Promise<void>
  startSession: (worktreePath: string) => Promise<string | null>
  openSession: (sessionFile: string) => Promise<string | null>
  stopSession: (sessionId: string) => Promise<void>
  deleteSessionFile: (sessionFile: string) => Promise<boolean>
  setActiveSession: (sessionId: string | null) => void
  sendPrompt: (text: string, images?: HarnessImageAttachment[]) => Promise<boolean>
  abort: (sessionId: string) => Promise<void>
  compact: (sessionId: string) => Promise<void>
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<void>
  setThinkingLevel: (sessionId: string, level: string) => Promise<void>
  setSessionName: (sessionId: string, name: string) => Promise<void>
  resolveApproval: (sessionId: string, requestId: string, answer: { value?: string; confirmed?: boolean; cancelled?: boolean }) => Promise<void>
}

// 事件批量缓冲：text_delta 高频事件 33ms 合并提交一次
const pendingEvents: Record<string, Record<string, unknown>[]> = {}
let flushTimer: ReturnType<typeof setTimeout> | null = null

export const useHarnessStore = create<HarnessStore>((set, get) => {
  const api = () => window.electronAPI

  const queueEvent = (sessionId: string, event: Record<string, unknown>) => {
    ;(pendingEvents[sessionId] = pendingEvents[sessionId] || []).push(event)
    if (flushTimer == null) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushEvents()
      }, 33)
    }
  }

  const flushEvents = () => {
    const settledSessions: string[] = []
    set((s) => {
      const runtimes = { ...s.runtimes }
      for (const [sessionId, events] of Object.entries(pendingEvents)) {
        const rt = runtimes[sessionId]
        if (!rt) continue
        const draft: HarnessSessionRuntime = { ...rt, nodes: [...rt.nodes] }
        for (const ev of events) {
          applyEvent(draft, ev)
          if (ev.type === 'agent_settled') settledSessions.push(sessionId)
        }
        runtimes[sessionId] = draft
      }
      for (const key of Object.keys(pendingEvents)) delete pendingEvents[key]
      return { runtimes }
    })
    // agent_settled 后刷新状态与统计（会话文件可能新落盘）
    for (const sessionId of settledSessions) {
      void api()?.harnessSessionCommand?.(sessionId, { type: 'get_state' })
      void api()?.harnessSessionCommand?.(sessionId, { type: 'get_session_stats' })
    }
  }

  const upsertRuntime = (rt: HarnessSessionRuntime) => {
    set((s) => ({ runtimes: { ...s.runtimes, [rt.sessionId]: rt }, activeSessionId: rt.sessionId }))
  }

  const sendCommand = async (sessionId: string, command: HarnessCommand): Promise<boolean> => {
    const res = await api()?.harnessSessionCommand?.(sessionId, command)
    if (!res) return false
    if (!res.success) {
      set((s) => {
        const rt = s.runtimes[sessionId]
        if (!rt) return {}
        return { runtimes: { ...s.runtimes, [sessionId]: { ...rt, error: res.error ?? '命令发送失败' } } }
      })
      return false
    }
    return true
  }

  return {
    available: null,
    detectError: null,
    detectVersion: null,
    worktrees: [],
    worktreesError: null,
    branches: [],
    currentBranch: null,
    sessionsByWorktree: {},
    runtimes: {},
    activeSessionId: null,
    initialized: false,

    init: () => {
      if (get().initialized) return
      set({ initialized: true })
      const a = api()
      if (!a || typeof a.onHarnessSessionEvent !== 'function') {
        set({ available: false, detectError: '当前环境不支持 Harness 会话（仅桌面端可用）' })
        return
      }
      a.onHarnessSessionEvent((payload) => {
        queueEvent(payload.sessionId, payload.event as Record<string, unknown>)
      })
      void get().detect()
      void get().refreshWorktrees()
      // 渲染层刷新/重开后重连主进程仍在运行的会话（水合历史消息与状态）
      void (async () => {
        try {
          const res = await a.harnessSessionListActive?.()
          const activeList = res && res.success ? (res.sessions ?? []) : []
          if (activeList.length > 0) {
            set((s) => {
              const runtimes = { ...s.runtimes }
              let firstId = s.activeSessionId
              for (const info of activeList) {
                if (runtimes[info.sessionId]) continue
                const rt = emptyRuntime(info.sessionId, info.worktreePath || '')
                rt.sessionFile = info.sessionFile ?? null
                rt.status = 'ready'
                runtimes[info.sessionId] = rt
                if (!firstId) firstId = info.sessionId
              }
              return { runtimes, activeSessionId: firstId }
            })
            for (const info of activeList) {
              void sendCommand(info.sessionId, { type: 'get_messages' })
              void sendCommand(info.sessionId, { type: 'get_state' })
              void sendCommand(info.sessionId, { type: 'get_session_stats' })
              void sendCommand(info.sessionId, { type: 'get_commands' })
              void sendCommand(info.sessionId, { type: 'get_available_models' })
              void sendCommand(info.sessionId, { type: 'get_available_thinking_levels' })
            }
          }
        } catch {
          // 主进程为旧版本（无该 channel）时静默忽略
        }
      })()
    },

    detect: async () => {
      const res = await api()?.harnessDetect?.()
      if (!res) {
        set({ available: false, detectError: '当前环境不支持 Harness 会话（仅桌面端可用）' })
        return
      }
      if (!res.success) {
        set({ available: false, detectError: res.error ?? 'pi 检测失败' })
        return
      }
      set({ available: !!res.available, detectError: res.available ? null : '未检测到 pi，请先在 Harness → 设置 查看安装指引', detectVersion: res.version ?? null })
    },

    refreshWorktrees: async () => {
      const res = await api()?.harnessListWorktrees?.()
      if (!res || !res.success) {
        set({ worktreesError: (res?.error) ?? 'worktree 列表获取失败' })
        return
      }
      const worktrees = res.worktrees ?? []
      set({ worktrees, worktreesError: null })
      for (const wt of worktrees) {
        void get().refreshSessions(wt.path)
      }
    },

    loadBranches: async () => {
      const res = await api()?.harnessListBranches?.()
      if (res && res.success) {
        set({ branches: res.branches ?? [], currentBranch: res.current ?? null })
      }
    },

    createWorktree: async (name, branch, baseBranch) => {
      const res = await api()?.harnessWorktreeCreate?.(name, branch, baseBranch)
      if (!res || !res.success) {
        return { success: false, error: (res?.error) ?? '创建工作区失败' }
      }
      await get().refreshWorktrees()
      return { success: true, path: res.path, branch: res.branch }
    },

    refreshSessions: async (worktreePath: string) => {
      const res = await api()?.harnessListSessions?.(worktreePath)
      set((s) => ({
        sessionsByWorktree: {
          ...s.sessionsByWorktree,
          [worktreePath]: res && res.success ? (res.sessions ?? []) : [],
        },
      }))
    },

    startSession: async (worktreePath: string) => {
      const res = await api()?.harnessSessionStart?.(worktreePath)
      if (!res || !res.success || !res.sessionId) {
        set({ detectError: res?.error ?? '会话启动失败' })
        return null
      }
      const rt = emptyRuntime(res.sessionId, worktreePath)
      upsertRuntime(rt)
      void sendCommand(res.sessionId, { type: 'get_commands' })
      void sendCommand(res.sessionId, { type: 'get_session_stats' })
      void sendCommand(res.sessionId, { type: 'get_available_models' })
      void sendCommand(res.sessionId, { type: 'get_available_thinking_levels' })
      void get().refreshSessions(worktreePath)
      return res.sessionId
    },

    openSession: async (sessionFile: string) => {
      const res = await api()?.harnessSessionOpen?.(sessionFile)
      if (!res || !res.success || !res.sessionId) {
        set({ detectError: res?.error ?? '会话打开失败' })
        return null
      }
      const rt = emptyRuntime(res.sessionId, '')
      rt.sessionFile = sessionFile
      upsertRuntime(rt)
      // 水合历史消息 + 状态
      await sendCommand(res.sessionId, { type: 'get_messages' })
      void sendCommand(res.sessionId, { type: 'get_commands' })
      void sendCommand(res.sessionId, { type: 'get_session_stats' })
      void sendCommand(res.sessionId, { type: 'get_available_models' })
      void sendCommand(res.sessionId, { type: 'get_available_thinking_levels' })
      return res.sessionId
    },

    stopSession: async (sessionId: string) => {
      await api()?.harnessSessionStop?.(sessionId)
      set((s) => {
        const rt = s.runtimes[sessionId]
        if (!rt) return {}
        return { runtimes: { ...s.runtimes, [sessionId]: { ...rt, status: 'closed', isStreaming: false } } }
      })
    },

    deleteSessionFile: async (sessionFile: string) => {
      const res = await api()?.harnessSessionDelete?.(sessionFile)
      if (!res || !res.success) return false
      // 刷新所有 worktree 分组（cwd 归属可能变化）
      for (const wt of get().worktrees) void get().refreshSessions(wt.path)
      return true
    },

    setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

    sendPrompt: async (text, images) => {
      const { activeSessionId, runtimes } = get()
      if (!activeSessionId) return false
      const rt = runtimes[activeSessionId]
      if (!rt) return false
      const trimmed = text.trim()
      if (!trimmed) return false
      const command: HarnessCommand = rt.isStreaming
        ? { type: 'steer', message: trimmed, ...(images && images.length > 0 ? { images } : {}) }
        : { type: 'prompt', message: trimmed, ...(images && images.length > 0 ? { images } : {}) }
      set((s) => {
        const node: HarnessNode = rt.isStreaming
          ? { kind: 'steering', id: nextNodeId(), text: trimmed, timestamp: Date.now() }
          : { kind: 'user', id: nextNodeId(), text: trimmed, images: images && images.length > 0 ? images : undefined, timestamp: Date.now() }
        const target = s.runtimes[activeSessionId]
        if (!target) return {}
        return { runtimes: { ...s.runtimes, [activeSessionId]: { ...target, nodes: [...target.nodes, node] } } }
      })
      return sendCommand(activeSessionId, command)
    },

    abort: async (sessionId) => {
      await api()?.harnessSessionAbort?.(sessionId)
    },

    compact: async (sessionId) => {
      await sendCommand(sessionId, { type: 'compact' })
    },

    setModel: async (sessionId, provider, modelId) => {
      await sendCommand(sessionId, { type: 'set_model', provider, modelId })
      void sendCommand(sessionId, { type: 'get_state' })
      void sendCommand(sessionId, { type: 'get_available_thinking_levels' })
    },

    setThinkingLevel: async (sessionId, level) => {
      await sendCommand(sessionId, { type: 'set_thinking_level', level })
      void sendCommand(sessionId, { type: 'get_state' })
    },

    setSessionName: async (sessionId, name) => {
      await sendCommand(sessionId, { type: 'set_session_name', name })
      void sendCommand(sessionId, { type: 'get_state' })
    },

    resolveApproval: async (sessionId, requestId, answer) => {
      await api()?.harnessSessionExtensionResponse?.(sessionId, { id: requestId, ...answer })
      set((s) => {
        const rt = s.runtimes[sessionId]
        if (!rt) return {}
        const nodes = rt.nodes.map((n) =>
          n.kind === 'approval' && n.requestId === requestId ? { ...n, resolved: true } : n
        )
        const pendingApproval = rt.pendingApproval && rt.pendingApproval.requestId === requestId ? null : rt.pendingApproval
        return { runtimes: { ...s.runtimes, [sessionId]: { ...rt, nodes, pendingApproval } } }
      })
    },
  }
})

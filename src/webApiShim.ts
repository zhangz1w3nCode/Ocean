// 浏览器端 window.electronAPI 适配层。
// 桌面端由 electron/preload.dev.cjs 注入 electronAPI；网页端由本模块注入同形实现：
// 82 个 invoke 方法走 HTTP，2 个事件订阅（instance-detail-delta / agent-loop-event）共用一条 SSE。

type PushCallback = (payload: unknown) => void

function apiBase(): string {
  const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_OCEAN_API
  if (fromEnv) return fromEnv
  // 必须延迟求值：模块加载时（如测试环境）window 可能还不存在
  return typeof window !== 'undefined' ? window.location.origin : ''
}

// 方法名 → IPC channel 名。84 个 preload 方法中 77 个满足 camelCase→kebab-case，
// 以下 5 个是例外（与 electron/launch.cjs 的 ipcMain.handle 注册名逐一核对）
const CHANNEL_OVERRIDES: Record<string, string> = {
  callLLMApi: 'call-llm-api',
  saveLLMConfig: 'save-llm-config',
  loadLLMConfig: 'load-llm-config',
  testLLMConnection: 'test-llm-connection',
  loadKnowledgeBaseline: 'get-knowledge-baseline',
}

export const methodToChannel = (method: string): string =>
  CHANNEL_OVERRIDES[method] ?? method.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// preload.dev.cjs 的 84 个 invoke 方法全集（顺序与 preload 保持一致，便于比对）
const INVOKE_METHODS = [
  'getAppVersion',
  'saveWorkflowFile', 'loadWorkflowFile', 'deleteWorkflowFile', 'loadAllWorkflowFiles',
  'createWorkflowFolder', 'loadWorkflowMd', 'saveWorkflowMd', 'loadWorkflowFlowJson',
  'saveWorkflowFlowJson', 'loadAllWorkflowFolders', 'deleteWorkflowFolder', 'renameWorkflowFolder',
  'listWorkflowInstances', 'readInstanceFile', 'readInstanceDetail',
  'subscribeInstanceDetail', 'unsubscribeInstanceDetail',
  'saveNodeFile', 'loadNodeFile', 'deleteNodeFile', 'loadAllNodeFiles',
  'saveLocalNode', 'loadLocalNode', 'loadAllLocalNodes', 'deleteLocalNode',
  'saveResourceFile', 'loadResourceFile', 'deleteResourceFile', 'loadAllResourceFiles',
  'saveAgentFile', 'loadAgentFile', 'deleteAgentFile', 'loadAllAgentFiles',
  'saveKnowledgeFile', 'loadKnowledgeFile', 'deleteKnowledgeFile', 'loadAllKnowledgeFiles',
  'listKnowledgeFolders', 'loadKnowledgeBaseline',
  'knowledgeGitStatus', 'knowledgeGitInit', 'knowledgeGitLog', 'knowledgeGitShow',
  'knowledgeGitCommit', 'knowledgeGitRollback', 'loadKnowledgeGitConfig', 'saveKnowledgeGitConfig',
  'createSkillDirectory', 'saveSkillFile', 'loadSkillFile', 'deleteSkillDirectory',
  'loadAllSkillDirectories', 'saveSkillResource', 'loadSkillResource', 'deleteSkillResource',
  'listSkillResources',
  'openFolderDialog', 'loadAppConfig', 'saveAppConfig', 'initProjectDir', 'setProjectPath',
  'loadGeneralSettings', 'saveGeneralSettings',
  'loadKnowledgeGraphConfig', 'saveKnowledgeGraphConfig', 'loadAssetRoot', 'saveAssetRoot',
  'testLLMConnection', 'testExecutablePath', 'checkCliInstalled', 'installCli',
  'callLLMApi', 'saveLLMConfig', 'loadLLMConfig',
  'saveAgenticConfig', 'loadAgenticConfig', 'executeAgenticTool',
  'runAgentLoop', 'abortAgentLoop',
  'saveSkillTemplateFile', 'loadSkillTemplateFile',
  'saveKnowledgeTemplateFile', 'loadKnowledgeTemplateFile',
]

const EVENT_METHODS: Record<string, string> = {
  onInstanceDetailDelta: 'instance-detail-delta',
  onAgentLoopEvent: 'agent-loop-event',
}

async function invoke(method: string, ...args: unknown[]): Promise<unknown> {
  const res = await fetch(`${apiBase()}/api/ipc/${methodToChannel(method)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  })
  return res.json()
}

let evtSource: EventSource | null = null
const listeners = new Map<string, Set<PushCallback>>()

function ensureEventSource(): void {
  if (evtSource) return
  evtSource = new EventSource(`${apiBase()}/api/events`)
  evtSource.onmessage = (ev: MessageEvent<string>) => {
    let channel: string | undefined
    let payload: unknown
    try {
      const parsed = JSON.parse(ev.data) as { channel: string; payload: unknown }
      channel = parsed.channel
      payload = parsed.payload
    } catch {
      return
    }
    if (!channel) return
    const set = listeners.get(channel)
    if (set) for (const cb of set) cb(payload)
  }
}

function subscribe(channel: string, cb: PushCallback): () => void {
  ensureEventSource()
  let set = listeners.get(channel)
  if (!set) {
    set = new Set()
    listeners.set(channel, set)
  }
  set.add(cb)
  return () => { set.delete(cb) }
}

export function installWebApi(): void {
  if (typeof window === 'undefined') return
  // 桌面端 preload 已注入则不覆盖
  if (window.electronAPI) return
  const api: Record<string, unknown> = {}
  for (const method of INVOKE_METHODS) {
    api[method] = (...args: unknown[]) => invoke(method, ...args)
  }
  for (const [method, channel] of Object.entries(EVENT_METHODS)) {
    api[method] = (cb: PushCallback) => subscribe(channel, cb)
  }
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
  // 供前端区分桌面/网页环境（如设置页只在桌面端显示网页端开关）
  ;(window as unknown as { __OCEAN_WEB__?: boolean }).__OCEAN_WEB__ = true
}

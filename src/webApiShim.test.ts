import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { installWebApi, methodToChannel } from './webApiShim'

afterEach(() => { vi.unstubAllGlobals() })

describe('methodToChannel', () => {
  it('5 个例外方法映射到正确的 channel 名（与 launch.cjs 注册名核对过）', () => {
    expect(methodToChannel('callLLMApi')).toBe('call-llm-api')
    expect(methodToChannel('saveLLMConfig')).toBe('save-llm-config')
    expect(methodToChannel('loadLLMConfig')).toBe('load-llm-config')
    expect(methodToChannel('testLLMConnection')).toBe('test-llm-connection')
    expect(methodToChannel('loadKnowledgeBaseline')).toBe('get-knowledge-baseline')
  })

  it('其余方法按 camelCase→kebab-case 规则映射', () => {
    expect(methodToChannel('getAppVersion')).toBe('get-app-version')
    expect(methodToChannel('saveWorkflowFile')).toBe('save-workflow-file')
    expect(methodToChannel('loadAllWorkflowFolders')).toBe('load-all-workflow-folders')
    expect(methodToChannel('subscribeInstanceDetail')).toBe('subscribe-instance-detail')
    expect(methodToChannel('runAgentLoop')).toBe('run-agent-loop')
    expect(methodToChannel('knowledgeGitStatus')).toBe('knowledge-git-status')
  })
})

describe('installWebApi', () => {
  const stubWindow = () => {
    vi.stubGlobal('window', { location: { origin: 'http://api.test' } })
    return (globalThis as unknown as { window: Record<string, unknown> }).window
  }

  it('桌面端已注入 electronAPI 时不覆盖', () => {
    const w = stubWindow()
    w.electronAPI = { fromDesktop: true }
    installWebApi()
    expect(w.electronAPI).toEqual({ fromDesktop: true })
  })

  it('invoke 方法经 fetch 转发到 /api/ipc/<channel> 并透传参数', async () => {
    const w = stubWindow()
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
      calls.push({ url: String(url), init })
      return { json: async () => ({ success: true, files: ['a.md'] }) }
    }))
    installWebApi()

    const api = w.electronAPI as Record<string, (...a: unknown[]) => Promise<unknown>>
    const r = await api.loadAllNodeFiles()
    expect(r).toEqual({ success: true, files: ['a.md'] })
    expect(calls[0].url).toBe('http://api.test/api/ipc/load-all-node-files')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ args: [] })

    await (api.saveWorkflowFile as any)('demo', '# x')
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ args: ['demo', '# x'] })
  })

  it('事件方法经同一条 EventSource 按 channel 分发', () => {
    const w = stubWindow()
    class FakeES {
      static instances: FakeES[] = []
      onmessage: ((ev: { data: string }) => void) | null = null
      constructor(public url: string) { FakeES.instances.push(this) }
    }
    vi.stubGlobal('EventSource', FakeES)

    installWebApi()
    const api = w.electronAPI as Record<string, (cb: (d: unknown) => void) => () => void>

    const got: unknown[] = []
    const off = api.onAgentLoopEvent((d) => got.push(d))
    const gotDelta: unknown[] = []
    api.onInstanceDetailDelta((d) => gotDelta.push(d))

    expect(FakeES.instances.length).toBe(1)
    expect(FakeES.instances[0].url).toBe('http://api.test/api/events')

    const fire = (payload: unknown) =>
      FakeES.instances[0].onmessage!({ data: JSON.stringify({ channel: 'agent-loop-event', payload }) })
    fire({ turn: 1 })
    expect(got).toEqual([{ turn: 1 }])
    expect(gotDelta).toEqual([])

    off()
    fire({ turn: 2 })
    expect(got).toEqual([{ turn: 1 }])
  })

  it('网页环境标记 __OCEAN_WEB__（设置页据此隐藏网页端开关）', () => {
    const w = stubWindow()
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) })))
    vi.stubGlobal('EventSource', class { onmessage = null; constructor(_u: string) {} })
    installWebApi()
    expect((w as unknown as { __OCEAN_WEB__?: boolean }).__OCEAN_WEB__).toBe(true)
  })

  it('注入的 api 与 preload 方法全集同步（网页端故意排除的除外）', () => {
    const w = stubWindow()
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) })))
    vi.stubGlobal('EventSource', class { onmessage = null; constructor(_u: string) {} })
    installWebApi()
    const keys = Object.keys(w.electronAPI as object)

    // 期望集合从 preload 源码推导，避免硬编码计数随方法增删过期（82→86→91 已两次过时）。
    // 提取锚点：electronAPI 对象内的两空格缩进方法定义行。
    const preloadSrc = readFileSync(new URL('../electron/preload.dev.cjs', import.meta.url), 'utf-8')
    const block = preloadSrc.slice(preloadSrc.indexOf('const electronAPI = {'), preloadSrc.indexOf('window.electronAPI = electronAPI'))
    const preloadMethods = [...block.matchAll(/^  ([A-Za-z0-9_]+): \(/gm)].map(m => m[1])
    // 提取失败的防火墙：锚点方法必须在
    expect(preloadMethods).toContain('getAppVersion')
    expect(preloadMethods).toContain('setProjectPath')

    // 网页端故意不注入的 preload 方法（新增排除项必须在此登记并注明原因）：
    // - webServerStatus/Start/Stop：http.cjs 的 HTTP_DENIED_CHANNELS，网页端禁止递归拉起子进程
    // - saveLlmReviewConfig/loadLlmReviewConfig：网页端走 localStorage 降级（见 storage.ts）
    // - harness* 全部 + onHarnessSessionEvent：harness 会话为桌面端专属（ipc.cjs 在 stub 环境自禁用，
    //   网页端不提供 spawn pi 子进程能力，页面层检测 window.__OCEAN_WEB__ 降级）
    const WEB_EXCLUDED = new Set([
      'webServerStatus', 'webServerStart', 'webServerStop',
      'saveLlmReviewConfig', 'loadLlmReviewConfig',
      'harnessDetect', 'harnessListWorktrees', 'harnessListBranches', 'harnessListSessions', 'harnessWorktreeCreate',
      'harnessSessionStart', 'harnessSessionOpen', 'harnessSessionSend',
      'harnessSessionCommand', 'harnessSessionAbort', 'harnessSessionStop',
      'harnessSessionDelete', 'harnessSessionExtensionResponse', 'harnessSessionInfo',
      'harnessSessionListActive',
      'onHarnessSessionEvent',
    ])
    // 网页端保留但桌面端已摘除 IPC 的方法（task 域迁移 renderer 直连后 preload 不再暴露；
    // 网页端任务页不在保真范围，这些方法成为 web-only 死代码，保留仅避免 shim 大改）：
    const WEB_ONLY_LEGACY = new Set([
      'listTasks', 'readTaskDetail', 'createTask', 'updateTask', 'saveTaskContext',
    ])
    const expected = preloadMethods.filter(m => !WEB_EXCLUDED.has(m))

    expect([...keys.filter(k => !WEB_ONLY_LEGACY.has(k))].sort()).toEqual([...expected].sort())
    expect(keys).toContain('onInstanceDetailDelta')
    expect(keys).toContain('onAgentLoopEvent')
    expect(keys).toContain('checkCliInstalled')
  })
})

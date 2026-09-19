import { describe, it, expect, afterEach, vi } from 'vitest'
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

  it('注入的 api 覆盖 preload 的全部 82 个 invoke 方法与 2 个事件方法', () => {
    const w = stubWindow()
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) })))
    vi.stubGlobal('EventSource', class { onmessage = null; constructor(_u: string) {} })
    installWebApi()
    const keys = Object.keys(w.electronAPI as object)
    expect(keys.length).toBe(86)
    expect(keys).toContain('onInstanceDetailDelta')
    expect(keys).toContain('onAgentLoopEvent')
    expect(keys).toContain('checkCliInstalled')
  })
})

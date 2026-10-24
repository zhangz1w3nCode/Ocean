import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import { executeAgenticTool, runAgentLoop } from '../../core/common'
import type { AgentToolFactory, AgentToolLike, AgentLoopConfig } from '../../core/common'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-agentic-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

// mock 工具工厂：记录 execute 调用；每实例自增（验证缓存）
function mockFactory(): { factory: AgentToolFactory; calls: Array<{ toolCallId: string; args: any; signal?: AbortSignal }>; count: () => number } {
  const calls: Array<{ toolCallId: string; args: any; signal?: AbortSignal }> = []
  const state = { instances: 0 }
  const mkTool = (): AgentToolLike => {
    state.instances++
    return {
      execute: async (toolCallId, args, signal) => {
        calls.push({ toolCallId, args, signal })
        return { content: [{ type: 'text', text: `ok:${JSON.stringify(args)}` }] }
      },
    }
  }
  return {
    factory: {
      createReadTool: mkTool,
      createWriteTool: mkTool,
      createEditTool: mkTool,
      createBashTool: mkTool,
    },
    calls,
    count: () => state.instances,
  }
}

// 本地 mock LLM server：按脚本轮次返回 openai 格式响应
function startScriptedLlm(script: Array<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: any }> }>): Promise<{ server: http.Server; url: string; bodies: any[] }> {
  return new Promise((resolve) => {
    const bodies: any[] = []
    let round = 0
    const server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => { raw += c })
      req.on('end', () => {
        bodies.push(JSON.parse(raw))
        const s = script[Math.min(round, script.length - 1)]
        round++
        const message: any = { role: 'assistant', content: s.content ?? null }
        if (s.toolCalls?.length) {
          message.tool_calls = s.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }))
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message, finish_reason: s.toolCalls?.length ? 'tool_calls' : 'stop' }],
        }))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve({ server, url: `http://127.0.0.1:${addr.port}/`, bodies })
    })
  })
}

const closeServer = (server: http.Server) => new Promise<void>((r) => server.close(() => r()))

const baseConfig = (baseUrl: string): AgentLoopConfig => ({
  provider: { name: 'mock', baseUrl, type: 'openai', apiKey: 'k' },
  model: 'mock-model',
  tools: [{ type: 'file-write', description: '写文件', enabled: true }, { type: 'file-read', description: '读文件', enabled: false }],
  maxIterations: 5,
  timeout: 10,
  projectPath: root,
  task: 'agentic-单测任务',
})

describe('executeAgenticTool', () => {
  it('未知类型 → {success:false, error:"未知的工具类型: xxx"}（不创建工具实例）', async () => {
    const { factory, count } = mockFactory()
    const r = await executeAgenticTool(factory, { type: 'nope' }, root)
    expect(r).toEqual({ success: false, error: '未知的工具类型: nope' })
    expect(count()).toBe(0)
  })

  it('write 参数映射（path/content）+ 输出 content 数组拼接', async () => {
    const { factory, calls } = mockFactory()
    const r = await executeAgenticTool(factory, { type: 'write', path: 'a.md', content: 'hello' }, root)
    expect(r.success).toBe(true)
    expect((r as any).output).toBe('ok:{"path":"a.md","content":"hello"}')
    expect(calls[0].args).toEqual({ path: 'a.md', content: 'hello' })
    expect(calls[0].toolCallId).toMatch(/^tool-call-\d+$/)
  })

  it('read 参数映射（path/offset/limit；undefined 键保留原样）', async () => {
    const { factory, calls } = mockFactory()
    await executeAgenticTool(factory, { type: 'read', path: 'a.md', offset: 3, limit: 10 }, root)
    expect(calls[0].args).toEqual({ path: 'a.md', offset: 3, limit: 10 })
  })

  it('bash / edit 参数映射', async () => {
    const { factory, calls } = mockFactory()
    await executeAgenticTool(factory, { type: 'bash', command: 'ls', timeout: 5 }, root)
    await executeAgenticTool(factory, { type: 'edit', path: 'a.md', oldText: 'x', newText: 'y' }, root)
    expect(calls[0].args).toEqual({ command: 'ls', timeout: 5 })
    expect(calls[1].args).toEqual({ path: 'a.md', oldText: 'x', newText: 'y' })
  })

  it('工具实例缓存：同 type+cwd 复用，不同 cwd 新建', async () => {
    const { factory, count } = mockFactory()
    await executeAgenticTool(factory, { type: 'write', path: 'a', content: '1' }, root)
    await executeAgenticTool(factory, { type: 'write', path: 'b', content: '2' }, root)
    expect(count()).toBe(1)
    await executeAgenticTool(factory, { type: 'write', path: 'c', content: '3' }, path.join(root, 'other'))
    expect(count()).toBe(2)
  })

  it('工具执行抛异常 → catch 兜底 {success:false, error}', async () => {
    const factory: AgentToolFactory = {
      createReadTool: () => ({ execute: async () => { throw new Error('工具炸了') } }),
      createWriteTool: () => ({ execute: async () => ({ content: [] }) }),
      createEditTool: () => ({ execute: async () => ({ content: [] }) }),
      createBashTool: () => ({ execute: async () => ({ content: [] }) }),
    }
    const r = await executeAgenticTool(factory, { type: 'read', path: 'a' }, root)
    expect(r.success).toBe(false)
    expect((r as any).error).toBe('工具炸了')
  })

  it('非 content 结构结果 → JSON.stringify 输出', async () => {
    const factory: AgentToolFactory = {
      createReadTool: () => ({ execute: async () => ({ details: 'x' } as any) }),
      createWriteTool: () => ({ execute: async () => ({ content: [] }) }),
      createEditTool: () => ({ execute: async () => ({ content: [] }) }),
      createBashTool: () => ({ execute: async () => ({ content: [] }) }),
    }
    const r = await executeAgenticTool(factory, { type: 'read', path: 'a' }, root)
    expect((r as any).output).toBe(JSON.stringify({ details: 'x' }, null, 2))
  })
})

describe('runAgentLoop（mock LLM 全链路）', () => {
  it('工具调用循环：turn1 tool_call → turn2 文本 → 完成（事件序列 + 返回契约）', async () => {
    const { server, url, bodies } = await startScriptedLlm([
      { toolCalls: [{ id: 'tc-1', name: 'write', arguments: { path: 'loop-a.md', content: '由 loop 写入' } }] },
      { content: '任务完成总结' },
    ])
    const { factory } = mockFactory()
    const events: Array<{ type: string; data: any }> = []
    const r = await runAgentLoop(factory, baseConfig(url), { onEvent: (e) => events.push({ ...e }) })
    await closeServer(server)

    expect(r.success).toBe(true)
    expect(r.result).toBe('任务完成总结')
    expect(r.totalTurns).toBe(2)
    expect(r.totalToolCalls).toBe(1)
    expect(r.duration).toBeGreaterThanOrEqual(0)

    // 工具以正确参数执行（真实工具落盘链路由 gui-probe C1-C4 与探针覆盖）

    // 事件序列
    const types = events.map(e => e.type)
    expect(types).toEqual(['agent_start', 'turn_start', 'tool_call', 'tool_result', 'turn_end', 'turn_start', 'thinking', 'agent_end'])
    expect(events[0].data).toEqual({ task: 'agentic-单测任务' })
    expect(events.find(e => e.type === 'tool_call')!.data).toEqual({ toolName: 'write', toolArgs: { path: 'loop-a.md', content: '由 loop 写入' } })
    expect(events.find(e => e.type === 'tool_result')!.data.toolSuccess).toBe(true)
    expect(events.at(-1)!.data).toMatchObject({ success: true, result: '任务完成总结', totalTurns: 2, totalToolCalls: 1 })

    // LLM 请求体：第二轮消息历史含 tool 结果（role:tool + tool_call_id）
    expect(bodies[1].messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'tc-1' && m.content.includes('ok:'))).toBe(true)
    // 系统提示词含启用的工具（enabled 过滤：file-read 未启用不出现）
    expect(bodies[0].messages[0].content).toContain('write')
    expect(bodies[0].messages[0].content).not.toContain('file-read: 读文件')
    // 工具定义只含启用项
    expect(bodies[0].tools).toHaveLength(1)
    expect(bodies[0].tools[0].function.name).toBe('write')
  })

  it('中止信号 → error 事件 + 失败返回「用户中止」', async () => {
    // 脚本恒返回 tool_call，循环继续；第 2 轮开始前 abort
    const { server, url } = await startScriptedLlm([
      { toolCalls: [{ id: 'tc-1', name: 'write', arguments: { path: 'a', content: '1' } }] },
      { toolCalls: [{ id: 'tc-2', name: 'write', arguments: { path: 'b', content: '2' } }] },
    ])
    const { factory } = mockFactory()
    const controller = new AbortController()
    const events: Array<{ type: string; data?: any }> = []
    const r = await runAgentLoop(factory, baseConfig(url), {
      onEvent: (e) => {
        events.push({ type: e.type, data: e.data })
        if (e.type === 'turn_start' && (e.data as any).turnNumber >= 2) controller.abort()
      },
      signal: controller.signal,
    })
    await closeServer(server)

    expect(r.success).toBe(false)
    expect(r.error).toBe('用户中止')
    expect(r.totalTurns).toBeGreaterThanOrEqual(1)
    expect(events.map(e => e.type)).toContain('error')
    expect(events.at(-1)!.type).toBe('agent_end')
    expect((events.find(e => e.type === 'error') as any).data.error).toBe('用户中止')
  })

  it('网络失败（无效 baseUrl）→ 事件序列 agent_start/turn_start/error/agent_end + 失败返回', async () => {
    const { factory } = mockFactory()
    const events: Array<{ type: string }> = []
    const r = await runAgentLoop(factory, baseConfig('http://127.0.0.1:1/'), { onEvent: (e) => events.push({ type: e.type }) })

    expect(r.success).toBe(false)
    expect(typeof r.error).toBe('string')
    expect(r.totalTurns).toBe(1)
    expect(r.totalToolCalls).toBe(0)
    expect(events.map(e => e.type)).toEqual(['agent_start', 'turn_start', 'error', 'agent_end'])
  })

  it('maxIterations 用尽 → 循环退出（finalResult 兜底「任务执行完成」或末消息）', async () => {
    const { server, url } = await startScriptedLlm([
      { toolCalls: [{ id: 'tc-1', name: 'write', arguments: { path: 'a', content: '1' } }] },
    ])
    const { factory } = mockFactory()
    const r = await runAgentLoop(factory, { ...baseConfig(url), maxIterations: 2 }, { onEvent: () => {} })
    await closeServer(server)
    // 末消息为 tool 角色（无 assistant 内容）→ finalResult 兜底
    expect(r.success).toBe(true)
    expect(r.totalTurns).toBe(2)
    expect(r.totalToolCalls).toBe(2)
  })
})

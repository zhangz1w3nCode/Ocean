import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as http from 'node:http'
import * as net from 'node:net'
import { AddressInfo } from 'node:net'
import {
  testLlmConnection,
  callLlmApi,
  readLlmConfig,
  writeLlmConfig,
  readAgenticConfig,
  writeAgenticConfig,
  readLlmReviewConfig,
  writeLlmReviewConfig,
} from '../../core/common'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-llm-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

// 本地 mock LLM server（按脚本返回响应；记录收到的请求供断言）
function startMockServer(handler: (req: http.IncomingMessage, body: any) => { status?: number; body: unknown }): Promise<{ server: http.Server; url: string; requests: Array<{ headers: http.IncomingHttpHeaders; url: string; body: any }> }> {
  return new Promise((resolve) => {
    const requests: Array<{ headers: http.IncomingHttpHeaders; url: string; body: any }> = []
    const server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        let body: any = null
        try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
        requests.push({ headers: req.headers, url: req.url || '', body })
        const out = handler(req, body)
        res.writeHead(out.status ?? 200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(out.body))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo
      resolve({ server, url: `http://127.0.0.1:${addr.port}/`, requests })
    })
  })
}

const closeServer = (server: http.Server) => new Promise<void>((r) => server.close(() => r()))

describe('testLlmConnection（GET {baseUrl}models）', () => {
  it('openai 类型 → Authorization Bearer 头 + ok 响应解析 json', async () => {
    const { server, url, requests } = await startMockServer(() => ({ body: { data: [{ id: 'gpt-test' }] } }))
    const r = await testLlmConnection({ name: 'p', type: 'openai', baseUrl: url, apiKey: 'sk-test' })
    await closeServer(server)
    expect(r.success).toBe(true)
    expect((r as any).status).toBe(200)
    expect((r as any).json).toEqual({ data: [{ id: 'gpt-test' }] })
    expect(requests[0].headers['authorization']).toBe('Bearer sk-test')
    expect(requests[0].url).toBe('/models')
  })

  it('anthropic 类型 → x-api-key + anthropic-version 头', async () => {
    const { server, url, requests } = await startMockServer(() => ({ body: {} }))
    const r = await testLlmConnection({ name: 'p', type: 'anthropic', baseUrl: url, apiKey: 'ak' })
    await closeServer(server)
    expect(r.success).toBe(true)
    expect(requests[0].headers['x-api-key']).toBe('ak')
    expect(requests[0].headers['anthropic-version']).toBe('2023-06-01')
  })

  it('非 200 响应 → success:false 但带 status/body', async () => {
    const { server, url } = await startMockServer(() => ({ status: 401, body: { error: 'unauthorized' } }))
    const r = await testLlmConnection({ name: 'p', type: 'openai', baseUrl: url, apiKey: 'bad' })
    await closeServer(server)
    expect(r.success).toBe(false)
    expect((r as any).status).toBe(401)
  })

  it('网络失败（无效 baseUrl）→ success:false + error', async () => {
    const r = await testLlmConnection({ name: 'p', type: 'openai', baseUrl: 'http://127.0.0.1:1/', apiKey: 'k' })
    expect(r.success).toBe(false)
    expect(typeof (r as any).error).toBe('string')
  })
})

describe('callLlmApi（POST {baseUrl}chat/completions）', () => {
  it('openai 格式：请求体构建 + content/usage 提取 + modelParams 传递', async () => {
    const { server, url, requests } = await startMockServer(() => ({
      body: { choices: [{ message: { content: '回答内容' } }], usage: { total_tokens: 42 } },
    }))
    const r = await callLlmApi(
      { name: 'p', type: 'openai', baseUrl: url, apiKey: 'sk-1', defaultModel: 'm-default', modelParams: { maxTokens: 100, topP: 0.5 } },
      '用户提问',
      'm-explicit',
    )
    await closeServer(server)
    expect(r.success).toBe(true)
    expect((r as any).content).toBe('回答内容')
    expect((r as any).usage).toEqual({ total_tokens: 42 })
    const sent = requests[0].body
    expect(sent.model).toBe('m-explicit')
    expect(sent.messages).toEqual([{ role: 'user', content: '用户提问' }])
    expect(sent.max_tokens).toBe(100)
    expect(sent.top_p).toBe(0.5)
    expect(sent.temperature).toBe(0.7)
    expect(requests[0].headers['authorization']).toBe('Bearer sk-1')
    expect(requests[0].url).toBe('/chat/completions')
  })

  it('anthropic 格式：content 数组拼接 + 独立 system 字段', async () => {
    const { server, url, requests } = await startMockServer(() => ({
      body: { content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }], usage: { input_tokens: 5 } },
    }))
    const r = await callLlmApi({ name: 'p', type: 'anthropic', baseUrl: url, apiKey: 'ak' }, '问题', 'claude-x')
    await closeServer(server)
    expect(r.success).toBe(true)
    expect((r as any).content).toBe('第一段第二段')
    const sent = requests[0].body
    expect(sent.model).toBe('claude-x')
    expect(sent.max_tokens).toBe(4096)
    expect(sent.messages).toEqual([{ role: 'user', content: '问题' }])
    expect(requests[0].headers['x-api-key']).toBe('ak')
  })

  it('非 2xx 响应 → error 含状态码', async () => {
    const { server, url } = await startMockServer(() => ({ status: 500, body: { error: 'boom' } }))
    const r = await callLlmApi({ name: 'p', type: 'openai', baseUrl: url, apiKey: 'k' }, 'q')
    await closeServer(server)
    expect(r.success).toBe(false)
    expect((r as any).error).toContain('500')
  })

  it('思考标签过滤（<think>...</think> 剥离）', async () => {
    const { server, url } = await startMockServer(() => ({
      body: { choices: [{ message: { content: '思考过程' + String.fromCharCode(60) + 'think' + String.fromCharCode(62) + '内部' + String.fromCharCode(60) + '/think' + String.fromCharCode(62) + '实际回答' } }] },
    }))
    const r = await callLlmApi({ name: 'p', type: 'openai', baseUrl: url, apiKey: 'k' }, 'q')
    await closeServer(server)
    expect((r as any).content).toBe('思考过程实际回答')
  })

  it('网络失败 → success:false', async () => {
    const r = await callLlmApi({ name: 'p', type: 'openai', baseUrl: 'http://127.0.0.1:1/', apiKey: 'k' }, 'q')
    expect(r.success).toBe(false)
  })
})

describe('三个配置文件 CRUD（.ocean 下，ensureDir 副作用）', () => {
  const cases: Array<[string, (r: string) => any, (r: string, c: unknown) => any, string]> = [
    ['llm-config.json', readLlmConfig, writeLlmConfig, 'LLM'],
    ['agentic-config.json', readAgenticConfig, writeAgenticConfig, 'Agentic'],
    ['cli-workflow-llm-judge-artifacts.json', readLlmReviewConfig, writeLlmReviewConfig, 'LLM 智能审核'],
  ]

  for (const [file, readFn, writeFn, label] of cases) {
    it(`${label} 配置：无文件 → {success:true, config:null} 且建 .ocean 目录`, () => {
      const r = readFn(root)
      expect(r).toEqual({ success: true, config: null })
      expect(fs.existsSync(path.join(root, '.ocean'))).toBe(true)
    })

    it(`${label} 配置：save 落盘 → load 读回一致`, () => {
      expect(writeFn(root, { x: 1, y: 'z' })).toEqual({ success: true })
      expect(readFn(root).config).toEqual({ x: 1, y: 'z' })
      expect(JSON.parse(fs.readFileSync(path.join(root, '.ocean', file), 'utf-8'))).toEqual({ x: 1, y: 'z' })
    })

    it(`${label} 配置：坏 JSON → 抛异常（壳 catch 兜底 {success:false, config:null}）`, () => {
      writeFn(root, { x: 1 })
      fs.writeFileSync(path.join(root, '.ocean', file), '{bad', 'utf-8')
      expect(() => readFn(root)).toThrow(SyntaxError)
    })
  }
})

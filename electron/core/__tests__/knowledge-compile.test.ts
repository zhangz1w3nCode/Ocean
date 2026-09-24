import { describe, expect, it, vi } from 'vitest'

const { compileSource } = require('../knowledge-compile.cjs')
const { createCompileQueue } = require('../compile-queue.cjs')

// ── 测试基建：内存 services + 脚本化假 LLM ──

function createFakeServices() {
  const cards = new Map<string, string>() // relPath → content
  const states = new Map<string, string>()
  const savedCards: string[] = []
  return {
    cards,
    states,
    savedCards,
    streamLLM: vi.fn(),
    readSource: vi.fn(async (name: string) => ({ content: `# ${name}\n\n源正文内容，包含关键实体 OpenAI 与概念 RAG。`, kind: 'text' })),
    listCards: vi.fn(() => {
      const { parseFrontmatter } = require('../knowledge-ingest/frontmatter.cjs')
      const out: any[] = []
      for (const [rel, content] of cards) {
        const { frontmatter } = parseFrontmatter(content)
        out.push({ relPath: rel, name: frontmatter?.name || rel.split('/').pop(), cardType: frontmatter?.type, summary: frontmatter?.summary })
      }
      return out
    }),
    loadCard: vi.fn((relPath: string) => (cards.has(relPath) ? cards.get(relPath)! : null)),
    saveCard: vi.fn((relPath: string, content: string) => {
      cards.set(relPath, content)
      savedCards.push(relPath)
    }),
    readState: vi.fn((rel: string) => (states.has(rel) ? states.get(rel)! : null)),
    writeState: vi.fn((rel: string, content: string) => {
      states.set(rel, content)
    }),
    fileExists: vi.fn((cardPathWithMd: string) => cards.has(cardPathWithMd.replace(/\.md$/, ''))),
  }
}

const FILE_BLOCK = (p: string, fm: string, body: string) =>
  `---FILE: ${p}---\n${fm}\n${body}\n---END FILE---`

const SOURCE_FM = `---
name: demo
type: source
summary: demo 源摘要
tags: [source]
domain: sources
sources:
  - path: .knowledges/.raw/demo.md
    anchor: ''
    kind: md
---`

const ENTITY_FM = `---
name: OpenAI
type: entity
summary: AI 公司
tags: [ai]
domain: entities
sources:
  - path: .knowledges/.raw/demo.md
    anchor: ''
    kind: md
---`

function llmScript(steps: Array<{ ok?: boolean; content?: string; error?: string }>) {
  return vi.fn(async (_llm: any, _messages: any, _params: any, _opts: any) => {
    const step = steps.shift()
    if (!step) return { success: false, error: 'no scripted step' }
    if (step.ok === false) return { success: false, error: step.error || 'scripted failure' }
    return { success: true, content: step.content || '' }
  })
}

const baseCtx = (services: any, llm: any) => ({
  sourceName: 'demo.md',
  services,
  llm: { provider: { name: 'fake', type: 'openai', baseUrl: 'http://x', apiKey: 'k' }, model: 'fake-model' },
  _streamLLM: llm,
})

describe('compileSource 全链路（假 LLM）', () => {
  it('两步调用 → FILE 块落盘 → 缓存写入', async () => {
    const services = createFakeServices()
    const llm = llmScript([
      { content: '## 关键实体\n- OpenAI' },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, '# demo\n正文') + '\n' + FILE_BLOCK('wiki/entities/OpenAI.md', ENTITY_FM, '# OpenAI\n正文') },
    ])
    services.streamLLM.mockImplementation(llm)
    const result = await compileSource({ sourceName: 'demo.md', services, llm: {} as any })

    expect(services.streamLLM).toHaveBeenCalledTimes(2)
    // Step1 system 是分析角色，Step2 system 是维护者角色
    const sys1 = services.streamLLM.mock.calls[0][1][0].content as string
    const sys2 = services.streamLLM.mock.calls[1][1][0].content as string
    expect(sys1).toContain('研究分析员')
    expect(sys2).toContain('知识库维护者')
    expect(result.cards).toContain('sources/demo')
    expect(result.cards).toContain('entities/OpenAI')
    // 卡内容：强制 pending + sources 指回源
    const card = services.cards.get('sources/demo')!
    expect(card).toContain('status: pending')
    expect(card).toContain('path: .knowledges/.raw/demo.md')
    expect(card).toContain('type: source')
    // 缓存已写
    expect(services.states.get('knowledge-compile-cache.json')).toBeTruthy()
    expect(services.savedCards).toContain('entities/OpenAI')
  })

  it('缓存命中：第二次同源零 LLM 调用', async () => {
    const services = createFakeServices()
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    expect(services.streamLLM).toHaveBeenCalledTimes(2)

    const r2 = await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    expect(services.streamLLM).toHaveBeenCalledTimes(2) // 未新增
    expect(r2.skipped).toBe(true)
  })

  it('缓存防幽灵：产出卡被删后失效重跑', async () => {
    const services = createFakeServices()
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b') },
      { content: '分析2' },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b2') },
    ])
    services.streamLLM.mockImplementation(llm)
    await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    services.cards.delete('sources/demo') // 删除产出卡
    const r2 = await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    expect(r2.skipped).toBeUndefined()
    expect(services.streamLLM).toHaveBeenCalledTimes(4)
  })

  it('分析阶段失败必抛（不静默当成功）', async () => {
    const services = createFakeServices()
    const llm = llmScript([{ ok: false, error: '429 rate limit' }])
    services.streamLLM.mockImplementation(llm)
    await expect(compileSource({ sourceName: 'demo.md', services, llm: {} as any })).rejects.toThrow(/分析阶段失败/)
    expect(services.states.has('knowledge-compile-cache.json')).toBe(false)
  })

  it('截断修复：未闭合块触发修复调用且只接受请求路径', async () => {
    const services = createFakeServices()
    // Step2：1 个完整 entity 卡 + 1 个未闭合 source 块（截断）
    const truncated = `---FILE: wiki/sources/demo.md---\n${SOURCE_FM}\n部分正文`
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/entities/OpenAI.md', ENTITY_FM, 'b') + '\n' + truncated },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, '修复后的完整正文') },
    ])
    services.streamLLM.mockImplementation(llm)
    const result = await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    expect(services.streamLLM).toHaveBeenCalledTimes(3) // 分析 + 生成 + 修复
    expect(result.cards).toContain('sources/demo')
    expect(result.cards).toContain('entities/OpenAI')
    // 修复 prompt 只点名被截断路径
    const repairSys = services.streamLLM.mock.calls[2][1][0].content as string
    expect(repairSys).toContain('wiki/sources/demo.md')
    expect(repairSys).not.toContain('entities/OpenAI.md')
  })

  it('兜底：LLM 未生成 source 卡时确定性补写', async () => {
    const services = createFakeServices()
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/entities/OpenAI.md', ENTITY_FM, 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    const result = await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    expect(result.cards).toContain('sources/demo')
    const card = services.cards.get('sources/demo')!
    expect(card).toContain('type: source')
    expect(card).toContain('兜底')
    expect(result.warnings.join('\n')).toContain('兜底')
  })

  it('写卡失败触发完整性门：抛错且不写缓存', async () => {
    const services = createFakeServices()
    services.saveCard.mockImplementation((relPath: string) => {
      if (relPath === 'entities/OpenAI') throw new Error('disk full')
      cards.set(relPath, 'x')
    })
    const cards = services.cards
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b') + '\n' + FILE_BLOCK('wiki/entities/OpenAI.md', ENTITY_FM, 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    await expect(compileSource({ sourceName: 'demo.md', services, llm: {} as any })).rejects.toThrow(/编译不完整/)
    expect(services.states.has('knowledge-compile-cache.json')).toBe(false)
  })

  it('重编译撞已有卡：sources/relations/tags 并集且正文追加', async () => {
    const services = createFakeServices()
    // 预置既有卡（另一源贡献）
    services.cards.set(
      'entities/OpenAI',
      `---\nname: OpenAI\ntype: entity\nsummary: 旧摘要\ntags: [old]\nstatus: validated\nsources:\n  - path: .knowledges/.raw/other.md\n    anchor: ''\n    kind: md\n---\n旧正文`,
    )
    const newFm = ENTITY_FM.replace('tags: [ai]', 'tags: [ai, new]')
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/entities/OpenAI.md', newFm, '新正文') + '\n' + FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    const merged = services.cards.get('entities/OpenAI')!
    // 数组并集
    expect(merged).toContain('path: .knowledges/.raw/other.md')
    expect(merged).toContain('path: .knowledges/.raw/demo.md')
    expect(merged).toContain('tags: [old, ai, new]')
    expect(merged).toContain('old')
    // 合并卡强制回 pending（进审核门）
    expect(merged).toContain('status: pending')
    // 多源共享卡正文保留旧内容（不替换）
    expect(merged).toContain('旧正文')
    expect(merged).toContain('新正文')
  })

  it('单源独占卡重编译：正文整体替换（不让已撤回措辞续命）', async () => {
    const services = createFakeServices()
    services.cards.set(
      'entities/OpenAI',
      `---\nname: OpenAI\ntype: entity\nsummary: 旧\nsources:\n  - path: .knowledges/.raw/demo.md\n    anchor: ''\n    kind: md\nstatus: validated\n---\n旧正文（将被撤回）`,
    )
    const llm = llmScript([
      { content: '分析' },
      { content: FILE_BLOCK('wiki/entities/OpenAI.md', ENTITY_FM, '新正文') + '\n' + FILE_BLOCK('wiki/sources/demo.md', SOURCE_FM, 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    await compileSource({ sourceName: 'demo.md', services, llm: {} as any })
    const replaced = services.cards.get('entities/OpenAI')!
    expect(replaced).toContain('新正文')
    expect(replaced).not.toContain('旧正文（将被撤回）')
  })
})

describe('compile-queue 状态机（注入式）', () => {
  const makeQueue = (services: any, events: any[]) =>
    createCompileQueue({
      services,
      emit: (type: string, payload: any) => events.push({ type, ...payload }),
    })

  it('串行执行：两个任务依次完成，done 保留在列表（实例页模式）', async () => {
    const services = createFakeServices()
    const llm = llmScript([
      { content: '分析A' },
      { content: FILE_BLOCK('wiki/sources/a.md', SOURCE_FM.replace(/demo/g, 'a').replace(/demo\.md/g, 'a.md'), 'b') },
      { content: '分析B' },
      { content: FILE_BLOCK('wiki/sources/b.md', SOURCE_FM.replace(/demo/g, 'b').replace(/demo\.md/g, 'b.md'), 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    const events: any[] = []
    const q = makeQueue(services, events)
    q.enqueue(['a.md', 'b.md'])
    await vi.waitFor(() => {
      const dones = q.list().filter((t: any) => t.status === 'done')
      expect(dones).toHaveLength(2)
    }, { timeout: 3000 })
    expect(services.streamLLM).toHaveBeenCalledTimes(4)
    expect(q.list().every((t: any) => ['done'].includes(t.status))).toBe(true)
    expect(q.summary().done).toBe(2)
    // 同源重跑：done 任务不复用，新建任务排队
    q.pause()
    q.enqueue(['a.md'])
    expect(q.list().length).toBe(3)
    // 清除已完成
    q.clearCompletedAndCancelled()
    expect(q.list().length).toBe(1)
  })

  it('429 错误：队列暂停、任务回 pending；恢复后继续', async () => {
    const services = createFakeServices()
    // 先失败一次 429，然后成功
    const llm = llmScript([
      { ok: false, error: 'Error: 429 Too Many Requests quota exceeded' },
      { content: '分析' },
      { content: FILE_BLOCK('wiki/sources/x.md', SOURCE_FM.replace(/demo/g, 'x').replace(/demo\.md/g, 'x.md'), 'b') },
    ])
    services.streamLLM.mockImplementation(llm)
    const events: any[] = []
    const q = makeQueue(services, events)
    q.enqueue(['x.md'])
    await vi.waitFor(() => expect(q.isPaused()).toBe(true), { timeout: 3000 })
    expect(q.list()[0].status).toBe('pending')
    expect(q.list()[0].error).toContain('用量限制')
    q.resume()
    await vi.waitFor(() => expect(q.list()[0]?.status).toBe('done'), { timeout: 3000 })
    expect(services.streamLLM).toHaveBeenCalledTimes(3)
  })

  it('重试上限 3 次：连续失败后标记 failed 保留', async () => {
    const services = createFakeServices()
    const llm = llmScript([])
    llm.mockImplementation(async () => ({ success: false, error: 'boom' }))
    services.streamLLM.mockImplementation(llm)
    const events: any[] = []
    const q = makeQueue(services, events)
    q.enqueue(['f.md'])
    await vi.waitFor(() => {
      expect(q.list()[0]?.status).toBe('failed')
    }, { timeout: 5000 })
    expect(q.list()[0].retryCount).toBe(3)
    expect(q.list().length).toBe(1) // failed 保留
  })

  it('同源 upsert：复用任务并重置重试计数', async () => {
    const services = createFakeServices()
    const events: any[] = []
    const q = makeQueue(services, events)
    q.pause()
    const [t1] = q.enqueue(['dup.md'])
    const [t2] = q.enqueue(['dup.md'])
    expect(t2.id).toBe(t1.id)
    expect(q.list().length).toBe(1)
  })

  it('恢复的任务不自动执行（避免启动即扣费）', async () => {
    const services = createFakeServices()
    const events: any[] = []
    const q = makeQueue(services, events)
    // 直接写一个磁盘队列（pending 任务）再 restore
    services.states.set('knowledge-compile-queue.json', JSON.stringify([
      { id: 'compile-restored-1', sourceName: 'restored.md', status: 'pending', addedAt: 1, error: null, retryCount: 0 },
    ]))
    q.restore()
    expect(q.list().length).toBe(1)
    // 未 setLLM 且未 enqueue 同源：pending 任务不被调度
    await new Promise((r) => setTimeout(r, 100))
    expect(services.streamLLM).not.toHaveBeenCalled()
    expect(q.list()[0].status).toBe('pending')
  })
})

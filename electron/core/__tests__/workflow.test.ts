import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveWorkflowFile,
  readWorkflowFile,
  deleteWorkflowFile,
  listWorkflowFiles,
  createWorkflowFolder,
  readWorkflowMdFile,
  saveWorkflowMdFile,
  readWorkflowFlowJson,
  saveWorkflowFlowJson,
  listWorkflowFolders,
  deleteWorkflowFolder,
  renameWorkflowFolder,
  listWorkflowInstances,
  readInstanceFile,
  readInstanceDetail,
  watchInstanceDetail,
} from '../../core/common'
import {
  createWorkflow,
  deleteWorkflow,
  renameWorkflow,
  readWorkflowMd,
  readWorkflowFlow,
  addWorkflowNode,
  connectWorkflowNodes,
  addWorkflowBranch,
  removeWorkflowNode,
  disconnectWorkflowNodes,
  listWorkflowNodes,
  listWorkflowEdges,
  generateWorkflow,
  doctorWorkflow,
  listWorkflowLocalNodes,
  readWorkflowLocalNode,
  createWorkflowLocalNode,
  deleteWorkflowLocalNode,
} from '../../source/cli/workflow'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-wf-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const wfRoot = (...seg: string[]): string => path.join(root, '.workflows', ...seg)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('GUI 语义组（launch.cjs workflow IPC 契约复刻）', () => {
  it('listWorkflowFiles：目录不存在返回空，且创建 .workflows 根（getWorkflowsDir 副作用）', () => {
    expect(listWorkflowFiles(root)).toEqual({ success: true, files: [] })
    expect(fs.existsSync(wfRoot())).toBe(true)
  })

  it('saveWorkflowFile 哑写：content 原样落盘、同名覆写', () => {
    expect(saveWorkflowFile(root, 'f1', '# 工作流一\n正文')).toEqual({ success: true })
    expect(fs.readFileSync(wfRoot('f1.md'), 'utf-8')).toBe('# 工作流一\n正文')
    expect(saveWorkflowFile(root, 'f1', '覆盖原文')).toEqual({ success: true })
    expect(fs.readFileSync(wfRoot('f1.md'), 'utf-8')).toBe('覆盖原文')
  })

  it('readWorkflowFile ghost 返回 content:null；存在返回原文与 mtime', () => {
    expect(readWorkflowFile(root, 'ghost')).toEqual({ success: true, content: null, mtime: null })
    saveWorkflowFile(root, 'a', 'raw')
    const res = readWorkflowFile(root, 'a')
    expect(res.success).toBe(true)
    expect(res.content).toBe('raw')
    expect(typeof res.mtime).toBe('string')
  })

  it('deleteWorkflowFile ghost 静默成功；listWorkflowFiles 过滤非 .md、原始序', () => {
    expect(deleteWorkflowFile(root, 'ghost')).toEqual({ success: true })
    saveWorkflowFile(root, 'zeta', 'z')
    saveWorkflowFile(root, 'alpha', 'a')
    fs.writeFileSync(wfRoot('notes.txt'), 'not md')
    expect(listWorkflowFiles(root)).toEqual({ success: true, files: ['alpha.md', 'zeta.md'] })
  })

  it('createWorkflowFolder：幂等 + 建 {name}/ 与 {name}/meta-data/ + 返回绝对 folderPath', () => {
    const r1 = createWorkflowFolder(root, 'wf1')
    expect(r1.success).toBe(true)
    if (r1.success) expect(r1.folderPath).toBe(wfRoot('wf1'))
    expect(fs.existsSync(wfRoot('wf1', 'meta-data'))).toBe(true)
    const r2 = createWorkflowFolder(root, 'wf1')
    expect(r2.success).toBe(true)
  })

  it('saveWorkflowMdFile：对不存在文件夹 ensureDir 一级（不建 meta-data）；readWorkflowMdFile ghost null-成功', () => {
    expect(readWorkflowMdFile(root, 'wf1')).toEqual({ success: true, content: null, mtime: null })
    expect(saveWorkflowMdFile(root, 'newwf', '直接保存')).toEqual({ success: true })
    expect(fs.existsSync(wfRoot('newwf'))).toBe(true)
    expect(fs.existsSync(wfRoot('newwf', 'meta-data'))).toBe(false)
    expect(fs.readFileSync(wfRoot('newwf', 'WORKFLOW.md'), 'utf-8')).toBe('直接保存')
  })

  it('saveWorkflowFlowJson：ensureDir meta-data 两级；readWorkflowFlowJson ghost null-成功', () => {
    expect(readWorkflowFlowJson(root, 'wf1')).toEqual({ success: true, content: null, mtime: null })
    expect(saveWorkflowFlowJson(root, 'newwf2', '{"nodes":[]}')).toEqual({ success: true })
    expect(fs.existsSync(wfRoot('newwf2', 'meta-data', 'flow.json'))).toBe(true)
  })

  it('listWorkflowFolders：只列目录、原始序；deleteWorkflowFolder ghost 静默 + 递归删除', () => {
    createWorkflowFolder(root, 'wf1')
    fs.mkdirSync(wfRoot('zeta-dir'))
    fs.writeFileSync(wfRoot('not-dir.md'), 'x')
    expect(listWorkflowFolders(root)).toEqual({ success: true, folders: ['wf1', 'zeta-dir'] })
    expect(deleteWorkflowFolder(root, 'ghost')).toEqual({ success: true })
    expect(deleteWorkflowFolder(root, 'wf1')).toEqual({ success: true })
    expect(fs.existsSync(wfRoot('wf1'))).toBe(false)
  })

  it('renameWorkflowFolder：ghost 静默跳过；真实重命名；目标已存在抛系统错误（壳 catch）', () => {
    createWorkflowFolder(root, 'wf1')
    createWorkflowFolder(root, 'wf2')
    expect(renameWorkflowFolder(root, 'ghost', 'x')).toEqual({ success: true })
    expect(renameWorkflowFolder(root, 'wf2', 'wf2x')).toEqual({ success: true })
    expect(fs.existsSync(wfRoot('wf2x'))).toBe(true)
    expect(() => renameWorkflowFolder(root, 'wf2x', 'wf1')).toThrow(/ENOTEMPTY|EEXIST/)
  })

  it('listWorkflowInstances：解析 status.json 九字段 + trace 首行 ts 作 createdAt + 降序', () => {
    const mkInst = (wf: string, id: string, status: Record<string, any>, ts: string) => {
      const instDir = wfRoot(wf, 'instance', id)
      fs.mkdirSync(path.join(instDir, 'trace'), { recursive: true })
      fs.mkdirSync(path.join(instDir, 'artifacts', 'n1', 'v1'), { recursive: true })
      fs.writeFileSync(path.join(instDir, 'status.json'), JSON.stringify(status))
      fs.writeFileSync(path.join(instDir, 'trace', 'trace.jsonl'), JSON.stringify({ ts, node: 'a', invoke: 'i', status: 'completed' }))
      fs.writeFileSync(path.join(instDir, 'artifacts', 'n1', 'v1', 'detail.md'), 'x')
    }
    mkInst('wf1', 'i2', { status: 'running', initial_input: '入', current_name: 'n1', step: 3, loop_count: 1, retry_count: 0, last_node: 'n1', completed: ['a'] }, '2026-10-23T02:00:00Z')
    mkInst('wf1', 'i1', { status: 'idle' }, '2026-10-23T01:00:00Z')

    const res = listWorkflowInstances(root)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.instances.map((i: any) => i.instanceId)).toEqual(['i2', 'i1'])
    const i2 = res.instances[0]
    expect(i2.workflowName).toBe('wf1')
    expect(i2.status).toBe('running')
    expect(i2.initialInput).toBe('入')
    expect(i2.currentName).toBe('n1')
    expect(i2.step).toBe(3)
    expect(i2.loopCount).toBe(1)
    expect(i2.retryCount).toBe(0)
    expect(i2.lastNode).toBe('n1')
    expect(i2.completedNodes).toEqual(['a'])
    expect(i2.artifactCount).toBe(1)
    expect(i2.createdAt).toBe('2026-10-23T02:00:00Z')
  })

  it('readInstanceFile：路径穿越拒绝 + File not found + 正常读', () => {
    createWorkflowFolder(root, 'wf1')
    const instDir = wfRoot('wf1', 'instance', 'i1')
    fs.mkdirSync(instDir, { recursive: true })
    fs.writeFileSync(path.join(instDir, 'status.json'), '{"status":"idle"}')
    expect(readInstanceFile(root, '..', 'i1', 'status.json')).toEqual({ success: false, error: 'Invalid path' })
    expect(readInstanceFile(root, 'wf1', 'i1', 'nope.md')).toEqual({ success: false, error: 'File not found' })
    expect(readInstanceFile(root, 'wf1', 'i1', 'status.json')).toEqual({ success: true, content: '{"status":"idle"}' })
  })

  it('readInstanceDetail：六组字段 + 路径守卫 + Instance not found', () => {
    expect(readInstanceDetail(root, '..', 'i1')).toEqual({ success: false, error: 'Invalid path' })
    expect(readInstanceDetail(root, 'wf1', 'nope')).toEqual({ success: false, error: 'Instance not found' })

    createWorkflowFolder(root, 'wf1')
    saveWorkflowFlowJson(root, 'wf1', '{"nodes":[],"edges":[]}')
    const instDir = wfRoot('wf1', 'instance', 'i1')
    fs.mkdirSync(path.join(instDir, 'trace'), { recursive: true })
    fs.mkdirSync(path.join(instDir, 'artifacts', 'n1', 'v1'), { recursive: true })
    fs.writeFileSync(path.join(instDir, 'status.json'), JSON.stringify({ status: 'running', current_name: 'n1', step: 2, completed: ['a'] }))
    fs.writeFileSync(path.join(instDir, 'trace', 'trace.jsonl'), JSON.stringify({ ts: 't', node: 'a', invoke: 'i', status: 'completed' }))
    fs.writeFileSync(path.join(instDir, 'artifacts', 'n1', 'v1', 'detail.md'), '产物')
    fs.writeFileSync(path.join(instDir, 'context.md'), '上下文')
    fs.writeFileSync(path.join(instDir, 'instance.md'), '说明')

    const res = readInstanceDetail(root, 'wf1', 'i1')
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.detail.wfStatus).toBe('running')
    expect(res.detail.currentName).toBe('n1')
    expect(res.detail.completedNodes).toEqual(['a'])
    expect(res.detail.trace).toHaveLength(1)
    expect(res.detail.traceLog).toContain('completed')
    expect(res.detail.artifacts[0].version).toBe('v1')
    expect(res.detail.artifacts[0].content).toBe('产物')
    expect(res.detail.contextMd).toBe('上下文')
    expect(res.detail.instanceMd).toBe('说明')
    expect(res.detail.flowData).toEqual({ nodes: [], edges: [] })
  })

  it('watchInstanceDetail：status 增量推送 + trace 增量 + 未识别文件全量兜底 + stop 停推', async () => {
    createWorkflowFolder(root, 'wf1')
    saveWorkflowFlowJson(root, 'wf1', '{"nodes":[]}')
    const instDir = wfRoot('wf1', 'instance', 'i1')
    fs.mkdirSync(path.join(instDir, 'trace'), { recursive: true })
    fs.writeFileSync(path.join(instDir, 'status.json'), JSON.stringify({ status: 'idle', completed: [] }))

    const deltas: any[] = []
    const handle = watchInstanceDetail(root, 'wf1', 'i1', (delta) => deltas.push(delta))
    await sleep(300)

    // status.json → process 六字段增量
    fs.writeFileSync(path.join(instDir, 'status.json'), JSON.stringify({ status: 'completed', step: 4, completed: ['a', 'b'] }))
    await sleep(600)
    expect(deltas.length).toBeGreaterThanOrEqual(1)
    const procDelta = deltas[deltas.length - 1]
    expect(Object.keys(procDelta).sort()).toEqual(['completedNodes', 'currentName', 'wfLoopCount', 'wfRetryCount', 'wfStatus', 'wfStep'])
    expect(procDelta.wfStatus).toBe('completed')
    expect(procDelta.wfStep).toBe(4)

    // trace.jsonl → trace 两字段增量
    fs.writeFileSync(path.join(instDir, 'trace', 'trace.jsonl'), JSON.stringify({ ts: 't2', node: 'a', invoke: 'i', status: 'completed' }))
    await sleep(600)
    expect(Object.keys(deltas[deltas.length - 1]).sort()).toEqual(['trace', 'traceLog'])

    // 未识别文件（顶层新文件）→ 全量兜底（含六组字段）
    fs.writeFileSync(path.join(instDir, 'random.bin'), 'x')
    await sleep(600)
    const full = deltas[deltas.length - 1]
    expect(['completedNodes', 'traceLog', 'artifacts', 'contextMd', 'instanceMd', 'flowData'].every(k => k in full)).toBe(true)

    // stop 后不再推送
    handle.stop()
    const before = deltas.length
    fs.writeFileSync(path.join(instDir, 'status.json'), JSON.stringify({ status: 'x' }))
    await sleep(600)
    expect(deltas.length).toBe(before)
  }, 10000)
})

describe('CLI 语义组（core/workflow.ts 行为零变更）', () => {
  it('createWorkflow：create-only + start/end 节点 + 不写 WORKFLOW.md', () => {
    createWorkflow(root, 'w1')
    const flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.nodes.map((n: any) => n.id)).toEqual(['start-1', 'end-1'])
    expect(flow.edges).toEqual([])
    expect(fs.existsSync(wfRoot('w1', 'WORKFLOW.md'))).toBe(false)
    expect(() => createWorkflow(root, 'w1')).toThrow('工作流已存在: w1')
  })

  it('addWorkflowNode：四类型语义 + decision 缺 condition 拒绝', () => {
    createWorkflow(root, 'w1')
    const pid = addWorkflowNode(root, 'w1', 'process', '处理', { content: '内容' })
    expect(pid).toMatch(/^process-\d+$/)
    addWorkflowNode(root, 'w1', 'business', '业务', { nodeRefPath: '.nodes/my.md' })
    expect(() => addWorkflowNode(root, 'w1', 'decision', '判断', {})).toThrow('decision 节点必须提供判断内容')
    const did = addWorkflowNode(root, 'w1', 'decision', '判断', { condition: '是否继续' })
    const flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    const dNode = flow.nodes.find((n: any) => n.id === did)
    expect(dNode.data.condition).toBe('是否继续')
    expect(dNode.data.branches).toEqual([])
    expect(() => addWorkflowNode(root, 'w1', 'unknown', 'x', {})).toThrow('不支持的节点类型: unknown')
    expect(() => addWorkflowNode(root, 'ghost', 'process', 'x', {})).toThrow('工作流不存在: ghost')
  })

  it('connectWorkflowNodes / addWorkflowBranch / removeWorkflowNode / disconnectWorkflowNodes', () => {
    createWorkflow(root, 'w1')
    const pid = addWorkflowNode(root, 'w1', 'process', '处理', { content: 'c' })
    const eid = connectWorkflowNodes(root, 'w1', 'start-1', pid)
    expect(eid).toMatch(/^e-\d+$/)
    expect(() => connectWorkflowNodes(root, 'w1', 'start-1', 'ghost')).toThrow('节点不存在: ghost')

    const did = addWorkflowNode(root, 'w1', 'decision', '判断', { condition: 'c' })
    const bid = addWorkflowBranch(root, 'w1', did, '分支A', '说明')
    expect(bid).toMatch(/^\d+$/)
    let flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    const dNode = flow.nodes.find((n: any) => n.id === did)
    expect(dNode.data.branches.map((b: any) => b.name)).toEqual(['分支A', '其他'])
    expect(() => addWorkflowBranch(root, 'w1', pid, 'x', '')).toThrow('节点不是 decision 类型')

    // removeNode 连带删边
    removeWorkflowNode(root, 'w1', pid)
    flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.nodes.some((n: any) => n.id === pid)).toBe(false)
    expect(flow.edges.some((e: any) => e.target === pid)).toBe(false)

    // connect 后 disconnect
    const pid2 = addWorkflowNode(root, 'w1', 'process', '处理2', { content: 'c' })
    connectWorkflowNodes(root, 'w1', 'start-1', pid2)
    disconnectWorkflowNodes(root, 'w1', 'start-1', pid2)
    flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.edges.filter((e: any) => e.target === pid2)).toHaveLength(0)
  })

  it('listWorkflowNodes / listWorkflowEdges：markdown 表格', () => {
    createWorkflow(root, 'w1')
    const pid = addWorkflowNode(root, 'w1', 'process', '处理', { content: '内容' })
    connectWorkflowNodes(root, 'w1', 'start-1', pid)
    const nodesTable = listWorkflowNodes(root, 'w1')
    expect(nodesTable).toContain('| ID | type | label | ref-path |')
    expect(nodesTable).toContain(pid)
    const edgesTable = listWorkflowEdges(root, 'w1')
    expect(edgesTable).toContain('| source | target | branch |')
    expect(edgesTable).toContain(`start-1 | ${pid} |`)
  })

  it('readWorkflowMd：缺失抛错；generate 后可读；readWorkflowFlow 原文', () => {
    createWorkflow(root, 'w1')
    expect(() => readWorkflowMd(root, 'w1')).toThrow('WORKFLOW.md 不存在: w1')
    generateWorkflow(root, 'w1')
    const md = readWorkflowMd(root, 'w1')
    expect(md).toContain('# w1')
    expect(readWorkflowFlow(root, 'w1')).toContain('"start-1"')
  })

  it('generateWorkflow：dagre 布局回写 + local 节点落盘 + WORKFLOW.md 生成', () => {
    createWorkflow(root, 'w1')
    addWorkflowNode(root, 'w1', 'local', '局部甲', { content: '局部内容' })
    addWorkflowNode(root, 'w1', 'process', '处理', { content: 'c' })
    generateWorkflow(root, 'w1')
    expect(fs.existsSync(wfRoot('w1', 'nodes', '局部甲.md'))).toBe(true)
    expect(fs.readFileSync(wfRoot('w1', 'nodes', '局部甲.md'), 'utf-8')).toBe('局部内容')
    const flow = JSON.parse(fs.readFileSync(wfRoot('w1', 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.nodes.every((n: any) => typeof n.position?.x === 'number')).toBe(true)
    expect(fs.existsSync(wfRoot('w1', 'WORKFLOW.md'))).toBe(true)
  })

  it('doctorWorkflow：11 检查报告', () => {
    createWorkflow(root, 'w1')
    const report = doctorWorkflow(root, 'w1')
    const checks = report.split('\n').filter((l: string) => l.startsWith('| ') && !l.includes('检查项'))
    expect(checks).toHaveLength(11)
    const json = doctorWorkflow(root, 'w1', true)
    expect(JSON.parse(json)).toHaveLength(11)
  })

  it('renameWorkflow / deleteWorkflow：校验语义', () => {
    createWorkflow(root, 'w1')
    expect(() => renameWorkflow(root, 'ghost', 'x')).toThrow('工作流不存在: ghost')
    renameWorkflow(root, 'w1', 'w2')
    const flow = JSON.parse(fs.readFileSync(wfRoot('w2', 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.name).toBe('w2')
    createWorkflow(root, 'w3')
    expect(() => renameWorkflow(root, 'w3', 'w2')).toThrow('工作流已存在: w2')
    deleteWorkflow(root, 'w2')
    expect(fs.existsSync(wfRoot('w2'))).toBe(false)
    deleteWorkflow(root, 'ghost') // 静默
  })

  it('local-node CRUD：create-only + 剥后缀排序 + ghost 静默', () => {
    createWorkflow(root, 'w2')
    createWorkflowLocalNode(root, 'w2', '乙', '内容乙')
    createWorkflowLocalNode(root, 'w2', '甲', '内容甲')
    expect(() => createWorkflowLocalNode(root, 'w2', '甲', 'x')).toThrow('局部节点已存在: 甲')
    expect(listWorkflowLocalNodes(root, 'w2')).toEqual(['乙', '甲'])
    expect(readWorkflowLocalNode(root, 'w2', '甲')).toBe('内容甲')
    deleteWorkflowLocalNode(root, 'w2', '乙')
    expect(listWorkflowLocalNodes(root, 'w2')).toEqual(['甲'])
    deleteWorkflowLocalNode(root, 'w2', 'ghost') // 静默
    expect(listWorkflowLocalNodes(root, 'ghost-wf')).toEqual([]) // 目录不存在 → []
  })
})

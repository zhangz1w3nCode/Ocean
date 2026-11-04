import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { create } from '../instance'
import { next, complete, choose, fail, status } from '../executor'
import { readTraceJsonl, traceJsonlPath } from '../state'

const workflow = 'snap-wf'
const instanceId = 'inst-001'

interface FlowSpec {
  startLabel?: string
  p1Content?: string
  withP2?: boolean
  withDecision?: boolean
}

function flowJson(spec: FlowSpec = {}): string {
  const startLabel = spec.startLabel ?? '开始'
  const p1Content = spec.p1Content ?? '原始内容'

  if (spec.withDecision) {
    return JSON.stringify({
      name: workflow,
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: startLabel, branches: [] } },
        {
          id: 'd1', type: 'decision', position: { x: 200, y: 0 },
          data: {
            label: '判断一',
            condition: '是否通过',
            branches: [
              { id: 'b1', name: '通过' },
              { id: 'b2', name: '其他' },
            ],
          },
        },
        { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: '结束', branches: [] } },
      ],
      edges: [
        { source: 'start-1', target: 'd1' },
        { source: 'd1', target: 'end-1', branchId: 'b1' },
        { source: 'd1', target: 'end-1', branchId: 'b2' },
      ],
    })
  }

  const nodes: unknown[] = [
    { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: startLabel, branches: [] } },
    { id: 'p1', type: 'process', position: { x: 200, y: 0 }, data: { label: '步骤一', branches: [], content: p1Content } },
    { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: '结束', branches: [] } },
  ]
  if (spec.withP2) {
    nodes.push({
      id: 'p2', type: 'process', position: { x: 200, y: 200 },
      data: { label: '步骤二', branches: [], content: '步骤二内容' },
    })
  }
  return JSON.stringify({
    name: workflow,
    nodes,
    edges: [
      { source: 'start-1', target: 'p1' },
      { source: 'p1', target: 'end-1' },
    ],
  })
}

describe('instance flow.json snapshot', () => {
  let root: string
  let metaDir: string
  let sourceFlowPath: string

  const snapshotPath = () =>
    path.join(root, '.workflows', workflow, 'instance', instanceId, 'meta-data', 'flow.json')

  const writeSourceFlow = (spec?: FlowSpec) => {
    fs.writeFileSync(sourceFlowPath, flowJson(spec), 'utf-8')
  }

  const currentName = (): string => {
    const json = JSON.parse(status(root, workflow, instanceId, true))
    return json.current_name
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-instance-snapshot-'))
    metaDir = path.join(root, '.workflows', workflow, 'meta-data')
    fs.mkdirSync(metaDir, { recursive: true })
    sourceFlowPath = path.join(metaDir, 'flow.json')
    writeSourceFlow()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('create 时把 flow.json 快照到实例 meta-data 下，内容与源一致', () => {
    create(root, workflow, instanceId, '输入')
    expect(fs.existsSync(snapshotPath())).toBe(true)
    expect(fs.readFileSync(snapshotPath(), 'utf-8')).toBe(fs.readFileSync(sourceFlowPath, 'utf-8'))
  })

  it('改源 flow.json（改 start 标签）后 next 仍返回快照里的定义', async () => {
    create(root, workflow, instanceId, '输入')
    writeSourceFlow({ startLabel: '已被改名的开始' })
    const out = await next(root, workflow, instanceId, false)
    expect(out).toContain('## 开始')
    expect(out).not.toContain('已被改名的开始')
  })

  it('改源 flow.json（改 process 内联 content）后 next 仍返回快照内容', async () => {
    create(root, workflow, instanceId, '输入')
    await next(root, workflow, instanceId, false)
    writeSourceFlow({ p1Content: '被篡改内容' })
    await complete(root, workflow, instanceId, '开始节点产物')
    const out = await next(root, workflow, instanceId, false)
    expect(out).toContain('原始内容')
    expect(out).not.toContain('被篡改内容')
  })

  it('源 flow.json 被整体删除后，next / complete / fail 仍全部可用', async () => {
    create(root, workflow, instanceId, '输入')
    fs.rmSync(sourceFlowPath)

    const out = await next(root, workflow, instanceId, false)
    expect(out).toContain('## 开始')

    await complete(root, workflow, instanceId, '开始节点产物')
    expect(currentName()).toBe('步骤一')

    const afterNext = await next(root, workflow, instanceId, false)
    expect(afterNext).toContain('原始内容')

    expect(fail(root, workflow, instanceId, '故意失败')).toContain('已标记失败')
  })

  it('complete 的下一节点按快照计算，源被改成指向别的节点也不受影响', async () => {
    create(root, workflow, instanceId, '输入')
    await next(root, workflow, instanceId, false)

    // 源：删掉 p1，start 直接指向 p2
    fs.writeFileSync(sourceFlowPath, JSON.stringify({
      name: workflow,
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始', branches: [] } },
        { id: 'p2', type: 'process', position: { x: 200, y: 0 }, data: { label: '步骤二', branches: [], content: '步骤二内容' } },
        { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: '结束', branches: [] } },
      ],
      edges: [
        { source: 'start-1', target: 'p2' },
        { source: 'p2', target: 'end-1' },
      ],
    }), 'utf-8')

    await complete(root, workflow, instanceId, '开始节点产物')
    expect(currentName()).toBe('步骤一')
  })

  it('choose 的分支来自快照，源分支改名后仍能按快照分支选择', async () => {
    writeSourceFlow({ withDecision: true })
    create(root, workflow, instanceId, '输入')
    await next(root, workflow, instanceId, false)
    await complete(root, workflow, instanceId, '开始节点产物')

    const decisionOut = await next(root, workflow, instanceId, false)
    expect(decisionOut).toContain('通过')
    expect(decisionOut).toContain('其他')

    // 源：把分支名整体改掉
    fs.writeFileSync(sourceFlowPath, JSON.stringify({
      name: workflow,
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始', branches: [] } },
        {
          id: 'd1', type: 'decision', position: { x: 200, y: 0 },
          data: { label: '判断一', condition: '是否通过', branches: [{ id: 'b9', name: '改名分支' }] },
        },
        { id: 'end-1', type: 'end', position: { x: 400, y: 0 }, data: { label: '结束', branches: [] } },
      ],
      edges: [
        { source: 'start-1', target: 'd1' },
        { source: 'd1', target: 'end-1', branchId: 'b9' },
      ],
    }), 'utf-8')

    expect(choose(root, workflow, instanceId, '通过')).toContain('已选择分支 通过')
    expect(currentName()).toBe('结束')
  })

  it('没有快照的历史实例回退到源 flow.json', async () => {    create(root, workflow, instanceId, '输入')
    fs.rmSync(path.join(root, '.workflows', workflow, 'instance', instanceId, 'meta-data'), {
      recursive: true, force: true,
    })
    writeSourceFlow({ startLabel: '历史实例读的是源' })
    const out = await next(root, workflow, instanceId, false)
    expect(out).toContain('历史实例读的是源')
  })
})

describe('trace.jsonl node_id', () => {
  let root: string
  let sourceFlowPath: string

  const instDir = () => path.join(root, '.workflows', workflow, 'instance', instanceId)
  const traceText = () => fs.readFileSync(traceJsonlPath(instDir()), 'utf-8')

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-trace-nodeid-'))
    const metaDir = path.join(root, '.workflows', workflow, 'meta-data')
    fs.mkdirSync(metaDir, { recursive: true })
    sourceFlowPath = path.join(metaDir, 'flow.json')
    fs.writeFileSync(sourceFlowPath, flowJson(), 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('node_id 取自实例快照，源节点 id 改名后仍写快照 id', async () => {
    create(root, workflow, instanceId, '输入')

    // 源：把节点 id 整体改名
    const src = JSON.parse(fs.readFileSync(sourceFlowPath, 'utf-8'))
    for (const n of src.nodes) n.id = n.id + '-renamed'
    for (const e of src.edges) {
      e.source = e.source + '-renamed'
      e.target = e.target + '-renamed'
    }
    fs.writeFileSync(sourceFlowPath, JSON.stringify(src), 'utf-8')

    await next(root, workflow, instanceId, false)
    await complete(root, workflow, instanceId, '开始节点产物')
    await next(root, workflow, instanceId, false)

    const text = traceText()
    expect(text).toContain('"node":"开始","node_id":"start-1"')
    expect(text).toContain('"node":"步骤一","node_id":"p1"')
    expect(text).not.toContain('renamed')
  })

  it('choose 记录的 node_id 是决策节点 id', async () => {
    fs.writeFileSync(sourceFlowPath, flowJson({ withDecision: true }), 'utf-8')
    create(root, workflow, instanceId, '输入')
    await next(root, workflow, instanceId, false)
    await complete(root, workflow, instanceId, '开始节点产物')
    await next(root, workflow, instanceId, false)
    choose(root, workflow, instanceId, '通过')

    expect(traceText()).toContain('"node":"判断一","node_id":"d1"')
  })

  it('老格式（无 node_id）的历史 trace 行仍能正常解析', () => {
    const dir = instDir()
    fs.mkdirSync(path.join(dir, 'trace'), { recursive: true })
    fs.writeFileSync(
      traceJsonlPath(dir),
      '{"ts":"2026-01-01 00:00:00","command":"next","node":"开始","invoke":"invoke-1","status":"active"}\n',
      'utf-8',
    )
    const entries = readTraceJsonl(traceJsonlPath(dir))
    expect(entries).toHaveLength(1)
    expect(entries[0].node).toBe('开始')
    expect(entries[0].node_id).toBeUndefined()
  })
})
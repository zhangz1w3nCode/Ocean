import * as fs from 'node:fs'
import * as path from 'node:path'

import { Flow, fromFile, startNode, node as getNode } from './model'
import {
  Limits, ProcessFile, ProcessState, Status,
  genInvokeId, logTrace, TraceLogEntry, defaultLimits, formatLocalTime,
} from './state'

export function create(
  root: string,
  workflow: string,
  instanceId: string,
  input?: string,
  limits: Limits = defaultLimits(),
): string {
  const wfDir = path.join(root, '.workflows', workflow)
  const flowPath = path.join(wfDir, 'meta-data', 'flow.json')
  const flow = fromFile(flowPath)

  const start = startNode(flow)
  if (!start) throw new Error('工作流缺少 start 节点')

  const instDir = path.join(wfDir, 'instance', instanceId)
  try {
    fs.mkdirSync(instDir, { recursive: true })
  } catch (e: any) {
    throw new Error(`创建实例目录失败: ${e.message}`)
  }

  // 定义快照：实例创建时冻结 flow.json 的图结构（label/分支/边/内联 content），之后执行只读快照。
  // business/local 节点正文按 nodeRefPath 实时读，不在快照范围内。
  // 先写 .tmp 再 rename：避免进程中断留下被截断的快照，从而阻断实例执行。
  const snapFlowPath = path.join(instDir, 'meta-data', 'flow.json')
  const snapTmpPath = `${snapFlowPath}.tmp`
  try {
    fs.mkdirSync(path.dirname(snapFlowPath), { recursive: true })
    fs.copyFileSync(flowPath, snapTmpPath)
    fs.renameSync(snapTmpPath, snapFlowPath)
  } catch (e: any) {
    try { fs.rmSync(snapTmpPath, { force: true }) } catch { /* ignored */ }
    throw new Error(`复制 flow.json 快照失败: ${e.message}`)
  }

  const wfMd = path.join(wfDir, 'WORKFLOW.md')
  if (fs.existsSync(wfMd)) {
    try {
      fs.copyFileSync(wfMd, path.join(instDir, 'instance.md'))
    } catch (e: any) {
      throw new Error(`复制 instance.md 失败: ${e.message}`)
    }
  }

  const state: ProcessState = {
    workflow,
    instance_id: instanceId,
    initial_input: input,
    status: Status.Idle,
    current: start.id,
    current_name: start.data.label,
    current_invoke: genInvokeId(),
    step: 0,
    loop_count: 0,
    retry_count: 0,
    last_node: undefined,
    last_invoke: undefined,
    completed: [],
    limits,
  }

  const pf = new ProcessFile(state, '', [])
  pf.write(path.join(instDir, 'process.md'))

  try {
    logTrace(instDir, {
      ts: formatLocalTime(), command: 'instance create',
      node: undefined, invoke: undefined, status: undefined, branch: undefined,
    })
  } catch {
    // ignored
  }

  return instanceId
}

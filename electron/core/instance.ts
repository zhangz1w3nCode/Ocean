import * as fs from 'node:fs'
import * as path from 'node:path'

import { Flow, fromFile, startNode, node as getNode } from './model'
import { Graph } from './graph'
import {
  Limits, ProcessFile, ProcessState, Status,
  genInvokeId, logTrace, TraceLogEntry, defaultLimits, formatLocalTime,
} from './state'
import { renderMermaid } from './executor'

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
  const graph = new Graph(flow)

  const start = startNode(flow)
  if (!start) throw new Error('工作流缺少 start 节点')
  const firstId = graph.nextNode(start.id)
  const first = getNode(flow, firstId)
  if (!first) throw new Error('首个节点不存在')

  const instDir = path.join(wfDir, 'instance', instanceId)
  try {
    fs.mkdirSync(instDir, { recursive: true })
  } catch (e: any) {
    throw new Error(`创建实例目录失败: ${e.message}`)
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
    current: firstId,
    current_name: first.data.label,
    current_invoke: genInvokeId(),
    step: 0,
    loop_count: 0,
    retry_count: 0,
    last_node: undefined,
    last_invoke: undefined,
    completed: [],
    limits,
  }

  const mermaid = renderMermaid(flow, state, instDir)
  const pf = new ProcessFile(state, mermaid, [])
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

import * as fs from 'node:fs'
import * as path from 'node:path'

import { Flow, Node, node as getNode, startNode, fromFile } from './model'
import { Graph } from './graph'
import {
  ProcessFile, Status, TraceLogEntry, Limits, ProcessState,
  genInvokeId, logTrace, traceJsonlPath, readTraceJsonl,
  serializeStatus, statusAsStr, formatLocalTime, defaultLimits,
  sortedJsonStringifyCompact,
} from './state'
import { writeDetail, writeError, hasDetail } from './artifact'
import { checkStepLimit, checkLoopLimit, checkRetryLimit } from './limits'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function instanceDir(root: string, workflow: string, instanceId: string): string {
  return path.join(root, '.workflows', workflow, 'instance', instanceId)
}

function loadFlow(root: string, workflow: string): Flow {
  const filePath = path.join(root, '.workflows', workflow, 'meta-data', 'flow.json')
  return fromFile(filePath)
}

// ---------------------------------------------------------------------------
// next
// ---------------------------------------------------------------------------

export function next(root: string, workflow: string, instanceId: string, json: boolean): string {
  const instDir = instanceDir(root, workflow, instanceId)
  const pf = ProcessFile.read(path.join(instDir, 'process.md'))

  if (pf.state.status !== Status.Idle) {
    throw new Error('当前节点未完成，先 complete/choose')
  }

  const flow = loadFlow(root, workflow)
  const currentNode = getNode(flow, pf.state.current)
  if (!currentNode) throw new Error('当前节点不存在')

  if (currentNode.type === 'end') {
    pf.state.status = Status.Completed
    pf.appendTrace('completed', currentNode.data.label, '-')
    logTrace(instDir, {
      ts: formatLocalTime(), command: 'next',
      node: currentNode.data.label, invoke: '-', status: 'completed',
    })
    pf.mermaid = renderMermaid(flow, pf.state, instDir)
    pf.write(path.join(instDir, 'process.md'))
    return '工作流已完成'
  }

  const lastNode = pf.state.last_node
  const lastInvoke = pf.state.last_invoke
  if (lastNode && lastInvoke) {
    if (!hasDetail(root, workflow, instanceId, lastNode, lastInvoke)) {
      throw new Error(`节点 ${lastNode} (${lastInvoke}) 未写入产物，请补写后再 next`)
    }
  }

  pf.state.step += 1
  try {
    checkStepLimit(pf.state)
  } catch (e: any) {
    pf.state.status = Status.Aborted
    pf.mermaid = renderMermaid(flow, pf.state, instDir)
    pf.write(path.join(instDir, 'process.md'))
    throw e
  }

  pf.state.status = currentNode.type === 'decision' ? Status.AwaitingChoice : Status.Executing
  const invoke = pf.state.current_invoke
  pf.appendTrace('active', currentNode.data.label, invoke)
  logTrace(instDir, {
    ts: formatLocalTime(), command: 'next',
    node: currentNode.data.label, invoke, status: 'active',
  })
  pf.mermaid = renderMermaid(flow, pf.state, instDir)
  pf.write(path.join(instDir, 'process.md'))

  return renderNode(root, currentNode, pf.state.current_invoke, json)
}

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------

export function complete(root: string, workflow: string, instanceId: string, output: string): string {
  const instDir = instanceDir(root, workflow, instanceId)
  const pf = ProcessFile.read(path.join(instDir, 'process.md'))

  if (pf.state.status !== Status.Executing) {
    throw new Error('当前无执行中的业务节点')
  }
  if (output.trim() === '') {
    throw new Error('请通过 --output / --output-file / stdin 提供产物')
  }

  const flow = loadFlow(root, workflow)
  const graph = new Graph(flow)

  writeDetail(root, workflow, instanceId, pf.state.current_name, pf.state.current_invoke, output)

  const name = pf.state.current_name
  const invoke = pf.state.current_invoke
  pf.appendTrace('completed', name, invoke)
  logTrace(instDir, {
    ts: formatLocalTime(), command: 'complete',
    node: name, invoke, status: 'completed',
  })
  if (!pf.state.completed.includes(pf.state.current_name)) {
    pf.state.completed.push(pf.state.current_name)
  }

  const nextId = graph.nextNode(pf.state.current)
  const nextNode = getNode(flow, nextId)
  if (!nextNode) throw new Error('下一个节点不存在')
  const nextInvoke = genInvokeId()

  pf.state.last_node = pf.state.current_name
  pf.state.last_invoke = pf.state.current_invoke
  pf.state.current = nextId
  pf.state.current_name = nextNode.data.label
  pf.state.current_invoke = nextInvoke
  pf.state.retry_count = 0
  pf.state.status = Status.Idle
  pf.mermaid = renderMermaid(flow, pf.state, instDir)
  pf.write(path.join(instDir, 'process.md'))

  return `已推进到 ${nextNode.data.label}`
}

// ---------------------------------------------------------------------------
// fail
// ---------------------------------------------------------------------------

export function fail(root: string, workflow: string, instanceId: string, reason: string): string {
  const instDir = instanceDir(root, workflow, instanceId)
  const pf = ProcessFile.read(path.join(instDir, 'process.md'))

  if (pf.state.status !== Status.Executing) {
    throw new Error('当前无执行中的业务节点')
  }

  const flow = loadFlow(root, workflow)

  writeError(root, workflow, instanceId, pf.state.current_name, pf.state.current_invoke, reason)
  const name = pf.state.current_name
  const invoke = pf.state.current_invoke
  pf.appendTrace('failed', name, invoke)
  logTrace(instDir, {
    ts: formatLocalTime(), command: 'fail',
    node: name, invoke, status: 'failed',
  })

  pf.state.retry_count += 1
  try {
    checkRetryLimit(pf.state)
  } catch (e: any) {
    pf.state.status = Status.Aborted
    pf.mermaid = renderMermaid(flow, pf.state, instDir)
    pf.write(path.join(instDir, 'process.md'))
    throw e
  }

  pf.state.last_node = undefined
  pf.state.last_invoke = undefined
  pf.state.current_invoke = genInvokeId()
  pf.state.status = Status.Idle
  pf.mermaid = renderMermaid(flow, pf.state, instDir)
  pf.write(path.join(instDir, 'process.md'))

  return '已标记失败，可重新 next 重试'
}

// ---------------------------------------------------------------------------
// choose
// ---------------------------------------------------------------------------

export function choose(
  root: string, workflow: string, instanceId: string,
  branch: string, reason?: string,
): string {
  const instDir = instanceDir(root, workflow, instanceId)
  const pf = ProcessFile.read(path.join(instDir, 'process.md'))

  if (pf.state.status !== Status.AwaitingChoice) {
    throw new Error('当前无待决策节点')
  }

  const flow = loadFlow(root, workflow)
  const graph = new Graph(flow)
  const currentNode = getNode(flow, pf.state.current)
  if (!currentNode) throw new Error('决策节点不存在')

  const names = graph.branchNames(pf.state.current)
  if (!names.includes(branch)) {
    throw new Error(`分支 ${branch} 不存在，可选: ${names.join('/')}`)
  }

  const detail = reason != null
    ? `## 选择分支\n- ${branch}\n\n## 理由\n- ${reason}`
    : `## 选择分支\n- ${branch}`
  writeDetail(root, workflow, instanceId, pf.state.current_name, pf.state.current_invoke, detail)
  const name = pf.state.current_name
  const invoke = pf.state.current_invoke
  pf.appendTrace('completed', name, invoke, branch)
  logTrace(instDir, {
    ts: formatLocalTime(), command: 'choose',
    node: name, invoke, status: 'completed', branch,
  })
  if (!pf.state.completed.includes(pf.state.current_name)) {
    pf.state.completed.push(pf.state.current_name)
  }

  const branchObj = currentNode.data.branches.find((b) => b.name === branch)
  const branchId = branchObj?.id
  if (branchId && graph.isLoopBack(pf.state.current, branchId, pf.state.completed)) {
    pf.state.loop_count += 1
  }

  const nextId = graph.nextNode(pf.state.current, branchId)
  const nextNode = getNode(flow, nextId)
  if (!nextNode) throw new Error('下一个节点不存在')
  const nextInvoke = genInvokeId()

  pf.state.last_node = undefined
  pf.state.last_invoke = undefined
  pf.state.current = nextId
  pf.state.current_name = nextNode.data.label
  pf.state.current_invoke = nextInvoke
  pf.state.status = Status.Idle

  try {
    checkLoopLimit(pf.state)
  } catch (e: any) {
    pf.state.status = Status.Aborted
    pf.mermaid = renderMermaid(flow, pf.state, instDir)
    pf.write(path.join(instDir, 'process.md'))
    throw e
  }

  pf.mermaid = renderMermaid(flow, pf.state, instDir)
  pf.write(path.join(instDir, 'process.md'))
  return `已选择分支 ${branch}，推进到 ${nextNode.data.label}`
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

export function status(root: string, workflow: string, instanceId: string, json: boolean): string {
  const instDir = instanceDir(root, workflow, instanceId)
  const pf = ProcessFile.read(path.join(instDir, 'process.md'))
  const s = pf.state

  if (json) {
    return serializeProcessStateJson(s)
  }

  return (
    `| 字段 | 值 |\n|------|-----|\n` +
    `| 实例 | ${s.instance_id} |\n` +
    `| 工作流 | ${s.workflow} |\n` +
    `| 状态 | ${statusAsStr(s.status)} |\n` +
    `| 当前节点 | ${s.current_name} (${s.current_invoke}) |\n` +
    `| 步数 | ${s.step} |\n` +
    `| 环回次数 | ${s.loop_count} |\n` +
    `| 失败重试 | ${s.retry_count} |\n` +
    `| 限制 | max_steps=${s.limits.max_steps} / max_loop=${s.limits.max_loop} / max_retry=${s.limits.max_retry} |`
  )
}

function serializeProcessStateJson(state: ProcessState): string {
  const obj: Record<string, any> = {}
  obj.workflow = state.workflow
  obj.instance_id = state.instance_id
  if (state.initial_input != null) obj.initial_input = state.initial_input
  obj.status = serializeStatus(state.status)
  obj.current = state.current
  obj.current_name = state.current_name
  obj.current_invoke = state.current_invoke
  obj.step = state.step
  obj.loop_count = state.loop_count
  obj.retry_count = state.retry_count
  if (state.last_node != null) obj.last_node = state.last_node
  if (state.last_invoke != null) obj.last_invoke = state.last_invoke
  if (state.completed.length > 0) obj.completed = state.completed
  obj.limits = state.limits
  return JSON.stringify(obj, null, 2)
}

// ---------------------------------------------------------------------------
// list_workflows / list_instances
// ---------------------------------------------------------------------------

export function listWorkflows(root: string): string {
  const base = path.join(root, '.workflows')
  if (!fs.existsSync(base)) return ''
  const names: string[] = []
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(base, entry.name, 'meta-data', 'flow.json'))) {
      names.push(entry.name)
    }
  }
  names.sort()
  return names.join('\n')
}

export function listInstances(root: string, workflowFilter?: string): string {
  let out = '| 实例 | 工作流 | 状态 |\n|------|--------|------|\n'
  const base = path.join(root, '.workflows')
  if (!fs.existsSync(base)) return out

  const wfDirs: string[] = []
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (workflowFilter && entry.name !== workflowFilter) continue
    wfDirs.push(entry.name)
  }

  for (const wfName of wfDirs) {
    const instDir = path.join(base, wfName, 'instance')
    if (!fs.existsSync(instDir)) continue
    const ids: string[] = []
    for (const entry of fs.readdirSync(instDir, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.push(entry.name)
    }
    ids.sort()
    for (const id of ids) {
      let st = 'unknown'
      try {
        const pf = ProcessFile.read(path.join(instDir, id, 'process.md'))
        st = statusAsStr(pf.state.status)
      } catch {
        // read failure → unknown
      }
      out += `| ${id} | ${wfName} | ${st} |\n`
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// render_node (private)
// ---------------------------------------------------------------------------

function renderNode(root: string, node: Node, invoke: string, json: boolean): string {
  if (json) {
    if (node.type === 'decision') {
      return sortedJsonStringifyCompact({
        type: 'decision',
        node_id: node.id,
        node_name: node.data.label,
        invoke,
        condition: node.data.condition ?? null,
        branches: node.data.branches.map((b) => ({
          name: b.name,
          description: b.description ?? null,
        })),
      })
    }
    return sortedJsonStringifyCompact({
      type: node.type,
      node_id: node.id,
      node_name: node.data.label,
      invoke,
      content: readNodeMd(root, node),
    })
  }

  if (node.type === 'decision') {
    let s = '# 判断内容\n\n'
    s += node.data.condition ?? ''
    s += '\n\n# 可选分支\n\n'
    for (const b of node.data.branches) {
      if (b.description) {
        s += `- ${b.name} (${b.description})\n`
      } else {
        s += `- ${b.name}\n`
      }
    }
    return s
  }

  return readNodeMd(root, node)
}

function readNodeMd(root: string, node: Node): string {
  if (node.type === 'process') {
    return node.data.content ?? `process 节点 ${node.data.label} 缺少 content`
  }
  const refPath = node.data.nodeRefPath ?? ''
  if (!refPath) {
    return `节点 ${node.data.label} 缺少 nodeRefPath`
  }
  const full = path.join(root, refPath)
  let raw: string
  try {
    raw = fs.readFileSync(full, 'utf-8')
  } catch (e: any) {
    // 复刻 Rust std::io::Error Display 格式: "No such file or directory (os error 2)"
    const ioMsg = e.code === 'ENOENT'
      ? 'No such file or directory (os error 2)'
      : e.message
    return `节点文件缺失: ${full} (${ioMsg})`
  }
  return stripFrontmatter(raw)
}

function stripFrontmatter(content: string): string {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') {
    return content
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(i + 1).join('\n')
    }
  }
  return content
}

// ---------------------------------------------------------------------------
// mermaid rendering
// ---------------------------------------------------------------------------

function mermaidId(s: string): string {
  return [...s].map((c) => (/[\p{L}\p{N}_]/u.test(c) ? c : '_')).join('')
}

function nodeRefName(flow: Flow, id: string): string {
  const n = getNode(flow, id)
  if (n) {
    if (n.type === 'start') return 'start_node'
    if (n.type === 'end') return 'end_node'
    return mermaidId(n.data.label)
  }
  return mermaidId(id)
}

export function renderMermaid(flow: Flow, state: ProcessState, instDir: string): string {
  let s = '```mermaid\nflowchart TD\n\n'

  // visited set
  const visited = new Set<string>()
  visited.add('开始')
  for (const label of state.completed) {
    visited.add(label)
  }
  if (state.status !== Status.Idle) {
    visited.add(state.current_name)
  }

  // rebuild path from trace.jsonl
  const jsonlPath = traceJsonlPath(instDir)
  const logEntries = readTraceJsonl(jsonlPath)
  const traversedEdges = new Set<string>()
  const path: Array<[string, string | undefined]> = []

  for (const entry of logEntries) {
    if (entry.node == null || entry.status == null) continue
    if (entry.status === 'active') {
      path.push([entry.node, entry.branch])
    } else if (entry.status === 'completed' && entry.branch != null) {
      const last = path[path.length - 1]
      if (last) {
        last[1] = entry.branch
      }
    }
  }

  // map path to flow edges
  for (const [nodeLabel, branch] of path) {
    const n = flow.nodes.find((nd) => nd.data.label === nodeLabel)
    if (!n) continue
    for (const edge of flow.edges) {
      if (edge.source !== n.id) continue
      if (n.type === 'decision') {
        if (edge.branchId) {
          const ebn = n.data.branches.find((b) => b.id === edge.branchId)?.name
          if (ebn === branch) {
            traversedEdges.add(`${n.id}\0${edge.target}\0${edge.branchId ?? ''}`)
          }
        }
      } else {
        traversedEdges.add(`${n.id}\0${edge.target}\0`)
      }
    }
  }

  // start → first path node edge
  if (path.length > 0) {
    const start = flow.nodes.find((n) => n.type === 'start')
    if (start) {
      for (const edge of flow.edges) {
        if (edge.source === start.id) {
          const targetNode = getNode(flow, edge.target)
          if (targetNode && targetNode.data.label === path[0][0]) {
            traversedEdges.add(`${start.id}\0${edge.target}\0`)
          }
        }
      }
    }
  }

  // last path node → end edge if completed
  if (state.status === Status.Completed && path.length > 0) {
    const lastLabel = path[path.length - 1][0]
    const ln = flow.nodes.find((n) => n.data.label === lastLabel)
    if (ln) {
      for (const edge of flow.edges) {
        if (edge.source === ln.id) {
          const targetNode = getNode(flow, edge.target)
          if (targetNode && targetNode.type === 'end') {
            traversedEdges.add(`${ln.id}\0${edge.target}\0`)
          }
        }
      }
    }
  }

  // render visited nodes
  for (const n of flow.nodes) {
    if (!visited.has(n.data.label)) continue
    const name = nodeRefName(flow, n.id)
    if (n.type === 'start' || n.type === 'end') {
      s += `    ${name}([${n.data.label}])\n`
    } else if (n.type === 'decision') {
      s += `    ${name}{${n.data.label}}\n`
    } else {
      s += `    ${name}[${n.data.label}]\n`
    }
  }
  s += '\n'

  // render traversed edges (both endpoints must be visited)
  for (const edge of flow.edges) {
    const key = `${edge.source}\0${edge.target}\0${edge.branchId ?? ''}`
    if (!traversedEdges.has(key)) continue
    const srcNode = getNode(flow, edge.source)
    const dstNode = getNode(flow, edge.target)
    if (!srcNode || !dstNode) continue
    if (!visited.has(srcNode.data.label) || !visited.has(dstNode.data.label)) continue

    const src = nodeRefName(flow, edge.source)
    const dst = nodeRefName(flow, edge.target)
    if (edge.branchId) {
      const srcNd = getNode(flow, edge.source)
      const branchName = srcNd?.data.branches.find((b) => b.id === edge.branchId)?.name ?? ''
      s += `    ${src} -->|${branchName}| ${dst}\n`
    } else {
      s += `    ${src} --> ${dst}\n`
    }
  }
  s += '\n'

  // classDef + class assignments
  s += '    classDef done fill:#4caf50,color:#fff;\n'
  s += '    classDef current fill:#ff9800,color:#fff;\n\n'
  const doneNodes: string[] = []
  const currentNodes: string[] = []
  for (const n of flow.nodes) {
    if (!visited.has(n.data.label)) continue
    const name = nodeRefName(flow, n.id)
    if (n.type === 'start' || (n.type === 'end' && state.status === Status.Completed)) {
      doneNodes.push(name)
    } else if (state.current_name === n.data.label && state.status !== Status.Completed) {
      currentNodes.push(name)
    } else if (state.completed.includes(n.data.label)) {
      doneNodes.push(name)
    }
  }
  if (doneNodes.length > 0) {
    s += `    class ${doneNodes.join(',')} done;\n`
  }
  if (currentNodes.length > 0) {
    s += `    class ${currentNodes.join(',')} current;\n`
  }
  s += '```'
  return s
}

// ---------------------------------------------------------------------------
// instance_workflow reverse lookup (from main.rs)
// ---------------------------------------------------------------------------

export function instanceWorkflow(root: string, instanceId: string): string {
  const base = path.join(root, '.workflows')
  if (!fs.existsSync(base)) throw new Error(`实例不存在: ${instanceId}`)

  function walkDir(dir: string, depth: number): string | undefined {
    if (depth > 3) return undefined
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const childPath = path.join(dir, entry.name)
      if (entry.name === instanceId && path.basename(dir) === 'instance') {
        return path.basename(path.dirname(dir))
      }
      const found = walkDir(childPath, depth + 1)
      if (found) return found
    }
    return undefined
  }

  const wfName = walkDir(base, 1)
  if (!wfName) throw new Error(`实例不存在: ${instanceId}`)
  return wfName
}

// ---------------------------------------------------------------------------
// resolve_root (from main.rs)
// ---------------------------------------------------------------------------

export function resolveRoot(explicit?: string): string {
  if (explicit) return explicit
  let cwd = process.cwd()
  while (true) {
    if (fs.existsSync(path.join(cwd, '.workflows'))) return cwd
    const parent = path.dirname(cwd)
    if (parent === cwd) break
    cwd = parent
  }
  // cwd 向上找不到 .workflows/ 时，回退到 ~/.ocean/cli-root（Ocean 当前打开的项目）
  try {
    const home = process.env.HOME || ''
    if (home) {
      const cliRoot = fs.readFileSync(path.join(home, '.ocean', 'cli-root'), 'utf-8').trim()
      if (cliRoot && fs.existsSync(path.join(cliRoot, '.workflows'))) return cliRoot
    }
  } catch {
    // 忽略
  }
  throw new Error('未找到 .workflows 目录，请用 --root 指定项目根')
}

// ---------------------------------------------------------------------------
// resolve_asset_dir — read .ocean/asset-root.json, return '.pi' or '.claude'
// ---------------------------------------------------------------------------

export function resolveAssetDir(root: string): string {
  try {
    const configPath = path.join(root, '.ocean', 'asset-root.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.assetRoot === 'pi') return '.pi'
    }
  } catch {
    // ignore
  }
  return '.claude'
}

// ---------------------------------------------------------------------------
// read_output (from main.rs)
// ---------------------------------------------------------------------------

export function readOutput(output?: string, outputFile?: string): string {
  if (outputFile) {
    try {
      return fs.readFileSync(outputFile, 'utf-8')
    } catch (e: any) {
      throw new Error(`读取产物文件失败 ${outputFile}: ${e.message}`)
    }
  }
  if (output != null) return output
  // read stdin
  return fs.readFileSync(0, 'utf-8')
}

// ---------------------------------------------------------------------------
// log_trace_command (from main.rs)
// ---------------------------------------------------------------------------

export function logTraceCommand(root: string, workflow: string, instanceId: string, command: string): void {
  const instDir = instanceDir(root, workflow, instanceId)
  try {
    logTrace(instDir, {
      ts: formatLocalTime(), command,
      node: undefined, invoke: undefined, status: undefined, branch: undefined,
    })
  } catch {
    // ignored
  }
}

// ---------------------------------------------------------------------------
// gen_id (from main.rs) — re-export for convenience
// ---------------------------------------------------------------------------

export { genId } from './state'

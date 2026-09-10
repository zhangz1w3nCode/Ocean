import * as fs from 'node:fs'
import * as path from 'node:path'

import { Flow, Node, node as getNode, startNode, fromFile } from './model'
import { Graph } from './graph'
import {
  ProcessFile, Status, TraceLogEntry, Limits, ProcessState,
  genInvokeId, logTrace, traceJsonlPath, readTraceJsonl,
  serializeStatus, statusAsStr, formatLocalTime, defaultLimits,
  sortedJsonStringifyCompact, serializeProcessStateJson,
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
  const flow = loadFlow(root, workflow)
  const graph = new Graph(flow)
  const currentNode = getNode(flow, pf.state.current)
  if (!currentNode) throw new Error('当前节点不存在')

  if (output.trim() === '') {
    throw new Error('请通过 --output / --output-file / stdin 提供产物')
  }
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

  if (currentNode.type === 'end') {
    pf.state.status = Status.Completed
    pf.write(path.join(instDir, 'process.md'))
    return '工作流已完成'
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
  pf.write(path.join(instDir, 'process.md'))

  return `产物已保存，请执行 \`ocean workflow next --instance ${instanceId}\` 推进工作流并执行下一个节点的任务`
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
    pf.write(path.join(instDir, 'process.md'))
    throw e
  }

  pf.state.last_node = undefined
  pf.state.last_invoke = undefined
  pf.state.current_invoke = genInvokeId()
  pf.state.status = Status.Idle
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
    pf.write(path.join(instDir, 'process.md'))
    throw e
  }

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
  if (node.type === 'start') {
    return `## ${node.data.label}\n\n工作流已开始，请确认后推进到下一个节点。`
  }
  if (node.type === 'end') {
    return `## ${node.data.label}\n\n工作流已全部执行完毕，请生成详细的markdown报告。`
  }
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

#!/usr/bin/env -S node
// ocean CLI — Ocean 命令行工具（workflow CLI 改造为 ocean 命名空间）
// Usage: ocean [--root <path>] <namespace> [subcommand] [positional...] [--flags...]

import { resolveRoot, resolveAssetDir, instanceWorkflow, readOutput, logTraceCommand, listWorkflows, listInstances, next, complete, fail, choose, status } from '../core/executor'
import { create } from '../core/instance'
import { list, view, search, timeline, diff, update, contextSet, contextGet } from '../core/artifact_query'
import { genId } from '../core/state'
import { defaultLimits } from '../core/state'
import type { Limits } from '../core/state'

import * as wfGraph from '../core/workflow'
import Table from 'cli-table3'
import { handleTask, printTaskHelp } from '../source/cli/task'
import { handleResource, printResourceHelp } from '../source/cli/resource'
import { handleAgent, printAgentHelp } from '../source/cli/agent'
import { handleSkill, printSkillHelp } from '../source/cli/skill'
import { handleKnowledge, printKnowledgeHelp } from '../source/cli/knowledge'
import { handleNode, printNodeHelp } from '../source/cli/node'
import {
  parseArgs,
  getLimit,
  UsageError,
  readContent,
  stripFrontmatter,
  rawOut,
  displayWidth,
  out,
  TABLE_CHARS,
  printDataTable,
  printList,
  printJson,
  printAction,
  setHelpJsonBuffer,
  getHelpJsonBuffer,
} from '../source/cli/common'

// 无表头单列表格，用于包裹树形展示（左对齐保留缩进，行间无分隔线）
// （domain 树形版本已随 knowledge 域迁至 source/cli/knowledge.ts 的 printDomainBox）
function printMarkdownTable(text: string): void {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    rawOut(text)
    return
  }
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 3) {
    out(text || '（无数据）')
    return
  }
  if (!/^\|[\s-|]+\|$/.test(lines[1])) {
    out(text)
    return
  }
  const parseRow = (line: string) => line.split('|').map(s => s.trim()).filter(Boolean)
  printDataTable(parseRow(lines[0]), lines.slice(2).map(parseRow))
}

function markdownTableToJson(text: string): any[] {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 3) return []
  if (!/^\|[\s-|]+\|$/.test(lines[1])) return []
  const parseRow = (line: string) => line.split('|').map(s => s.trim()).filter(Boolean)
  const headers = parseRow(lines[0])
  return lines.slice(2).map(line => {
    const cells = parseRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || '' })
    return obj
  })
}

function err(e: any): void {
  const code = e instanceof UsageError ? 2 : 1
  const lines = e.message.split('\n')
  const widths = lines.map((l: string) => displayWidth(l))
  const maxW = Math.max(...widths, 0)
  const h = '\u2501'.repeat(maxW + 2)
  process.stderr.write('\u250f' + h + '\u2513\n')
  for (let i = 0; i < lines.length; i++) {
    const pad = ' '.repeat(maxW - widths[i])
    process.stderr.write('\u2503 ' + lines[i] + pad + ' \u2503\n')
  }
  process.stderr.write('\u2517' + h + '\u251b\n')
  process.exit(code)
}

// ---------------------------------------------------------------------------
// Help / Version
// ---------------------------------------------------------------------------

function getVersion(): string {
  const path = require('path')
  const candidates = [
    path.join(__dirname, '..', 'package.json'),
    path.join(__dirname, '..', '..', '..', 'package.json'),
  ]
  for (const p of candidates) {
    try {
      const pkg = require(p)
      if (pkg.version) return pkg.version
    } catch {}
  }
  return 'unknown'
}

function printVersion(): void {
  out(`ocean ${getVersion()}`)
}

function printHelp(namespace?: string, subcommand?: string, json: boolean = false): void {
  if (json) {
    setHelpJsonBuffer([])
  }
  if (!namespace) {
    out(`ocean — Ocean 命令行工具

用法: ocean [--root <path>] <namespace> [subcommand] [positional...] [--flags...]

全局选项:
  --root <path>      覆盖项目根目录
  --help, -h         显示帮助信息
  --version, -v      显示版本号

命名空间:
  workflow    工作流执行与图编辑
  node        节点 CRUD
  knowledge   知识 CRUD
  resource    资源 CRUD
  agent       智能体 CRUD
  skill       技能 CRUD
  task        任务库 CRUD
  config      配置管理

运行 'ocean <namespace> --help' 查看命名空间的详细用法。`)
    return
  }

  switch (namespace) {
    case 'workflow':
      if (subcommand) {
        switch (subcommand) {
          case 'instance':
            out(`ocean workflow instance — 创建工作流实例

用法: ocean workflow instance <name> [--flags...]

参数:
  <name>                      工作流名称（必填）

flag:
  --input <string>            初始输入内容（必填）
  --max-steps <n>             最大步数上限（默认 100）
  --max-loop <n>              最大循环次数上限（默认 10）
  --max-retry <n>             最大重试次数上限（默认 2）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录
`)
            break
          case 'next':
            out(`ocean workflow next — 拉取下一个节点内容

用法: ocean workflow next --instance <id> [--flags...]

flag:
  --instance <id>             实例 ID（必填）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录`)
            break
          case 'complete':
            out(`ocean workflow complete — 交产物并推进

用法: ocean workflow complete --instance <id> [--flags...]

flag:
  --instance <id>             实例 ID（必填）
  --output <string>           产物内容
  --output-file <path>        产物文件路径
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录`)
            break
          case 'fail':
            out(`ocean workflow fail — 标记失败

用法: ocean workflow fail --instance <id> --reason <string>

flag:
  --instance <id>             实例 ID（必填）
  --reason <string>           失败原因
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录`)
            break
          case 'choose':
            out(`ocean workflow choose — 决策分支选择

用法: ocean workflow choose --instance <id> --branch <name> --reason <string>

flag:
  --instance <id>             实例 ID（必填）
  --branch <name>             分支名称（必填）
  --reason <string>           选择原因（必填）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录`)
            break
          case 'status':
            out(`ocean workflow status — 查看进度

用法: ocean workflow status --instance <id> [--flags...]

flag:
  --instance <id>             实例 ID（必填）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录`)
            break
          case 'artifact':
            out(`ocean workflow artifact — 产物操作

用法: ocean workflow artifact <sub> --instance <id> [--flags...]

子命令:
  list                         列出所有产物
  view                         查看产物详情
  search                       按关键词搜索产物
  timeline                     产物时间线
  diff                         产物 diff
  update                       更新产物（自动创建新版本）

flag（所有子命令通用）:
  --instance <id>             实例 ID（必填）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录

flag（view 专用）:
  --node <id>                 节点 ID
  --invoke <id>               invoke ID
  --artifact-version <v>       版本号（如 v1、v2）

flag（search 专用）:
  --keyword <string>          搜索关键词

flag（diff 专用）:
  --node <id>                 节点 ID
  --invoke <id>               invoke ID（指定后对比同 invoke 的版本差异）
  --version-from <v>          起始版本号（如 v1）
  --version-to <v>            目标版本号（如 v2）
  --context <n>               上下文行数（默认 3）
  --full                       输出完整 diff

flag（update 专用）:
  --node <id>                 节点 ID（必填）
  --invoke <id>               invoke ID（必填）
  --output <string>           产物内容
  --output-file <path>        从文件读取产物内容`)
            break
          case 'context':
            out(`ocean workflow context — 上下文操作

用法: ocean workflow context <set|get> --instance <id> [--flags...]

子命令:
  set                          设置上下文
  get                          获取上下文

flag:
  --instance <id>             实例 ID（必填）
  --topic <string>            上下文主题（set 必填）
  --content <string>          上下文内容（set 必填）
  --json                       JSON 格式输出（get 专用）
  --root <path>               覆盖项目根目录`)
            break
          default:
            out(`未知的 workflow 子命令: ${subcommand}
运行 'ocean workflow --help' 查看可用子命令。`)
        }
        break
      }
      out(`ocean workflow — 工作流执行与图编辑

用法: ocean workflow <subcommand> [positional...] [--flags...]

执行子命令:
  list                          列出可用工作流
  instance <name>              创建工作流实例，返回 instance-id
  instance list                 列出实例
  next                          拉取下一个节点内容
  complete                      交产物并推进
  fail                          标记失败
  choose                        决策分支选择
  status                        查看进度
  artifact list/view/search/timeline/diff    产物操作
  context set/get               上下文操作

图编辑子命令:
  create <name>                创建工作流（初始化 start + end）
  add-node <name>              添加节点，返回 node ID
  connect <name>               连接节点
  add-branch <name>             添加分支（自动追加"其他"兜底）
  remove-node <name>           删除节点 + 关联边
  disconnect <name>            删除边
  list-nodes <name>            列出节点表格
  list-edges <name>            列出边表格
  read <name>                  读 WORKFLOW.md
  read-flow <name>             读 flow.json
  generate <name>              dagre 自动布局 + 生成 WORKFLOW.md
  doctor <name>                检查工作流完整性（10 项检查）
  delete <name>                删除工作流
  rename <old> <new>           重命名工作流
  local-node list/read/create/delete <wf> [name]   局部节点 CRUD

常用 flag:
  --instance <id>              实例 ID
  --json                       JSON 格式输出
  --root <path>                覆盖项目根目录`)
      break
    case 'node':
      printNodeHelp()
      break
    case 'knowledge':
      printKnowledgeHelp()
      break
    case 'resource':
      printResourceHelp()
      break
    case 'agent':
      printAgentHelp()
      break
    case 'skill':
      printSkillHelp()
      break
    case 'task':
      printTaskHelp(subcommand)
      break
    case 'config':
      out(`ocean config — 配置管理

用法: ocean config <subcommand>

子命令:
  asset-root                   查询当前资产来源（pi 或 claude）`)
      break
    default:
      out(`未知命名空间: ${namespace}

可用命名空间: workflow | node | knowledge | resource | agent | skill | task | config
运行 'ocean --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  // version 优先（eager，无需子命令）
  if (args.version) {
    args.flags.json ? printJson({ version: getVersion() }) : printVersion()
    return
  }

  // help 检查（ocean --help, ocean -h, ocean help [namespace], ocean <ns> --help）
  if (args.help) {
    printHelp(args.namespace, args.subcommand, !!args.flags.json)
    if (getHelpJsonBuffer() !== null) {
      printJson({ namespace: args.namespace || null, subcommand: args.subcommand || null, help: (getHelpJsonBuffer() as string[]).join('\n') })
      setHelpJsonBuffer(null)
    }
    return
  }

  // 无 namespace → 打印全局帮助（stdout, exit 0）
  if (!args.namespace) {
    printHelp()
    return
  }

  try {
    const root = resolveRoot(args.root)

    switch (args.namespace) {
      // === workflow execution + design ===
      case 'workflow':
        await handleWorkflow(root, args)
        break

      // === asset management ===
      case 'node':
        handleNode(root, args)
        break
      case 'knowledge':
        handleKnowledge(root, args)
        break
      case 'resource':
        handleResource(root, args)
        break
      case 'agent':
        handleAgent(root, args)
        break
      case 'skill':
        handleSkill(root, args)
        break
      case 'task':
        handleTask(root, args)
        break

      // === config ===
      case 'config':
        handleConfig(root, args)
        break

      default:
        throw new UsageError(`未知的命令: ${args.namespace}\n运行 'ocean --help' 查看可用命令。`)
    }
  } catch (e: any) {
    if (args.flags.json) {
      process.stderr.write(JSON.stringify({ error: e.message }) + '\n')
      process.exit(e instanceof UsageError ? 2 : 1)
    }
    err(e)
  }
}

// ---------------------------------------------------------------------------
// workflow: execution commands + design commands
// ---------------------------------------------------------------------------

async function handleWorkflow(root: string, args: ReturnType<typeof parseArgs>): Promise<void> {
  const cmd = args.subcommand

  switch (cmd) {
    // --- execution commands (ported from workflow.ts) ---
    case 'list':
      if (args.flags.json) printJson(listWorkflows(root).split('\n').filter(Boolean))
      else printList(listWorkflows(root).split('\n').filter(Boolean), '工作流')
      break

    case 'instance': {
      if (args.positional[0] === 'list') {
        const wf = typeof args.flags.workflow === 'string' ? args.flags.workflow : undefined
        if (args.flags.json) printJson(markdownTableToJson(listInstances(root, wf)))
        else printMarkdownTable(listInstances(root, wf))
      } else {
        const workflowName = args.positional[0]
        if (!workflowName) {
          throw new UsageError('创建实例时需要指定工作流名称: ocean workflow instance <name>')
        }
        if (args.flags.instance !== undefined) {
          throw new UsageError('创建实例时不支持 --instance 参数，实例 ID 由内部自动生成')
        }
        const id = genId()
        const limits: Limits = {
          max_steps: getLimit(args.flags, 'max-steps', 100),
          max_loop: getLimit(args.flags, 'max-loop', 10),
          max_retry: getLimit(args.flags, 'max-retry', 2),
        }
        const input = args.flags.input
        if (!input || typeof input !== 'string' || input.trim().length === 0) {
          throw new UsageError('创建实例时 --input <string> 为必填参数，不可为空')
        }
        create(root, workflowName, id, input, limits)
        args.flags.json ? printJson({ action: 'created', instanceId: id }) : printAction('created', { instanceId: id })
      }
      break
    }

    case 'next': {
      const id = args.flags.instance as string
      const json = args.flags.json === true
      const wf = instanceWorkflow(root, id)
      printMarkdownTable(await next(root, wf, id, json))
      break
    }

    case 'complete': {
      const id = args.flags.instance as string
      const wf = instanceWorkflow(root, id)
      const output = typeof args.flags.output === 'string' ? args.flags.output : undefined
      const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined
      const content = readOutput(output, outputFile)
      const message = await complete(root, wf, id, content)
      args.flags.json ? printJson({ message }) : printMarkdownTable(message)
      break
    }

    case 'fail': {
      const id = args.flags.instance as string
      const reason = args.flags.reason as string
      const wf = instanceWorkflow(root, id)
      args.flags.json ? printJson({ message: fail(root, wf, id, reason), reason }) : printMarkdownTable(fail(root, wf, id, reason))
      break
    }

    case 'choose': {
      const id = args.flags.instance as string
      const branch = args.flags.branch as string
      const reason = args.flags.reason
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        throw new UsageError('决策分支选择时 --reason <string> 为必填参数，不可为空')
      }
      const wf = instanceWorkflow(root, id)
      args.flags.json ? printJson({ message: choose(root, wf, id, branch, reason), branch }) : printMarkdownTable(choose(root, wf, id, branch, reason))
      break
    }

    case 'status': {
      const id = args.flags.instance as string
      const json = args.flags.json === true
      const wf = instanceWorkflow(root, id)
      logTraceCommand(root, wf, id, 'status')
      printMarkdownTable(status(root, wf, id, json))
      break
    }

    case 'artifact': {
      const id = args.flags.instance as string
      const json = args.flags.json === true
      const wf = instanceWorkflow(root, id)
      const sub = args.positional[0] || ''
      switch (sub) {
        case 'list':
          logTraceCommand(root, wf, id, 'artifact list')
          printMarkdownTable(list(root, wf, id, json))
          break
        case 'view': {
          logTraceCommand(root, wf, id, 'artifact view')
          const node = typeof args.flags.node === 'string' ? args.flags.node : undefined
          const invoke = typeof args.flags.invoke === 'string' ? args.flags.invoke : undefined
          const version = typeof args.flags['artifact-version'] === 'string' ? args.flags['artifact-version'] as string : undefined
          printMarkdownTable(view(root, wf, id, node, invoke, json, version))
          break
        }
        case 'search': {
          logTraceCommand(root, wf, id, 'artifact search')
          const keyword = args.flags.keyword as string
          printMarkdownTable(search(root, wf, id, keyword, json))
          break
        }
        case 'timeline':
          logTraceCommand(root, wf, id, 'artifact timeline')
          printMarkdownTable(timeline(root, wf, id, json))
          break
        case 'diff': {
          logTraceCommand(root, wf, id, 'artifact diff')
          const node = args.flags.node as string
          const context = typeof args.flags.context === 'string' ? parseInt(args.flags.context as string, 10) : 3
          const full = args.flags.full === true
          const invoke = typeof args.flags.invoke === 'string' ? args.flags.invoke : undefined
          const versionFrom = typeof args.flags['version-from'] === 'string' ? args.flags['version-from'] as string : undefined
          const versionTo = typeof args.flags['version-to'] === 'string' ? args.flags['version-to'] as string : undefined
          printMarkdownTable(diff(root, wf, id, node, json, context, full, invoke, versionFrom, versionTo))
          break
        }
        case 'update': {
          logTraceCommand(root, wf, id, 'artifact update')
          const node = args.flags.node as string
          const invoke = args.flags.invoke as string
          const output = typeof args.flags.output === 'string' ? args.flags.output : undefined
          const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined
          const content = readOutput(output, outputFile)
          args.flags.json ? printJson({ message: update(root, wf, id, node, invoke, content) }) : printMarkdownTable(update(root, wf, id, node, invoke, content))
          break
        }
        default:
          throw new Error(`未知的 artifact 子命令: ${sub}`)
      }
      break
    }

    case 'context': {
      const id = args.flags.instance as string
      const wf = instanceWorkflow(root, id)
      const sub = args.positional[0] || ''
      switch (sub) {
        case 'set': {
          logTraceCommand(root, wf, id, 'context set')
          const topic = args.flags.topic as string
          const content = args.flags.content as string
          args.flags.json ? (contextSet(root, wf, id, topic, content), printJson({ action: 'set', topic })) : printMarkdownTable(contextSet(root, wf, id, topic, content))
          break
        }
        case 'get': {
          logTraceCommand(root, wf, id, 'context get')
          const json = args.flags.json === true
          args.flags.json ? printJson({ context: contextGet(root, wf, id, false), instance: id }) : printMarkdownTable(contextGet(root, wf, id, json))
          break
        }
        default:
          throw new Error(`未知的 context 子命令: ${sub}`)
      }
      break
    }

    // --- design commands ---
    case 'create': {
      const name = args.positional[0]
      wfGraph.create(root, name)
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }

    case 'add-node': {
      const name = args.positional[0]
      const type = args.flags.type as string
      const label = args.flags.label as string
      const nodeRefPath = typeof args.flags['node-ref'] === 'string' ? args.flags['node-ref'] : undefined
      const content = (type === 'process' || type === 'local') ? readContent(args.flags) : undefined
      const condition = typeof args.flags.condition === 'string' ? args.flags.condition : undefined
      if (type === 'decision' && !condition?.trim()) {
        throw new Error('decision 节点必须提供判断内容（--condition 参数）')
      }
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const id = wfGraph.addNode(root, name, type, label, { nodeRefPath, content, condition, description })
      args.flags.json ? printJson({ action: 'added', nodeId: id }) : printAction('added', { nodeId: id })
      break
    }

    case 'connect': {
      const name = args.positional[0]
      const from = args.flags.from as string
      const to = args.flags.to as string
      const branch = typeof args.flags.branch === 'string' ? args.flags.branch : undefined
      const edgeId = wfGraph.connect(root, name, from, to, branch)
      args.flags.json ? printJson({ action: 'connected', edgeId }) : printAction('connected', { edgeId })
      break
    }

    case 'add-branch': {
      const name = args.positional[0]
      const nodeId = args.flags.node as string
      const branchName = args.flags.name as string
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const branchId = wfGraph.addBranch(root, name, nodeId, branchName, description)
      args.flags.json ? printJson({ action: 'added', branchId }) : printAction('added', { branchId })
      break
    }

    case 'remove-node': {
      const name = args.positional[0]
      const nodeId = args.flags.node as string
      wfGraph.removeNode(root, name, nodeId)
      args.flags.json ? printJson({ action: 'removed', nodeId }) : printAction('removed', { nodeId })
      break
    }

    case 'disconnect': {
      const name = args.positional[0]
      const from = args.flags.from as string
      const to = args.flags.to as string
      const branch = typeof args.flags.branch === 'string' ? args.flags.branch : undefined
      wfGraph.disconnect(root, name, from, to, branch)
      args.flags.json ? printJson({ action: 'disconnected', from, to }) : printAction('disconnected', { from, to })
      break
    }

    case 'list-nodes': {
      const name = args.positional[0]
      if (args.flags.json) printJson(markdownTableToJson(wfGraph.listNodes(root, name)))
      else printMarkdownTable(wfGraph.listNodes(root, name))
      break
    }

    case 'list-edges': {
      const name = args.positional[0]
      if (args.flags.json) printJson(markdownTableToJson(wfGraph.listEdges(root, name)))
      else printMarkdownTable(wfGraph.listEdges(root, name))
      break
    }

    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(wfGraph.readWorkflowMd(root, name)) }) : out(stripFrontmatter(wfGraph.readWorkflowMd(root, name)))
      break
    }

    case 'read-flow': {
      const name = args.positional[0]
      args.flags.json ? rawOut(wfGraph.readFlow(root, name)) : out(wfGraph.readFlow(root, name))
      break
    }

    case 'generate': {
      const name = args.positional[0]
      wfGraph.generate(root, name)
      args.flags.json ? printJson({ action: 'generated', workflow: name }) : printAction('generated', { workflow: name })
      break
    }
    case 'doctor': {
      const name = args.positional[0]
      const json = args.flags.json === true
      printMarkdownTable(wfGraph.doctor(root, name, json))
      break
    }

    case 'delete': {
      const name = args.positional[0]
      wfGraph.del(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }

    case 'rename': {
      const oldName = args.positional[0]
      const newName = args.positional[1]
      wfGraph.rename(root, oldName, newName)
      args.flags.json ? printJson({ action: 'renamed', from: oldName, to: newName }) : printAction('renamed', { from: oldName, to: newName })
      break
    }

    // --- local node ---
    case 'local-node': {
      const sub = args.positional[0] || ''
      const wfName = args.positional[1] || ''
      switch (sub) {
        case 'list':
          if (args.flags.json) printJson(wfGraph.listLocalNodes(root, wfName))
          else printList(wfGraph.listLocalNodes(root, wfName), '局部节点')
          break
        case 'read': {
          const nodeName = args.positional[2] || ''
          args.flags.json ? printJson({ content: stripFrontmatter(wfGraph.readLocalNode(root, wfName, nodeName)) }) : out(stripFrontmatter(wfGraph.readLocalNode(root, wfName, nodeName)))
          break
        }
        case 'create': {
          const nodeName = args.positional[2] || ''
          const content = readContent(args.flags)
          wfGraph.createLocalNode(root, wfName, nodeName, content)
          args.flags.json ? printJson({ action: 'created', name: nodeName }) : printAction('created', { name: nodeName })
          break
        }
        case 'delete': {
          const nodeName = args.positional[2] || ''
          wfGraph.delLocalNode(root, wfName, nodeName)
          args.flags.json ? printJson({ action: 'deleted', name: nodeName }) : printAction('deleted', { name: nodeName })
          break
        }
        default:
          throw new Error(`未知的 local-node 子命令: ${sub}`)
      }
      break
    }

    default:
      if (!cmd) {
        printHelp('workflow')
        return
      }
      throw new UsageError(`未知的 workflow 子命令: ${cmd}\n运行 'ocean workflow --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

function handleConfig(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'asset-root':
      args.flags.json ? printJson({ action: 'queried', 'asset-root': resolveAssetDir(root) }) : printAction('queried', { 'asset-root': resolveAssetDir(root) })
      break
    default:
      if (!cmd) {
        printHelp('config')
        return
      }
      throw new UsageError(`未知的 config 子命令: ${cmd}\n运行 'ocean config --help' 查看详细用法。`)
  }
}

main().catch((e: any) => {
  process.stderr.write((e?.message ?? String(e)) + '\n')
  process.exit(1)
})

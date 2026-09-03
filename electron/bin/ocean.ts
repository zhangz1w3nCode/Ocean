#!/usr/bin/env -S node
// ocean CLI — Ocean 命令行工具（workflow CLI 改造为 ocean 命名空间）
// Usage: ocean [--root <path>] <namespace> [subcommand] [positional...] [--flags...]

import { resolveRoot, resolveAssetDir, instanceWorkflow, readOutput, logTraceCommand, listWorkflows, listInstances, next, complete, fail, choose, status } from '../core/executor'
import { create } from '../core/instance'
import { list, view, search, timeline, diff, contextSet, contextGet } from '../core/artifact_query'
import { genId } from '../core/state'
import { defaultLimits } from '../core/state'
import type { Limits } from '../core/state'

import * as nodeCrud from '../core/node'
import * as knowledgeCrud from '../core/knowledge'
import * as resourceCrud from '../core/resource'
import * as agentCrud from '../core/agent'
import * as skillCrud from '../core/skill'
import * as wfGraph from '../core/workflow'

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  root?: string
  namespace: string
  subcommand: string
  positional: string[]
  flags: Record<string, string | boolean>
} {
  const args = argv.slice(2)
  let root: string | undefined
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}

  let i = 0
  let namespace = ''
  let subcommand = ''

  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === '--root') {
      root = args[++j]
    } else if (arg.startsWith('--root=')) {
      root = arg.substring(7)
    } else if (arg.startsWith('--')) {
      const key = arg.substring(2)
      const next = args[j + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        j++
      } else {
        flags[key] = true
      }
    } else {
      if (!namespace) {
        namespace = arg
      } else if (!subcommand) {
        subcommand = arg
      } else {
        positional.push(arg)
      }
    }
  }

  return { root, namespace, subcommand, positional, flags }
}

function getLimit(flags: Record<string, string | boolean>, key: string, fallback: number): number {
  const val = flags[key]
  if (typeof val === 'string') return parseInt(val, 10)
  return fallback
}

function readContent(flags: Record<string, string | boolean>): string {
  const content = typeof flags.content === 'string' ? flags.content : undefined
  const contentFile = typeof flags['content-file'] === 'string' ? flags['content-file'] : undefined
  if (contentFile) {
    try {
      return require('fs').readFileSync(contentFile, 'utf-8')
    } catch (e: any) {
      throw new Error(`读取内容文件失败 ${contentFile}: ${e.message}`)
    }
  }
  if (content != null) return content
  // read stdin
  return require('fs').readFileSync(0, 'utf-8')
}

function out(s: string): void {
  process.stdout.write(s + '\n')
}

function err(e: any): void {
  process.stderr.write(e.message + '\n')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv)

  try {
    const root = resolveRoot(args.root)

    switch (args.namespace) {
      // === workflow execution + design ===
      case 'workflow':
        handleWorkflow(root, args)
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

      // === config ===
      case 'config':
        handleConfig(root, args)
        break

      default:
        throw new Error(`未知的命令: ${args.namespace}\n用法: ocean <workflow|node|knowledge|resource|agent|skill|config> [...]`)
    }
  } catch (e: any) {
    err(e)
  }
}

// ---------------------------------------------------------------------------
// workflow: execution commands + design commands
// ---------------------------------------------------------------------------

function handleWorkflow(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand

  switch (cmd) {
    // --- execution commands (ported from workflow.ts) ---
    case 'list':
      out(listWorkflows(root))
      break

    case 'instance': {
      if (args.positional[0] === 'list') {
        const wf = typeof args.flags.workflow === 'string' ? args.flags.workflow : undefined
        out(listInstances(root, wf))
      } else {
        const workflowName = args.positional[0]
        const id = typeof args.flags.instance === 'string' ? args.flags.instance : genId()
        const limits: Limits = {
          max_steps: getLimit(args.flags, 'max-steps', 100),
          max_loop: getLimit(args.flags, 'max-loop', 10),
          max_retry: getLimit(args.flags, 'max-retry', 2),
        }
        const input = typeof args.flags.input === 'string' ? args.flags.input : undefined
        create(root, workflowName, id, input, limits)
        out(id)
      }
      break
    }

    case 'next': {
      const id = args.flags.instance as string
      const json = args.flags.json === true
      const wf = instanceWorkflow(root, id)
      out(next(root, wf, id, json))
      break
    }

    case 'complete': {
      const id = args.flags.instance as string
      const wf = instanceWorkflow(root, id)
      const output = typeof args.flags.output === 'string' ? args.flags.output : undefined
      const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined
      const content = readOutput(output, outputFile)
      out(complete(root, wf, id, content))
      break
    }

    case 'fail': {
      const id = args.flags.instance as string
      const reason = args.flags.reason as string
      const wf = instanceWorkflow(root, id)
      out(fail(root, wf, id, reason))
      break
    }

    case 'choose': {
      const id = args.flags.instance as string
      const branch = args.flags.branch as string
      const reason = typeof args.flags.reason === 'string' ? args.flags.reason : undefined
      const wf = instanceWorkflow(root, id)
      out(choose(root, wf, id, branch, reason))
      break
    }

    case 'status': {
      const id = args.flags.instance as string
      const json = args.flags.json === true
      const wf = instanceWorkflow(root, id)
      logTraceCommand(root, wf, id, 'status')
      out(status(root, wf, id, json))
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
          out(list(root, wf, id, json))
          break
        case 'view': {
          logTraceCommand(root, wf, id, 'artifact view')
          const node = typeof args.flags.node === 'string' ? args.flags.node : undefined
          const invoke = typeof args.flags.invoke === 'string' ? args.flags.invoke : undefined
          out(view(root, wf, id, node, invoke, json))
          break
        }
        case 'search': {
          logTraceCommand(root, wf, id, 'artifact search')
          const keyword = args.flags.keyword as string
          out(search(root, wf, id, keyword, json))
          break
        }
        case 'timeline':
          logTraceCommand(root, wf, id, 'artifact timeline')
          out(timeline(root, wf, id, json))
          break
        case 'diff': {
          logTraceCommand(root, wf, id, 'artifact diff')
          const node = args.flags.node as string
          const context = typeof args.flags.context === 'string' ? parseInt(args.flags.context as string, 10) : 3
          const full = args.flags.full === true
          out(diff(root, wf, id, node, json, context, full))
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
          out(contextSet(root, wf, id, topic, content))
          break
        }
        case 'get': {
          logTraceCommand(root, wf, id, 'context get')
          const json = args.flags.json === true
          out(contextGet(root, wf, id, json))
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
      out(`已创建工作流 ${name}`)
      break
    }

    case 'add-node': {
      const name = args.positional[0]
      const type = args.flags.type as string
      const label = args.flags.label as string
      const nodeRefPath = typeof args.flags['node-ref'] === 'string' ? args.flags['node-ref'] : undefined
      const content = (type === 'process' || type === 'local') ? readContent(args.flags) : undefined
      const condition = typeof args.flags.condition === 'string' ? args.flags.condition : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const id = wfGraph.addNode(root, name, type, label, { nodeRefPath, content, condition, description })
      out(id)
      break
    }

    case 'connect': {
      const name = args.positional[0]
      const from = args.flags.from as string
      const to = args.flags.to as string
      const branch = typeof args.flags.branch === 'string' ? args.flags.branch : undefined
      const edgeId = wfGraph.connect(root, name, from, to, branch)
      out(edgeId)
      break
    }

    case 'add-branch': {
      const name = args.positional[0]
      const nodeId = args.flags.node as string
      const branchName = args.flags.name as string
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const branchId = wfGraph.addBranch(root, name, nodeId, branchName, description)
      out(branchId)
      break
    }

    case 'remove-node': {
      const name = args.positional[0]
      const nodeId = args.flags.node as string
      wfGraph.removeNode(root, name, nodeId)
      out(`已删除节点 ${nodeId}`)
      break
    }

    case 'disconnect': {
      const name = args.positional[0]
      const from = args.flags.from as string
      const to = args.flags.to as string
      const branch = typeof args.flags.branch === 'string' ? args.flags.branch : undefined
      wfGraph.disconnect(root, name, from, to, branch)
      out(`已断开 ${from} → ${to}`)
      break
    }

    case 'list-nodes': {
      const name = args.positional[0]
      out(wfGraph.listNodes(root, name))
      break
    }

    case 'list-edges': {
      const name = args.positional[0]
      out(wfGraph.listEdges(root, name))
      break
    }

    case 'read': {
      const name = args.positional[0]
      out(wfGraph.readWorkflowMd(root, name))
      break
    }

    case 'read-flow': {
      const name = args.positional[0]
      out(wfGraph.readFlow(root, name))
      break
    }

    case 'generate': {
      const name = args.positional[0]
      wfGraph.generate(root, name)
      out(`已生成 WORKFLOW.md`)
      break
    }

    case 'doctor': {
      const name = args.positional[0]
      const json = args.flags.json === true
      out(wfGraph.doctor(root, name, json))
      break
    }

    case 'delete': {
      const name = args.positional[0]
      wfGraph.del(root, name)
      out(`已删除工作流 ${name}`)
      break
    }

    case 'rename': {
      const oldName = args.positional[0]
      const newName = args.positional[1]
      wfGraph.rename(root, oldName, newName)
      out(`已重命名 ${oldName} → ${newName}`)
      break
    }

    // --- local node ---
    case 'local-node': {
      const sub = args.positional[0] || ''
      const wfName = args.positional[1] || ''
      switch (sub) {
        case 'list':
          out(wfGraph.listLocalNodes(root, wfName).join('\n'))
          break
        case 'read': {
          const nodeName = args.positional[2] || ''
          out(wfGraph.readLocalNode(root, wfName, nodeName))
          break
        }
        case 'create': {
          const nodeName = args.positional[2] || ''
          const content = readContent(args.flags)
          wfGraph.createLocalNode(root, wfName, nodeName, content)
          out(`已创建局部节点 ${nodeName}`)
          break
        }
        case 'delete': {
          const nodeName = args.positional[2] || ''
          wfGraph.delLocalNode(root, wfName, nodeName)
          out(`已删除局部节点 ${nodeName}`)
          break
        }
        default:
          throw new Error(`未知的 local-node 子命令: ${sub}`)
      }
      break
    }

    default:
      throw new Error(`未知的 workflow 子命令: ${cmd}\n用法: ocean workflow <list|instance|next|complete|fail|choose|status|artifact|context|create|add-node|connect|add-branch|remove-node|disconnect|list-nodes|list-edges|read|read-flow|generate|doctor|delete|rename|local-node> [...]`)
  }
}

// ---------------------------------------------------------------------------
// node CRUD
// ---------------------------------------------------------------------------

function handleNode(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      out(nodeCrud.list(root).join('\n'))
      break
    case 'read': {
      const name = args.positional[0]
      out(nodeCrud.read(root, name))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      nodeCrud.create(root, name, content, { type, description })
      out(`已创建节点 ${name}`)
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      nodeCrud.update(root, name, content, { type, description })
      out(`已更新节点 ${name}`)
      break
    }
    case 'delete': {
      const name = args.positional[0]
      nodeCrud.del(root, name)
      out(`已删除节点 ${name}`)
      break
    }
    default:
      throw new Error(`未知的 node 子命令: ${cmd}\n用法: ocean node <list|read|create|update|delete> [...]`)
  }
}

// ---------------------------------------------------------------------------
// knowledge CRUD
// ---------------------------------------------------------------------------

function handleKnowledge(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      out(knowledgeCrud.list(root).join('\n'))
      break
    case 'read': {
      const relPath = args.positional[0]
      out(knowledgeCrud.read(root, relPath))
      break
    }
    case 'create': {
      const relPath = args.positional[0]
      const content = readContent(args.flags)
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const tagsStr = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : undefined
      knowledgeCrud.create(root, relPath, content, { description, tags })
      out(`已创建知识 ${relPath}`)
      break
    }
    case 'update': {
      const relPath = args.positional[0]
      const content = readContent(args.flags)
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const tagsStr = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      const tags = tagsStr !== undefined ? tagsStr.split(',').map(t => t.trim()) : undefined
      knowledgeCrud.update(root, relPath, content, { description, tags })
      out(`已更新知识 ${relPath}`)
      break
    }
    case 'delete': {
      const relPath = args.positional[0]
      knowledgeCrud.del(root, relPath)
      out(`已删除知识 ${relPath}`)
      break
    }
    default:
      throw new Error(`未知的 knowledge 子命令: ${cmd}\n用法: ocean knowledge <list|read|create|update|delete> [...]`)
  }
}

// ---------------------------------------------------------------------------
// resource CRUD
// ---------------------------------------------------------------------------

function handleResource(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      out(resourceCrud.list(root).join('\n'))
      break
    case 'read': {
      const name = args.positional[0]
      out(resourceCrud.read(root, name))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      resourceCrud.create(root, name, content, { type, description })
      out(`已创建资源 ${name}`)
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      resourceCrud.update(root, name, content, { type, description })
      out(`已更新资源 ${name}`)
      break
    }
    case 'delete': {
      const name = args.positional[0]
      resourceCrud.del(root, name)
      out(`已删除资源 ${name}`)
      break
    }
    default:
      throw new Error(`未知的 resource 子命令: ${cmd}\n用法: ocean resource <list|read|create|update|delete> [...]`)
  }
}

// ---------------------------------------------------------------------------
// agent CRUD
// ---------------------------------------------------------------------------

function handleAgent(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      out(agentCrud.list(root).join('\n'))
      break
    case 'read': {
      const name = args.positional[0]
      out(agentCrud.read(root, name))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      agentCrud.create(root, name, content, {
        description: typeof args.flags.description === 'string' ? args.flags.description : undefined,
        model: typeof args.flags.model === 'string' ? args.flags.model : undefined,
        color: typeof args.flags.color === 'string' ? args.flags.color : undefined,
        tools: typeof args.flags.tools === 'string' ? args.flags.tools : undefined,
        systemPromptMode: typeof args.flags['system-prompt-mode'] === 'string' ? args.flags['system-prompt-mode'] : undefined,
        inheritProjectContext: args.flags['inherit-project-context'] === true,
        inheritSkills: args.flags['inherit-skills'] === true,
      })
      out(`已创建智能体 ${name}`)
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      agentCrud.update(root, name, content, {
        description: typeof args.flags.description === 'string' ? args.flags.description : undefined,
        model: typeof args.flags.model === 'string' ? args.flags.model : undefined,
        color: typeof args.flags.color === 'string' ? args.flags.color : undefined,
        tools: typeof args.flags.tools === 'string' ? args.flags.tools : undefined,
        systemPromptMode: typeof args.flags['system-prompt-mode'] === 'string' ? args.flags['system-prompt-mode'] : undefined,
        inheritProjectContext: args.flags['inherit-project-context'] === true ? true : undefined,
        inheritSkills: args.flags['inherit-skills'] === true ? true : undefined,
      })
      out(`已更新智能体 ${name}`)
      break
    }
    case 'delete': {
      const name = args.positional[0]
      agentCrud.del(root, name)
      out(`已删除智能体 ${name}`)
      break
    }
    default:
      throw new Error(`未知的 agent 子命令: ${cmd}\n用法: ocean agent <list|read|create|update|delete> [...]`)
  }
}

// ---------------------------------------------------------------------------
// skill CRUD
// ---------------------------------------------------------------------------

function handleSkill(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      out(skillCrud.list(root).join('\n'))
      break
    case 'read': {
      const name = args.positional[0]
      out(skillCrud.read(root, name))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const description = args.flags.description as string
      skillCrud.create(root, name, content, description)
      out(`已创建技能 ${name}`)
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      skillCrud.update(root, name, content)
      out(`已更新技能 ${name}`)
      break
    }
    case 'delete': {
      const name = args.positional[0]
      skillCrud.del(root, name)
      out(`已删除技能 ${name}`)
      break
    }
    default:
      throw new Error(`未知的 skill 子命令: ${cmd}\n用法: ocean skill <list|read|create|update|delete> [...]`)
  }
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

function handleConfig(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'asset-root':
      out(resolveAssetDir(root))
      break
    default:
      throw new Error(`未知的 config 子命令: ${cmd}\n用法: ocean config <asset-root>`)
  }
}

main()

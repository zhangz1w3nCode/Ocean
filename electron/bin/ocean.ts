#!/usr/bin/env -S node
// ocean CLI — Ocean 命令行工具（workflow CLI 改造为 ocean 命名空间）
// Usage: ocean [--root <path>] <namespace> [subcommand] [positional...] [--flags...]

import { resolveRoot, resolveAssetDir } from '../core/executor'
import { handleTask, printTaskHelp } from '../source/cli/task'
import { handleResource, printResourceHelp } from '../source/cli/resource'
import { handleAgent, printAgentHelp } from '../source/cli/agent'
import { handleSkill, printSkillHelp } from '../source/cli/skill'
import { handleKnowledge, printKnowledgeHelp } from '../source/cli/knowledge'
import { handleNode, printNodeHelp } from '../source/cli/node'
import { handleWorkflow, printWorkflowHelp } from '../source/cli/workflow'
import {
  parseArgs,
  UsageError,
  displayWidth,
  out,
  printJson,
  printAction,
  setHelpJsonBuffer,
  getHelpJsonBuffer,
} from '../source/cli/common'

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
      printWorkflowHelp(subcommand)
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

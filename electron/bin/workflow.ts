#!/usr/bin/env -S node
// workflow CLI — TS rewrite of Rust workflow-cli
// Usage: node workflow.js [options] <command> [subcommand] ...

import { resolveRoot, instanceWorkflow, readOutput, logTraceCommand, listWorkflows, listInstances, next, complete, fail, choose, status } from '../core/executor'
import { create } from '../core/instance'
import { list, view, search, timeline, diff, contextSet, contextGet } from '../core/artifact_query'
import { genId } from '../core/state'
import { defaultLimits } from '../core/state'
import type { Limits } from '../core/state'

// ---------------------------------------------------------------------------
// Simple argument parser (all flags are --long value)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  root?: string
  command: string
  subcommand?: string
  positional: string[]
  flags: Record<string, string | boolean>
} {
  const args = argv.slice(2) // skip node + script
  let root: string | undefined
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}

  let i = 0
  // First, find the command (first non-flag argument, but --root is global)
  let command = ''
  let subcommand = ''
  const remaining: string[] = []

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
      if (!command) {
        command = arg
      } else if (!subcommand && (command === 'artifact' || command === 'context')) {
        subcommand = arg
      } else {
        positional.push(arg)
      }
    }
  }

  return { root, command, subcommand, positional, flags }
}

function getLimit(flags: Record<string, string | boolean>, key: string, fallback: number): number {
  const val = flags[key]
  if (typeof val === 'string') return parseInt(val, 10)
  return fallback
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv)

  try {
    const root = resolveRoot(args.root)

    switch (args.command) {
      case 'list': {
        process.stdout.write(listWorkflows(root) + '\n')
        break
      }

      case 'instance': {
        if (args.positional[0] === 'list') {
          const wf = typeof args.flags.workflow === 'string' ? args.flags.workflow : undefined
          process.stdout.write(listInstances(root, wf) + '\n')
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
          process.stdout.write(id + '\n')
        }
        break
      }

      case 'next': {
        const id = args.flags.instance as string
        const json = args.flags.json === true
        const wf = instanceWorkflow(root, id)
        process.stdout.write(next(root, wf, id, json) + '\n')
        break
      }

      case 'complete': {
        const id = args.flags.instance as string
        const wf = instanceWorkflow(root, id)
        const output = typeof args.flags.output === 'string' ? args.flags.output : undefined
        const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined
        const content = readOutput(output, outputFile)
        process.stdout.write(complete(root, wf, id, content) + '\n')
        break
      }

      case 'fail': {
        const id = args.flags.instance as string
        const reason = args.flags.reason as string
        const wf = instanceWorkflow(root, id)
        process.stdout.write(fail(root, wf, id, reason) + '\n')
        break
      }

      case 'choose': {
        const id = args.flags.instance as string
        const branch = args.flags.branch as string
        const reason = typeof args.flags.reason === 'string' ? args.flags.reason : undefined
        const wf = instanceWorkflow(root, id)
        process.stdout.write(choose(root, wf, id, branch, reason) + '\n')
        break
      }

      case 'status': {
        const id = args.flags.instance as string
        const json = args.flags.json === true
        const wf = instanceWorkflow(root, id)
        logTraceCommand(root, wf, id, 'status')
        process.stdout.write(status(root, wf, id, json) + '\n')
        break
      }

      case 'artifact': {
        const id = args.flags.instance as string
        const json = args.flags.json === true
        const wf = instanceWorkflow(root, id)
        switch (args.subcommand) {
          case 'list':
            logTraceCommand(root, wf, id, 'artifact list')
            process.stdout.write(list(root, wf, id, json) + '\n')
            break
          case 'view': {
            logTraceCommand(root, wf, id, 'artifact view')
            const node = typeof args.flags.node === 'string' ? args.flags.node : undefined
            const invoke = typeof args.flags.invoke === 'string' ? args.flags.invoke : undefined
            process.stdout.write(view(root, wf, id, node, invoke, json) + '\n')
            break
          }
          case 'search': {
            logTraceCommand(root, wf, id, 'artifact search')
            const keyword = args.flags.keyword as string
            process.stdout.write(search(root, wf, id, keyword, json) + '\n')
            break
          }
          case 'timeline':
            logTraceCommand(root, wf, id, 'artifact timeline')
            process.stdout.write(timeline(root, wf, id, json) + '\n')
            break
          case 'diff': {
            logTraceCommand(root, wf, id, 'artifact diff')
            const node = args.flags.node as string
            const context = typeof args.flags.context === 'string' ? parseInt(args.flags.context as string, 10) : 3
            const full = args.flags.full === true
            process.stdout.write(diff(root, wf, id, node, json, context, full) + '\n')
            break
          }
          default:
            throw new Error(`未知的 artifact 子命令: ${args.subcommand}`)
        }
        break
      }

      case 'context': {
        const id = args.flags.instance as string
        const wf = instanceWorkflow(root, id)
        switch (args.subcommand) {
          case 'set': {
            logTraceCommand(root, wf, id, 'context set')
            const topic = args.flags.topic as string
            const content = args.flags.content as string
            process.stdout.write(contextSet(root, wf, id, topic, content) + '\n')
            break
          }
          case 'get': {
            logTraceCommand(root, wf, id, 'context get')
            const json = args.flags.json === true
            process.stdout.write(contextGet(root, wf, id, json) + '\n')
            break
          }
          default:
            throw new Error(`未知的 context 子命令: ${args.subcommand}`)
        }
        break
      }

      default:
        throw new Error(`未知的命令: ${args.command}\n用法: workflow <list|instance|next|complete|fail|choose|status|artifact|context> [...]`)
    }
  } catch (e: any) {
    process.stderr.write(e.message + '\n')
    process.exit(1)
  }
}

main()

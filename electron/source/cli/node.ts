// ocean node CLI 适配层：把 core/node 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败（如「节点已存在」「节点不存在」）→ 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格）在本层完成。
// 由 bin/ocean.ts 的 handleNode 与 printHelp('node') 迁移而来（零行为变更）。

import {
  listNodes as listNodesCore,
  readNode as readNodeCore,
  createNode as createNodeCore,
  updateNode as updateNodeCore,
  delNode as delNodeCore,
} from '../../core/common'
import type { NodeWriteOpts } from '../../core/common'
import {
  UsageError,
  readContent,
  stripFrontmatter,
  out,
  printJson,
  printList,
  printAction,
} from './common'
import type { CliArgs } from './common'

// ---------------------------------------------------------------------------
// core 契约 → CLI 异常语义
// ---------------------------------------------------------------------------

function unwrap<T>(res: { success: boolean; error?: string } & Partial<T>, fallback: string): T {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
  return res as T
}

function unwrapOk(res: { success: boolean; error?: string }, fallback: string): void {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
}

export function listNodes(root: string): string[] {
  return unwrap<{ names: string[] }>(listNodesCore(root), '列出节点失败').names || []
}

// 返回原文（含 frontmatter）；文件不存在时 core 保留系统错误原文（ENOENT）
export function readNode(root: string, name: string): string {
  return unwrap<{ content: string }>(readNodeCore(root, name), '读取节点失败').content
}

export function createNode(root: string, name: string, content: string, opts?: NodeWriteOpts): void {
  unwrapOk(createNodeCore(root, name, content, opts), '创建节点失败')
}

export function updateNode(root: string, name: string, content: string, opts?: NodeWriteOpts): void {
  unwrapOk(updateNodeCore(root, name, content, opts), '更新节点失败')
}

export function delNode(root: string, name: string): void {
  unwrapOk(delNodeCore(root, name), '删除节点失败')
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printNodeHelp(): void {
  out(`ocean node — 节点 CRUD

用法: ocean node <subcommand> <name> [--flags...]

子命令:
  list                          列出所有节点
  read <name>                  读取节点内容
  create <name>                创建节点
  update <name>                更新节点
  delete <name>                删除节点

常用 flag:
  --type <type>                节点类型
  --description <text>         节点描述
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleNode(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(listNodes(root))
      else printList(listNodes(root), '节点')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(readNode(root, name)) }) : out(stripFrontmatter(readNode(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      createNode(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      updateNode(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      delNode(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printNodeHelp()
        return
      }
      throw new UsageError(`未知的 node 子命令: ${cmd}\n运行 'ocean node --help' 查看详细用法。`)
  }
}

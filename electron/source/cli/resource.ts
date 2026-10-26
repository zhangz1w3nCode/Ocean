// ocean resource CLI 适配层：把 core/resource 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败（如「资源已存在」「资源不存在」）→ 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格）在本层完成。
// 由 bin/ocean.ts 的 handleResource 与 printHelp('resource') 迁移而来（零行为变更）。

import {
  listResources as listResourcesCore,
  readResource as readResourceCore,
  createResource as createResourceCore,
  updateResource as updateResourceCore,
  delResource as delResourceCore,
} from '../../core/common'
import type { ResourceWriteOpts } from '../../core/common'
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

// 业务校验失败在 core 是 { success:false, error }，对 CLI 而言就是执行失败 → 抛出，
// 由 main() 统一按运行时错误（exit 1）输出。
function unwrap<T>(res: { success: boolean; error?: string } & Partial<T>, fallback: string): T {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
  return res as T
}

// 无数据返回的操作（create/update/delete）：只关心成功/失败
function unwrapOk(res: { success: boolean; error?: string }, fallback: string): void {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
}

export function listResources(root: string): string[] {
  return unwrap<{ names: string[] }>(listResourcesCore(root), '列出资源失败').names || []
}

// 返回原文（含 frontmatter）；文件不存在时 core 保留系统错误原文（ENOENT），与迁移前 CLI 输出一致
export function readResource(root: string, name: string): string {
  return unwrap<{ content: string }>(readResourceCore(root, name), '读取资源失败').content
}

export function createResource(root: string, name: string, content: string, opts?: ResourceWriteOpts): void {
  unwrapOk(createResourceCore(root, name, content, opts), '创建资源失败')
}

export function updateResource(root: string, name: string, content: string, opts?: ResourceWriteOpts): void {
  unwrapOk(updateResourceCore(root, name, content, opts), '更新资源失败')
}

export function delResource(root: string, name: string): void {
  unwrapOk(delResourceCore(root, name), '删除资源失败')
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printResourceHelp(): void {
  out(`ocean resource — 资源 CRUD

用法: ocean resource <subcommand> <name> [--flags...]

子命令:
  list                          列出所有资源
  read <name>                  读取资源内容
  create <name>                创建资源
  update <name>                更新资源
  delete <name>                删除资源

常用 flag:
  --type <type>                资源类型
  --description <text>         资源描述
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleResource(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(listResources(root))
      else printList(listResources(root), '资源')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(readResource(root, name)) }) : out(stripFrontmatter(readResource(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      createResource(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      updateResource(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      delResource(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printResourceHelp()
        return
      }
      throw new UsageError(`未知的 resource 子命令: ${cmd}\n运行 'ocean resource --help' 查看详细用法。`)
  }
}

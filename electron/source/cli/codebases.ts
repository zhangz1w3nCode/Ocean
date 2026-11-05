import * as codebaseCore from '../../core/codebases'
import type { CodebaseResult, CodebaseInfo, SearchHit } from '../../core/codebases'
import { UsageError, printAction, printJson, printList, readContent, out } from './common'

// CLI 端适配层：入口负责参数解析与用法拦截，出口负责输出格式与退出码。
// 业务结果统一来自 core 的 { success } 契约，失败抛 Error（exit 1），
// 用法错误抛 UsageError（exit 2），由 CLI 入口 main() 统一捕获。

type Args = {
  subcommand: string
  positional: string[]
  flags: Record<string, string | boolean>
}

function unwrap<T>(r: CodebaseResult<T>): T & { success: true } {
  if (!r.success) throw new Error(r.error)
  return r as T & { success: true }
}

function getNumberFlag(flags: Record<string, string | boolean>, key: string, fallback: number): number {
  const val = flags[key]
  if (typeof val === 'string') {
    const n = parseInt(val, 10)
    return Number.isNaN(n) ? fallback : n
  }
  return fallback
}

export async function handleCodebases(root: string, args: Args): Promise<void> {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list': {
      const r = unwrap(await codebaseCore.list(root))
      if (args.flags.json) {
        printJson(r.codebases)
      } else {
        printList(r.codebases.map((c: CodebaseInfo) => c.name), '名称')
      }
      break
    }

    case 'create': {
      const name = args.positional[0]
      if (!name) throw new UsageError('用法: ocean codebases create <name> [--url <repo> | --from-local <path> | --description <text> | --content "文本"]')
      const url = typeof args.flags.url === 'string' ? args.flags.url.trim() : ''
      const fromLocal = typeof args.flags['from-local'] === 'string' ? args.flags['from-local'].trim() : ''
      const description = typeof args.flags.description === 'string' ? args.flags.description : ''
      if (url && fromLocal) throw new UsageError('--url 与 --from-local 不能同时使用')
      const type = url ? 'url' as const : fromLocal ? 'local' as const : 'blank' as const
      if (type === 'url' && !url) throw new UsageError('URL 添加方式必须提供 --url <repo>')
      if (type === 'local' && !fromLocal) throw new UsageError('本地添加方式必须提供 --from-local <path>')
      // 空项目方式：--content 直接作为 README 初始内容（与桌面端一致）
      const content = type === 'blank' && typeof args.flags.content === 'string' ? args.flags.content : undefined

      unwrap(await codebaseCore.create(root, name, { type, url, sourcePath: fromLocal, description, content }))
      args.flags.json
        ? printJson({ action: 'created', name })
        : printAction('created', { name })
      break
    }

    case 'update': {
      const name = args.positional[0]
      if (!name) throw new UsageError('用法: ocean codebases update <name> (--content "文本" | --content-file <path> | stdin)')
      const content = readContent(args.flags)
      unwrap(await codebaseCore.update(root, name, content))
      args.flags.json
        ? printJson({ action: 'updated', name })
        : printAction('updated', { name })
      break
    }

    case 'delete': {
      const name = args.positional[0]
      if (!name) throw new UsageError('用法: ocean codebases delete <name>')
      unwrap(await codebaseCore.del(root, name))
      args.flags.json
        ? printJson({ action: 'deleted', name })
        : printAction('deleted', { name })
      break
    }

    case 'search': {
      const keyword = args.positional[0]
      if (!keyword) throw new UsageError('用法: ocean codebases search <keyword> [--top N] [--context N]')
      const top = getNumberFlag(args.flags, 'top', 5)
      const context = getNumberFlag(args.flags, 'context', 2)
      if (top < 1) throw new UsageError('--top 必须是正整数')
      if (context < 0) throw new UsageError('--context 必须是非负整数')
      const r = unwrap(await codebaseCore.search(root, keyword, { top, context }))
      if (args.flags.json) {
        printJson(r.results)
      } else if (r.results.length === 0) {
        out('（无命中）')
      } else {
        for (const item of r.results) {
          out(`${item.name}（${item.matches.length} 处命中）`)
          for (const m of item.matches) {
            const lines = [
              ...m.before.map(l => `  ${l}`),
              `> ${m.line}: ${m.text}`,
              ...m.after.map(l => `  ${l}`),
            ]
            out(lines.join('\n'))
          }
        }
      }
      break
    }

    default:
      if (!cmd) {
        throw new UsageError("运行 'ocean codebases --help' 查看详细用法。")
      }
      throw new UsageError(`未知的 codebases 子命令: ${cmd}\n运行 'ocean codebases --help' 查看详细用法。`)
  }
}

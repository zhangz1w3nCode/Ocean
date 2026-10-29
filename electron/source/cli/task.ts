// ocean task CLI 侧适配层（自 electron/bin/ocean.ts handleTask 原样平移）。
// 入口负责参数解析与用法拦截（UsageError → exit 2），出口负责输出格式与退出码。
// 业务结果统一来自 core 的 { success } 契约，业务失败抛 Error（exit 1），
// 由 CLI 入口 main() 统一捕获。
import * as taskCore from '../../core/task'
import type { TaskSummary, TaskDetail, TaskWritePayload, TaskContextPayload, TaskSearchResult } from '../../core/task'
import { UsageError, printAction, printJson, printDataTable, rawOut, out } from './common'

type Args = {
  subcommand: string
  positional: string[]
  flags: Record<string, string | boolean>
}

function unwrap<T>(r: taskCore.TaskResult<T>): T & { success: true } {
  if (!r.success) throw new Error(r.error)
  return r as T & { success: true }
}

// 数值 flag：与 ocean.ts getLimit 语义一致（parseInt，NaN 交由 core 侧默认值兜底）
function getLimit(flags: Record<string, string | boolean>, key: string, fallback: number): number {
  const val = flags[key]
  if (typeof val === 'string') return parseInt(val, 10)
  return fallback
}

// 标量 flag：值为布尔说明 flag 后面跟的是下一个 --flag（或值缺失），必须报错而不是静默忽略
function strFlag(key: string, args: Args): string | undefined {
  const v = args.flags[key]
  if (v === true) throw new UsageError(`--${key} 缺少值（紧跟其后的 -- 开头内容会被当成另一个 flag）`)
  return typeof v === 'string' ? v : undefined
}

// 逗号分隔数组 flag
function listFlag(key: string, args: Args): string[] | undefined {
  const v = strFlag(key, args)
  return v === undefined ? undefined : v.split(',').map(s => s.trim()).filter(Boolean)
}

// 显式清空：--no-handler / --no-repo / --no-tags / --no-related
function cleared(key: string, args: Args): boolean {
  const v = args.flags[`no-${key}`]
  if (typeof v === 'string') throw new UsageError(`--no-${key} 是开关，不接受值；要设值请用 --${key} <值>`)
  return v !== undefined
}

// 内容只允许 --content 参数传入（与 ocean knowledge 的约定一致）：
// 禁用 --content-file 与 stdin，防止把整份文件（很可能自带 YAML frontmatter）灌进正文，
// 破坏 TASK.md / 上下文文档原有的头。长内容用 --content "$(cat 文件)"。
function taskContent(label: string, args: Args): string | undefined {
  if (args.flags['content-file'] !== undefined) {
    throw new UsageError(`${label}不支持 --content-file，只能用 --content 传入（长内容可 --content "$(cat 文件)"）`)
  }
  const v = args.flags.content
  if (v === true) {
    // 正文以 --- 开头时，parseArgs 会把它当成下一个 flag（ocean knowledge 同样如此），
    // 因此这里必须把「frontmatter 开头」作为最常见成因写进文案
    throw new UsageError(`--content 缺少值，或正文以 -- 开头（如 YAML frontmatter 的 ---）——请剥掉 frontmatter 只传正文；长内容可 --content "$(cat 文件)"`)
  }
  if (typeof v !== 'string') return undefined
  if (v.trimStart().startsWith('---')) {
    throw new UsageError(`${label}开头不能包含 YAML frontmatter（检测到以 --- 开头）：只传正文，YAML 头由系统维护`)
  }
  return v
}

// 状态 flag：取值先校验，避免无效值静默当作未提供
function statusFlag(args: Args): string | undefined {
  const status = strFlag('status', args)
  if (status !== undefined && !(taskCore.TASK_STATUSES as readonly string[]).includes(status)) {
    throw new UsageError(`无效的状态：${status}，可选：${taskCore.TASK_STATUSES.join(' | ')}`)
  }
  return status
}

function taskName(cmd: string, args: Args): string {
  const name = cmd === 'context' ? args.positional[1] : args.positional[0]
  if (!name) throw new UsageError(`缺少任务名称: ocean task ${cmd === 'context' ? `${args.positional[0]} <name>` : `${cmd} <name>`}`)
  return name
}

// 列表过滤：与桌面端任务库同一套语义 —— 状态精确匹配，
// 关键词对 名称/处理人/关联仓库/标签/状态 做大小写不敏感的子串匹配。
export function filterTasks(tasks: TaskSummary[], status?: string, keyword?: string): TaskSummary[] {
  const q = (keyword || '').toLowerCase()
  return tasks.filter((task) => {
    if (status && task.status !== status) return false
    if (!q) return true
    return task.name.toLowerCase().includes(q) ||
      task.handler.toLowerCase().includes(q) ||
      task.repo.some(r => r.toLowerCase().includes(q)) ||
      task.tags.some(t => t.toLowerCase().includes(q)) ||
      task.status.toLowerCase().includes(q)
  })
}

export async function handleTask(root: string, args: Args): Promise<void> {
  const cmd = args.subcommand
  const json = args.flags.json === true

  switch (cmd) {
    case 'list': {
      const tasks = filterTasks((unwrap(await taskCore.listTasks(root)).tasks) || [], statusFlag(args), strFlag('keyword', args))
      if (json) {
        printJson(tasks)
      } else {
        printDataTable(
          ['任务', '状态', '处理人', '关联仓库', '标签', '更新时间'],
          tasks.map(t => [t.name, t.status, t.handler || '-', t.repo.join(',') || '-', t.tags.join(',') || '-', t.updatedAt || '-']),
        )
      }
      break
    }

    case 'read': {
      const name = taskName(cmd, args)
      const detail: TaskDetail = unwrap(await taskCore.readTaskDetail(root, name)).detail
      if (json) {
        printJson(detail)
        break
      }
      const t = detail.task
      printDataTable(['字段', '值'], [
        ['名称', t.name],
        ['状态', t.status],
        ['处理人', t.handler || '-'],
        ['关联仓库', t.repo.join(', ') || '-'],
        ['标签', t.tags.join(', ') || '-'],
        ['关联任务', t.relatedTasks.join(', ') || '-'],
        ['创建时间', t.createdAt || '-'],
        ['更新时间', t.updatedAt || '-'],
        ['上下文', detail.contexts.map(c => c.name).join(', ') || '-'],
        ['事件数', String(detail.trace.length)],
      ])
      out(t.content ? t.content.trim() : '（无任务内容）')
      break
    }

    case 'create': {
      const name = taskName(cmd, args)
      const content = taskContent('任务内容', args)
      if (content === undefined || content.trim() === '') {
        throw new UsageError('创建任务必须通过 --content 传入任务内容（长内容可 --content "$(cat 文件)"），不支持 --content-file / stdin')
      }
      const payload: TaskWritePayload = { name, content }
      const handler = strFlag('handler', args)
      if (handler !== undefined) payload.handler = handler
      const repo = listFlag('repo', args)
      if (repo) payload.repo = repo
      const tags = listFlag('tags', args)
      if (tags) payload.tags = tags
      const related = listFlag('related', args)
      if (related) payload.relatedTasks = related
      const context = strFlag('context', args)
      if (context !== undefined) payload.context = context
      const task = unwrap(await taskCore.createTask(root, payload)).task
      if (json) printJson({ action: 'created', task })
      else printAction('created', { name: task.name, status: task.status })
      break
    }

    case 'update': {
      const name = taskName(cmd, args)
      const status = statusFlag(args)
      // 先取原值：core 的 update 是全量覆写语义，CLI 未显式提供的字段必须回填，否则会被清空
      const current = unwrap(await taskCore.readTaskDetail(root, name)).detail.task
      const content = taskContent('任务内容', args)
      if (content !== undefined && content.trim() === '') {
        throw new UsageError('任务内容不能为空；只改其它字段时请不要传 --content')
      }
      const handlerFlag = strFlag('handler', args)
      const repoFlag = listFlag('repo', args)
      const tagsFlag = listFlag('tags', args)
      const relatedFlag = listFlag('related', args)
      const payload: TaskWritePayload = {
        name,
        content: content !== undefined ? content : current.content,
        handler: cleared('handler', args) ? '' : (handlerFlag !== undefined ? handlerFlag : current.handler),
        repo: cleared('repo', args) ? [] : (repoFlag !== undefined ? repoFlag : current.repo),
        tags: cleared('tags', args) ? [] : (tagsFlag !== undefined ? tagsFlag : current.tags),
        relatedTasks: cleared('related', args) ? [] : (relatedFlag !== undefined ? relatedFlag : current.relatedTasks),
      }
      if (status !== undefined) payload.status = status
      const task = unwrap(await taskCore.updateTask(root, payload)).task
      if (json) printJson({ action: 'updated', task })
      else printAction('updated', { name: task.name, status: task.status, handler: task.handler || '-' })
      break
    }

    case 'search': {
      const keyword = args.positional[0]
      if (!keyword) throw new UsageError('用法: ocean task search <keyword> [--top N] [--context N] [--status <状态>]')
      const status = statusFlag(args)
      const results: TaskSearchResult[] = (unwrap(await taskCore.searchTasks(root, keyword, {
        top: getLimit(args.flags, 'top', 5),
        context: getLimit(args.flags, 'context', 2),
        status,
      })).results) || []
      if (json) {
        printJson(results)
      } else if (results.length === 0) {
        rawOut(`未命中：${keyword}（只检索任务正文与上下文正文，摘要字段请用 ocean task list --keyword）`)
      } else {
        const lines: string[] = []
        for (const r of results) {
          const meta = [
            r.status,
            r.handler ? `处理人: ${r.handler}` : '',
            r.repo.length ? `仓库: ${r.repo.join(', ')}` : '',
            r.tags.length ? `标签: ${r.tags.join(', ')}` : '',
          ].filter(Boolean).join('  |  ')
          lines.push(`# ${r.name}  (${meta})`)
          for (const m of r.matches) {
            lines.push(`  ── ${m.where} · 第 ${m.line} 行`)
            for (const b of m.before) lines.push(`      ${b}`)
            lines.push(`    > ${m.text}`)
            for (const a of m.after) lines.push(`      ${a}`)
          }
          lines.push('')
        }
        rawOut(lines.join('\n'))
      }
      break
    }

    case 'context': {
      const sub = args.positional[0] || ''
      if (sub !== 'list' && sub !== 'read' && sub !== 'save') {
        throw new UsageError(`未知的 context 子命令: ${sub || '(未提供)'}\n用法: ocean task context list/read/save <name>`)
      }
      const name = taskName(cmd, args)
      switch (sub) {
        case 'list': {
          const contexts = unwrap(await taskCore.readTaskDetail(root, name)).detail.contexts
          if (json) printJson(contexts)
          else if (contexts.length === 0) rawOut('（无上下文）')
          else printDataTable(['主题', '更新时间'], contexts.map(c => [c.name, c.updatedAt || '-']))
          break
        }
        case 'read': {
          const topic = strFlag('topic', args)
          if (!topic) throw new UsageError('读取上下文需要 --topic <主题>（ocean task context list <name> 可查主题）')
          const item = unwrap(await taskCore.readTaskDetail(root, name)).detail.contexts.find(c => c.name === topic)
          if (!item) throw new Error(`上下文不存在: ${topic}`)
          json ? printJson(item) : out(item.content.trim() || '（空上下文）')
          break
        }
        case 'save': {
          const topic = strFlag('topic', args)
          if (!topic) throw new UsageError('保存上下文需要 --topic <主题>')
          const content = taskContent('上下文内容', args)
          if (content === undefined || content.trim() === '') {
            throw new UsageError('保存上下文必须通过 --content 传入内容（长内容可 --content "$(cat 文件)"），不支持 --content-file / stdin')
          }
          const isUpdate = unwrap(await taskCore.saveTaskContext(root, { taskName: name, contextName: topic, content } as TaskContextPayload)).isUpdate
          if (json) printJson({ action: isUpdate ? 'updated' : 'created', task: name, topic })
          else printAction(isUpdate ? 'updated' : 'created', { task: name, topic })
          break
        }
        default:
          throw new UsageError(`未知的 context 子命令: ${sub}\n用法: ocean task context list/read/save <name>`)
      }
      break
    }

    case 'trace': {
      const name = taskName(cmd, args)
      const events = unwrap(await taskCore.readTaskDetail(root, name)).detail.trace
      if (json) {
        printJson(events)
      } else if (events.length === 0) {
        rawOut('（无事件）')
      } else {
        printDataTable(
          ['时间', '事件', '说明'],
          events.map(e => [e.ts || '-', e.type || '-', e.message || '-']),
        )
      }
      break
    }

    default:
      throw new UsageError(`未知的 task 子命令: ${cmd}\n运行 'ocean task --help' 查看详细用法。`)
  }
}

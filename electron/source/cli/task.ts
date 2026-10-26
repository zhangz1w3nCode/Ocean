// ocean task CLI 适配层：把 core/task 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败 → 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格）在本层完成。
// 由 bin/ocean.ts 的 handleTask 迁移而来（零行为变更）。

import {
  TASK_STATUSES,
  listTasks as listTasksCore,
  readTaskDetail as readTaskDetailCore,
  createTask as createTaskCore,
  updateTask as updateTaskCore,
  searchTasks as searchTasksCore,
  saveTaskContext as saveTaskContextCore,
} from '../../core/common'
import type {
  TaskSummary,
  TaskDetail,
  TaskWritePayload,
  TaskContextPayload,
  TaskSearchResult,
  TaskSearchOpts,
} from '../../core/common'
import {
  UsageError,
  getLimit,
  out,
  rawOut,
  printJson,
  printDataTable,
  printAction,
} from './common'
import type { CliArgs } from './common'

// ---------------------------------------------------------------------------
// core 契约 → CLI 异常语义
// ---------------------------------------------------------------------------

// 业务校验失败（如「任务名称已存在」「状态不能变更」）在 core 是 { success:false, error }，
// 对 CLI 而言就是执行失败 → 抛出，由 main() 统一按运行时错误（exit 1）输出。
function unwrap<T>(res: { success: boolean; error?: string } & Partial<T>, fallback: string): T {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
  return res as T
}

export function listTasks(root: string): TaskSummary[] {
  return unwrap<{ tasks: TaskSummary[] }>(listTasksCore(root), '列出任务失败').tasks || []
}

export function readTaskDetail(root: string, name: string): TaskDetail {
  return unwrap<{ detail: TaskDetail }>(readTaskDetailCore(root, name), '读取任务详情失败').detail
}

export function createTask(root: string, payload: TaskWritePayload): TaskSummary {
  return unwrap<{ task: TaskSummary }>(createTaskCore(root, payload), '创建任务失败').task
}

export function updateTask(root: string, payload: TaskWritePayload): TaskSummary {
  return unwrap<{ task: TaskSummary }>(updateTaskCore(root, payload), '更新任务失败').task
}

export function saveTaskContext(root: string, payload: TaskContextPayload): boolean {
  return !!unwrap<{ isUpdate: boolean }>(saveTaskContextCore(root, payload), '保存任务上下文失败').isUpdate
}

// 全文检索任务正文与上下文正文（list --keyword 不覆盖正文维度）
export function searchTasks(root: string, keyword: string, opts?: TaskSearchOpts): TaskSearchResult[] {
  return unwrap<{ results: TaskSearchResult[] }>(searchTasksCore(root, keyword, opts), '检索任务失败').results || []
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

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printTaskHelp(subcommand?: string): void {
  if (subcommand) {
    const common = `
通用 flag:
  --json                       JSON 格式输出
  --root <path>                覆盖项目根目录`
    switch (subcommand) {
      case 'list':
        out(`ocean task list — 列出任务

用法: ocean task list [--flags...]

flag:
  --status <状态>             按状态精确过滤（等待处理|处理中|已完成|已取消）
  --keyword <kw>              对 名称/处理人/关联仓库/标签/状态 做子串匹配（不区分大小写）${common}`)
        break
      case 'read':
        out(`ocean task read — 读取任务

用法: ocean task read <name> [--flags...]

参数:
  <name>                      任务名称（必填）

输出：元信息 + 任务内容 + 上下文主题（完整 detail 请用 --json）${common}`)
        break
      case 'create':
        out(`ocean task create — 创建任务

用法: ocean task create <name> [--flags...]

参数:
  <name>                      任务名称（必填，作目录名，不能含 / \\ .. 且 ≤100 字符）

flag:
  --content <text>            任务内容（必填，仅此一种；禁用 --content-file / stdin）
                                正文开头不得包含 YAML frontmatter
  --handler <name>             处理人（选填）
  --repo <r1,r2>              关联仓库（逗号分隔）
  --tags <t1,t2>               标签（逗号分隔）
  --related <n1,n2>            关联任务（逗号分隔，仅收录已存在的任务）
  --context <text>             初始上下文内容（写入名为「初始上下文」的上下文文件）

初始状态固定为「等待处理」（与桌面端一致）${common}`)
        break
      case 'update':
        out(`ocean task update — 更新任务

用法: ocean task update <name> [--flags...]

参数:
  <name>                      任务名称（必填）

flag（未提供的字段保留原值）:
  --content <text>            任务内容（仅此一种，禁用 --content-file / stdin；
                                不传则保留原正文，正文开头不得包含 YAML frontmatter）
  --handler <name>             处理人
  --repo <r1,r2>              关联仓库（逗号分隔）
  --tags <t1,t2>               标签（逗号分隔）
  --related <n1,n2>            关联任务（逗号分隔）
  --status <状态>             推进状态（等待处理|处理中|已完成|已取消）

清空某字段用显式开关：--no-handler / --no-repo / --no-tags / --no-related
（不能传空字符串：解析器会把 --flag 后紧跟的 -- 开头内容视为另一个 flag）

状态机（仅前进，终态锁定）:
  等待处理 → 处理中 → 已完成 | 已取消
  等待处理 → 已完成 | 已取消（允许直接进终态）
  「等待处理 → 处理中」必须已有处理人：本次同时 --handler 指定即自动流转，无需再加 --status${common}`)
        break
      case 'context':
        out(`ocean task context — 任务上下文

用法: ocean task context <list|read|save> <name> [--flags...]

子命令:
  list <name>                  列出全部上下文主题
  read <name> --topic <t>     读取指定上下文内容
  save <name> --topic <t>      新增/更新上下文（同名覆盖）

save 的内容传入（仅此一种，禁用 --content-file / stdin）:
  --content <text>             上下文正文（长内容可 --content "$(cat 文件)"，开头不得含 YAML frontmatter）${common}`)
        break
      case 'trace':
        out(`ocean task trace — 处理时间线

用法: ocean task trace <name> [--flags...]

参数:
  <name>                      任务名称（必填）

输出：trace.jsonl 事件流（同一次变更内字段变更事件在前、状态变更事件在后）${common}`)
        break
      case 'search':
        out(`ocean task search — 全文检索

用法: ocean task search <keyword> [--flags...]

参数:
  <keyword>                   检索关键词（必填，不区分大小写）

检索范围：任务正文 + 每个任务上下文正文
（与 list --keyword 的分工：list 只过摘要字段——名称/处理人/仓库/标签/状态，
与桌面端任务库一致；search 负表正文维度）

输出：命中的任务 + 位置（任务内容 / 上下文主题）+ 行号 + 前后上下文行，不返回全文

flag:
  --top N                      返回条数（默认 5，按命中数倒序）
  --context N                  命中上下文行数（默认 2）
  --status <状态>             仅检索该状态的任务${common}`)
        break
      default:
        out(`未知的 task 子命令: ${subcommand}
运行 'ocean task --help' 查看可用子命令。`)
    }
    return
  }
  out(`ocean task — 任务库 CRUD

用法: ocean task <subcommand> [positional...] [--flags...]

数据与语义：任务存在当前项目根目录的 .tasks/ 下，与桌面端同一份存储、同一个状态机
（.tasks/{name}/TASK.md + context/*.md + trace/trace.jsonl；.tasks/{YYYY-MM-DD}/ 日期目录不视为任务）

子命令:
  list                          列出任务（按更新时间倒序）
  read <name>                  读取任务
  create <name>                创建任务
  update <name>                更新任务（含状态推进）
  search <keyword>             全文检索（任务正文 + 上下文正文）
  context list/read/save        任务上下文
  trace <name>                  处理时间线事件流

状态机：等待处理 → 处理中 → 已完成 | 已取消（等待处理可直接进终态；终态锁定；
等待处理→处理中需先有处理人）

常用 flag:
  --status <状态>              过滤 / 推进状态
  --keyword <kw>               列表关键词
  --content <text>             内容（仅此一种，禁用 --content-file / stdin）
  --json                        JSON 格式输出
  --root <path>                覆盖项目根目录

运行 'ocean task <subcommand> --help' 查看子命令详情。`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleTask(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  const json = args.flags.json === true

  // 标量 flag：值为布尔说明 flag 后面跟的是下一个 --flag（或值缺失），必须报错而不是静默忽略
  const strFlag = (key: string): string | undefined => {
    const v = args.flags[key]
    if (v === true) throw new UsageError(`--${key} 缺少值（紧跟其后的 -- 开头内容会被当成另一个 flag）`)
    return typeof v === 'string' ? v : undefined
  }
  // 逗号分隔数组 flag
  const listFlag = (key: string): string[] | undefined => {
    const v = strFlag(key)
    return v === undefined ? undefined : v.split(',').map(s => s.trim()).filter(Boolean)
  }
  // 显式清空：--no-handler / --no-repo / --no-tags / --no-related
  const cleared = (key: string): boolean => {
    const v = args.flags[`no-${key}`]
    if (typeof v === 'string') throw new UsageError(`--no-${key} 是开关，不接受值；要设值请用 --${key} <值>`)
    return v !== undefined
  }

  // 内容只允许 --content 参数传入（与 ocean knowledge 的约定一致）：
  // 禁用 --content-file 与 stdin，防止把整份文件（很可能自带 YAML frontmatter）灌进正文，
  // 破坏 TASK.md / 上下文文档原有的头。长内容用 --content "$(cat 文件)"。
  const taskContent = (label: string): string | undefined => {
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
  const statusFlag = (): string | undefined => {
    const status = strFlag('status')
    if (status !== undefined && !TASK_STATUSES.includes(status)) {
      throw new UsageError(`无效的状态：${status}，可选：${TASK_STATUSES.join(' | ')}`)
    }
    return status
  }

  const taskName = (): string => {
    const name = cmd === 'context' ? args.positional[1] : args.positional[0]
    if (!name) throw new UsageError(`缺少任务名称: ocean task ${cmd === 'context' ? `${args.positional[0]} <name>` : `${cmd} <name>`}`)
    return name
  }

  switch (cmd) {
    case 'list': {
      const tasks = filterTasks(listTasks(root), statusFlag(), strFlag('keyword'))
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
      const name = taskName()
      const detail = readTaskDetail(root, name)
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
      const name = taskName()
      const content = taskContent('任务内容')
      if (content === undefined || content.trim() === '') {
        throw new UsageError('创建任务必须通过 --content 传入任务内容（长内容可 --content "$(cat 文件)"），不支持 --content-file / stdin')
      }
      const payload: TaskWritePayload = { name, content }
      const handler = strFlag('handler')
      if (handler !== undefined) payload.handler = handler
      const repo = listFlag('repo')
      if (repo) payload.repo = repo
      const tags = listFlag('tags')
      if (tags) payload.tags = tags
      const related = listFlag('related')
      if (related) payload.relatedTasks = related
      const context = strFlag('context')
      if (context !== undefined) payload.context = context
      const task = createTask(root, payload)
      if (json) printJson({ action: 'created', task })
      else printAction('created', { name: task.name, status: task.status })
      break
    }

    case 'update': {
      const name = taskName()
      const status = statusFlag()
      // 先取原值：core 的 update 是全量覆写语义，CLI 未显式提供的字段必须回填，否则会被清空
      const current = readTaskDetail(root, name).task
      const content = taskContent('任务内容')
      if (content !== undefined && content.trim() === '') {
        throw new UsageError('任务内容不能为空；只改其它字段时请不要传 --content')
      }
      const handlerFlag = strFlag('handler')
      const repoFlag = listFlag('repo')
      const tagsFlag = listFlag('tags')
      const relatedFlag = listFlag('related')
      const payload: TaskWritePayload = {
        name,
        content: content !== undefined ? content : current.content,
        handler: cleared('handler') ? '' : (handlerFlag !== undefined ? handlerFlag : current.handler),
        repo: cleared('repo') ? [] : (repoFlag !== undefined ? repoFlag : current.repo),
        tags: cleared('tags') ? [] : (tagsFlag !== undefined ? tagsFlag : current.tags),
        relatedTasks: cleared('related') ? [] : (relatedFlag !== undefined ? relatedFlag : current.relatedTasks),
      }
      if (status !== undefined) payload.status = status
      const task = updateTask(root, payload)
      if (json) printJson({ action: 'updated', task })
      else printAction('updated', { name: task.name, status: task.status, handler: task.handler || '-' })
      break
    }

    case 'search': {
      const keyword = args.positional[0]
      if (!keyword) throw new UsageError('用法: ocean task search <keyword> [--top N] [--context N] [--status <状态>]')
      const status = statusFlag()
      const results = searchTasks(root, keyword, {
        top: getLimit(args.flags, 'top', 5),
        context: getLimit(args.flags, 'context', 2),
        status,
      })
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
      const name = taskName()
      switch (sub) {
        case 'list': {
          const contexts = readTaskDetail(root, name).contexts
          if (json) printJson(contexts)
          else if (contexts.length === 0) rawOut('（无上下文）')
          else printDataTable(['主题', '更新时间'], contexts.map(c => [c.name, c.updatedAt || '-']))
          break
        }
        case 'read': {
          const topic = strFlag('topic')
          if (!topic) throw new UsageError('读取上下文需要 --topic <主题>（ocean task context list <name> 可查主题）')
          const item = readTaskDetail(root, name).contexts.find(c => c.name === topic)
          if (!item) throw new Error(`上下文不存在: ${topic}`)
          json ? printJson(item) : out(item.content.trim() || '（空上下文）')
          break
        }
        case 'save': {
          const topic = strFlag('topic')
          if (!topic) throw new UsageError('保存上下文需要 --topic <主题>')
          const content = taskContent('上下文内容')
          if (content === undefined || content.trim() === '') {
            throw new UsageError('保存上下文必须通过 --content 传入内容（长内容可 --content "$(cat 文件)"），不支持 --content-file / stdin')
          }
          const isUpdate = saveTaskContext(root, { taskName: name, contextName: topic, content })
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
      const name = taskName()
      const events = readTaskDetail(root, name).trace
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
      if (!cmd) {
        printTaskHelp()
        return
      }
      throw new UsageError(`未知的 task 子命令: ${cmd}\n运行 'ocean task --help' 查看详细用法。`)
  }
}

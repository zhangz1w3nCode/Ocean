// ocean task CLI 侧适配层（自 electron/bin/ocean.ts handleTask 原样平移）。
// 入口负责参数解析与用法拦截（UsageError → exit 2），出口负责输出格式与退出码。
// 业务结果统一来自 core 的 { success } 契约，业务失败抛 Error（exit 1），
// 由 CLI 入口 main() 统一捕获。
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as taskCore from '../../core/task'
import type { TaskSummary, TaskDetail, TaskWritePayload, TaskContextPayload, TaskSearchResult } from '../../core/task'
import * as codebaseCore from '../../core/codebases'
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

// 显式清空：--no-handler / --no-related-codebases / --no-tags / --no-related
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
  if (!name) throw new UsageError(`缺少任务名称: ocean task ${cmd === 'context' ? `context ${args.positional[0]} <name>` : `${cmd} <name>`}`)
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
      task.relatedCodebases.some(r => r.toLowerCase().includes(q)) ||
      task.tags.some(t => t.toLowerCase().includes(q)) ||
      task.status.toLowerCase().includes(q)
  })
}

// 关联代码库校验：CLI 是自由输入面，传入的代码库名必须是当前项目 .codebases/ 下
// 真实存在的（GUI 为选择模式天然满足）；不存在的直接拦截为用法错误
async function validateRelatedCodebases(root: string, names: string[]): Promise<void> {
  if (!names.length) return
  const r = await codebaseCore.list(root)
  if (!r.success) throw new Error(r.error)
  const available = new Set(r.codebases.map(c => c.name))
  const missing = names.filter(n => !available.has(n))
  if (missing.length) {
    throw new UsageError(`代码库不存在: ${missing.join(', ')}（可用代码库可用 ocean codebases list 查看，或先在「Ocean桌面端-代码库-管理」页添加）`)
  }
}

// 关联任务自引用校验：任务不能关联自身（语义为「关联其他任务」）；
// 核心层 updateTask 会静默剔除自身，但 CLI 自由输入面应显式报错拦截，避免用户误传而不自知
function rejectSelfRelated(name: string, related: string[] | undefined): void {
  if (related && related.includes(name)) {
    throw new UsageError('禁止添加本身作为相关任务，请使用 ocean task list查看已有任务')
  }
}

// 工作流绑定校验：绑定为可选项，但一旦填写就必须真实存在（GUI 为选择模式天然满足）。
// 实例必须属于所选工作流——实例目录本身就挂在工作流目录下，路径存在即归属成立。
function validateWorkflowBinding(root: string, workflow: string | undefined, instance: string | undefined): void {
  const wf = (workflow || '').trim()
  const inst = (instance || '').trim()
  if (!wf) {
    if (inst) throw new UsageError('绑定工作流实例时必须同时指定 --workflow <工作流名称>')
    return
  }
  const wfDir = path.join(root, '.workflows', wf)
  if (!fs.existsSync(wfDir) || !fs.statSync(wfDir).isDirectory()) {
    throw new UsageError(`工作流不存在: ${wf}（可用 ocean workflow list 查看可用工作流）`)
  }
  if (!inst) return
  const instDir = path.join(wfDir, 'instance', inst)
  if (!fs.existsSync(instDir) || !fs.statSync(instDir).isDirectory()) {
    throw new UsageError(`工作流「${wf}」下不存在实例: ${inst}（可用 ocean workflow instance list 查看）`)
  }
}

// 上下文路径展示：文件夹可选，平铺不加前缀
function contextPathLabel(folder: string | null | undefined, topic: string): string {
  return folder ? `${folder}/${topic}` : topic
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
          tasks.map(t => [t.name, t.status, t.handler || '-', t.relatedCodebases.join(',') || '-', t.tags.join(',') || '-', t.updatedAt || '-']),
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
        ['关联仓库', t.relatedCodebases.join(', ') || '-'],
        ['标签', t.tags.join(', ') || '-'],
        ['关联任务', t.relatedTasks.join(', ') || '-'],
        ['绑定工作流', t.workflow || '-'],
        ['绑定实例', t.workflowInstance || '-'],
        ['创建时间', t.createdAt || '-'],
        ['更新时间', t.updatedAt || '-'],
        ['上下文', detail.contexts.map(c => contextPathLabel(c.folder, c.name)).join(', ') || '-'],
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
      const relatedCodebases = listFlag('related-codebases', args)
      if (relatedCodebases) {
        await validateRelatedCodebases(root, relatedCodebases)
        payload.relatedCodebases = relatedCodebases
      }
      const tags = listFlag('tags', args)
      if (tags) payload.tags = tags
      const associated = listFlag('related', args)
      if (associated) {
        rejectSelfRelated(name, associated)
        payload.relatedTasks = associated
      }
      const workflow = strFlag('workflow', args)
      const workflowInstance = strFlag('workflow-instance', args)
      validateWorkflowBinding(root, workflow, workflowInstance)
      if (workflow !== undefined) payload.workflow = workflow
      if (workflowInstance !== undefined) payload.workflowInstance = workflowInstance
      const context = strFlag('context', args)
      if (context !== undefined) {
        const contextFolder = strFlag('context-folder', args)
        if (!contextFolder) {
          throw new UsageError('写入初始上下文必须同时指定 --context-folder <文件夹>（上下文写入一律落 context/{folder}/{topic}.md）')
        }
        payload.context = context
        payload.contextFolder = contextFolder
      } else if (args.flags['context-folder'] !== undefined) {
        throw new UsageError('--context-folder 需与 --context 一同使用')
      }
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
      const relatedCodebasesFlag = listFlag('related-codebases', args)
      if (relatedCodebasesFlag !== undefined) {
        await validateRelatedCodebases(root, relatedCodebasesFlag)
      }
      const tagsFlag = listFlag('tags', args)
      const relatedFlag = listFlag('related', args)
      if (relatedFlag !== undefined) {
        rejectSelfRelated(name, relatedFlag)
      }
      // 绑定：未提供的字段回填原值（core 为全量覆写语义），--no-workflow / --no-workflow-instance 显式清空；
      // 清空工作流时同时清空实例（实例不得脱离工作流存在）
      const workflowFlag = strFlag('workflow', args)
      const workflowInstanceFlag = strFlag('workflow-instance', args)
      const workflowValue = cleared('workflow', args) ? '' : (workflowFlag !== undefined ? workflowFlag : current.workflow)
      // 换工作流但未显式指定实例：旧实例属于原工作流，自动清空而不是报归属错误
      const workflowChanged = workflowValue !== current.workflow
      const workflowInstanceValue = cleared('workflow-instance', args) || (workflowChanged && workflowInstanceFlag === undefined)
        ? ''
        : (workflowInstanceFlag !== undefined ? workflowInstanceFlag : current.workflowInstance)
      validateWorkflowBinding(root, workflowValue, workflowValue ? workflowInstanceValue : '')
      const payload: TaskWritePayload = {
        name,
        content: content !== undefined ? content : current.content,
        handler: cleared('handler', args) ? '' : (handlerFlag !== undefined ? handlerFlag : current.handler),
        relatedCodebases: cleared('related-codebases', args) ? [] : (relatedCodebasesFlag !== undefined ? relatedCodebasesFlag : current.relatedCodebases),
        tags: cleared('tags', args) ? [] : (tagsFlag !== undefined ? tagsFlag : current.tags),
        relatedTasks: cleared('related', args) ? [] : (relatedFlag !== undefined ? relatedFlag : current.relatedTasks),
        workflow: workflowValue,
        workflowInstance: workflowValue ? workflowInstanceValue : '',
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
            r.relatedCodebases.length ? `仓库: ${r.relatedCodebases.join(', ')}` : '',
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
          else printDataTable(['文件夹', '主题', '更新时间'], contexts.map(c => [c.folder || '-', c.name, c.updatedAt || '-']))
          break
        }
        case 'read': {
          const topic = strFlag('topic', args)
          if (!topic) throw new UsageError('读取上下文需要 --topic <主题>（ocean task context list <name> 可查主题）')
          const folder = strFlag('folder', args)
          // 不传 --folder 时只能命中存量平铺上下文（context/{topic}.md）；文件夹内的上下文必须指定 --folder
          const item = unwrap(await taskCore.readTaskDetail(root, name)).detail.contexts.find(c => c.name === topic && (c.folder ?? undefined) === folder)
          if (!item) throw new Error(`上下文不存在: ${folder ? `${folder}/${topic}` : `${topic}（如为文件夹内上下文请加 --folder <文件夹>）`}`)
          json ? printJson(item) : out(item.content.trim() || '（空上下文）')
          break
        }
        case 'save': {
          const topic = strFlag('topic', args)
          if (!topic) throw new UsageError('保存上下文需要 --topic <主题>')
          const folder = strFlag('folder', args)
          if (!folder) {
            throw new UsageError('保存上下文需要 --folder <文件夹>（上下文写入一律落 context/{folder}/{topic}.md）')
          }
          const content = taskContent('上下文内容', args)
          if (content === undefined || content.trim() === '') {
            throw new UsageError('保存上下文必须通过 --content 传入内容（长内容可 --content "$(cat 文件)"），不支持 --content-file / stdin')
          }
          const isUpdate = unwrap(await taskCore.saveTaskContext(root, { taskName: name, contextName: topic, folder, content } as TaskContextPayload)).isUpdate
          const label = contextPathLabel(folder, topic)
          if (json) printJson({ action: isUpdate ? 'updated' : 'created', task: name, folder, topic })
          else printAction(isUpdate ? 'updated' : 'created', { task: name, context: label })
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

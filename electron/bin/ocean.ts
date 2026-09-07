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
import Table from 'cli-table3'

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  root?: string
  namespace: string
  subcommand: string
  positional: string[]
  flags: Record<string, string | boolean>
  help: boolean
  version: boolean
} {
  const args = argv.slice(2)
  let root: string | undefined
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  let help = false
  let version = false

  let namespace = ''
  let subcommand = ''

  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === '--root') {
      root = args[++j]
    } else if (arg.startsWith('--root=')) {
      root = arg.substring(7)
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--version' || arg === '-v') {
      version = true
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

  // help/version 子命令形式: ocean help [namespace], ocean version
  if (namespace === 'help' || namespace === '-h') {
    help = true
    namespace = subcommand
    subcommand = ''
  } else if (namespace === 'version' || namespace === '-v') {
    version = true
    namespace = ''
  }

  return { root, namespace, subcommand, positional, flags, help, version }
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

function readAttachmentFiles(flags: Record<string, string | boolean>, key: string): skillCrud.SkillAttachment[] {
  const raw = flags[key]
  if (typeof raw !== 'string' || !raw.trim()) return []
  const files: skillCrud.SkillAttachment[] = []
  for (const seg of raw.split(',')) {
    const p = seg.trim()
    if (!p) continue
    let content: string
    try {
      content = require('fs').readFileSync(p, 'utf-8')
    } catch (e: any) {
      throw new UsageError(`读取 --${key} 文件失败 ${p}: ${e.message}`)
    }
    files.push({ name: require('path').basename(p), content })
  }
  return files
}

function rawOut(s: string): void {
  process.stdout.write(s + '\n')
}

function displayWidth(s: string): number {
  return [...s].reduce((w, c) => {
    const code = c.charCodeAt(0)
    if (code < 0x80) return w + 1
    if ((code >= 0x1100 && code <= 0x115F) ||
        (code >= 0x2E80 && code <= 0x303E) ||
        (code >= 0x3040 && code <= 0x33BF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0xA000 && code <= 0xA4CF) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFE30 && code <= 0xFE4F) ||
        (code >= 0xFF00 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6)) {
      return w + 2
    }
    return w + 1
  }, 0)
}

function stripFrontmatter(text: string): string {
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end !== -1) {
      const after = text.indexOf('\n', end + 4)
      if (after !== -1) {
        return text.substring(after + 1).trim()
      }
    }
  }
  return text
}

let _helpJsonBuf: string[] | null = null

function out(s: string): void {
  if (_helpJsonBuf !== null) { _helpJsonBuf.push(s); return }
  const maxBoxW = (process.stdout.columns || 120) - 4
  const wrapped: string[] = []
  for (const line of s.split('\n')) {
    if (displayWidth(line) <= maxBoxW) {
      wrapped.push(line)
    } else {
      let cur = ''
      let curW = 0
      for (const c of [...line]) {
        const cw = displayWidth(c)
        if (curW + cw > maxBoxW) {
          wrapped.push(cur)
          cur = c
          curW = cw
        } else {
          cur += c
          curW += cw
        }
      }
      if (cur) wrapped.push(cur)
    }
  }
  const widths = wrapped.map(l => displayWidth(l))
  const maxW = Math.max(...widths, 0)
  const h = '\u2501'.repeat(maxW + 2)
  rawOut('\u250f' + h + '\u2513')
  for (let i = 0; i < wrapped.length; i++) {
    const pad = ' '.repeat(maxW - widths[i])
    rawOut('\u2503 ' + wrapped[i] + pad + ' \u2503')
  }
  rawOut('\u2517' + h + '\u251b')
}

function printDataTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    out('（无数据）')
    return
  }
  const table = new Table({
    head: headers.map(h => ({ content: '\x1b[1m' + h + '\x1b[0m', hAlign: 'center' as const })) as any[],
    style: { head: ['cyan'] },
    colAligns: headers.map(() => 'center' as const),
    chars: {
      'top': '\u2501', 'top-mid': '\u2533', 'top-left': '\u250f', 'top-right': '\u2513',
      'bottom': '\u2500', 'bottom-mid': '\u2534', 'bottom-left': '\u2514', 'bottom-right': '\u2518',
      'left': '\u2502', 'right': '\u2502', 'mid': '\u2501', 'mid-mid': '\u2547',
      'left-mid': '\u2521', 'right-mid': '\u2529', 'middle': '\u2502',
    },
  })
  for (const row of rows) {
    table.push(row)
  }
  const lines = table.toString().split('\n')
  let separatorSeen = false
  const filtered = lines.filter(line => {
    if (line.includes('\u2521')) {
      if (!separatorSeen) {
        separatorSeen = true
        return true
      }
      return false
    }
    return true
  })
  if (filtered.length > 2) {
    filtered[1] = filtered[1].replace(/\u2502/g, '\u2503')
  }
  rawOut(filtered.join('\n'))
}

function printList(items: string[], header: string): void {
  printDataTable([header], items.map(item => [item]))
}

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

function printJson(data: any): void {
  rawOut(JSON.stringify(data, null, 2))
}

function printAction(action: string, fields: Record<string, string>): void {
  const keys = Object.keys(fields)
  const table = new Table({
    head: [{ content: '\x1b[1mAction\x1b[0m', hAlign: 'center' as const }, ...keys.map(k => ({ content: '\x1b[1m' + k + '\x1b[0m', hAlign: 'center' as const }))] as any[],
    style: { head: ['green'] },
    colAligns: ['center', ...keys.map(() => 'center' as const)],
    chars: {
      'top': '\u2501', 'top-mid': '\u2533', 'top-left': '\u250f', 'top-right': '\u2513',
      'bottom': '\u2500', 'bottom-mid': '\u2534', 'bottom-left': '\u2514', 'bottom-right': '\u2518',
      'left': '\u2502', 'right': '\u2502', 'mid': '\u2501', 'mid-mid': '\u2547',
      'left-mid': '\u2521', 'right-mid': '\u2529', 'middle': '\u2502',
    },
  })
  table.push([action, ...keys.map(k => fields[k])])
  const lines = table.toString().split('\n')
  let separatorSeen = false
  const filtered = lines.filter(line => {
    if (line.includes('\u2521')) {
      if (!separatorSeen) {
        separatorSeen = true
        return true
      }
      return false
    }
    return true
  })
  if (filtered.length > 2) {
    filtered[1] = filtered[1].replace(/\u2502/g, '\u2503')
  }
  rawOut(filtered.join('\n'))
}

// ---------------------------------------------------------------------------
// Usage Error (exit 2 for usage errors, exit 1 for runtime errors)
// ---------------------------------------------------------------------------

class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
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
    _helpJsonBuf = []
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

用法: ocean workflow choose --instance <id> --branch <name> [--reason <string>]

flag:
  --instance <id>             实例 ID（必填）
  --branch <name>             分支名称（必填）
  --reason <string>           选择原因
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

flag（所有子命令通用）:
  --instance <id>             实例 ID（必填）
  --json                       JSON 格式输出
  --root <path>               覆盖项目根目录

flag（view 专用）:
  --node <id>                 节点 ID
  --invoke <id>               invoke ID

flag（search 专用）:
  --keyword <string>          搜索关键词

flag（diff 专用）:
  --node <id>                 节点 ID
  --context <n>               上下文行数（默认 3）
  --full                       输出完整 diff`)
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
      break
    case 'knowledge':
      out(`ocean knowledge — 知识 CRUD

用法: ocean knowledge <subcommand> <path> [--flags...]

子命令:
  list                          列出所有知识
  read <path>                  读取知识内容
  create <path>                创建知识
  update <path>                更新知识
  delete <path>                删除知识

常用 flag:
  --description <text>         知识描述
  --tags <tag1,tag2>           标签（逗号分隔）
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
      break
    case 'resource':
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
      break
    case 'agent':
      out(`ocean agent — 智能体 CRUD

用法: ocean agent <subcommand> <name> [--flags...]

子命令:
  list                          列出所有智能体
  read <name>                  读取智能体内容
  create <name>                创建智能体
  update <name>                更新智能体
  delete <name>                删除智能体

常用 flag:
  --description <text>         智能体描述
  --model <model>              模型名称
  --color <color>              颜色标识
  --tools <tools>              工具列表
  --system-prompt-mode <mode>  系统提示模式
  --inherit-project-context    继承项目上下文
  --inherit-skills             继承技能
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
      break
    case 'skill':
      if (subcommand) {
        switch (subcommand) {
          case 'list':
            out(`ocean skill list — 列出所有技能

用法: ocean skill list [--json]

说明:
  返回 {asset-root}/skills/ 下的技能目录名，按字母序排列
  资产根随 ocean config asset-root 在 .pi 与 .claude 间自动切换`)
            break
          case 'read':
            out(`ocean skill read — 读取技能正文

用法: ocean skill read <技能名> [--json]

参数:
  <技能名>   必填，只能含字母、数字、中划线、下划线

说明:
  输出 SKILL.md 去掉 frontmatter 后的正文
  技能不存在时报「技能不存在: <技能名>」并 exit 1
  要看附属文件请用 ocean skill resource read`)
            break
          case 'create':
            out(`ocean skill create — 创建技能（可一次带上附属文件）

用法: ocean skill create <技能名> --description <text> (--content <文本> | --content-file <路径> | stdin)
                 --references <文件,文件> --examples <文件,文件> [--scripts <文件,文件>] [--json]

必填: --description、正文、--references、--examples
选填: --scripts

附属文件参数说明:
  值为逗号分隔的源文件，可裸文件名、相对路径或绝对路径
  目标子目录由参数名固定决定，源文件不需按这些目录组织
  落盘文件名取源文件的 basename；同一类内 basename 重复会被拒
    --references  写入 skills/{name}/references/
    --examples    写入 skills/{name}/examples/
    --scripts     写入 skills/{name}/scripts/
  注: GUI 侧 create-skill-directory 对三类附件均为可选，上面的必填是 CLI 额外的产品约束；
      写入能力与字段形状则与 GUI CreateSkillInput 同构

失败行为: 缺必填 exit 2；全部校验先于写盘，失败不留半成品目录
注意: --content-file 传入自带 frontmatter 的文件会产生重复 frontmatter 块，正文建议走 --content 或 stdin`)
            break
          case 'update':
            out(`ocean skill update — 更新技能正文

用法: ocean skill update <技能名> (--content <文本> | --content-file <路径> | stdin)

说明:
  保留原 frontmatter 全部字段，只替换正文
  不改动 references/examples/scripts 里的附属文件（请用 ocean skill resource）
  --content-file 传入自带 frontmatter 的文件会产生重复块，正文建议走 --content 或 stdin`)
            break
          case 'delete':
            out(`ocean skill delete — 删除技能

用法: ocean skill delete <技能名>

说明:
  递归删除整个技能目录，含 SKILL.md 与三类附属文件
  技能不存在时静默成功（幂等）`)
            break
          case 'resource':
            out(`ocean skill resource — 管理技能的单个附属文件

对齐 GUI 技能页四个 Tab 对 scripts/references/examples 的逐个操作。

用法:
  ocean skill resource list   <技能名> <类型>
  ocean skill resource read   <技能名> <类型> <文件名>
  ocean skill resource create <技能名> <类型> <文件名> (--content <文本> | --content-file <路径> | stdin)
  ocean skill resource delete <技能名> <类型> <文件名>

参数:
  <技能名>   必须是已存在的技能（GUI 也仅在编辑态提供这些操作）
  <类型>     scripts | references | examples
  <文件名>   不得含 . 、.. 或路径分隔符

子命令语义（逐条对齐 GUI）:
  list    列出该类型下的文件；类型目录不存在时返回空而非报错
  read    输出文件内容；文件不存在报错
  create  新建文件。重名直接拒绝且原文件不被覆盖（对齐 GUI 新建态校验）；内容必填；
          类型子目录缺失时自动创建（对齐 getSkillSubDir）
  delete  删除指定文件；不存在时静默成功

与 GUI 的对应关系:
  list   → list-skill-resources    read   → load-skill-resource
  create → save-skill-resource     delete → delete-skill-resource

说明: GUI 的 save IPC 本身是无条件覆写，拒绝重名来自 UI 层的新建态校验；
      因此本 CLI 要改已存在文件的内容需先 delete 再 create。
      文件名越界防护是 CLI 额外加固，GUI 侧该缺口未修。`)
            break
          default:
            out(`未知的 skill 子命令: ${subcommand}
运行 'ocean skill --help' 查看可用子命令。`)
        }
        break
      }
      out(`ocean skill — 技能 CRUD

用法: ocean skill <subcommand> <name> [--flags...]

子命令:
  list                          列出所有技能
  read <name>                  读取技能内容
  create <name>                创建技能
  update <name>                更新技能
  delete <name>                删除技能
  resource <sub> <skill> <类型> [文件名]   管理 scripts/references/examples 里的单个文件

常用 flag:
  --description <text>         技能描述（create 必填）
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）

create 附属文件 flag（目标子目录由参数名固定决定，源文件不需按目录组织）:
  传入值为逗号分隔的源文件，可裸文件名、相对路径或绝对路径；落盘文件名取源文件的 basename
  --references <f1,f2>        → skills/{name}/references/（本项目约束：create 必填，至少一个）
  --examples <f1,f2>          → skills/{name}/examples/（本项目约束：create 必填，至少一个）
  --scripts <f1,f2>           → skills/{name}/scripts/（选填）
  注：GUI 侧 create-skill-directory 对三类附件均为可选；上面的“必填”是 CLI 额外的产品约束，不是 GUI 行为。
      写入能力与字段形状则与 GUI CreateSkillInput 同构。

resource 子命令（类型 = scripts | references | examples，对应 GUI 技能页四个 Tab 的文件操作）:
  list   <skill> <类型>                        列出该类型下的文件
  read   <skill> <类型> <文件名>               输出文件内容
  create <skill> <类型> <文件名> --content ...  新建一个文件（已存在则拒绝，类型子目录缺失时自动创建）
  delete <skill> <类型> <文件名>               删除一个文件

示例:
  ocean skill create my-skill --description "..." --content-file SKILL.md \
    --references note.md,api.md --examples demo.md --scripts build.sh
  ocean skill resource create my-skill references guide.md --content "# 指南"
  ocean skill resource list my-skill references
  ocean skill resource read my-skill references guide.md
  ocean skill resource delete my-skill references guide.md`)
      break
    case 'config':
      out(`ocean config — 配置管理

用法: ocean config <subcommand>

子命令:
  asset-root                   查询当前资产来源（pi 或 claude）`)
      break
    default:
      out(`未知命名空间: ${namespace}

可用命名空间: workflow | node | knowledge | resource | agent | skill | config
运行 'ocean --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv)

  // version 优先（eager，无需子命令）
  if (args.version) {
    args.flags.json ? printJson({ version: getVersion() }) : printVersion()
    return
  }

  // help 检查（ocean --help, ocean -h, ocean help [namespace], ocean <ns> --help）
  if (args.help) {
    printHelp(args.namespace, args.subcommand, !!args.flags.json)
    if (_helpJsonBuf !== null) {
      printJson({ namespace: args.namespace || null, subcommand: args.subcommand || null, help: _helpJsonBuf.join('\n') })
      _helpJsonBuf = null
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

function handleWorkflow(root: string, args: ReturnType<typeof parseArgs>): void {
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
      printMarkdownTable(next(root, wf, id, json))
      break
    }

    case 'complete': {
      const id = args.flags.instance as string
      const wf = instanceWorkflow(root, id)
      const output = typeof args.flags.output === 'string' ? args.flags.output : undefined
      const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined
      const content = readOutput(output, outputFile)
      args.flags.json ? printJson({ message: complete(root, wf, id, content) }) : printMarkdownTable(complete(root, wf, id, content))
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
      const reason = typeof args.flags.reason === 'string' ? args.flags.reason : undefined
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
          printMarkdownTable(view(root, wf, id, node, invoke, json))
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
          printMarkdownTable(diff(root, wf, id, node, json, context, full))
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
// node CRUD
// ---------------------------------------------------------------------------

function handleNode(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(nodeCrud.list(root))
      else printList(nodeCrud.list(root), '节点')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(nodeCrud.read(root, name)) }) : out(stripFrontmatter(nodeCrud.read(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      nodeCrud.create(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      nodeCrud.update(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      nodeCrud.del(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printHelp('node')
        return
      }
      throw new UsageError(`未知的 node 子命令: ${cmd}\n运行 'ocean node --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// knowledge CRUD
// ---------------------------------------------------------------------------

function handleKnowledge(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(knowledgeCrud.list(root))
      else printList(knowledgeCrud.list(root), '知识')
      break
    case 'read': {
      const relPath = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(knowledgeCrud.read(root, relPath)) }) : out(stripFrontmatter(knowledgeCrud.read(root, relPath)))
      break
    }
    case 'create': {
      const relPath = args.positional[0]
      const content = readContent(args.flags)
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const tagsStr = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : undefined
      knowledgeCrud.create(root, relPath, content, { description, tags })
      args.flags.json ? printJson({ action: 'created', path: relPath }) : printAction('created', { path: relPath })
      break
    }
    case 'update': {
      const relPath = args.positional[0]
      const content = readContent(args.flags)
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      const tagsStr = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      const tags = tagsStr !== undefined ? tagsStr.split(',').map(t => t.trim()) : undefined
      knowledgeCrud.update(root, relPath, content, { description, tags })
      args.flags.json ? printJson({ action: 'updated', path: relPath }) : printAction('updated', { path: relPath })
      break
    }
    case 'delete': {
      const relPath = args.positional[0]
      knowledgeCrud.del(root, relPath)
      args.flags.json ? printJson({ action: 'deleted', path: relPath }) : printAction('deleted', { path: relPath })
      break
    }
    default:
      if (!cmd) {
        printHelp('knowledge')
        return
      }
      throw new UsageError(`未知的 knowledge 子命令: ${cmd}\n运行 'ocean knowledge --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// resource CRUD
// ---------------------------------------------------------------------------

function handleResource(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(resourceCrud.list(root))
      else printList(resourceCrud.list(root), '资源')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(resourceCrud.read(root, name)) }) : out(stripFrontmatter(resourceCrud.read(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      resourceCrud.create(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const type = typeof args.flags.type === 'string' ? args.flags.type : undefined
      const description = typeof args.flags.description === 'string' ? args.flags.description : undefined
      resourceCrud.update(root, name, content, { type, description })
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      resourceCrud.del(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printHelp('resource')
        return
      }
      throw new UsageError(`未知的 resource 子命令: ${cmd}\n运行 'ocean resource --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// agent CRUD
// ---------------------------------------------------------------------------

function handleAgent(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(agentCrud.list(root))
      else printList(agentCrud.list(root), '智能体')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(agentCrud.read(root, name)) }) : out(stripFrontmatter(agentCrud.read(root, name)))
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
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
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
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      agentCrud.del(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printHelp('agent')
        return
      }
      throw new UsageError(`未知的 agent 子命令: ${cmd}\n运行 'ocean agent --help' 查看详细用法。`)
  }
}

// ---------------------------------------------------------------------------
// skill CRUD
// ---------------------------------------------------------------------------

function handleSkill(root: string, args: ReturnType<typeof parseArgs>): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(skillCrud.list(root))
      else printList(skillCrud.list(root), '技能')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(skillCrud.read(root, name)) }) : out(stripFrontmatter(skillCrud.read(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const references = readAttachmentFiles(args.flags, 'references')
      const examples = readAttachmentFiles(args.flags, 'examples')
      const scripts = readAttachmentFiles(args.flags, 'scripts')
      if (!references.length) {
        throw new UsageError('创建技能时 --references <path1,path2> 为必填参数，需至少提供一个参考文档文件')
      }
      if (!examples.length) {
        throw new UsageError('创建技能时 --examples <path1,path2> 为必填参数，需至少提供一个示例文件')
      }
      const content = readContent(args.flags)
      const description = args.flags.description as string
      skillCrud.create(root, name, content, description, { scripts, references, examples })
      const names = (list: skillCrud.SkillAttachment[]) => list.map(f => f.name).join(',') || '-'
      args.flags.json
        ? printJson({ action: 'created', name, attachments: { references: references.map(f => f.name), examples: examples.map(f => f.name), scripts: scripts.map(f => f.name) } })
        : printAction('created', { name, references: names(references), examples: names(examples), scripts: names(scripts) })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      skillCrud.update(root, name, content)
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      skillCrud.del(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    case 'resource':
      handleSkillResource(root, args)
      break
    default:
      if (!cmd) {
        printHelp('skill')
        return
      }
      throw new UsageError(`未知的 skill 子命令: ${cmd}\n运行 'ocean skill --help' 查看详细用法。`)
  }
}

// skill resource 子命令组：与 GUI 技能页对 scripts/references/examples 的四个操作对齐
function handleSkillResource(root: string, args: ReturnType<typeof parseArgs>): void {
  const [action, name, type, fileName] = args.positional
  const json = !!args.flags.json
  if (!action) {
    // 不传 json：_helpJsonBuf 的打印只发生在 main 的 --help 分支，这里传入会造成静默空输出
    printHelp('skill', 'resource')
    return
  }
  switch (action) {
    case 'list': {
      requirePositional(action, [name, type], ['<技能名>', '<类型>'])
      const files = skillCrud.listResources(root, name, type)
      json ? printJson({ name, type, files }) : printList(files, `${name}/${type}`)
      break
    }
    case 'read': {
      requirePositional(action, [name, type, fileName], ['<技能名>', '<类型>', '<文件名>'])
      const content = skillCrud.readResource(root, name, type, fileName)
      json ? printJson({ name, type, fileName, content }) : out(content)
      break
    }
    case 'create': {
      requirePositional(action, [name, type, fileName], ['<技能名>', '<类型>', '<文件名>'])
      const content = readContent(args.flags)
      skillCrud.addResource(root, name, type, fileName, content)
      json
        ? printJson({ action: 'created', name, type, fileName })
        : printAction('created', { name, type, file: fileName })
      break
    }
    case 'delete': {
      requirePositional(action, [name, type, fileName], ['<技能名>', '<类型>', '<文件名>'])
      skillCrud.deleteResource(root, name, type, fileName)
      json
        ? printJson({ action: 'deleted', name, type, fileName })
        : printAction('deleted', { name, type, file: fileName })
      break
    }
    default:
      throw new UsageError(`未知的 skill resource 子命令: ${action}\n运行 'ocean skill --help' 查看详细用法。`)
  }
}

function requirePositional(action: string, vals: (string | undefined)[], labels: string[]): void {
  for (let i = 0; i < vals.length; i++) {
    if (!vals[i]) throw new UsageError(`skill resource ${action} 缺少参数 ${labels[i]}`)
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

main()

// ocean knowledge CLI 适配层：把 core/knowledge 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败（如「知识已存在」「知识不存在」）→ 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格 / 树形）在本层完成。
// 由 bin/ocean.ts 的 handleKnowledge、printHelp('knowledge') 与 domain 树形渲染函数迁移而来（零行为变更）。

import Table from 'cli-table3'
import {
  listKnowledges as listKnowledgesCore,
  readKnowledge as readKnowledgeCore,
  createKnowledge as createKnowledgeCore,
  updateKnowledge as updateKnowledgeCore,
  delKnowledge as delKnowledgeCore,
  createKnowledgeDomain as createKnowledgeDomainCore,
  listKnowledgeDomainTree,
  listKnowledgeDomainSubtree,
  searchKnowledgeDomains as searchKnowledgeDomainsCore,
  updateKnowledgeDomain as updateKnowledgeDomainCore,
  searchKnowledges as searchKnowledgesCore,
} from '../../core/common'
import type { DomainNode, KnowledgeSearchResult } from '../../core/common'
import {
  UsageError,
  stripFrontmatter,
  out,
  rawOut,
  printJson,
  printList,
  printAction,
  printDataTable,
  getLimit,
  TABLE_CHARS,
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

export function listKnowledges(root: string): string[] {
  return unwrap<{ files: string[] }>(listKnowledgesCore(root), '列出知识失败').files || []
}

// 返回原文（含 frontmatter）；文件不存在时 core 保留系统错误原文（ENOENT）
export function readKnowledge(root: string, relPath: string): string {
  return unwrap<{ content: string }>(readKnowledgeCore(root, relPath), '读取知识失败').content
}

export function createKnowledge(root: string, relPath: string, content: string, opts?: { summary?: string; tags?: string[] }): void {
  unwrapOk(createKnowledgeCore(root, relPath, content, opts), '创建知识失败')
}

export function updateKnowledge(root: string, relPath: string, content: string, opts?: { summary?: string; tags?: string[] }): void {
  unwrapOk(updateKnowledgeCore(root, relPath, content, opts), '更新知识失败')
}

export function delKnowledge(root: string, relPath: string): void {
  unwrapOk(delKnowledgeCore(root, relPath), '删除知识失败')
}

export function createKnowledgeDomain(root: string, name: string): void {
  unwrapOk(createKnowledgeDomainCore(root, name), '创建 domain 失败')
}

export function listDomainTree(root: string): DomainNode[] {
  return unwrap<{ nodes: DomainNode[] }>(listKnowledgeDomainTree(root), '列出 domain 失败').nodes || []
}

export function listDomainSubtree(root: string, name: string): DomainNode {
  return unwrap<{ node: DomainNode }>(listKnowledgeDomainSubtree(root, name), '列出 domain 失败').node
}

export function searchDomains(root: string, keyword: string) {
  return unwrap<{ results: { domain: string; count: number }[] }>(searchKnowledgeDomainsCore(root, keyword), '检索 domain 失败').results || []
}

export function updateKnowledgeDomain(root: string, oldName: string, newName: string): void {
  unwrapOk(updateKnowledgeDomainCore(root, oldName, newName), '更新 domain 失败')
}

export function searchKnowledges(root: string, keyword: string, opts?: { top?: number; context?: number }): KnowledgeSearchResult[] {
  return unwrap<{ results: KnowledgeSearchResult[] }>(searchKnowledgesCore(root, keyword, opts), '检索知识失败').results || []
}

// ---------------------------------------------------------------------------
// domain 树形渲染（自 ocean.ts 原样迁出）
// ---------------------------------------------------------------------------

// 无表头单列表格，用于包裹树形展示（左对齐保留缩进，行间无分隔线）
function printDomainBox(lines: string[]): void {
  const table = new Table({
    colAligns: ['left' as const],
    chars: { ...TABLE_CHARS, mid: '', 'mid-mid': '', 'left-mid': '', 'right-mid': '' },
  })
  for (const line of lines) table.push([line])
  rawOut(table.toString())
}

function domainBasename(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1]
}

// 树形展示 domain 层级（不含知识卡片），返回名称列各行（带层级前缀）
// 根行（knowledges）顶格，顶层 domain 起用树形符号
function domainTreeLines(nodes: DomainNode[]): string[] {
  const lines: string[] = ['knowledges']
  const root: DomainNode = { domain: '', knowledges: [], subdomains: nodes }
  domainBranchLines(root, '', lines)
  return lines
}

function domainBranchLines(node: DomainNode, prefix: string, lines: string[]): void {
  const children = node.subdomains
  children.forEach((child, i) => {
    const isLast = i === children.length - 1
    const branch = isLast ? '└── ' : '├── '
    lines.push(`${prefix}${branch}${domainBasename(child.domain)}`)
    domainBranchLines(child, prefix + (isLast ? '    ' : '│   '), lines)
  })
}

// 收集树中全部 domain 完整路径（深度优先）
function collectDomainPaths(nodes: DomainNode[], paths: string[] = []): string[] {
  for (const node of nodes) {
    paths.push(node.domain)
    collectDomainPaths(node.subdomains, paths)
  }
  return paths
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printKnowledgeHelp(): void {
  out(`ocean knowledge — 知识 CRUD

用法: ocean knowledge <subcommand> <path> [--flags...]

子命令:
  list                          列出所有知识
  read <path>                  读取知识内容
  create <path>                创建知识
  update <path>                更新知识
  delete <path>                删除知识
  search <keyword>             检索已审核知识（仅 status=validated，不返回原文）
  domain list [name]            列出 domain 结构
  domain create <name>          创建 domain
  domain search <keyword>       按 keyword 匹配 domain 名称
  domain update <old> <new>     重命名 domain（同步刷新知识字段）

常用 flag:
  --summary <text>              知识摘要（create 必填）
  --tags <tag1,tag2>           标签（逗号分隔，create 必填）

create 内容传入（仅此一种，禁用 --content-file / stdin）:
  --content "文本"             正文；长内容 "$(cat 文件)"
                                正文开头不得包含 YAML frontmatter

update: 三项均可选（缺省保留原值），至少一项有效:
  --content "文本"             同 create 约束，缺省保留原正文
  --summary / --tags           缺省保留原值
  禁用 --content-file / stdin

search flag:
  --top N                       返回条数（默认 5）
  --context N                   命中上下文行数（默认 2）

domain 说明:
  domain = 知识所在文件夹（相对 .knowledges）；create/update 知识时
  自动写入 YAML 头的 domain 字段，顶层知识无 domain
  domain list 全景树形展示全部 domain（不含知识卡片）
  domain list <name> 仅列出其直接子 domain 名称`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleKnowledge(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(listKnowledges(root))
      else printList(listKnowledges(root), '知识')
      break
    case 'read': {
      const relPath = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(readKnowledge(root, relPath)) }) : out(stripFrontmatter(readKnowledge(root, relPath)))
      break
    }
    case 'create': {
      const relPath = args.positional[0]
      if (args.flags.content === true) {
        throw new UsageError('创建知识的 --content 值缺失或以 -- 开头无法解析。若正文以 --- 开头（YAML frontmatter），请剥掉 frontmatter 后传入纯正文；长内容可 --content "$(cat 文件)"')
      }
      const content = typeof args.flags.content === 'string' ? args.flags.content : undefined
      if (content === undefined || content.trim() === '') {
        throw new UsageError('创建知识必须通过 --content 传入正文（长内容可 --content "$(cat file.md)"），不支持 --content-file / stdin')
      }
      if (content.trimStart().startsWith('---')) {
        throw new UsageError('知识正文开头不能包含 YAML frontmatter（检测到以 --- 开头）。请传入纯正文，name/summary/tags/status 由系统自动生成')
      }
      const summary = typeof args.flags.summary === 'string' ? args.flags.summary : undefined
      if (!summary || summary.trim() === '') {
        throw new UsageError('创建知识时 --summary <text> 为必填参数，不可为空')
      }
      const tagsStr = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      if (tagsStr === undefined || tagsStr.trim() === '') {
        throw new UsageError('创建知识时 --tags <tag1,tag2> 为必填参数，不可为空')
      }
      const tags = tagsStr.split(',').map(t => t.trim())
      createKnowledge(root, relPath, content, { summary, tags })
      args.flags.json ? printJson({ action: 'created', path: relPath }) : printAction('created', { path: relPath })
      break
    }
    case 'update': {
      const relPath = args.positional[0]
      if (args.flags.content === true) {
        throw new UsageError('更新知识的 --content 值缺失或以 -- 开头无法解析。若正文以 --- 开头（YAML frontmatter），请剥掉 frontmatter 后传入纯正文；长内容可 --content "$(cat 文件)"')
      }
      if (args.flags['content-file'] !== undefined) {
        throw new UsageError('更新知识不支持 --content-file，正文仅能通过 --content 传入（长内容可 --content "$(cat 文件)"）')
      }
      const contentFlag = typeof args.flags.content === 'string' ? args.flags.content : undefined
      const content = contentFlag !== undefined && contentFlag.trim() !== '' ? contentFlag : undefined
      if (content !== undefined && content.trimStart().startsWith('---')) {
        throw new UsageError('知识正文开头不能包含 YAML frontmatter（检测到以 --- 开头）。请传入纯正文，name/summary/tags/status 由系统自动生成')
      }
      const summaryFlag = typeof args.flags.summary === 'string' ? args.flags.summary : undefined
      const summary = summaryFlag !== undefined && summaryFlag.trim() !== '' ? summaryFlag : undefined
      const tagsFlag = typeof args.flags.tags === 'string' ? args.flags.tags : undefined
      const tags = tagsFlag !== undefined && tagsFlag.trim() !== '' ? tagsFlag.split(',').map(t => t.trim()) : undefined
      if (content === undefined && summary === undefined && tags === undefined) {
        throw new UsageError('更新知识至少需要提供 --content / --summary / --tags 中的一项有效参数（不可全为空，stdin 输入会被忽略）')
      }
      let body: string
      if (content !== undefined) {
        body = content
      } else {
        // 缺省保留原正文：从原文件读取（core 保留系统错误原文，ENOENT 映射为用法错误）
        const res = readKnowledgeCore(root, relPath)
        if (!res || res.success !== true) {
          const err = res && res.error ? res.error : '读取知识失败'
          if (/^ENOENT/.test(err)) throw new UsageError(`知识不存在: ${relPath}`)
          throw new Error(err)
        }
        body = stripFrontmatter(res.content)
      }
      updateKnowledge(root, relPath, body, { summary, tags })
      args.flags.json ? printJson({ action: 'updated', path: relPath }) : printAction('updated', { path: relPath })
      break
    }
    case 'delete': {
      const relPath = args.positional[0]
      delKnowledge(root, relPath)
      args.flags.json ? printJson({ action: 'deleted', path: relPath }) : printAction('deleted', { path: relPath })
      break
    }
    case 'domain': {
      const sub = args.positional[0] || ''
      switch (sub) {
        case 'list': {
          const name = args.positional[1]
          if (name === undefined) {
            const tree = listDomainTree(root)
            if (args.flags.json) printJson(collectDomainPaths(tree))
            else if (tree.length === 0) rawOut('（无 domain）')
            else printDomainBox(domainTreeLines(tree))
          } else {
            const node = listDomainSubtree(root, name)
            if (args.flags.json) printJson(node.subdomains.map(s => s.domain))
            else {
              const subNames = node.subdomains.map(s => domainBasename(s.domain))
              if (subNames.length === 0) rawOut(`domain ${name} 下暂无子领域`)
              else printList(subNames, '子领域')
            }
          }
          break
        }
        case 'create': {
          const name = args.positional[1]
          if (!name) throw new UsageError('用法: ocean knowledge domain create <name>')
          createKnowledgeDomain(root, name)
          args.flags.json ? printJson({ action: 'created', domain: name }) : printAction('created', { domain: name })
          break
        }
        case 'search': {
          const keyword = args.positional[1]
          if (!keyword) throw new UsageError('用法: ocean knowledge domain search <keyword>')
          const results = searchDomains(root, keyword)
          if (args.flags.json) printJson(results)
          else if (results.length === 0) rawOut('未找到匹配的 domain')
          else printDataTable(['domain', '知识数'], results.map(r => [r.domain, String(r.count)]))
          break
        }
        case 'update': {
          const oldName = args.positional[1]
          const newName = args.positional[2]
          if (!oldName || !newName) throw new UsageError('用法: ocean knowledge domain update <old> <new>')
          updateKnowledgeDomain(root, oldName, newName)
          args.flags.json ? printJson({ action: 'updated', from: oldName, to: newName }) : printAction('updated', { from: oldName, to: newName })
          break
        }
        default:
          throw new UsageError(`未知的 domain 子命令: ${sub}\n用法: ocean knowledge domain list/create/search/update`)
      }
      break
    }
    case 'search': {
      const keyword = args.positional[0]
      if (!keyword) throw new UsageError('用法: ocean knowledge search <keyword> [--top N] [--context N]')
      const top = getLimit(args.flags, 'top', 5)
      const context = getLimit(args.flags, 'context', 2)
      const results = searchKnowledges(root, keyword, { top, context })
      if (args.flags.json) {
        printJson(results)
      } else if (results.length === 0) {
        rawOut('未找到匹配的已审核知识（仅检索 status=validated）')
      } else {
        const lines: string[] = []
        for (const r of results) {
          const meta = Object.entries(r.metadata)
            .filter(([k]) => k !== 'name' && k !== 'summary')
            .map(([k, v]) => `${k}: ${v}`)
            .join('  |  ')
          lines.push(`# ${r.name}  (${r.path})`)
          if (meta) lines.push(meta)
          if (r.summary) lines.push(`summary: ${r.summary}`)
          for (const m of r.matches) {
            for (const b of m.before) lines.push(`    ${b}`)
            lines.push(`  > (L${m.line}) ${m.text}`)
            for (const a of m.after) lines.push(`    ${a}`)
            lines.push('')
          }
          lines.push('')
        }
        rawOut(lines.join('\n'))
      }
      break
    }
    default:
      if (!cmd) {
        printKnowledgeHelp()
        return
      }
      throw new UsageError(`未知的 knowledge 子命令: ${cmd}\n运行 'ocean knowledge --help' 查看详细用法。`)
  }
}

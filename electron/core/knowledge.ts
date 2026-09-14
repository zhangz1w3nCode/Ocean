import * as fs from 'node:fs'
import * as path from 'node:path'

const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', '.DS_Store', 'node_modules'])

export function dir(root: string): string {
  return path.join(root, '.knowledges')
}

export function list(root: string): string[] {
  const d = dir(root)
  if (!fs.existsSync(d)) return []
  const result: string[] = []
  scanDir(d, d, result)
  return result.sort()
}

function scanDir(dir: string, baseDir: string, result: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      scanDir(fullPath, baseDir, result)
    } else if (item.endsWith('.md')) {
      result.push(path.relative(baseDir, fullPath))
    }
  }
}

export function read(root: string, relPath: string): string {
  const filePath = path.join(dir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  return fs.readFileSync(filePath, 'utf-8')
}

export function create(root: string, relPath: string, content: string, opts?: {
  summary?: string
  tags?: string[]
}): void {
  const d = dir(root)
  const filePath = path.join(d, relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (fs.existsSync(filePath)) throw new Error(`知识已存在: ${relPath}`)
  const name = path.basename(filePath, '.md')
  let fm = `---\nname: ${name}\n`
  if (opts?.summary) fm += `summary: ${opts.summary}\n`
  if (opts?.tags && opts.tags.length > 0) {
    fm += `tags: [${opts.tags.join(', ')}]\n`
  }
  // 新建知识默认待审核
  fm += `status: pending\n`
  fm += `---\n\n${content}\n`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
}

export function update(root: string, relPath: string, content: string, opts?: {
  summary?: string
  tags?: string[]
}): void {
  const filePath = path.join(dir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (!fs.existsSync(filePath)) throw new Error(`知识不存在: ${relPath}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.summary !== undefined) {
    if (opts.summary) {
      fields.summary = opts.summary
    } else {
      delete fields.summary
    }
    // 历史 description 字段统一迁移为 summary
    delete fields.description
  }
  if (opts?.tags !== undefined) {
    if (opts.tags.length > 0) {
      fields.tags = `[${opts.tags.join(', ')}]`
    } else {
      delete fields.tags
    }
  }
  // 更新后回退为待审核
  fields.status = 'pending'
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, relPath: string): void {
  const filePath = path.join(dir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

// --- frontmatter helpers ---

function parseFrontmatter(raw: string): { fields: Record<string, string>, body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { fields: {}, body: raw }
  const block = match[1]
  const body = match[2] || ''
  const fields: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.substring(0, idx).trim()
      const val = line.substring(idx + 1).trim()
      if (key) fields[key] = val
    }
  }
  return { fields, body }
}

function buildFrontmatter(fields: Record<string, string>, body: string): string {
  let fm = '---\n'
  for (const [key, val] of Object.entries(fields)) {
    fm += `${key}: ${val}\n`
  }
  fm += `---\n\n${body}\n`
  return fm
}

// --- 知识检索 ---

export interface KnowledgeSearchMatch {
  line: number // 命中行号（正文内，1 起）
  text: string // 命中行原文
  before: string[] // 上下文前 N 行
  after: string[] // 上下文后 N 行
}

export interface KnowledgeSearchResult {
  path: string // 相对 .knowledges 的路径（含 .md）
  name: string // 文档标题
  metadata: Record<string, string> // yaml 元数据（frontmatter 全字段）
  summary: string // 摘要
  matches: KnowledgeSearchMatch[] // 命中上下文
}

// 全文检索已审核通过（status=validated）的知识，返回标题/元数据/摘要/命中上下文，不返回文档原文。
export function search(root: string, keyword: string, opts?: { top?: number; context?: number }): KnowledgeSearchResult[] {
  if (!keyword || keyword.trim() === '') return []
  const top = typeof opts?.top === 'number' && opts.top >= 0 ? opts.top : 5
  const context = typeof opts?.context === 'number' && opts.context >= 0 ? opts.context : 2
  const d = dir(root)
  const kw = keyword.toLowerCase()
  const results: KnowledgeSearchResult[] = []

  for (const relPath of list(root)) {
    if (path.basename(relPath).toLowerCase() === 'index.md') continue
    const filePath = path.join(d, relPath)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    const { fields, body } = parseFrontmatter(raw)
    if ((fields.status || '').trim() !== 'validated') continue

    const lines = body.split('\n')
    const matches: KnowledgeSearchMatch[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(kw)) {
        matches.push({
          line: i + 1,
          text: lines[i],
          before: lines.slice(Math.max(0, i - context), i),
          after: lines.slice(i + 1, i + 1 + context),
        })
      }
    }
    if (matches.length === 0) continue

    results.push({
      path: relPath,
      name: fields.name || path.basename(relPath, '.md'),
      metadata: fields,
      summary: fields.summary || fields.description || '',
      matches,
    })
  }

  results.sort((a, b) => b.matches.length - a.matches.length || a.path.localeCompare(b.path))
  return results.slice(0, top)
}

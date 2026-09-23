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
  const domain = path.dirname(path.relative(d, filePath))
  let fm = `---\nname: ${name}\n`
  // domain = 知识所在文件夹（相对 .knowledges），根目录下的知识无 domain
  if (domain !== '.') fm += `domain: ${domain}\n`
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
  // domain 字段与文件实际位置保持一致（兼容无 domain 字段的历史知识）
  const fileDomain = path.dirname(path.relative(dir(root), filePath))
  if (fileDomain !== '.') {
    fields.domain = fileDomain
  } else {
    delete fields.domain
  }
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, relPath: string): void {
  const filePath = path.join(dir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

// --- domain 管理（domain 即 .knowledges 下的文件夹）---

function resolveDomainDir(root: string, name: string): string {
  const d = path.resolve(dir(root))
  const target = path.resolve(d, name)
  if (target === d || !target.startsWith(d + path.sep)) {
    throw new Error(`非法的 domain 路径: ${name}`)
  }
  return target
}

export function createDomain(root: string, name: string): void {
  const target = resolveDomainDir(root, name)
  if (fs.existsSync(target)) throw new Error(`domain 已存在: ${name}`)
  fs.mkdirSync(target, { recursive: true })
}

export interface DomainInfo {
  domain: string // 相对 .knowledges 的目录路径
  count: number // 直接位于该目录的知识数
}

function listDomains(root: string): DomainInfo[] {
  const d = dir(root)
  if (!fs.existsSync(d)) return []
  const result: DomainInfo[] = []
  scanDomains(d, d, result)
  return result.sort((a, b) => a.domain.localeCompare(b.domain))
}

function scanDomains(dir: string, baseDir: string, result: DomainInfo[]): void {
  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(dir, item)
    if (!fs.statSync(fullPath).isDirectory()) continue
    const rel = path.relative(baseDir, fullPath)
    let count = 0
    for (const f of fs.readdirSync(fullPath)) {
      if (f.endsWith('.md')) count++
    }
    result.push({ domain: rel, count })
    scanDomains(fullPath, baseDir, result)
  }
}

export function searchDomains(root: string, keyword: string): DomainInfo[] {
  if (!keyword || keyword.trim() === '') return []
  const kw = keyword.trim().toLowerCase()
  return listDomains(root).filter(d => d.domain.toLowerCase().includes(kw))
}

// 列出指定 domain 子树下的全部知识（相对 .knowledges 的路径，含 .md）
export interface DomainNode {
  domain: string // 相对 .knowledges 的目录路径
  knowledges: string[] // 直接位于该目录的知识（相对 .knowledges 完整路径）
  subdomains: DomainNode[] // 子 domain 节点（递归）
}

function buildDomainNode(baseDir: string, domainDir: string): DomainNode {
  const knowledges: string[] = []
  const subdomains: DomainNode[] = []
  for (const item of fs.readdirSync(domainDir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(domainDir, item)
    if (fs.statSync(fullPath).isDirectory()) {
      subdomains.push(buildDomainNode(baseDir, fullPath))
    } else if (item.endsWith('.md')) {
      knowledges.push(path.relative(baseDir, fullPath))
    }
  }
  knowledges.sort()
  subdomains.sort((a, b) => a.domain.localeCompare(b.domain))
  return { domain: path.relative(baseDir, domainDir), knowledges, subdomains }
}

export function listDomainTree(root: string): DomainNode[] {
  const d = path.resolve(dir(root))
  if (!fs.existsSync(d)) return []
  const nodes: DomainNode[] = []
  for (const item of fs.readdirSync(d)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(d, item)
    if (!fs.statSync(fullPath).isDirectory()) continue
    nodes.push(buildDomainNode(d, fullPath))
  }
  return nodes.sort((a, b) => a.domain.localeCompare(b.domain))
}

export function listDomainSubtree(root: string, name: string): DomainNode {
  const d = path.resolve(dir(root))
  const target = resolveDomainDir(root, name)
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`domain 不存在: ${name}`)
  }
  return buildDomainNode(d, target)
}

export function updateDomain(root: string, oldName: string, newName: string): void {
  const d = path.resolve(dir(root))
  const oldDir = resolveDomainDir(root, oldName)
  const newDir = resolveDomainDir(root, newName)
  if (!fs.existsSync(oldDir)) throw new Error(`domain 不存在: ${oldName}`)
  if (fs.existsSync(newDir)) throw new Error(`domain 已存在: ${newName}`)
  if (newDir.startsWith(oldDir + path.sep)) throw new Error('新 domain 不能是旧 domain 的子路径')
  if (oldDir.startsWith(newDir + path.sep)) throw new Error('新 domain 不能是旧 domain 的父路径')
  fs.mkdirSync(path.dirname(newDir), { recursive: true })
  fs.renameSync(oldDir, newDir)
  // 刷新受影响知识的 domain 字段（含子目录）
  refreshDomainFields(d, newDir)
}

function refreshDomainFields(baseDir: string, targetDir: string): void {
  for (const item of fs.readdirSync(targetDir)) {
    const fullPath = path.join(targetDir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      refreshDomainFields(baseDir, fullPath)
    } else if (item.endsWith('.md')) {
      const fileDomain = path.dirname(path.relative(baseDir, fullPath))
      const raw = fs.readFileSync(fullPath, 'utf-8')
      const { fields, body } = parseFrontmatter(raw)
      fields.domain = fileDomain
      fs.writeFileSync(fullPath, buildFrontmatter(fields, body), 'utf-8')
    }
  }
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

import * as fs from 'node:fs'
import * as path from 'node:path'
// 暂存队列模型：正式位置只存过审版本；create/update 只写 reviewQueue 快照（G3）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('./review.cjs')

const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', '.DS_Store', 'node_modules'])

export function dir(root: string): string {
  return path.join(root, '.ocean', 'knowledges')
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
  // 读取一律正式位置（G7）：正式文件不存在 = 没有已过审版本（仅有草稿或从未创建），提示不存在且不暴露磁盘路径
  if (!fs.existsSync(filePath)) throw new Error(`知识不存在: ${relPath}（新建或修改后的版本需审核通过后才可读取，待审队列可用 ocean review list 查看）`)
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
  // 新建知识默认待审核（快照不写 version，由审核通过时在正式文件维护）
  fm += `reviewStatus: pending\n`
  const bc = review.baseCommitField(root)
  if (bc) fm += bc + '\n'
  fm += `---\n\n${content}\n`
  const nameKey = path.relative(d, filePath).replace(/\.md$/, '')
  const snap = review.newSnapshotDir(root, 'knowledge', nameKey)
  if (snap.error) throw new Error(snap.error)
  fs.writeFileSync(path.join(snap.dir, `${name}.md`), fm, 'utf-8')
}

export function update(root: string, relPath: string, content: string, opts?: {
  summary?: string
  tags?: string[]
}): void {
  const d = dir(root)
  const filePath = path.join(d, relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  const nameKey = path.relative(d, filePath).replace(/\.md$/, '')
  const draft = review.latestDraft(root, 'knowledge', nameKey)
  const basePath = draft ? draft.mainFile : filePath
  if (!fs.existsSync(basePath)) throw new Error(`知识不存在: ${relPath}`)
  const raw = fs.readFileSync(basePath, 'utf-8')
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
  // 更新后回退为待审核（快照不写 version，删除驳回理由）
  fields.reviewStatus = 'pending'
  delete fields.rejectReason
  delete fields.version
  delete fields.mergeConflict
  delete fields.autoMerged
  const baseCommit = review.headSha(root)
  if (baseCommit) fields.baseCommit = baseCommit
  // domain 字段与文件实际位置保持一致（兼容无 domain 字段的历史知识）
  const fileDomain = path.dirname(path.relative(d, filePath))
  if (fileDomain !== '.') {
    fields.domain = fileDomain
  } else {
    delete fields.domain
  }
  const updated = buildFrontmatter(fields, content)
  const snap = review.newSnapshotDir(root, 'knowledge', nameKey)
  if (snap.error) throw new Error(snap.error)
  fs.writeFileSync(path.join(snap.dir, `${path.basename(filePath, '.md')}.md`), updated, 'utf-8')
}

export function del(root: string, relPath: string): void {
  const d = dir(root)
  const filePath = path.join(d, relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  const rel = path.relative(d, filePath).split(path.sep).join('/')
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  const c = review.commitFormalDeletion(root, `knowledges/${rel}`)
  if (!c.success) throw new Error(c.error || '提交删除失败')
  review.discardSnapshots(root, 'knowledge', rel.replace(/\.md$/, ''))
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
  // 队列内对应 nameKey 子树同步改名（草稿不丢）
  const qOld = path.join(review.queueDir(root), 'knowledges', oldName)
  const qNew = path.join(review.queueDir(root), 'knowledges', newName)
  if (fs.existsSync(qOld) && !fs.existsSync(qNew)) {
    fs.mkdirSync(path.dirname(qNew), { recursive: true })
    fs.renameSync(qOld, qNew)
  }
  // 刷新受影响知识的 domain 字段与子树内部 wikilink（含子目录）
  refreshDomainFields(d, newDir, oldName, newName)
  // 重写子树外其他知识中指向旧 domain 的 wikilink
  rewriteExternalLinks(root, d, newDir, oldName, newName)
}

function refreshDomainFields(baseDir: string, targetDir: string, oldName: string, newName: string): void {
  for (const item of fs.readdirSync(targetDir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(targetDir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      refreshDomainFields(baseDir, fullPath, oldName, newName)
    } else if (item.endsWith('.md')) {
      const raw = fs.readFileSync(fullPath, 'utf-8')
      // 仅改写带合法 frontmatter 的知识文件，非知识 .md 保持原样
      if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue
      const fileDomain = path.dirname(path.relative(baseDir, fullPath))
      const { fields, body } = parseFrontmatter(raw)
      fields.domain = fileDomain
      const newBody = rewriteDomainLinks(body, oldName, newName)
      fs.writeFileSync(fullPath, buildFrontmatter(fields, newBody), 'utf-8')
    }
  }
}

// 重写正文中 wikilink 指向旧 domain 的路径前缀（纯文件名引用不受影响）
function rewriteDomainLinks(body: string, oldName: string, newName: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixRe = new RegExp(`(^|\\/)${esc(oldName)}\\/`)
  return body.replace(/\[\[([^\]|]+?)(\.(?:md|mdx))?(\|[^\]]+)?\]\]/g, (m, rawTarget: string, ext: string, alias: string) => {
    const tick = rawTarget.includes('`')
    const t = rawTarget.trim().replace(/^`+|`+$/g, '')
    if (!prefixRe.test(t)) return m
    const replaced = t.replace(prefixRe, (_mm: string, p1: string) => `${p1}${newName}/`)
    return `[[${tick ? '`' + replaced + '`' : replaced}${ext || ''}${alias || ''}]]`
  })
}

// 重写移动子树之外其他知识中指向旧 domain 的 wikilink
function rewriteExternalLinks(root: string, baseDir: string, movedDir: string, oldName: string, newName: string): void {
  const movedRel = path.relative(baseDir, movedDir)
  for (const relPath of list(root)) {
    if (relPath.startsWith(movedRel + path.sep)) continue
    const filePath = path.join(baseDir, relPath)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue
    const { fields, body } = parseFrontmatter(raw)
    const newBody = rewriteDomainLinks(body, oldName, newName)
    if (newBody === body) continue
    fs.writeFileSync(filePath, buildFrontmatter(fields, newBody), 'utf-8')
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

// 全文检索知识（正式位置即最近过审版本），返回标题/元数据/摘要/命中上下文，不返回文档原文。
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

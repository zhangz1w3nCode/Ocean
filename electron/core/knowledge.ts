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
  description?: string
  tags?: string[]
}): void {
  const d = dir(root)
  const filePath = path.join(d, relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (fs.existsSync(filePath)) throw new Error(`知识已存在: ${relPath}`)
  const name = path.basename(filePath, '.md')
  let fm = `---\nname: ${name}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  if (opts?.tags && opts.tags.length > 0) {
    fm += `tags: [${opts.tags.join(', ')}]\n`
  }
  fm += `---\n\n${content}\n`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
}

export function update(root: string, relPath: string, content: string, opts?: {
  description?: string
  tags?: string[]
}): void {
  const filePath = path.join(dir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (!fs.existsSync(filePath)) throw new Error(`知识不存在: ${relPath}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.description !== undefined) fields.description = opts.description
  if (opts?.tags !== undefined) {
    if (opts.tags.length > 0) {
      fields.tags = `[${opts.tags.join(', ')}]`
    } else {
      delete fields.tags
    }
  }
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

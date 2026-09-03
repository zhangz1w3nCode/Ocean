import * as fs from 'node:fs'
import * as path from 'node:path'

export function dir(root: string): string {
  return path.join(root, '.nodes')
}

export function list(root: string): string[] {
  const d = dir(root)
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
}

export function read(root: string, name: string): string {
  const filePath = path.join(dir(root), `${name}.md`)
  return fs.readFileSync(filePath, 'utf-8')
}

export function create(root: string, name: string, content: string, opts?: {
  type?: string
  description?: string
}): void {
  const d = dir(root)
  const filePath = path.join(d, `${name}.md`)
  if (fs.existsSync(filePath)) throw new Error(`节点已存在: ${name}`)
  const type = opts?.type || 'business'
  let fm = `---\nname: ${name}\ntype: ${type}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  fm += `---\n\n${content}\n`
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
}

export function update(root: string, name: string, content: string, opts?: {
  type?: string
  description?: string
}): void {
  const filePath = path.join(dir(root), `${name}.md`)
  if (!fs.existsSync(filePath)) throw new Error(`节点不存在: ${name}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.type) fields.type = opts.type
  if (opts?.description) fields.description = opts.description
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, name: string): void {
  const filePath = path.join(dir(root), `${name}.md`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

// --- frontmatter helpers (shared inline) ---

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

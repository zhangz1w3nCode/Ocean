import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveAssetDir } from './executor'

export function dir(root: string): string {
  return path.join(root, resolveAssetDir(root), 'agents')
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
  description?: string
  model?: string
  color?: string
  tools?: string
  systemPromptMode?: string
  inheritProjectContext?: boolean
  inheritSkills?: boolean
}): void {
  const d = dir(root)
  const filePath = path.join(d, `${name}.md`)
  if (fs.existsSync(filePath)) throw new Error(`智能体已存在: ${name}`)
  const model = opts?.model || 'haiku'
  const systemPromptMode = opts?.systemPromptMode || 'inherit'
  const assetDir = resolveAssetDir(root)

  let fm = `---\nname: ${name}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  fm += `model: ${model}\n`
  // color: pi 不写（除非提供），claude 默认 blue（与 GUI storage.ts:1837-1845 一致）
  if (opts?.color) {
    fm += `color: ${opts.color}\n`
  } else if (assetDir === '.claude') {
    fm += `color: blue\n`
  }
  if (opts?.tools) fm += `tools: ${opts.tools}\n`
  fm += `systemPromptMode: ${systemPromptMode}\n`
  if (opts?.inheritProjectContext) fm += `inheritProjectContext: true\n`
  if (opts?.inheritSkills) fm += `inheritSkills: true\n`
  fm += `---\n\n${content}\n`

  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
}

export function update(root: string, name: string, content: string, opts?: {
  description?: string
  model?: string
  color?: string
  tools?: string
  systemPromptMode?: string
  inheritProjectContext?: boolean
  inheritSkills?: boolean
}): void {
  const filePath = path.join(dir(root), `${name}.md`)
  if (!fs.existsSync(filePath)) throw new Error(`智能体不存在: ${name}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.description !== undefined) fields.description = opts.description
  if (opts?.model) fields.model = opts.model
  if (opts?.color) fields.color = opts.color
  if (opts?.tools !== undefined) fields.tools = opts.tools
  if (opts?.systemPromptMode) fields.systemPromptMode = opts.systemPromptMode
  if (opts?.inheritProjectContext !== undefined) fields.inheritProjectContext = String(opts.inheritProjectContext)
  if (opts?.inheritSkills !== undefined) fields.inheritSkills = String(opts.inheritSkills)
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, name: string): void {
  const filePath = path.join(dir(root), `${name}.md`)
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

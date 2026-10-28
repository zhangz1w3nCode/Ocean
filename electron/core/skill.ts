import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveAssetDir } from './executor'

export function baseDir(root: string): string {
  return path.join(root, resolveAssetDir(root), 'skills')
}

export function list(root: string): string[] {
  const d = baseDir(root)
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
}

export function read(root: string, name: string): string {
  const filePath = path.join(baseDir(root), name, 'SKILL.md')
  return fs.readFileSync(filePath, 'utf-8')
}

export function create(root: string, name: string, content: string, description: string): void {
  if (!description || !description.trim()) {
    throw new Error('技能描述为必填项（与 GUI ApplyModal.tsx:148 验证一致）')
  }
  const d = baseDir(root)
  const skillDir = path.join(d, name)
  if (fs.existsSync(skillDir)) throw new Error(`技能目录已存在: ${name}`)

  fs.mkdirSync(skillDir, { recursive: true })
  for (const subDir of ['scripts', 'references', 'examples']) {
    fs.mkdirSync(path.join(skillDir, subDir), { recursive: true })
  }

  const skillMd = `---\nname: ${name}\ndescription: ${description}\n---\n${content}\n`
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8')
}

export function update(root: string, name: string, content: string): void {
  const filePath = path.join(baseDir(root), name, 'SKILL.md')
  if (!fs.existsSync(filePath)) throw new Error(`技能不存在: ${name}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, name: string): void {
  const skillDir = path.join(baseDir(root), name)
  if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
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
  fm += `---\n${body}\n`
  return fm
}

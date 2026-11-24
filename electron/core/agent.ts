import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveAssetDir } from './executor'
// 暂存队列模型：正式位置只存过审版本；create/update 只写 reviewQueue 快照（G3）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('./review.cjs')

const TYPE = 'agent'

export function dir(root: string): string {
  return path.join(root, '.ocean', 'agents')
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
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  return fs.readFileSync(review.resolveReadPath(root, ref.refPath), 'utf-8')
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
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  if (fs.existsSync(review.resolveReadPath(root, ref.refPath))) throw new Error(`智能体已存在: ${name}`)
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
  fm += `reviewStatus: pending\n`
  fm += `---\n\n${content}\n`

  const snap = review.newSnapshotDir(root, TYPE, name)
  if (snap.error) throw new Error(snap.error)
  fs.writeFileSync(path.join(snap.dir, `${name}.md`), fm, 'utf-8')
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
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  const formalPath = review.resolveReadPath(root, ref.refPath)
  const draft = review.latestDraft(root, TYPE, name)
  const basePath = draft ? draft.mainFile : formalPath
  if (!fs.existsSync(basePath)) throw new Error(`智能体不存在: ${name}`)
  const raw = fs.readFileSync(basePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.description !== undefined) fields.description = opts.description
  if (opts?.model) fields.model = opts.model
  if (opts?.color) fields.color = opts.color
  if (opts?.tools !== undefined) fields.tools = opts.tools
  if (opts?.systemPromptMode) fields.systemPromptMode = opts.systemPromptMode
  if (opts?.inheritProjectContext !== undefined) fields.inheritProjectContext = String(opts.inheritProjectContext)
  if (opts?.inheritSkills !== undefined) fields.inheritSkills = String(opts.inheritSkills)
  fields.reviewStatus = 'pending'
  delete fields.rejectReason
  delete fields.version
  const updated = buildFrontmatter(fields, content)

  const snap = review.newSnapshotDir(root, TYPE, name)
  if (snap.error) throw new Error(snap.error)
  fs.writeFileSync(path.join(snap.dir, `${name}.md`), updated, 'utf-8')
}

export function del(root: string, name: string): void {
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  const filePath = review.resolveReadPath(root, ref.refPath)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  const c = review.commitFormalDeletion(root, ref.refPath)
  if (!c.success) throw new Error(c.error || '提交删除失败')
  review.discardSnapshots(root, TYPE, name)
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

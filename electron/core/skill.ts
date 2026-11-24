import * as fs from 'node:fs'
import * as path from 'node:path'
// 暂存队列模型：正式位置只存过审版本；create/update 只写 reviewQueue 快照（G3）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('./review.cjs')

const TYPE = 'skill'

export function baseDir(root: string): string {
  return path.join(root, '.ocean', 'skills')
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
  // 读取一律正式位置（G7）：正式文件即最近过审版本
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  return fs.readFileSync(review.resolveReadPath(root, ref.refPath), 'utf-8')
}

export function create(root: string, name: string, content: string, description: string): void {
  if (!description || !description.trim()) {
    throw new Error('技能描述为必填项（与 GUI ApplyModal.tsx:148 验证一致）')
  }
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  if (fs.existsSync(review.resolveReadPath(root, ref.refPath))) throw new Error(`技能目录已存在: ${name}`)

  const snap = review.newSnapshotDir(root, TYPE, name)
  if (snap.error) throw new Error(snap.error)
  for (const subDir of ['scripts', 'references', 'examples']) {
    fs.mkdirSync(path.join(snap.dir, subDir), { recursive: true })
  }
  const skillMd = `---\nname: ${name}\ndescription: ${description}\nreviewStatus: pending\n---\n${content}\n`
  fs.writeFileSync(path.join(snap.dir, 'SKILL.md'), skillMd, 'utf-8')
}

export function update(root: string, name: string, content: string): void {
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  const formalPath = review.resolveReadPath(root, ref.refPath)
  const draft = review.latestDraft(root, TYPE, name)
  const basePath = draft ? draft.mainFile : formalPath
  if (!fs.existsSync(basePath)) throw new Error(`技能不存在: ${name}`)
  const raw = fs.readFileSync(basePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  fields.reviewStatus = 'pending'
  delete fields.rejectReason
  delete fields.version

  const snap = review.newSnapshotDir(root, TYPE, name)
  if (snap.error) throw new Error(snap.error)
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(path.join(snap.dir, 'SKILL.md'), updated, 'utf-8')
}

export function del(root: string, name: string): void {
  const ref = review.resolveRef(root, TYPE, name)
  if (ref.error) throw new Error(ref.error)
  const skillDir = review.resolveReadPath(root, `skills/${name}`)
  if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
  const c = review.commitFormalDeletion(root, `skills/${name}`)
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
  fm += `---\n${body}\n`
  return fm
}

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
  assertSkillName(name)
  const filePath = path.join(baseDir(root), name, 'SKILL.md')
  if (!fs.existsSync(filePath)) throw new Error(`技能不存在: ${name}`)
  return fs.readFileSync(filePath, 'utf-8')
}

export interface SkillAttachment {
  name: string
  content: string
}

export interface SkillAttachments {
  scripts?: SkillAttachment[]
  references?: SkillAttachment[]
  examples?: SkillAttachment[]
}

const SKILL_SUB_DIRS = ['scripts', 'references', 'examples'] as const
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

export function create(root: string, name: string, content: string, description: string, attachments: SkillAttachments = {}): void {
  assertSkillName(name)
  if (!description || !description.trim()) {
    throw new Error('技能描述为必填项（与 GUI ApplyModal.tsx:148 验证一致）')
  }
  if (!content || !content.trim()) {
    throw new Error('技能正文为必填项（与 GUI SkillModal.tsx:414 验证一致）')
  }
  validateAttachments(attachments)

  const d = baseDir(root)
  const skillDir = path.join(d, name)
  fs.mkdirSync(d, { recursive: true })
  // 末段目录不加 recursive：让 EEXIST 原生抛出，构成原子的 check-and-create。
  // 否则并发下 mkdir 会吞掉已存在目录，再由 catch 的 rmSync 误删他人数据。
  try {
    fs.mkdirSync(skillDir)
  } catch (e: any) {
    if (e && e.code === 'EEXIST') throw new Error(`技能目录已存在: ${name}`)
    throw e
  }
  try {
    for (const subDir of SKILL_SUB_DIRS) {
      fs.mkdirSync(path.join(skillDir, subDir), { recursive: true })
    }

    const skillMd = `---\nname: ${name}\ndescription: ${description}\n---\n${content}\n`
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8')

    for (const subDir of SKILL_SUB_DIRS) {
      for (const file of attachments[subDir] || []) {
        fs.writeFileSync(path.join(skillDir, subDir, file.name), file.content, 'utf-8')
      }
    }
  } catch (e) {
    fs.rmSync(skillDir, { recursive: true, force: true })
    throw e
  }
}

function validateAttachments(attachments: SkillAttachments): void {
  for (const subDir of SKILL_SUB_DIRS) {
    const files = attachments[subDir]
    if (!files) continue
    const seen = new Set<string>()
    for (const file of files) {
      assertSafeFileName(subDir, file && file.name)
      // 与 addResource 的内容必填校验保持一致，避免同一语义两条路径规则不对称
      if (typeof file.content !== 'string' || !file.content.trim()) {
        throw new Error(`${subDir} 附件 ${file.name} 内容为空（与 addResource 一致，附属文件内容必填）`)
      }
      if (seen.has(file.name)) {
        throw new Error(`${subDir} 文件名重复: ${file.name}`)
      }
      seen.add(file.name)
    }
  }
}

export function update(root: string, name: string, content: string): void {
  assertSkillName(name)
  const filePath = path.join(baseDir(root), name, 'SKILL.md')
  if (!fs.existsSync(filePath)) throw new Error(`技能不存在: ${name}`)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
}

export function del(root: string, name: string): void {
  assertSkillName(name)
  const skillDir = path.join(baseDir(root), name)
  if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
}

export type SkillResourceType = 'scripts' | 'references' | 'examples'

export function listResources(root: string, name: string, type: string): string[] {
  const skillDir = requireSkill(root, name)
  const t = assertResourceType(type)
  const d = resolveTypeDir(skillDir, t)
  if (!fs.existsSync(d)) return []
  // 只排除目录：保留普通文件与符号链接，与 GUI list-skill-resources 的无过滤 readdirSync 对齐
  return fs.readdirSync(d, { withFileTypes: true }).filter(e => !e.isDirectory()).map(e => e.name).sort()
}

export function readResource(root: string, name: string, type: string, fileName: string): string {
  const skillDir = requireSkill(root, name)
  const t = assertResourceType(type)
  assertSafeFileName(t, fileName)
  const filePath = path.join(resolveTypeDir(skillDir, t), fileName)
  if (!fs.existsSync(filePath)) throw new Error(`${t} 下不存在文件: ${fileName}`)
  return fs.readFileSync(filePath, 'utf-8')
}

// 语义与 GUI 技能页「添加文件」一致，但两处来源不同，分开标注以免误读：
//   重名拒 —— 来自 UI 层 SkillResourceEditModal 的新建态校验；IPC save-skill-resource 本身是无条件覆写（upsert）
//   子目录缺失时按需创建 —— 来自主进程 getSkillSubDir
// 因此本函数是 create-only：要覆写已存在的资源文件需先 resource delete 再 create
export function addResource(root: string, name: string, type: string, fileName: string, content: string): void {
  const skillDir = requireSkill(root, name)
  const t = assertResourceType(type)
  assertSafeFileName(t, fileName)
  if (!content || !content.trim()) {
    throw new Error('资源文件内容为必填项（与 GUI SkillResourceEditModal 新建校验一致）')
  }
  const dir = resolveTypeDir(skillDir, t)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  if (fs.existsSync(filePath)) {
    throw new Error(`${t} 下文件已存在: ${fileName}（GUI 新建时同样拒绝重名）`)
  }
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function deleteResource(root: string, name: string, type: string, fileName: string): void {
  const skillDir = requireSkill(root, name)
  const t = assertResourceType(type)
  assertSafeFileName(t, fileName)
  const filePath = path.join(resolveTypeDir(skillDir, t), fileName)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function requireSkill(root: string, name: string): string {
  assertSkillName(name)
  const d = baseDir(root)
  const skillDir = path.join(d, name)
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) throw new Error(`技能不存在: ${name}`)
  // 技能目录本身被换成指向 skills 根外的符号链接时，后续读写会穿透，故先校真实路径
  assertWithinParent(fs.realpathSync(d), fs.realpathSync(skillDir), '技能目录')
  return skillDir
}

function assertWithinParent(realParent: string, realTarget: string, label: string): void {
  if (!realTarget.startsWith(realParent + path.sep)) {
    throw new Error(`${label}的真实路径超出允许范围，已拒绝以避免越界读写: ${realTarget}`)
  }
}

// 解析附属文件类型目录；若已存在则先确认其真实路径仍在技能目录内
function resolveTypeDir(skillDir: string, t: SkillResourceType): string {
  const dir = path.join(skillDir, t)
  if (fs.existsSync(dir)) {
    assertWithinParent(fs.realpathSync(skillDir), fs.realpathSync(dir), `${t} 目录`)
  }
  return dir
}

function assertSkillName(name: string): void {
  // 与 GUI 新建技能时的名称格式校验同源（SkillModal 限定字母/数字/中划线/下划线）；不写行号以免随文件演进腐化
  if (!name || !SKILL_NAME_PATTERN.test(name)) {
    throw new Error(`技能名称只能包含字母、数字、中划线和下划线: ${name}`)
  }
}

function assertResourceType(type: string | undefined): SkillResourceType {
  if (!type || !(SKILL_SUB_DIRS as readonly string[]).includes(type)) {
    throw new Error(`资源类型必须是 scripts / references / examples 之一: ${type}`)
  }
  return type as SkillResourceType
}

function assertSafeFileName(subDir: string, fileName: string): void {
  if (!fileName || !fileName.trim()) {
    throw new Error(`${subDir} 存在空文件名`)
  }
  if (fileName === '.' || fileName === '..' || fileName !== path.basename(fileName) || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error(`${subDir} 文件名非法（不允许 . 或 .. 或路径分隔符）: ${fileName}`)
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
  fm += `---\n${body}\n`
  return fm
}

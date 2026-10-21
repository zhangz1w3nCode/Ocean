// 技能域 CRUD 统一实现 —— CLI（ocean skill）与桌面端/网页端共用的唯一事实源。
// 由 core/skill.ts 迁移而来（CLI 语义组）+ launch.cjs 技能文件/技能模板 IPC 内联实现（GUI 语义组），
// 行为零变更：两组语义并存，底层共享同一份文件操作。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（存储在资产根下，随 assetRoot 变化）：
//   {root}/{.claude|.pi}/skills/{name}/SKILL.md — YAML frontmatter（name/description）+ 正文；
//   子目录 scripts/references/examples 存资源文件。GUI 链路由前端组装完整 Markdown
//   （generateSkillMarkdown：name+description frontmatter）后整文件写入；
//   CLI create 由 core 组装 frontmatter，update 以原 frontmatter 为基底增量重建。
//   GUI create 的 SKILL.md 无尾换行且不校验 description，CLI create 有尾换行且必填——
//   双端既有差异，按双语义组逐字复刻，不做统一。
//
// 技能模板文件（GUI-only，无 CLI 对应命令）固定存 {root}/.ocean/template/skill/{type}.json，
// 不随 assetRoot 变化；内容 { content, updatedAt } JSON。
//
// assetRoot 解析与 core/executor.ts resolveAssetDir / launch.cjs getAssetRoot 同源：
// 读 {root}/.ocean/asset-root.json（assetRoot === 'pi' → .pi，否则 .claude）。

import * as fs from 'node:fs'
import * as path from 'node:path'

// GUI create-skill-directory 的输入（前端 SkillModal 组装）
export interface SkillDirectoryInput {
  description?: string
  content?: string
  scripts?: { name: string; content: string }[]
  references?: { name: string; content: string }[]
  examples?: { name: string; content: string }[]
}

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助：路径 / frontmatter
// ---------------------------------------------------------------------------

// 读 {root}/.ocean/asset-root.json（与 executor.ts resolveAssetDir、launch.cjs getAssetRoot 同一语义）
function resolveAssetDir(root: string): string {
  try {
    const configPath = path.join(root, '.ocean', 'asset-root.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.assetRoot === 'pi') return '.pi'
    }
  } catch {
    // ignore
  }
  return '.claude'
}

function skillsDir(root: string): string {
  return path.join(root, resolveAssetDir(root), 'skills')
}

// GUI 原语义：launch.cjs getSkillsDir() 读取目录时同步创建（load/delete/list 也触发该副作用）
function ensureSkillsDir(root: string): string {
  const dir = skillsDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// GUI 原语义：launch.cjs getSkillSubDir() 保存资源前同步创建 skillDir + subDir 两层
function ensureSkillSubDir(root: string, skillName: string, subDir: string): string {
  const dir = path.join(ensureSkillsDir(root), skillName, subDir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function skillMdPath(root: string, name: string): string {
  return path.join(skillsDir(root), name, 'SKILL.md')
}

// 解析 YAML frontmatter（简单 key: value 行，自 core/skill.ts 原样迁移）
function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
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

// 序列化 YAML frontmatter（字段顺序 = 对象插入序，与原实现一致）
function buildFrontmatter(fields: Record<string, string>, body: string): string {
  let fm = '---\n'
  for (const [key, val] of Object.entries(fields)) {
    fm += `${key}: ${val}\n`
  }
  fm += `---\n${body}\n`
  return fm
}

// ---------------------------------------------------------------------------
// GUI 语义组（launch.cjs 技能文件 / 技能模板 IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// create-skill-directory：create-only（重名报错，文案不含技能名），建 scripts/references/examples
// 子目录与 input 内资源文件；SKILL.md 无尾换行、description 无校验（与 CLI 组差异）
export function createSkillDirectory(root: string, name: string, input: SkillDirectoryInput): { success: true } | Failed {
  const skillDir = path.join(ensureSkillsDir(root), name)
  if (fs.existsSync(skillDir)) {
    return { success: false, error: '技能目录已存在' }
  }

  fs.mkdirSync(skillDir, { recursive: true })
  for (const subDir of ['scripts', 'references', 'examples']) {
    fs.mkdirSync(path.join(skillDir, subDir), { recursive: true })
  }

  const skillMdContent = `---
name: ${name}
description: ${input.description || ''}
---
${input.content || ''}`
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8')

  if (input.scripts) {
    for (const script of input.scripts) {
      fs.writeFileSync(path.join(skillDir, 'scripts', script.name), script.content, 'utf-8')
    }
  }
  if (input.references) {
    for (const ref of input.references) {
      fs.writeFileSync(path.join(skillDir, 'references', ref.name), ref.content, 'utf-8')
    }
  }
  if (input.examples) {
    for (const ex of input.examples) {
      fs.writeFileSync(path.join(skillDir, 'examples', ex.name), ex.content, 'utf-8')
    }
  }

  return { success: true }
}

// save-skill-file：无条件覆写（upsert），目录不存在时只建 skillDir（不建子目录），
// content 为前端组装的完整 Markdown，原样哑写
export function saveSkillFile(root: string, name: string, content: string): { success: true } | Failed {
  const skillDir = path.join(ensureSkillsDir(root), name)
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true })
  }
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
  return { success: true }
}

// load-skill-file：文件不存在返回 content:null（不是失败）
export function readSkillFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(ensureSkillsDir(root), name, 'SKILL.md')
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-skill-directory：目录不存在静默成功
export function deleteSkillDirectory(root: string, name: string): { success: true } | Failed {
  const skillDir = path.join(ensureSkillsDir(root), name)
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true })
  }
  return { success: true }
}

// load-all-skill-directories：返回目录名（readdirSync 原始顺序，不排序、不校验 SKILL.md）
export function listSkillDirectories(root: string): { success: true; directories: string[] } | Failed {
  const dir = ensureSkillsDir(root)
  const directories = fs.readdirSync(dir)
    .filter(file => {
      const filePath = path.join(dir, file)
      return fs.statSync(filePath).isDirectory()
    })
  return { success: true, directories }
}

// save-skill-resource：ensureSkillSubDir 副作用（建 skillDir + subDir 两层）后写文件
export function saveSkillResource(root: string, skillName: string, resourceType: string, fileName: string, content: string): { success: true } | Failed {
  const subDir = ensureSkillSubDir(root, skillName, resourceType)
  fs.writeFileSync(path.join(subDir, fileName), content, 'utf-8')
  return { success: true }
}

// load-skill-resource：文件不存在返回 content:null；只 ensureDir skills 根，不建子目录
export function readSkillResource(root: string, skillName: string, resourceType: string, fileName: string): { success: true; content: string | null } | ({ success: false; error: string } & { content: null }) {
  const filePath = path.join(ensureSkillsDir(root), skillName, resourceType, fileName)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  return { success: true, content }
}

// delete-skill-resource：文件不存在静默成功
export function deleteSkillResource(root: string, skillName: string, resourceType: string, fileName: string): { success: true } | Failed {
  const filePath = path.join(ensureSkillsDir(root), skillName, resourceType, fileName)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true }
}

// list-skill-resources：子目录不存在返回 files:[]（且不建子目录）；返回原始序文件名
export function listSkillResourceFiles(root: string, skillName: string, resourceType: string): { success: true; files: string[] } | Failed {
  const subDirPath = path.join(ensureSkillsDir(root), skillName, resourceType)
  if (!fs.existsSync(subDirPath)) {
    return { success: true, files: [] }
  }
  const files = fs.readdirSync(subDirPath)
  return { success: true, files }
}

// save-skill-template-file：{root}/.ocean/template/skill/{type}.json，不随 assetRoot
export function saveSkillTemplateFile(root: string, templateType: string, content: string): { success: true } | Failed {
  const templateDir = path.join(root, '.ocean', 'template', 'skill')
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true })
  }
  const filePath = path.join(templateDir, `${templateType}.json`)
  const templateData = {
    content,
    updatedAt: new Date().toISOString()
  }
  fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2), 'utf-8')
  return { success: true }
}

// load-skill-template-file：不存在返回 { success:false, content:null }（missing = 失败，
// 与技能文件 load 的 null-成功语义相反——launch.cjs 既有行为，逐字复刻）；
// JSON 解析失败向上抛（desktop 壳 catch 包成 error.message）
export function readSkillTemplateFile(root: string, templateType: string): { success: true; content: string } | { success: false; content: null; error?: string } {
  const filePath = path.join(root, '.ocean', 'template', 'skill', `${templateType}.json`)
  if (!fs.existsSync(filePath)) {
    return { success: false, content: null }
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const templateData = JSON.parse(fileContent)
  return { success: true, content: templateData.content }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/skill.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

// 目录名数组，sort 排序；目录不存在返回空（不建目录，与 GUI 组副作用区分）
export function listSkills(root: string): { success: true; names: string[] } | Failed {
  const d = skillsDir(root)
  if (!fs.existsSync(d)) return { success: true, names: [] }
  const names = fs.readdirSync(d, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
  return { success: true, names }
}

// 读取原文（含 frontmatter）；文件不存在时保留系统错误原文（ENOENT），CLI 输出与迁移前一致
export function readSkill(root: string, name: string): { success: true; content: string } | Failed {
  try {
    const content = fs.readFileSync(skillMdPath(root, name), 'utf-8')
    return { success: true, content }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// description 必填（与 GUI ApplyModal.tsx:148 验证一致——原错误文案原样保留）；
// create-only（重名报错，文案含技能名）；SKILL.md 有尾换行（与 GUI 组差异）
export function createSkill(root: string, name: string, content: string, description: string): { success: true } | Failed {
  if (!description || !description.trim()) {
    return { success: false, error: '技能描述为必填项（与 GUI ApplyModal.tsx:148 验证一致）' }
  }
  const d = skillsDir(root)
  const skillDir = path.join(d, name)
  if (fs.existsSync(skillDir)) return { success: false, error: `技能目录已存在: ${name}` }

  fs.mkdirSync(skillDir, { recursive: true })
  for (const subDir of ['scripts', 'references', 'examples']) {
    fs.mkdirSync(path.join(skillDir, subDir), { recursive: true })
  }

  const skillMd = `---
name: ${name}
description: ${description}
---
${content}
`
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8')
  return { success: true }
}

// 前置存在检查 + 以原 frontmatter 为基底增量重建（未知字段与字段顺序保留）
export function updateSkill(root: string, name: string, content: string): { success: true } | Failed {
  const filePath = skillMdPath(root, name)
  if (!fs.existsSync(filePath)) return { success: false, error: `技能不存在: ${name}` }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
  return { success: true }
}

// 目录不存在静默成功（与 GUI delete 同语义，但无 ensureDir 副作用）
export function delSkill(root: string, name: string): { success: true } | Failed {
  const skillDir = path.join(skillsDir(root), name)
  if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true })
  return { success: true }
}

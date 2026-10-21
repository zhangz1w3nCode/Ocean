// 资源域 CRUD 统一实现 —— CLI（ocean resource）与桌面端/网页端共用的唯一事实源。
// 由 core/resource.ts 迁移而来（CLI 语义组）+ launch.cjs 资源 IPC 内联实现（GUI 语义组），
// 行为零变更：两组语义并存，底层共享同一份文件操作。
//
// 契约：原子操作返回 { success: true, ...data } | { success: false, error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（存储在项目根 .resources/ 下，不随 assetRoot 变化）：
//   {root}/.resources/{name}.md — YAML frontmatter 记录元信息（CLI create 生成
//   id/type/description），正文为资源内容。GUI 链路由前端组装完整 Markdown 后整文件写入。

import * as fs from 'node:fs'
import * as path from 'node:path'

// CLI create / update 的可选元信息
export interface ResourceWriteOpts {
  type?: string
  description?: string
}

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助：路径 / frontmatter
// ---------------------------------------------------------------------------

function resourcesDir(root: string): string {
  return path.join(root, '.resources')
}

// GUI 原语义：launch.cjs getResourcesDir() 读取目录时同步创建（load/delete 也触发该副作用）
function ensureResourcesDir(root: string): string {
  const dir = resourcesDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function resourcePath(root: string, name: string): string {
  return path.join(resourcesDir(root), `${name}.md`)
}

// 解析 YAML frontmatter（简单 key: value 行，自 core/resource.ts 原样迁移）
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
  fm += `---\n\n${body}\n`
  return fm
}

// ---------------------------------------------------------------------------
// GUI 语义组（launch.cjs resource IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// save-resource-file：无条件覆写（upsert），content 为前端组装的完整 Markdown
export function saveResourceFile(root: string, name: string, content: string): { success: true } | Failed {
  ensureResourcesDir(root)
  fs.writeFileSync(resourcePath(root, name), content, 'utf-8')
  return { success: true }
}

// load-resource-file：文件不存在返回 content:null（不是失败）
export function readResourceFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  ensureResourcesDir(root)
  const filePath = resourcePath(root, name)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-resource-file：文件不存在静默成功
export function deleteResourceFile(root: string, name: string): { success: true } | Failed {
  ensureResourcesDir(root)
  const filePath = resourcePath(root, name)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

// load-all-resource-files：返回完整 .md 文件名（readdirSync 顺序，不排序）
export function listResourceFiles(root: string): { success: true; files: string[] } | Failed {
  ensureResourcesDir(root)
  const files = fs.readdirSync(resourcesDir(root))
    .filter(file => file.endsWith('.md'))
  return { success: true, files }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/resource.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

export function listResources(root: string): { success: true; names: string[] } | Failed {
  const d = resourcesDir(root)
  if (!fs.existsSync(d)) return { success: true, names: [] }
  const names = fs.readdirSync(d)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
  return { success: true, names }
}

// 读取原文（含 frontmatter）；文件不存在时保留系统错误原文（ENOENT），CLI 输出与迁移前一致
export function readResource(root: string, name: string): { success: true; content: string } | Failed {
  try {
    const content = fs.readFileSync(resourcePath(root, name), 'utf-8')
    return { success: true, content }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// create-only（重名失败）+ frontmatter 组装（id 自动生成）
export function createResource(root: string, name: string, content: string, opts?: ResourceWriteOpts): { success: true } | Failed {
  const d = resourcesDir(root)
  const filePath = path.join(d, `${name}.md`)
  if (fs.existsSync(filePath)) return { success: false, error: `资源已存在: ${name}` }
  const type = opts?.type || 'rule'
  const id = `${name}-${Date.now()}`
  let fm = `---\nid: ${id}\ntype: ${type}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  fm += `---\n\n${content}\n`
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
  return { success: true }
}

// 前置存在检查 + 以原 frontmatter 为基底增量更新（未知字段与字段顺序保留）
export function updateResource(root: string, name: string, content: string, opts?: ResourceWriteOpts): { success: true } | Failed {
  const filePath = resourcePath(root, name)
  if (!fs.existsSync(filePath)) return { success: false, error: `资源不存在: ${name}` }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.type) fields.type = opts.type
  if (opts?.description) fields.description = opts.description
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
  return { success: true }
}

// 文件不存在静默成功（与 GUI delete 同语义，但无 ensureDir 副作用）
export function delResource(root: string, name: string): { success: true } | Failed {
  const filePath = resourcePath(root, name)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

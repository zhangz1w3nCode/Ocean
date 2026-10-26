// 节点域统一实现 —— CLI（ocean node）与桌面端/网页端共用的唯一事实源。
// 由 core/node.ts 迁移而来（CLI 语义组）+ launch.cjs 节点文件/局部节点内联实现（GUI 语义组），
// 行为零变更：两组语义并存，底层共享同一份文件操作与 frontmatter helper。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（两组存储位置均跨资产来源共享，不随 assetRoot 变化）：
//   全局节点：{root}/.nodes/{name}.md — YAML frontmatter（name/type 默认 business/description）+ 正文。
//   局部节点：{root}/.workflows/{workflowName}/nodes/{name}.md — 工作流作用域。
//   GUI 链路由前端组装完整 Markdown（generateNodeMarkdown）后整文件哑写；
//   CLI create 由 core 组装 frontmatter（后空行 + 尾换行），update 增量重建。

import * as fs from 'node:fs'
import * as path from 'node:path'

// CLI create / update 的可选元信息
export interface NodeWriteOpts {
  type?: string
  description?: string
}

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助：路径 / frontmatter
// ---------------------------------------------------------------------------

function nodesDir(root: string): string {
  return path.join(root, '.nodes')
}

// GUI 原语义：launch.cjs getNodesDir() 读取目录时同步创建（load/delete/list 也触发该副作用）
function ensureNodesDir(root: string): string {
  const dir = nodesDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// GUI 原语义：launch.cjs getWorkflowsDir() 同步创建（经 getWorkflowFolderPath 触发，
// 局部节点读操作只建 .workflows 根，不建 {wf}/nodes）
function ensureWorkflowsDir(root: string): string {
  const dir = path.join(root, '.workflows')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function localNodesDir(root: string, workflowName: string): string {
  return path.join(ensureWorkflowsDir(root), workflowName, 'nodes')
}

// 解析 YAML frontmatter（简单 key: value 行，自 core/node.ts 原样迁移）
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

// 序列化 YAML frontmatter（字段顺序 = 对象插入序；后空行 + 尾换行，与原实现一致）
function buildFrontmatter(fields: Record<string, string>, body: string): string {
  let fm = '---\n'
  for (const [key, val] of Object.entries(fields)) {
    fm += `${key}: ${val}\n`
  }
  fm += `---\n\n${body}\n`
  return fm
}

// ---------------------------------------------------------------------------
// GUI 语义组（launch.cjs 节点 IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// save-node-file：哑写（content 为前端组装的完整 Markdown，原样落盘）
export function saveNodeFile(root: string, name: string, content: string): { success: true } | Failed {
  const filePath = path.join(ensureNodesDir(root), `${name}.md`)
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-node-file：文件不存在返回 content:null（不是失败）
export function readNodeFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(ensureNodesDir(root), `${name}.md`)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-node-file：文件不存在静默成功
export function deleteNodeFile(root: string, name: string): { success: true } | Failed {
  const filePath = path.join(ensureNodesDir(root), `${name}.md`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true }
}

// load-all-node-files：返回带 .md 后缀的文件名（readdirSync 原始顺序，不排序；排除非 .md）
export function listNodeFiles(root: string): { success: true; files: string[] } | Failed {
  const dir = ensureNodesDir(root)
  const files = fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => file)
  return { success: true, files }
}

// save-local-node：{root}/.workflows/{wf}/nodes/{name}.md，ensureDir 两级（wf + nodes）
export function saveLocalNode(root: string, workflowName: string, nodeName: string, content: string): { success: true } | Failed {
  const dir = localNodesDir(root, workflowName)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filePath = path.join(dir, `${nodeName}.md`)
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-local-node：ghost 返回 content:null；只触发 .workflows 根创建，不建 {wf}/nodes
export function readLocalNode(root: string, workflowName: string, nodeName: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(localNodesDir(root, workflowName), `${nodeName}.md`)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-local-node：文件不存在静默成功
export function deleteLocalNode(root: string, workflowName: string, nodeName: string): { success: true } | Failed {
  const filePath = path.join(localNodesDir(root, workflowName), `${nodeName}.md`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true }
}

// load-all-local-nodes：带 .md 后缀、原始顺序；目录不存在 {success:true, files:[]}
export function listLocalNodes(root: string, workflowName: string): { success: true; files: string[] } | Failed {
  const dir = localNodesDir(root, workflowName)
  if (!fs.existsSync(dir)) {
    return { success: true, files: [] }
  }
  const files = fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => file)
  return { success: true, files }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/node.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

// 剥 .md 后缀名称数组，sort 排序；目录不存在返回空（不建目录，与 GUI 组副作用区分）
export function listNodes(root: string): { success: true; names: string[] } | Failed {
  const d = nodesDir(root)
  if (!fs.existsSync(d)) return { success: true, names: [] }
  const names = fs.readdirSync(d)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
  return { success: true, names }
}

// 读取原文（含 frontmatter）；文件不存在时保留系统错误原文（ENOENT）
export function readNode(root: string, name: string): { success: true; content: string } | Failed {
  try {
    const content = fs.readFileSync(path.join(nodesDir(root), `${name}.md`), 'utf-8')
    return { success: true, content }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// create-only（重名报错）；frontmatter：name + type（默认 business）+ description 可选
export function createNode(root: string, name: string, content: string, opts?: NodeWriteOpts): { success: true } | Failed {
  const d = nodesDir(root)
  const filePath = path.join(d, `${name}.md`)
  if (fs.existsSync(filePath)) return { success: false, error: `节点已存在: ${name}` }
  const type = opts?.type || 'business'
  let fm = `---\nname: ${name}\ntype: ${type}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  fm += `---\n\n${content}\n`
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
  return { success: true }
}

// 前置存在检查 + 以原 frontmatter 为基底增量更新（type/description 显式提供则覆盖，未知字段与顺序保留）
export function updateNode(root: string, name: string, content: string, opts?: NodeWriteOpts): { success: true } | Failed {
  const filePath = path.join(nodesDir(root), `${name}.md`)
  if (!fs.existsSync(filePath)) return { success: false, error: `节点不存在: ${name}` }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.type) fields.type = opts.type
  if (opts?.description) fields.description = opts.description
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
  return { success: true }
}

// 文件不存在静默成功（无 ensureDir 副作用）
export function delNode(root: string, name: string): { success: true } | Failed {
  const filePath = path.join(nodesDir(root), `${name}.md`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

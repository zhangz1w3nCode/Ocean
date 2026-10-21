// 智能体域 CRUD 统一实现 —— CLI（ocean agent）与桌面端/网页端共用的唯一事实源。
// 由 core/agent.ts 迁移而来（CLI 语义组）+ launch.cjs 智能体 IPC 内联实现（GUI 语义组），
// 行为零变更：两组语义并存，底层共享同一份文件操作。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false, error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（存储在资产根下，随 assetRoot 变化）：
//   {root}/{.claude|.pi}/agents/{name}.md — YAML frontmatter 记录元信息
//   （name/description/model/color/tools/systemPromptMode/inheritProjectContext/inheritSkills），
//   正文为智能体提示词。GUI 链路由前端组装完整 Markdown（以 rawFrontmatter 为基底合并，
//   保留未知字段）后整文件写入。
//
// assetRoot 解析与 core/executor.ts resolveAssetDir / launch.cjs getAssetRoot 同源：
// 读 {root}/.ocean/asset-root.json（assetRoot === 'pi' → .pi，否则 .claude）。

import * as fs from 'node:fs'
import * as path from 'node:path'

// CLI create / update 的可选元信息
export interface AgentWriteOpts {
  description?: string
  model?: string
  color?: string
  tools?: string
  systemPromptMode?: string
  inheritProjectContext?: boolean
  inheritSkills?: boolean
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

function agentsDir(root: string): string {
  return path.join(root, resolveAssetDir(root), 'agents')
}

// GUI 原语义：launch.cjs getAgentsDir() 读取目录时同步创建（load/delete 也触发该副作用）
function ensureAgentsDir(root: string): string {
  const dir = agentsDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function agentPath(root: string, name: string): string {
  return path.join(agentsDir(root), `${name}.md`)
}

// 解析 YAML frontmatter（简单 key: value 行，自 core/agent.ts 原样迁移）
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
// GUI 语义组（launch.cjs agent IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// save-agent-file：无条件覆写（upsert），content 为前端组装的完整 Markdown
export function saveAgentFile(root: string, name: string, content: string): { success: true } | Failed {
  ensureAgentsDir(root)
  fs.writeFileSync(agentPath(root, name), content, 'utf-8')
  return { success: true }
}

// load-agent-file：文件不存在返回 content:null（不是失败）
export function readAgentFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  ensureAgentsDir(root)
  const filePath = agentPath(root, name)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-agent-file：文件不存在静默成功
export function deleteAgentFile(root: string, name: string): { success: true } | Failed {
  ensureAgentsDir(root)
  const filePath = agentPath(root, name)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

// load-all-agent-files：返回完整 .md 文件名（readdirSync 顺序，不排序）
export function listAgentFiles(root: string): { success: true; files: string[] } | Failed {
  ensureAgentsDir(root)
  const files = fs.readdirSync(agentsDir(root))
    .filter(file => file.endsWith('.md'))
  return { success: true, files }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/agent.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

export function listAgents(root: string): { success: true; names: string[] } | Failed {
  const d = agentsDir(root)
  if (!fs.existsSync(d)) return { success: true, names: [] }
  const names = fs.readdirSync(d)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
  return { success: true, names }
}

// 读取原文（含 frontmatter）；文件不存在时保留系统错误原文（ENOENT），CLI 输出与迁移前一致
export function readAgent(root: string, name: string): { success: true; content: string } | Failed {
  try {
    const content = fs.readFileSync(agentPath(root, name), 'utf-8')
    return { success: true, content }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// create-only（重名失败）+ frontmatter 组装
// color：显式提供则写；未提供时 .claude 默认 blue（与 GUI storage.ts 一致），.pi 不写
export function createAgent(root: string, name: string, content: string, opts?: AgentWriteOpts): { success: true } | Failed {
  const d = agentsDir(root)
  const filePath = path.join(d, `${name}.md`)
  if (fs.existsSync(filePath)) return { success: false, error: `智能体已存在: ${name}` }
  const model = opts?.model || 'haiku'
  const systemPromptMode = opts?.systemPromptMode || 'inherit'
  const assetDir = resolveAssetDir(root)

  let fm = `---\nname: ${name}\n`
  if (opts?.description) fm += `description: ${opts.description}\n`
  fm += `model: ${model}\n`
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
  return { success: true }
}

// 前置存在检查 + 以原 frontmatter 为基底增量更新（未知字段与字段顺序保留）
export function updateAgent(root: string, name: string, content: string, opts?: AgentWriteOpts): { success: true } | Failed {
  const filePath = agentPath(root, name)
  if (!fs.existsSync(filePath)) return { success: false, error: `智能体不存在: ${name}` }
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
  return { success: true }
}

// 文件不存在静默成功（与 GUI delete 同语义，但无 ensureDir 副作用）
export function delAgent(root: string, name: string): { success: true } | Failed {
  const filePath = agentPath(root, name)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

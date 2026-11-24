import * as fs from 'node:fs'
import * as path from 'node:path'
// 暂存队列模型：正式位置只存过审版本；create/update 只写 reviewQueue 快照（G3）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('./review.cjs')
import { spawn } from 'node:child_process'

export type CodebaseSource = 'url' | 'blank' | 'local'

export interface CreateCodebaseOptions {
  type: CodebaseSource
  url?: string
  description?: string
  content?: string
  sourcePath?: string
}

export interface CodebaseInfo {
  name: string
  preview: string
  reviewStatus: 'pending' | 'validated'
}

export interface SearchHit {
  name: string
  line: number
  text: string
  before: string[]
  after: string[]
}

export type CodebaseResult<T> = ({ success: true } & T) | { success: false; error: string }

const README_FILE = 'README.md'
const PREVIEW_LENGTH = 200

export function dir(root: string): string {
  return path.join(root, '.ocean', 'codebases')
}

function validName(name: string): boolean {
  if (!name || name.trim() !== name) return false
  if (name === '.' || name === '..') return false
  if (name.startsWith('.')) return false
  if (/[\\/:*?"<>|]/.test(name)) return false
  if (/\s/.test(name)) return false
  return true
}

function codebaseDir(root: string, name: string): string {
  return path.join(dir(root), name)
}

function readmePath(root: string, name: string): string {
  return path.join(codebaseDir(root, name), README_FILE)
}

function ensureDir(root: string): void {
  fs.mkdirSync(dir(root), { recursive: true })
}

// 空项目或无 README 的克隆/复制目标生成默认 README；描述写入正文
function defaultReadme(name: string, description?: string): string {
  const lines = ['---', 'reviewStatus: pending', '---', '', `# ${name}`, '']
  if (description && description.trim()) {
    lines.push(`> ${description.trim()}`, '')
  }
  return lines.join('\n')
}

// 解析 README frontmatter 的审核状态（无 frontmatter /无字段视为 pending）
function readmeReviewStatus(rp: string): 'pending' | 'validated' {
  try {
    const raw = fs.readFileSync(rp, 'utf-8')
    const m = raw.match(/^---\n([\s\S]*?)\n---/)
    const rs = m ? m[1].match(/^reviewStatus:\s*(\S+)/m) : null
    return rs && rs[1] === 'validated' ? 'validated' : 'pending'
  } catch {
    return 'pending'
  }
}

// 更新 README 时确保 frontmatter 带有 reviewStatus: pending（快照不写 version/rejectReason）
function ensureReadmeReviewStatusPending(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (m) {
    let fm = m[1]
      .replace(/^reviewStatus:.*$/m, '')
      .replace(/^rejectReason:.*$/m, '')
      .replace(/^version:.*$/m, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
    return `---\n${fm ? fm + '\n' : ''}reviewStatus: pending\n---\n${m[2]}`
  }
  return `---\nreviewStatus: pending\n---\n${content}`
}

// IO 异常收敛统一契约：任何 fs/spawn 异常都转为 { success: false, error }，不向调用方抛出
async function guard<T>(fn: () => Promise<CodebaseResult<T>>): Promise<CodebaseResult<T>> {
  try {
    return await fn()
  } catch (e: any) {
    return { success: false, error: e?.message ? `IO 错误: ${e.message}` : String(e) }
  }
}

const GIT_CLONE_TIMEOUT_MS = 300_000

function runGitClone(url: string, dest: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    // '--' 分隔符防止以 - 开头的 URL 被解析为 git 选项；timeout 防网络挂起导致永不 settle
    const child = spawn('git', ['clone', '--', url, dest], { stdio: ['ignore', 'pipe', 'pipe'], timeout: GIT_CLONE_TIMEOUT_MS })
    let stderr = ''
    child.stdout.on('data', () => {})
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => {
      resolve({ ok: false, message: `无法启动 git: ${err.message}` })
    })
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ ok: true, message: '' })
      else if (signal === 'SIGTERM') resolve({ ok: false, message: `git clone 超时（${GIT_CLONE_TIMEOUT_MS / 1000}s）已中止` })
      else resolve({ ok: false, message: stderr.trim() || `git clone 失败（退出码 ${code}）` })
    })
  })
}

export async function list(root: string): Promise<CodebaseResult<{ codebases: CodebaseInfo[] }>> {
  return guard<{ codebases: CodebaseInfo[] }>(async () => {
  const d = dir(root)
  if (!fs.existsSync(d)) return { success: true, codebases: [] }
  const codebases: CodebaseInfo[] = []
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const rp = readmePath(root, entry.name)
    let preview = ''
    let reviewStatus: 'pending' | 'validated' = 'pending'
    if (fs.existsSync(rp)) {
      const raw = fs.readFileSync(rp, 'utf-8')
      reviewStatus = readmeReviewStatus(rp)
      preview = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/[#*`>]/g, '').trim().slice(0, PREVIEW_LENGTH)
    }
    codebases.push({ name: entry.name, preview, reviewStatus })
  }
  codebases.sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, codebases }
  })
}

export async function read(root: string, name: string): Promise<CodebaseResult<{ name: string; content: string }>> {
  return guard<{ name: string; content: string }>(async () => {
  if (!validName(name)) return { success: false, error: `非法的代码库名称: ${name}` }
  const cd = codebaseDir(root, name)
  if (!fs.existsSync(cd)) return { success: false, error: `代码库不存在: ${name}` }
  const rp = readmePath(root, name)
  if (!fs.existsSync(rp)) return { success: false, error: `代码库缺少 README.md: ${name}` }
    const content = fs.readFileSync(rp, 'utf-8')
    return { success: true, name, content }
  })
}

export async function create(root: string, name: string, opts: CreateCodebaseOptions): Promise<CodebaseResult<{ name: string }>> {
  return guard<{ name: string }>(async (): Promise<CodebaseResult<{ name: string }>> => {
  if (!validName(name)) return { success: false, error: `非法的代码库名称: ${name ?? ''}` }
  ensureDir(root)
  // create 写快照（G3）；重名仅对正式位置判定（快照可有多份草稿）
  if (fs.existsSync(codebaseDir(root, name))) return { success: false, error: `代码库已存在: ${name}` }
  const snap = review.newSnapshotDir(root, 'codebase', name)
  if (snap.error) return { success: false, error: snap.error }
  const target = snap.dir

  const description = (opts.description || '').trim()

  if (opts.type === 'url') {
    const url = (opts.url || '').trim()
    if (!url) return { success: false, error: 'URL 添加方式必须提供仓库地址' }
    const r = await runGitClone(url, target)
    if (!r.ok) {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
      return { success: false, error: `git clone 失败: ${r.message}` }
    }
    if (!fs.existsSync(path.join(target, README_FILE))) {
      fs.writeFileSync(path.join(target, README_FILE), defaultReadme(name, description), 'utf-8')
    }
  } else if (opts.type === 'local') {
    const sourcePath = (opts.sourcePath || '').trim()
    if (!sourcePath) return { success: false, error: '本地添加方式必须提供源目录路径' }
    let st: fs.Stats
    try {
      st = fs.statSync(sourcePath)
    } catch {
      return { success: false, error: `源目录不存在: ${sourcePath}` }
    }
    if (!st.isDirectory()) return { success: false, error: `源路径不是目录: ${sourcePath}` }
    try {
      await fs.promises.cp(sourcePath, target, { recursive: true })
    } catch (e: any) {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
      return { success: false, error: `复制失败: ${e.message}` }
    }
    if (!fs.existsSync(path.join(target, README_FILE))) {
      fs.writeFileSync(path.join(target, README_FILE), defaultReadme(name, description), 'utf-8')
    }
  } else {
    fs.mkdirSync(target, { recursive: true })
    // 空项目：content 直接作为 README 内容；未提供则生成默认模板
    fs.writeFileSync(path.join(target, README_FILE), (opts.content ?? defaultReadme(name, description)), 'utf-8')
  }

    return { success: true, name }
  })
}

export async function update(root: string, name: string, content: string): Promise<CodebaseResult<{ name: string }>> {
  return guard<{ name: string }>(async () => {
  if (!validName(name)) return { success: false, error: `非法的代码库名称: ${name}` }
  const formal = readmePath(root, name)
  const draft = review.latestDraft(root, 'codebase', name)
  const basePath = draft ? path.join(draft.dir, README_FILE) : formal
  if (!fs.existsSync(basePath)) return { success: false, error: `代码库不存在: ${name}` }
  if (typeof content !== 'string') return { success: false, error: 'README 内容必须是字符串' }
  const snap = review.newSnapshotDir(root, 'codebase', name)
  if (snap.error) return { success: false, error: snap.error }
  fs.writeFileSync(path.join(snap.dir, README_FILE), ensureReadmeReviewStatusPending(content), 'utf-8')
  return { success: true, name }
  })
}

export async function del(root: string, name: string): Promise<CodebaseResult<{ name: string }>> {
  return guard<{ name: string }>(async () => {
  if (!validName(name)) return { success: false, error: `非法的代码库名称: ${name}` }
  const target = codebaseDir(root, name)
  if (!fs.existsSync(target)) return { success: false, error: `代码库不存在: ${name}` }
  fs.rmSync(target, { recursive: true, force: true })
  const c = review.commitFormalDeletion(root, `codebases/${name}`)
  if (!c.success) return { success: false, error: c.error || '提交删除失败' }
  review.discardSnapshots(root, 'codebase', name)
  return { success: true, name }
  })
}

export async function search(root: string, keyword: string, opts?: { top?: number; context?: number }): Promise<CodebaseResult<{ results: Array<{ name: string; matches: SearchHit[] }> }>> {
  return guard<{ results: Array<{ name: string; matches: SearchHit[] }> }>(async () => {
  const kw = (keyword || '').trim().toLowerCase()
  if (!kw) return { success: false, error: '检索关键词不能为空' }
  const top = opts?.top ?? 5
  const context = opts?.context ?? 2

  const d = dir(root)
  if (!fs.existsSync(d)) return { success: true, results: [] }

  const results: Array<{ name: string; matches: SearchHit[] }> = []
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const rp = readmePath(root, entry.name)
    if (!fs.existsSync(rp)) continue
    const lines = fs.readFileSync(rp, 'utf-8').split('\n')
    const matches: SearchHit[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(kw)) continue
      matches.push({
        name: entry.name,
        line: i + 1,
        text: lines[i],
        before: lines.slice(Math.max(0, i - context), i),
        after: lines.slice(i + 1, i + 1 + context),
      })
    }
    if (matches.length > 0) results.push({ name: entry.name, matches })
  }

  results.sort((a, b) => b.matches.length - a.matches.length)
  return { success: true, results: results.slice(0, top) }
  })
}

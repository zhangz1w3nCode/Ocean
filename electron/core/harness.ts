// Harness 会话 core —— 桌面端适配层（source/desktop/harness.ts）的唯一实现本体。
//
// 契约（对齐 codebases.ts / task.ts 样板）：全 async，统一返回 { success: true, ...data } | { success: false, error }；
// IO 异常经 guard 收敛为 { success: false, error }，不向调用方抛出。
// spawn `pi --mode rpc` 子进程，JSONL over stdio；纯 Node，无 Electron 依赖。
// 自 electron/harness/sessionManager.cjs 原样平移（迁移基线 2026-10-29）：
//   - 函数签名与 { success, error } 返回契约保持不变；
//   - git 查询自 spawnSync 改为 execFile 异步化（原主进程同步阻塞全部 IPC，renderer 直连后同步实现会阻塞渲染线程）。

import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

const PI_BIN = 'pi'
// 可用 OCEAN_HARNESS_SESSIONS_ROOT 覆盖（单测隔离用；模块加载时读取）
const SESSIONS_ROOT = process.env.OCEAN_HARNESS_SESSIONS_ROOT || path.join(os.homedir(), '.pi', 'agent', 'sessions')
const STOP_TIMEOUT_MS = 5000
const STDERR_TAIL_LIMIT = 8192
const SESSION_TAIL_BYTES = 64 * 1024

// ---------- 契约与类型 ----------

// 统一返回契约：成功（携带数据）或失败（携带错误信息）
export type HarnessResult<T> = ({ success: true } & T) | { success: false; error: string }

// git worktree 条目（git worktree list --porcelain 解析结果）
export interface HarnessWorktree {
  path: string
  branch: string | null
  isMain: boolean
  detached: boolean
  prunable: boolean
  bare: boolean
}

// pi 会话文件摘要（~/.pi/agent/sessions/--<path>--/ 扫描结果）
export interface HarnessSessionSummary {
  file: string
  valid?: boolean
  id: string | null
  name: string | null
  timestamp: string | null
  cwd: string | null
  mtime: number
  lastMessage: { role: string; text: string } | null
  firstUserText: string | null
}

// pi RPC 命令（prompt/steer/abort/compact/get_state/... 透传结构）
export interface HarnessCommand {
  type: string
  message?: string
  images?: { type: 'image'; data: string; mimeType: string }[]
  streamingBehavior?: 'steer' | 'followUp'
  [key: string]: unknown
}

// 会话事件载荷（按 sessionId 路由）
export interface HarnessEventPayload {
  sessionId: string
  event: { type: string } & Record<string, unknown>
}

export interface HarnessDirEntry {
  name: string
  type: 'file' | 'directory'
}

export interface HarnessGitFileEntry {
  path: string
  status: string
  additions: number | null
  deletions: number | null
}

// 仓库分组（调度页仓库维度视图：主仓库 + .codebases/ 登记仓库各自铺开）
export interface HarnessRepoGroup {
  /** 仓库名（主仓库=项目目录名；其他=codebase 条目名） */
  name: string
  /** 仓库主工作区路径 */
  path: string
  /** 主仓库（当前项目根） */
  isMain: boolean
  /** 该仓库的 git worktree 列表 */
  worktrees: HarnessWorktree[]
}

export interface HarnessSessionInfoEntry {
  sessionId: string
  worktreePath: string
  sessionFile: string | null
  pid: number
}

// ---------- 内部状态 ----------

const emitter = new EventEmitter()
emitter.setMaxListeners(200)
const activeSessions = new Map<string, SessionHandle>()
let sessionSeq = 0
let detectCache: HarnessResult<{ path: string | null; version: string | null; available: boolean }> | null = null

interface SessionHandle {
  proc: ChildProcess
  worktreePath: string
  requestedSessionFile: string | null
  sessionFile: string | null
  exited: boolean
  stderrTail: string
}

// ---------- 通用 ----------

function ok<T extends object>(data: T): HarnessResult<T> {
  return Object.assign({ success: true }, data) as HarnessResult<T>
}

function fail(error: unknown): { success: false; error: string } {
  const msg = error instanceof Error ? error.message : String(error)
  return { success: false, error: msg }
}

// IO 异常 guard 收敛（样板见 codebases.ts）：渲染进程 store 侧裸消费 core 时
// unhandled rejection 会造成 UI 静默失败，全部导出函数不得向调用方抛出
async function guard<T extends object>(fn: () => Promise<HarnessResult<T>>): Promise<HarnessResult<T>> {
  try {
    return await fn()
  } catch (error) {
    return { success: false, error: `IO 错误: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// ---------- JSONL 分帧与解析（纯函数，单测入口） ----------

// 严格 LF 分帧：Node readline 会按 U+2028/U+2029 分行，而它们在 JSON 字符串内合法
export function splitJsonlBuffer(buf: string): [string[], string] {
  const lines: string[] = []
  let rest = buf
  let idx: number
  while ((idx = rest.indexOf('\n')) !== -1) {
    let line = rest.slice(0, idx)
    rest = rest.slice(idx + 1)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line.trim().length > 0) lines.push(line)
  }
  return [lines, rest]
}

export function parseJsonlLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ---------- pi 检测与 spawn 环境 ----------

function candidatePiPaths(): string[] {
  const home = os.homedir()
  const nvm: string[] = []
  try {
    const nvmDir = path.join(home, '.nvm', 'versions', 'node')
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir).filter((v) => /^v?\d/.test(v))
      versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      for (let i = versions.length - 1; i >= 0; i--) {
        nvm.push(path.join(nvmDir, versions[i], 'bin', PI_BIN))
      }
    }
  } catch {
    // 忽略 nvm 目录探测失败
  }
  return [
    path.join('/usr/local/bin', PI_BIN),
    path.join('/opt/homebrew/bin', PI_BIN),
    ...nvm,
    path.join(home, '.npm-global', 'bin', PI_BIN),
  ]
}

function resolvePiPath(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [PI_BIN], { timeout: 3000 }, (err, stdout) => {
      const viaWhich = !err && stdout && String(stdout).trim()
      if (viaWhich) return resolve(String(stdout).trim())
      for (const cand of candidatePiPaths()) {
        try {
          if (fs.existsSync(cand)) return resolve(cand)
        } catch {
          // 忽略单个候选路径探测失败
        }
      }
      resolve(null)
    })
  })
}

// GUI 启动的 Electron 进程 PATH 不含 nvm/homebrew 目录；pi 子进程内部的 bash/git
// 同样依赖这份 env，因此把 pi 所在目录与常见 bin 目录前置注入
function buildSpawnEnv(piPath: string | null): NodeJS.ProcessEnv {
  const sep = process.platform === 'win32' ? ';' : ':'
  const extra = [
    piPath ? path.dirname(piPath) : null,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(os.homedir(), '.npm-global', 'bin'),
  ].filter((d): d is string => Boolean(d))
  const seen = new Set<string>()
  const parts: string[] = []
  for (const dir of [...extra, ...(process.env.PATH || '').split(sep)]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    parts.push(dir)
  }
  return Object.assign({}, process.env, { PATH: parts.join(sep) })
}

// git 查询异步化（原 spawnSync 平移）：返回结构与 spawnSync 等价（status/error/stdout/stderr）
interface GitRunResult {
  status: number | null
  stdout: string
  stderr: string
  error: Error | null
}

function execGit(cwd: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv): Promise<GitRunResult> {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { encoding: 'utf-8', timeout: timeoutMs, env }, (error, stdout, stderr) => {
      // execFile 把非零退出也包进 error：code 为数字=退出码（对应 spawnSync 的 status 路径），
      // 字符串 code=启动失败（ENOENT/超时 kill，对应 spawnSync 的 error 路径）。
      // 保持与原 spawnSync 平移语义一致：退出码不当 error，业务层按 status 报错。
      const isExitCode = error && typeof (error as { code?: unknown }).code === 'number'
      resolve({
        status: isExitCode ? (error as { code: number }).code : error ? null : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: isExitCode ? null : error ?? null,
      })
    })
  })
}

export async function detectAgent(): Promise<HarnessResult<{ path: string | null; version: string | null; available: boolean }>> {
  if (detectCache && detectCache.success) return detectCache
  return guard(async () => {
    const piPath = await resolvePiPath()
    if (!piPath) {
      // 不缓存不可用结果，安装 pi 后无需重启即可检出
      return ok({ path: null, version: null, available: false })
    }
    const version = await new Promise<string | null>((resolve) => {
      execFile(piPath, ['--version'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err || !stdout) {
          console.error(
            '[harness] pi --version 失败:',
            err ? String(err.message) : 'stdout 为空',
            'stderr:', String(stderr || '').slice(0, 200)
          )
        }
        resolve(!err && stdout ? String(stdout).trim() : null)
      })
    })
    detectCache = ok({ path: piPath, version, available: true })
    return detectCache
  })
}

// ---------- git worktree 解析（纯函数，单测入口） ----------

export function parseWorktreeList(text: string | null | undefined): HarnessWorktree[] {
  const worktrees: HarnessWorktree[] = []
  let current: HarnessWorktree | null = null
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current)
      current = {
        path: line.slice('worktree '.length).trim(),
        branch: null,
        isMain: false,
        detached: false,
        prunable: false,
        bare: false,
      }
      continue
    }
    if (!current) continue
    if (line.startsWith('branch ')) {
      let branch = line.slice('branch '.length).trim()
      if (branch.startsWith('refs/heads/')) branch = branch.slice('refs/heads/'.length)
      current.branch = branch
    } else if (line === 'detached') {
      current.detached = true
    } else if (line === 'prunable') {
      current.prunable = true
    } else if (line === 'bare') {
      current.bare = true
    }
  }
  if (current) worktrees.push(current)
  if (worktrees.length > 0) worktrees[0].isMain = true
  return worktrees
}

export async function listWorktrees(root: string): Promise<HarnessResult<{ worktrees: HarnessWorktree[] }>> {
  return guard(async () => {
    const res = await execGit(root, ['worktree', 'list', '--porcelain'], 10000, buildSpawnEnv(null))
    if (res.error) return fail(res.error)
    if (res.status !== 0) {
      return fail(new Error(`git worktree list 失败: ${res.stderr.trim()}`))
    }
    return ok({ worktrees: parseWorktreeList(res.stdout) })
  })
}

// 仓库维度视图：主仓库 + .codebases/ 下的登记仓库（url/local 方式登记的真实 git 仓库）
// 各自铺开全部 worktree；blank 条目（非 git）自动跳过。主仓库 git 失败时整体 fail
// （.codebases 属于主仓库目录，与既有错误语义一致）。
export async function listRepoWorktrees(root: string): Promise<HarnessResult<{ repos: HarnessRepoGroup[] }>> {
  return guard(async () => {
    const main = await listWorktrees(root)
    if (!main.success) return main
    const repos: HarnessRepoGroup[] = [
      { name: path.basename(root), path: root, isMain: true, worktrees: main.worktrees },
    ]
    const cbDir = path.join(root, '.codebases')
    if (fs.existsSync(cbDir)) {
      for (const entry of fs.readdirSync(cbDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const repoPath = path.join(cbDir, entry.name)
        if (!fs.existsSync(path.join(repoPath, '.git'))) continue
        const r = await listWorktrees(repoPath)
        if (r.success) {
          repos.push({ name: entry.name, path: repoPath, isMain: false, worktrees: r.worktrees })
        }
      }
    }
    return ok({ repos })
  })
}

// 列出本地分支与当前分支（来源分支选择器数据源）
export async function listBranches(root: string): Promise<HarnessResult<{ branches: string[]; current: string | null }>> {
  return guard(async () => {
    const env = buildSpawnEnv(null)
    const res = await execGit(root, ['for-each-ref', 'refs/heads/', '--format=%(refname:short)'], 10000, env)
    if (res.status !== 0) {
      return fail(new Error(`git for-each-ref 失败: ${res.stderr.trim()}`))
    }
    const branches = String(res.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const head = await execGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 5000, env)
    const current = head.status === 0 ? String(head.stdout || '').trim() : null
    return ok({ branches, current })
  })
}

// 在项目根 .worktrees/ 下新建隔离工作区（目录名 + 新分支 + 可选来源分支基点）
export async function createWorktree(root: string, name: string, branch?: string, baseBranch?: string): Promise<HarnessResult<{ path: string; branch: string }>> {
  return guard(async () => {
    const wtName = String(name || '').trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(wtName)) {
      return fail(new Error('工作区名称仅支持字母/数字/点/下划线/连字符，且以字母或数字开头'))
    }
    const wtPath = path.join(root, '.worktrees', wtName)
    if (fs.existsSync(wtPath)) {
      return fail(new Error(`工作区已存在: ${wtPath}`))
    }
    const branchName = String(branch || '').trim() || `feat/${wtName}`
    const env = buildSpawnEnv(null)
    const fmt = await execGit(root, ['check-ref-format', '--branch', branchName], 5000, env)
    if (fmt.status !== 0) {
      return fail(new Error(`分支名称不合法: ${branchName}`))
    }
    const exists = await execGit(root, ['rev-parse', '--verify', `refs/heads/${branchName}`], 5000, env)
    if (exists.status === 0) {
      return fail(new Error(`分支已存在: ${branchName}`))
    }
    const args = ['worktree', 'add', wtPath, '-b', branchName]
    const base = String(baseBranch || '').trim()
    if (base) {
      const verify = await execGit(root, ['rev-parse', '--verify', base], 5000, env)
      if (verify.status !== 0) {
        return fail(new Error(`来源分支不存在: ${base}`))
      }
      args.push(base)
    }
    const res = await execGit(root, args, 60000, env)
    if (res.status !== 0) {
      return fail(new Error(`git worktree add 失败: ${res.stderr.trim().slice(0, 300)}`))
    }
    return ok({ path: wtPath, branch: branchName })
  })
}

// ---------- pi 会话目录扫描 ----------

// ~/.pi/agent/sessions/--<path>--/，<path> 为 cwd 的 '/'->'-' 转写（非 hash）
export function sanitizeCwdForSessionDir(cwd: string): string {
  const cleaned = String(cwd || '').replace(/^\//, '').replace(/\//g, '-')
  return '--' + cleaned + '--'
}

function readHeadLine(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(8192)
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0)
      const text = buf.toString('utf8', 0, bytes)
      const nl = text.indexOf('\n')
      return nl === -1 ? text.trim() : text.slice(0, nl).trim()
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

// 只读文件尾部若干字节并按行返回（首行若是截断半行则丢弃）；文件小于窗口时首行为 header 也会被丢弃
function readTailLines(filePath: string, limitBytes: number): string[] {
  try {
    const size = fs.statSync(filePath).size
    const len = Math.min(size, limitBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, size - len)
      let text = buf.toString('utf8')
      const firstNl = text.indexOf('\n')
      if (firstNl !== -1) text = text.slice(firstNl + 1)
      return text.split('\n').filter((l) => l.trim().length > 0)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return []
  }
}

function extractMessageText(msg: { content?: unknown }): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<{ type?: string; text?: unknown }>)
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join(' ')
  }
  return ''
}

// 只读文件头部若干字节并按行返回（跳过 header 首行）；用于回退提取首条用户消息
function readFirstLines(filePath: string, limitBytes: number): string[] {
  try {
    const size = fs.statSync(filePath).size
    const len = Math.min(size, limitBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, 0)
      const text = buf.toString('utf8')
      const nl = text.indexOf('\n')
      const body = nl === -1 ? '' : text.slice(nl + 1)
      return body.split('\n').filter((l) => l.trim().length > 0)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return []
  }
}

function extractSessionSummary(filePath: string, mtimeMs: number): HarnessSessionSummary {
  const headerLine = readHeadLine(filePath)
  const header = headerLine ? parseJsonlLine(headerLine) : null
  const headerOk = !!(header && header.type === 'session')
  let name: string | null = null
  let lastMessage: { role: string; text: string } | null = null
  const tail = readTailLines(filePath, SESSION_TAIL_BYTES)
  // 自后向前：取最新 session_info 作为会话名；取最后一条 user/assistant message 作预览
  for (let i = tail.length - 1; i >= 0 && (name === null || lastMessage === null); i--) {
    const entry = parseJsonlLine(tail[i])
    if (!entry) continue
    if (name === null && entry.type === 'session_info' && entry.name) name = String(entry.name)
    if (
      lastMessage === null &&
      entry.type === 'message' &&
      entry.message &&
      ((entry.message as { role?: unknown }).role === 'user' || (entry.message as { role?: unknown }).role === 'assistant')
    ) {
      const role = String((entry.message as { role: unknown }).role)
      lastMessage = { role, text: extractMessageText(entry.message as { content?: unknown }).slice(0, 200) }
    }
  }
  // 回退：首条用户消息（对齐 pi 会话选择器无命名时展示首条消息的行为）
  let firstUserText: string | null = null
  for (const line of readFirstLines(filePath, 16 * 1024)) {
    const entry = parseJsonlLine(line)
    if (entry && entry.type === 'message' && entry.message && (entry.message as { role?: unknown }).role === 'user') {
      const text = extractMessageText(entry.message as { content?: unknown })
      if (text) {
        firstUserText = text.slice(0, 200)
        break
      }
    }
  }
  return {
    file: filePath,
    valid: headerOk,
    id: header && header.id ? String(header.id) : null,
    name,
    timestamp: header && header.timestamp ? String(header.timestamp) : null,
    cwd: header && header.cwd ? String(header.cwd) : null,
    mtime: mtimeMs,
    lastMessage,
    firstUserText,
  }
}

export async function listSessions(worktreePath: string): Promise<HarnessResult<{ sessions: HarnessSessionSummary[] }>> {
  return guard(async () => {
    if (!worktreePath || !fs.existsSync(worktreePath)) {
      return fail(new Error(`worktree 路径不存在: ${worktreePath}`))
    }
    // pi 以 cwd 的真实路径作为会话目录键（实证：macOS /tmp 的会话落在 --private-tmp--/）
    const realCwd = fs.realpathSync(worktreePath)
    const dir = path.join(SESSIONS_ROOT, sanitizeCwdForSessionDir(realCwd))
    if (!fs.existsSync(dir)) return ok({ sessions: [] })
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    const sessions: HarnessSessionSummary[] = []
    for (const f of files) {
      const full = path.join(dir, f)
      try {
        const stat = fs.statSync(full)
        if (!stat.isFile()) continue
        const summary = extractSessionSummary(full, stat.mtimeMs)
        // 会话文件损坏（首行 header 解析失败）：跳过该文件并提示，不让列表整体失败
        if (!summary.valid) {
          console.error('[harness] 跳过损坏的会话文件:', full)
          continue
        }
        sessions.push(summary)
      } catch (error) {
        console.error('[harness] 跳过无法读取的会话文件:', full, error instanceof Error ? error.message : String(error))
      }
    }
    sessions.sort((a, b) => b.mtime - a.mtime)
    return ok({ sessions })
  })
}

// ---------- 会话进程生命周期 ----------

function emitSessionEvent(sessionId: string, event: { type: string } & Record<string, unknown>): void {
  emitter.emit('harness-event', { sessionId, event } satisfies HarnessEventPayload)
}

// 订阅全部会话事件流（desktop 适配层转发给 store）
export function onHarnessEvent(callback: (payload: HarnessEventPayload) => void): () => void {
  emitter.on('harness-event', callback)
  return () => emitter.removeListener('harness-event', callback)
}

function isSessionFileActive(sessionFile: string): boolean {
  if (!sessionFile) return false
  for (const handle of activeSessions.values()) {
    if (handle.requestedSessionFile === sessionFile || handle.sessionFile === sessionFile) return true
  }
  return false
}

function attachProcess(sessionId: string, proc: ChildProcess, cwd: string, requestedSessionFile: string | null): SessionHandle {
  const handle: SessionHandle = {
    proc,
    worktreePath: cwd,
    requestedSessionFile: requestedSessionFile || null,
    sessionFile: requestedSessionFile || null,
    exited: false,
    stderrTail: '',
  }
  activeSessions.set(sessionId, handle)

  let buffer = ''
  proc.stdout?.setEncoding('utf8')
  proc.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    const [lines, rest] = splitJsonlBuffer(buffer)
    buffer = rest
    for (const line of lines) {
      const event = parseJsonlLine(line)
      if (event) {
        // 拦截可携带 sessionFile 的响应，维护互斥与删除守卫依据
        if (
          event.type === 'response' &&
          (event.command === 'get_state' || event.command === 'new_session' || event.command === 'switch_session') &&
          event.success &&
          event.data &&
          (event.data as { sessionFile?: unknown }).sessionFile
        ) {
          handle.sessionFile = String((event.data as { sessionFile: unknown }).sessionFile)
        }
        emitSessionEvent(sessionId, event as { type: string } & Record<string, unknown>)
      } else {
        emitSessionEvent(sessionId, { type: 'jsonl_parse_error', raw: String(line).slice(0, 500) })
      }
    }
  })

  proc.stderr?.setEncoding('utf8')
  proc.stderr?.on('data', (chunk: string) => {
    handle.stderrTail = (handle.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
  })

  proc.on('error', (error: Error) => {
    if (handle.exited) return
    handle.exited = true
    emitSessionEvent(sessionId, { type: 'process_error', error: String(error.message || error) })
    activeSessions.delete(sessionId)
  })

  proc.on('exit', (code, signal) => {
    if (handle.exited) return
    handle.exited = true
    emitSessionEvent(sessionId, {
      type: 'process_exit',
      code,
      signal,
      stderrTail: handle.stderrTail,
    })
    activeSessions.delete(sessionId)
  })

  return handle
}

async function spawnSession(args: string[], cwd: string, requestedSessionFile: string | null): Promise<HarnessResult<{ sessionId: string }>> {
  const detected = await detectAgent()
  if (!detected.success || !detected.available || !detected.path) {
    const reason = detected.success
      ? '未检测到 pi，请先安装：npm i -g @earendil-works/pi-coding-agent'
      : detected.error || 'pi 检测失败'
    return fail(new Error(reason))
  }
  return guard(async () => {
    const stat = fs.statSync(cwd)
    if (!stat.isDirectory()) return fail(new Error(`会话目录不是有效目录: ${cwd}`))
    const sessionId = `sess-${Date.now()}-${sessionSeq++}`
    const proc = spawn(detected.path as string, args, {
      cwd,
      env: buildSpawnEnv(detected.path),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    attachProcess(sessionId, proc, cwd, requestedSessionFile)
    // 启动即握手：预热连接并取回 sessionFile（响应事件同时转发给前端）
    void sendCommand(sessionId, { type: 'get_state' })
    return ok({ sessionId })
  })
}

export async function startSession(worktreePath: string): Promise<HarnessResult<{ sessionId: string }>> {
  return spawnSession(['--mode', 'rpc'], worktreePath, null)
}

export async function openSession(sessionFile: string): Promise<HarnessResult<{ sessionId: string }>> {
  if (!sessionFile || !sessionFile.endsWith('.jsonl') || !fs.existsSync(sessionFile)) {
    return fail(new Error(`会话文件不存在: ${sessionFile}`))
  }
  if (isSessionFileActive(sessionFile)) {
    return fail(new Error('该会话已在运行中，不可重复打开'))
  }
  const headerLine = readHeadLine(sessionFile)
  const header = headerLine ? parseJsonlLine(headerLine) : null
  const cwd = header && header.cwd ? String(header.cwd) : null
  if (!cwd || !fs.existsSync(cwd)) {
    return fail(new Error(`会话原目录不存在: ${cwd || '(会话 header 缺少 cwd)'}`))
  }
  return spawnSession(['--mode', 'rpc', '--session', sessionFile], cwd, sessionFile)
}

export async function sendCommand(sessionId: string, command: HarnessCommand): Promise<HarnessResult<Record<string, unknown>>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  if (handle.exited) return fail(new Error(`会话进程已退出: ${sessionId}`))
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
    return fail(new Error('无效命令：需要含 type 字段的对象'))
  }
  return guard(async () => {
    if (!handle.proc.stdin) return fail(new Error('会话进程 stdin 不可用'))
    handle.proc.stdin.write(JSON.stringify(command) + '\n')
    return ok({})
  })
}

export async function stopSession(sessionId: string): Promise<HarnessResult<{ wasRunning: boolean }>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return ok({ wasRunning: false })
  const proc = handle.proc
  try {
    proc.kill('SIGTERM')
  } catch {
    // 忽略已死进程的 kill 失败
  }
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL')
    } catch {
      // 忽略
    }
  }, STOP_TIMEOUT_MS)
  proc.once('exit', () => clearTimeout(timer))
  return ok({ wasRunning: true })
}

export async function stopAllSessions(): Promise<HarnessResult<{ stopped: number }>> {
  const ids = Array.from(activeSessions.keys())
  for (const id of ids) void stopSession(id)
  return ok({ stopped: ids.length })
}

export async function deleteSessionFile(sessionFile: string): Promise<HarnessResult<Record<string, unknown>>> {
  return guard(async () => {
    if (isSessionFileActive(sessionFile)) {
      return fail(new Error('会话正在运行，请先停止后再删除'))
    }
    if (!fs.existsSync(sessionFile)) return fail(new Error(`会话文件不存在: ${sessionFile}`))
    fs.unlinkSync(sessionFile)
    return ok({})
  })
}

export async function getSessionInfo(sessionId: string): Promise<HarnessResult<{ sessionId: string; worktreePath: string; sessionFile: string | null; exited: boolean; pid: number }>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  return ok({
    sessionId,
    worktreePath: handle.worktreePath,
    sessionFile: handle.sessionFile,
    exited: handle.exited,
    pid: handle.proc.pid ?? -1,
  })
}

// 渲染层刷新/重连后重列运行中的会话（renderer 直连后子进程随页面生命周期，同页内 store 重建仍可重连）
export async function listActiveSessions(): Promise<HarnessResult<{ sessions: HarnessSessionInfoEntry[] }>> {
  const sessions: HarnessSessionInfoEntry[] = []
  for (const [sessionId, handle] of activeSessions.entries()) {
    if (handle.exited) continue
    sessions.push({
      sessionId,
      worktreePath: handle.worktreePath,
      sessionFile: handle.sessionFile,
      pid: handle.proc.pid ?? -1,
    })
  }
  return ok({ sessions })
}

// 读取会话工作区内的文件（相对路径，限制在 worktree 内；供右侧文件预览）
export async function readSessionFile(sessionId: string, relativePath: string): Promise<HarnessResult<{ content: string; path: string }>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  return guard(async () => {
    const base = path.resolve(handle.worktreePath)
    const target = path.resolve(base, String(relativePath || ''))
    if (target !== base && !target.startsWith(base + path.sep)) {
      return fail(new Error('路径越界：仅可读取会话工作区内的文件'))
    }
    const stat = fs.statSync(target)
    if (!stat.isFile()) return fail(new Error('目标不是文件'))
    if (stat.size > 2 * 1024 * 1024) return fail(new Error('文件过大（>2MB）'))
    const content = fs.readFileSync(target, 'utf8')
    if (content.includes('\0')) return fail(new Error('二进制文件暂不支持预览'))
    return ok({ content, path: target })
  })
}

// Git 变更概览：当前分支 vs 可配置基线分支（提交时间线/分支变更/工作区变更）
export async function gitStatus(sessionId: string, baseBranch: string): Promise<HarnessResult<{
  base: string
  current: string | null
  ahead: number
  behind: number
  commits: string[]
  branchFiles: HarnessGitFileEntry[]
  worktreeFiles: HarnessGitFileEntry[]
}>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  const cwd = handle.worktreePath
  const env = buildSpawnEnv(null)
  const base = String(baseBranch || 'main').trim()
  const run = (args: string[]) => execGit(cwd, args, 15000, env)
  return guard(async () => {
    const verify = await run(['rev-parse', '--verify', base])
    if (verify.status !== 0) return fail(new Error(`基线分支不存在: ${base}`))
    const current = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
    const counts = await run(['rev-list', '--left-right', '--count', `${base}...HEAD`])
    const log = await run(['log', `${base}..HEAD`, '--oneline', '--no-decorate', '-n', '200'])
    const nameStatus = await run(['diff', '--name-status', '--no-renames', `${base}...HEAD`])
    const numstat = await run(['diff', '--numstat', '--no-renames', `${base}...HEAD`])
    const status = await run(['status', '--porcelain'])
    const wtNumstat = await run(['diff', '--numstat', '--no-renames', 'HEAD'])
    if (log.status !== 0 || nameStatus.status !== 0 || numstat.status !== 0 || status.status !== 0) {
      return fail(new Error('git 信息读取失败'))
    }
    const numByPath: Record<string, { additions: number | null; deletions: number | null }> = {}
    for (const line of String(numstat.stdout || '').split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      if (parts.length >= 3) {
        numByPath[parts[2]] = {
          additions: parts[0] === '-' ? null : Number(parts[0]),
          deletions: parts[1] === '-' ? null : Number(parts[1]),
        }
      }
    }
    const branchFiles: HarnessGitFileEntry[] = []
    for (const line of String(nameStatus.stdout || '').split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      if (parts.length < 2) continue
      const filePath = parts[parts.length - 1]
      const n = numByPath[filePath] || {}
      branchFiles.push({
        path: filePath,
        status: parts[0].slice(0, 1),
        additions: n.additions ?? null,
        deletions: n.deletions ?? null,
      })
    }
    const wtNumByPath: Record<string, { additions: number | null; deletions: number | null }> = {}
    for (const line of String(wtNumstat.stdout || '').split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      if (parts.length >= 3) {
        wtNumByPath[parts[2]] = {
          additions: parts[0] === '-' ? null : Number(parts[0]),
          deletions: parts[1] === '-' ? null : Number(parts[1]),
        }
      }
    }
    const worktreeFiles: HarnessGitFileEntry[] = []
    for (const rawLine of String(status.stdout || '').split('\n')) {
      if (!rawLine.trim()) continue
      const code = rawLine.slice(0, 2)
      const filePath = rawLine.slice(3).trim().replace(/^"|"$/g, '')
      let letter = '?'
      if (code.startsWith('??')) letter = 'U'
      else if (code[0] !== ' ') letter = code[0]
      else letter = code[1]
      const n = wtNumByPath[filePath] || {}
      worktreeFiles.push({
        path: filePath,
        status: letter,
        additions: n.additions ?? null,
        deletions: n.deletions ?? null,
      })
    }
    let ahead = 0
    let behind = 0
    if (counts.status === 0) {
      const m = /(\d+)\D+(\d+)/.exec(String(counts.stdout || '').trim())
      if (m) {
        behind = Number(m[1])
        ahead = Number(m[2])
      }
    }
    const commits = String(log.stdout || '').split('\n').filter((l) => l.trim())
    return ok({
      base,
      current: current.status === 0 ? String(current.stdout || '').trim() : null,
      ahead,
      behind,
      commits,
      branchFiles,
      worktreeFiles,
    })
  })
}

// 读取单个文件的 diff（分支变更 base...HEAD / 工作区变更 HEAD + 未跟踪文件）
export async function gitDiffFile(sessionId: string, relativePath: string, source: 'branch' | 'worktree', baseBranch: string): Promise<HarnessResult<{ diff: string; path: string }>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  const cwd = handle.worktreePath
  const env = buildSpawnEnv(null)
  const file = String(relativePath || '').trim()
  if (!file) return fail(new Error('缺少文件路径'))
  const resolved = path.resolve(cwd, file)
  if (resolved !== cwd && !resolved.startsWith(cwd + path.sep)) {
    return fail(new Error('路径越界：仅可读取会话工作区内的文件'))
  }
  return guard(async () => {
    if (source === 'worktree') {
      const tracked = await execGit(cwd, ['diff', 'HEAD', '--', file], 15000, env)
      if (tracked.status === 0 && String(tracked.stdout || '').trim()) {
        return ok({ diff: String(tracked.stdout), path: file })
      }
      // 未跟踪文件：与空文件对比（exit code 1 属正常）
      const untracked = await execGit(cwd, ['diff', '--no-index', '--', '/dev/null', resolved], 15000, env)
      const text = String(untracked.stdout || '')
      if (text.trim()) return ok({ diff: text, path: file })
      return ok({ diff: '', path: file })
    }
    const base = String(baseBranch || 'main').trim()
    const verify = await execGit(cwd, ['rev-parse', '--verify', base], 5000, env)
    if (verify.status !== 0) return fail(new Error(`基线分支不存在: ${base}`))
    const res = await execGit(cwd, ['diff', `${base}...HEAD`, '--', file], 15000, env)
    if (res.status !== 0) return fail(new Error('git diff 失败'))
    return ok({ diff: String(res.stdout || ''), path: file })
  })
}

// 列举会话工作区内的目录（供右侧文件浏览器树，目录优先排序）
export async function listSessionDir(sessionId: string, relativePath: string): Promise<HarnessResult<{ entries: HarnessDirEntry[]; path: string }>> {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  return guard(async () => {
    const base = path.resolve(handle.worktreePath)
    const target = path.resolve(base, String(relativePath || '.'))
    if (target !== base && !target.startsWith(base + path.sep)) {
      return fail(new Error('路径越界：仅可浏览会话工作区内的目录'))
    }
    const stat = fs.statSync(target)
    if (!stat.isDirectory()) return fail(new Error('目标不是目录'))
    const dirents = fs.readdirSync(target, { withFileTypes: true })
    const entries: HarnessDirEntry[] = []
    for (const d of dirents) {
      if (d.isFile()) entries.push({ name: d.name, type: 'file' })
      else if (d.isDirectory()) entries.push({ name: d.name, type: 'directory' })
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, 'en', { numeric: true })
    })
    return ok({ entries, path: target })
  })
}

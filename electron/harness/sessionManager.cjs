// Harness 会话核心（阶段一：main 分支 .cjs 形态）
// spawn `pi --mode rpc` 子进程，JSONL over stdio；纯 Node，无 Electron 依赖。
// 阶段二（refactor/api-core-unification 合入 main 后）平移为 electron/core/harness/operate.ts，
// 函数签名与 { success, error } 返回契约保持不变。
'use strict'

const { spawn, execFile, spawnSync } = require('child_process')
const { EventEmitter } = require('events')
const path = require('path')
const fs = require('fs')
const os = require('os')

const PI_BIN = 'pi'
// 可用 OCEAN_HARNESS_SESSIONS_ROOT 覆盖（单测隔离用；阶段二平移时保留）
const SESSIONS_ROOT = process.env.OCEAN_HARNESS_SESSIONS_ROOT || path.join(os.homedir(), '.pi', 'agent', 'sessions')
const STOP_TIMEOUT_MS = 5000
const STDERR_TAIL_LIMIT = 8192
const SESSION_TAIL_BYTES = 64 * 1024

// ---------- 内部状态 ----------

const emitter = new EventEmitter()
emitter.setMaxListeners(200)
const activeSessions = new Map() // sessionId -> handle
let sessionSeq = 0
let detectCache = null

// ---------- 通用 ----------

function ok(data) {
  return Object.assign({ success: true }, data)
}

function fail(error) {
  const msg = error && error.message ? error.message : String(error)
  return { success: false, error: msg }
}

// ---------- JSONL 分帧与解析（纯函数，单测入口） ----------

// 严格 LF 分帧：Node readline 会按 U+2028/U+2029 分行，而它们在 JSON 字符串内合法
function splitJsonlBuffer(buf) {
  const lines = []
  let rest = buf
  let idx
  while ((idx = rest.indexOf('\n')) !== -1) {
    let line = rest.slice(0, idx)
    rest = rest.slice(idx + 1)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line.trim().length > 0) lines.push(line)
  }
  return [lines, rest]
}

function parseJsonlLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

// ---------- pi 检测与 spawn 环境 ----------

function candidatePiPaths() {
  const home = os.homedir()
  const nvm = []
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

function resolvePiPath() {
  return new Promise((resolve) => {
    execFile('which', [PI_BIN], { timeout: 3000 }, (err, stdout) => {
      const viaWhich = !err && stdout && stdout.trim()
      if (viaWhich) return resolve(stdout.trim())
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
function buildSpawnEnv(piPath) {
  const sep = process.platform === 'win32' ? ';' : ':'
  const extra = [
    piPath ? path.dirname(piPath) : null,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(os.homedir(), '.npm-global', 'bin'),
  ].filter(Boolean)
  const seen = new Set()
  const parts = []
  for (const dir of [...extra, ...(process.env.PATH || '').split(sep)]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    parts.push(dir)
  }
  return Object.assign({}, process.env, { PATH: parts.join(sep) })
}

async function detectAgent() {
  if (detectCache && detectCache.available) return detectCache
  try {
    const piPath = await resolvePiPath()
    if (!piPath) {
      // 不缓存不可用结果，安装 pi 后无需重启即可检出
      return ok({ path: null, version: null, available: false })
    }
    const version = await new Promise((resolve) => {
      execFile(piPath, ['--version'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err || !stdout) {
          console.error(
            '[harness] pi --version 失败:',
            err ? String(err.message) : 'stdout 为空',
            'stderr:', String(stderr || '').slice(0, 200)
          )
        }
        resolve(!err && stdout ? stdout.trim() : null)
      })
    })
    detectCache = ok({ path: piPath, version, available: true })
    return detectCache
  } catch (error) {
    return fail(error)
  }
}

// ---------- git worktree 解析（纯函数，单测入口） ----------

function parseWorktreeList(text) {
  const worktrees = []
  let current = null
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

function listWorktrees(projectRoot) {
  try {
    const res = spawnSync('git', ['-C', projectRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf-8',
      timeout: 10000,
      env: buildSpawnEnv(null),
    })
    if (res.error) return fail(res.error)
    if (res.status !== 0) {
      return fail(new Error(`git worktree list 失败: ${(res.stderr || '').trim()}`))
    }
    return ok({ worktrees: parseWorktreeList(res.stdout) })
  } catch (error) {
    return fail(error)
  }
}

// 列出本地分支与当前分支（来源分支选择器数据源）
function listBranches(projectRoot) {
  try {
    const env = buildSpawnEnv(null)
    const res = spawnSync('git', ['-C', projectRoot, 'for-each-ref', 'refs/heads/', '--format=%(refname:short)'], { encoding: 'utf-8', timeout: 10000, env })
    if (res.status !== 0) {
      return fail(new Error(`git for-each-ref 失败: ${(res.stderr || '').trim()}`))
    }
    const branches = String(res.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const head = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', timeout: 5000, env })
    const current = head.status === 0 ? String(head.stdout || '').trim() : null
    return ok({ branches, current })
  } catch (error) {
    return fail(error)
  }
}

// 在项目根 .worktrees/ 下新建隔离工作区（目录名 + 新分支 + 可选来源分支基点）
function createWorktree(projectRoot, name, branch, baseBranch) {
  try {
    const wtName = String(name || '').trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(wtName)) {
      return fail(new Error('工作区名称仅支持字母/数字/点/下划线/连字符，且以字母或数字开头'))
    }
    const wtPath = path.join(projectRoot, '.worktrees', wtName)
    if (fs.existsSync(wtPath)) {
      return fail(new Error(`工作区已存在: ${wtPath}`))
    }
    const branchName = String(branch || '').trim() || `feat/${wtName}`
    const env = buildSpawnEnv(null)
    const fmt = spawnSync('git', ['-C', projectRoot, 'check-ref-format', '--branch', branchName], { encoding: 'utf-8', timeout: 5000, env })
    if (fmt.status !== 0) {
      return fail(new Error(`分支名称不合法: ${branchName}`))
    }
    const exists = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--verify', `refs/heads/${branchName}`], { encoding: 'utf-8', timeout: 5000, env })
    if (exists.status === 0) {
      return fail(new Error(`分支已存在: ${branchName}`))
    }
    const args = ['-C', projectRoot, 'worktree', 'add', wtPath, '-b', branchName]
    const base = String(baseBranch || '').trim()
    if (base) {
      const verify = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--verify', base], { encoding: 'utf-8', timeout: 5000, env })
      if (verify.status !== 0) {
        return fail(new Error(`来源分支不存在: ${base}`))
      }
      args.push(base)
    }
    const res = spawnSync('git', args, { encoding: 'utf-8', timeout: 60000, env })
    if (res.status !== 0) {
      return fail(new Error(`git worktree add 失败: ${(res.stderr || '').trim().slice(0, 300)}`))
    }
    return ok({ path: wtPath, branch: branchName })
  } catch (error) {
    return fail(error)
  }
}

// ---------- pi 会话目录扫描 ----------

// ~/.pi/agent/sessions/--<path>--/，<path> 为 cwd 的 '/'->'-' 转写（非 hash）
function sanitizeCwdForSessionDir(cwd) {
  const cleaned = String(cwd || '').replace(/^\//, '').replace(/\//g, '-')
  return '--' + cleaned + '--'
}

function readHeadLine(filePath) {
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
function readTailLines(filePath, limitBytes) {
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

function extractMessageText(msg) {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ')
  }
  return ''
}

// 只读文件头部若干字节并按行返回（跳过 header 首行）；用于回退提取首条用户消息
function readFirstLines(filePath, limitBytes) {
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

function extractSessionSummary(filePath, mtimeMs) {
  const headerLine = readHeadLine(filePath)
  const header = headerLine ? parseJsonlLine(headerLine) : null
  const headerOk = !!(header && header.type === 'session')
  let name = null
  let lastMessage = null
  const tail = readTailLines(filePath, SESSION_TAIL_BYTES)
  // 自后向前：取最新 session_info 作为会话名；取最后一条 user/assistant message 作预览
  for (let i = tail.length - 1; i >= 0 && (name === null || lastMessage === null); i--) {
    const entry = parseJsonlLine(tail[i])
    if (!entry) continue
    if (name === null && entry.type === 'session_info' && entry.name) name = entry.name
    if (
      lastMessage === null &&
      entry.type === 'message' &&
      entry.message &&
      (entry.message.role === 'user' || entry.message.role === 'assistant')
    ) {
      lastMessage = { role: entry.message.role, text: extractMessageText(entry.message).slice(0, 200) }
    }
  }
  // 回退：首条用户消息（对齐 pi 会话选择器无命名时展示首条消息的行为）
  let firstUserText = null
  for (const line of readFirstLines(filePath, 16 * 1024)) {
    const entry = parseJsonlLine(line)
    if (entry && entry.type === 'message' && entry.message && entry.message.role === 'user') {
      const text = extractMessageText(entry.message)
      if (text) {
        firstUserText = text.slice(0, 200)
        break
      }
    }
  }
  return {
    file: filePath,
    valid: headerOk,
    id: header && header.id ? header.id : null,
    name,
    timestamp: header && header.timestamp ? header.timestamp : null,
    cwd: header && header.cwd ? header.cwd : null,
    mtime: mtimeMs,
    lastMessage,
    firstUserText,
  }
}

function listSessions(worktreePath) {
  try {
    if (!worktreePath || !fs.existsSync(worktreePath)) {
      return fail(new Error(`worktree 路径不存在: ${worktreePath}`))
    }
    // pi 以 cwd 的真实路径作为会话目录键（实证：macOS /tmp 的会话落在 --private-tmp--/）
    const realCwd = fs.realpathSync(worktreePath)
    const dir = path.join(SESSIONS_ROOT, sanitizeCwdForSessionDir(realCwd))
    if (!fs.existsSync(dir)) return ok({ sessions: [] })
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    const sessions = []
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
        console.error('[harness] 跳过无法读取的会话文件:', full, error.message)
      }
    }
    sessions.sort((a, b) => b.mtime - a.mtime)
    return ok({ sessions })
  } catch (error) {
    return fail(error)
  }
}

// ---------- 会话进程生命周期 ----------

function emitSessionEvent(sessionId, event) {
  emitter.emit('harness-event', { sessionId, event })
}

function onHarnessEvent(callback) {
  emitter.on('harness-event', callback)
  return () => emitter.removeListener('harness-event', callback)
}

function isSessionFileActive(sessionFile) {
  if (!sessionFile) return false
  for (const handle of activeSessions.values()) {
    if (handle.requestedSessionFile === sessionFile || handle.sessionFile === sessionFile) return true
  }
  return false
}

function attachProcess(sessionId, proc, cwd, requestedSessionFile) {
  const handle = {
    proc,
    worktreePath: cwd,
    requestedSessionFile: requestedSessionFile || null,
    sessionFile: requestedSessionFile || null,
    exited: false,
    stderrTail: '',
  }
  activeSessions.set(sessionId, handle)

  let buffer = ''
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk) => {
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
          event.data.sessionFile
        ) {
          handle.sessionFile = event.data.sessionFile
        }
        emitSessionEvent(sessionId, event)
      } else {
        emitSessionEvent(sessionId, { type: 'jsonl_parse_error', raw: String(line).slice(0, 500) })
      }
    }
  })

  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (chunk) => {
    handle.stderrTail = (handle.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
  })

  proc.on('error', (error) => {
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

  // agent_settled 后会话文件可能新落盘，刷新一次 sessionFile
  proc.stdout.on('data', () => {}) // 占位：事件拦截在上方统一处理
  return handle
}

async function spawnSession(args, cwd, requestedSessionFile) {
  const detected = await detectAgent()
  if (!detected.success || !detected.available || !detected.path) {
    const reason = detected.success
      ? '未检测到 pi，请先安装：npm i -g @earendil-works/pi-coding-agent'
      : detected.error || 'pi 检测失败'
    return fail(new Error(reason))
  }
  try {
    const stat = fs.statSync(cwd)
    if (!stat.isDirectory()) return fail(new Error(`会话目录不是有效目录: ${cwd}`))
  } catch {
    return fail(new Error(`会话目录不存在: ${cwd}`))
  }
  try {
    const sessionId = `sess-${Date.now()}-${sessionSeq++}`
    const proc = spawn(detected.path, args, {
      cwd,
      env: buildSpawnEnv(detected.path),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    attachProcess(sessionId, proc, cwd, requestedSessionFile)
    // 启动即握手：预热连接并取回 sessionFile（响应事件同时转发给前端）
    sendCommand(sessionId, { type: 'get_state' })
    return ok({ sessionId })
  } catch (error) {
    return fail(error)
  }
}

function startSession(worktreePath) {
  return spawnSession(['--mode', 'rpc'], worktreePath, null)
}

function openSession(sessionFile) {
  try {
    if (!sessionFile || !sessionFile.endsWith('.jsonl') || !fs.existsSync(sessionFile)) {
      return Promise.resolve(fail(new Error(`会话文件不存在: ${sessionFile}`)))
    }
  } catch (error) {
    return Promise.resolve(fail(error))
  }
  if (isSessionFileActive(sessionFile)) {
    return Promise.resolve(fail(new Error('该会话已在运行中，不可重复打开')))
  }
  const headerLine = readHeadLine(sessionFile)
  const header = headerLine ? parseJsonlLine(headerLine) : null
  const cwd = header && header.cwd
  if (!cwd || !fs.existsSync(cwd)) {
    return Promise.resolve(fail(new Error(`会话原目录不存在: ${cwd || '(会话 header 缺少 cwd)'}`)))
  }
  return spawnSession(['--mode', 'rpc', '--session', sessionFile], cwd, sessionFile)
}

function sendCommand(sessionId, command) {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  if (handle.exited) return fail(new Error(`会话进程已退出: ${sessionId}`))
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
    return fail(new Error('无效命令：需要含 type 字段的对象'))
  }
  try {
    handle.proc.stdin.write(JSON.stringify(command) + '\n')
    return ok({})
  } catch (error) {
    return fail(error)
  }
}

function stopSession(sessionId) {
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

function stopAllSessions() {
  const ids = Array.from(activeSessions.keys())
  for (const id of ids) stopSession(id)
  return ok({ stopped: ids.length })
}

function deleteSessionFile(sessionFile) {
  try {
    if (isSessionFileActive(sessionFile)) {
      return fail(new Error('会话正在运行，请先停止后再删除'))
    }
    if (!fs.existsSync(sessionFile)) return fail(new Error(`会话文件不存在: ${sessionFile}`))
    fs.unlinkSync(sessionFile)
    return ok({})
  } catch (error) {
    return fail(error)
  }
}

function getSessionInfo(sessionId) {
  const handle = activeSessions.get(sessionId)
  if (!handle) return fail(new Error(`会话不存在或已结束: ${sessionId}`))
  return ok({
    sessionId,
    worktreePath: handle.worktreePath,
    sessionFile: handle.sessionFile,
    exited: handle.exited,
    pid: handle.proc.pid,
  })
}

// 渲染层刷新/重连后重迪运行中的会话（页面重载丢失 store 状态但主进程子进程仍在）
function listActiveSessions() {
  const sessions = []
  for (const [sessionId, handle] of activeSessions.entries()) {
    if (handle.exited) continue
    sessions.push({
      sessionId,
      worktreePath: handle.worktreePath,
      sessionFile: handle.sessionFile,
      pid: handle.proc.pid,
    })
  }
  return ok({ sessions })
}

module.exports = {
  // 检测与目录
  detectAgent,
  listWorktrees,
  listBranches,
  createWorktree,
  listSessions,
  sanitizeCwdForSessionDir,
  // 会话生命周期
  startSession,
  openSession,
  sendCommand,
  stopSession,
  stopAllSessions,
  deleteSessionFile,
  getSessionInfo,
  listActiveSessions,
  onHarnessEvent,
  // 纯函数（单测入口）
  splitJsonlBuffer,
  parseJsonlLine,
  parseWorktreeList,
}

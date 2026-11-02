import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, execFileSync, ChildProcess } from 'node:child_process'

// ---------------------------------------------------------------------------
// Agent 适配层：把「本地 agent 可执行文件」抽象成统一调用契约。
// 目前实现 pi；后续接 claude code / codex 只需新增一个 adapter。
// ---------------------------------------------------------------------------

export type AgentType = 'pi'

export interface AgentSpec {
  type: AgentType
  /** 可执行文件绝对路径；不填则自动探测 */
  executable?: string
  /** 模型，透传给 agent（pi: --model） */
  model?: string
  /** 额外参数 */
  extraArgs?: string[]
  /** 是否信任项目本地配置（pi: --approve） */
  approveProject?: boolean
}

export interface AgentRunRequest {
  spec: AgentSpec
  prompt: string
  /** 实例级固定 session id */
  sessionId: string
  /** session 落盘目录（钉在实例目录下，避免按 cwd 分目录导致静默新建空会话） */
  sessionDir: string
  /** 子进程工作目录，必须稳定（pi 的 session 按 cwd 组织） */
  cwd: string
  timeoutMs: number
  /** 事件流原始行落盘位置 */
  eventsPath: string
  onEvent?: (ev: AgentStreamEvent) => void
  signal?: AbortSignal
}

export interface AgentStreamEvent {
  type: string
  raw?: unknown
}

export interface AgentRunResult {
  ok: boolean
  /** 最后一个带文本的 assistant 消息 */
  text: string
  sessionId?: string
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
  error?: string
  stderrTail?: string
}

// ---------------------------------------------------------------------------
// 可执行文件探测
// ---------------------------------------------------------------------------

const COMMON_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  path.join(process.env.HOME || '', '.ocean', 'bin'),
  path.join(process.env.HOME || '', '.local', 'bin'),
]

function nvmBinDirs(): string[] {
  const base = path.join(process.env.HOME || '', '.nvm', 'versions', 'node')
  try {
    return fs.readdirSync(base).map((v) => path.join(base, v, 'bin'))
  } catch {
    return []
  }
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Electron GUI 进程的 PATH 往往不含 nvm/homebrew，直接 spawn('pi') 会 ENOENT。
 * 探测顺序：显式路径 → which → PATH 各段 → 常见目录 → nvm 各版本 bin。
 */
export function resolveAgentExecutable(name: string, explicit?: string): string {
  if (explicit) {
    if (!isExecutable(explicit)) throw new Error(`agent 可执行文件不存在或不可执行: ${explicit}`)
    return explicit
  }

  try {
    const found = execFileSync('which', [name], { encoding: 'utf-8', timeout: 5000 }).trim()
    if (found && isExecutable(found)) return found
  } catch {
    // which 未找到，继续
  }

  const searchDirs = [
    ...(process.env.PATH || '').split(':').filter(Boolean),
    ...nvmBinDirs(),
    ...COMMON_BIN_DIRS,
  ]
  for (const dir of searchDirs) {
    const candidate = path.join(dir, name)
    if (isExecutable(candidate)) return candidate
  }

  throw new Error(
    `找不到 agent 可执行文件 "${name}"。请确认已安装并在 PATH 中，或在配置里指定绝对路径。`,
  )
}

// ---------------------------------------------------------------------------
// pi adapter
// ---------------------------------------------------------------------------

function buildPiArgs(req: AgentRunRequest, executable: string): string[] {
  const args = [
    '--session-id', req.sessionId,
    '--session-dir', req.sessionDir,
    '-p',
    '--mode', 'json',
  ]
  if (req.spec.model) args.push('--model', req.spec.model)
  if (req.spec.approveProject) args.push('--approve')
  if (req.spec.extraArgs && req.spec.extraArgs.length > 0) args.push(...req.spec.extraArgs)
  args.push(req.prompt)
  void executable
  return args
}

/** pi 的 assistant 消息里剔除 toolCall 后的纯文本 */
function assistantText(message: any): string {
  if (!message || message.role !== 'assistant') return ''
  const content = Array.isArray(message.content) ? message.content : []
  return content
    .filter((part: any) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('')
    .trim()
}

// ---------------------------------------------------------------------------
// 运行
// ---------------------------------------------------------------------------

export async function runAgent(req: AgentRunRequest): Promise<AgentRunResult> {
  const result: AgentRunResult = {
    ok: false, text: '', exitCode: null, timedOut: false, aborted: false,
  }

  let executable: string
  let args: string[]
  try {
    executable = resolveAgentExecutable(req.spec.type, req.spec.executable)
    args = buildPiArgs(req, executable)
  } catch (e: any) {
    // 探测失败不抛出，交给调度器走 fail 收尾
    result.error = e.message
    return result
  }

  fs.mkdirSync(path.dirname(req.eventsPath), { recursive: true })
  fs.mkdirSync(req.sessionDir, { recursive: true })
  const events = fs.createWriteStream(req.eventsPath, { flags: 'a' })

  let stderrBuf = ''
  let buf = ''
  let lastText = ''

  const child: ChildProcess = spawn(executable, args, {
    cwd: req.cwd,
    // stdin 必须是 ignore：pi 的 -p 模式会把管道 stdin 合并进 prompt，pipe 会挂住
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, OCEAN_DISPATCH_CHILD: '1' },
  })

  let timer: NodeJS.Timeout | undefined
  let killTimer: NodeJS.Timeout | undefined

  const onAbort = () => {
    result.aborted = true
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  }
  if (req.signal) {
    if (req.signal.aborted) onAbort()
    else req.signal.addEventListener('abort', onAbort, { once: true })
  }

  timer = setTimeout(() => {
    result.timedOut = true
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  }, req.timeoutMs)

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    events.write(trimmed + '\n')
    let parsed: any
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return
    }
    if (parsed.type === 'session' && typeof parsed.id === 'string') {
      result.sessionId = parsed.id
    }
    if (parsed.type === 'message_end') {
      const text = assistantText(parsed.message)
      if (text) lastText = text
    }
    if (req.onEvent) {
      try {
        req.onEvent({ type: String(parsed.type || 'unknown'), raw: parsed })
      } catch {
        // 事件回调异常不影响执行
      }
    }
  }

  if (child.stdout) {
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      let idx = buf.indexOf('\n')
      while (idx >= 0) {
        handleLine(buf.slice(0, idx))
        buf = buf.slice(idx + 1)
        idx = buf.indexOf('\n')
      }
    })
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderrBuf += chunk
      if (stderrBuf.length > 20000) stderrBuf = stderrBuf.slice(-20000)
    })
  }

  const exitCode: number | null = await new Promise((resolve) => {
    child.on('error', (err: Error) => {
      result.error = `启动 agent 失败: ${err.message}`
      resolve(null)
    })
    child.on('close', (code: number | null) => resolve(code))
  })

  if (buf.trim()) handleLine(buf)
  events.end()

  if (timer) clearTimeout(timer)
  if (killTimer) clearTimeout(killTimer)
  if (req.signal) req.signal.removeEventListener('abort', onAbort)

  result.exitCode = exitCode
  result.text = lastText
  result.stderrTail = stderrBuf.trim().slice(-2000)

  if (result.aborted) {
    result.error = '已被取消'
    return result
  }
  if (result.timedOut) {
    result.error = `agent 执行超时（${Math.round(req.timeoutMs / 60000)} 分钟）`
    return result
  }
  if (exitCode !== 0) {
    result.error = `agent 进程退出码 ${exitCode}${result.stderrTail ? `：${result.stderrTail}` : ''}`
    return result
  }
  if (!result.text) {
    result.error = 'agent 未返回任何文本内容'
    return result
  }

  result.ok = true
  return result
}
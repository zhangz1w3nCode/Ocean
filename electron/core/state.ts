import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// JSON helpers — serde_json::json! macro uses BTreeMap (alphabetical key order)
// ---------------------------------------------------------------------------

function sortKeysDeep(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortKeysDeep)
  const sorted: Record<string, any> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key])
  }
  return sorted
}

/** Match serde_json::to_string_pretty on a Value (alphabetical key order, 2-space indent) */
export function sortedJsonStringify(obj: any): string {
  return JSON.stringify(sortKeysDeep(obj), null, 2)
}

/** Match serde_json::to_string on a Value (alphabetical key order, compact) */
export function sortedJsonStringifyCompact(obj: any): string {
  return JSON.stringify(sortKeysDeep(obj))
}

// ---------------------------------------------------------------------------
// Status enum — dual serialization (serde rename_all="lowercase" vs as_str)
// ---------------------------------------------------------------------------

export enum Status {
  Idle,
  Executing,
  AwaitingChoice,
  Completed,
  Aborted,
}

/** serde_yaml 序列化用（frontmatter）：AwaitingChoice → awaitingchoice（去下划线） */
export function serializeStatus(status: Status): string {
  switch (status) {
    case Status.Idle: return 'idle'
    case Status.Executing: return 'executing'
    case Status.AwaitingChoice: return 'awaitingchoice'
    case Status.Completed: return 'completed'
    case Status.Aborted: return 'aborted'
  }
}

/** as_str() — 命令输出用：AwaitingChoice → awaiting_choice（带下划线） */
export function statusAsStr(status: Status): string {
  switch (status) {
    case Status.Idle: return 'idle'
    case Status.Executing: return 'executing'
    case Status.AwaitingChoice: return 'awaiting_choice'
    case Status.Completed: return 'completed'
    case Status.Aborted: return 'aborted'
  }
}

export function parseStatus(s: string): Status {
  switch (s) {
    case 'idle': return Status.Idle
    case 'executing': return Status.Executing
    case 'awaitingchoice':
    case 'awaiting_choice':
      return Status.AwaitingChoice
    case 'completed': return Status.Completed
    case 'aborted': return Status.Aborted
    default: return Status.Idle
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function genInvokeId(): string {
  const now = new Date()
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}`
  const time = `${p(now.getHours(), 2)}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`
  const millis = p(now.getMilliseconds(), 3)
  return `invoke-${date}-${time}-${millis}`
}

export function genId(): string {
  const now = new Date()
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}`
  const time = `${p(now.getHours(), 2)}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`
  const hex = (now.getMilliseconds() % 10000).toString(16).padStart(4, '0')
  return `${date}T${time}-${hex}`
}

export function formatLocalTime(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

export interface Limits {
  max_steps: number
  max_loop: number
  max_retry: number
}

export function defaultLimits(): Limits {
  return { max_steps: 100, max_loop: 10, max_retry: 2 }
}

export interface ProcessState {
  workflow: string
  instance_id: string
  initial_input?: string
  status: Status
  current: string
  current_name: string
  current_invoke: string
  step: number
  loop_count: number
  retry_count: number
  last_node?: string
  last_invoke?: string
  completed: string[]
  limits: Limits
}

export interface TraceEvent {
  status: string
  node: string
  invoke: string
  branch?: string
  time: string
}

export interface TraceLogEntry {
  ts: string
  command: string
  node?: string
  invoke?: string
  status?: string
  branch?: string
}

export class ProcessFile {
  state: ProcessState
  mermaid: string
  trace: TraceEvent[]

  constructor(state: ProcessState, mermaid: string, trace: TraceEvent[]) {
    this.state = state
    this.mermaid = mermaid
    this.trace = trace
  }

  // -------------------------------------------------------------------------
  // read — read status.json + merge trace.jsonl
  // -------------------------------------------------------------------------

  static read(filePath: string): ProcessFile {
    const dir = path.dirname(filePath)
    const jsonPath = path.join(dir, 'status.json')

    let state: ProcessState
    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8')
      state = parseProcessStateJson(jsonContent)
    } catch (e: any) {
      throw new Error(`读取 status.json 失败 ${jsonPath}: ${e.message}`)
    }

    let trace: TraceEvent[] = []
    const logEntries = readTraceJsonl(traceJsonlPath(dir))
    const jsonlTrace = reconstructTraceFromJsonl(logEntries)
    if (jsonlTrace.length > 0) {
      mergeTrace(trace, jsonlTrace)
    }

    return new ProcessFile(state, '', trace)
  }

  // -------------------------------------------------------------------------
  // write — atomic write status.json (.tmp + rename)
  // -------------------------------------------------------------------------

  write(filePath: string): void {
    const dir = path.dirname(filePath)
    const jsonPath = path.join(dir, 'status.json')
    const jsonContent = serializeProcessStateJson(this.state)
    const tmp = path.join(dir, 'status.tmp')
    try {
      fs.writeFileSync(tmp, jsonContent)
    } catch (e: any) {
      throw new Error(`写入 status.json 失败: ${e.message}`)
    }
    try {
      fs.renameSync(tmp, jsonPath)
    } catch (e: any) {
      throw new Error(`替换 status.json 失败: ${e.message}`)
    }
  }

  // -------------------------------------------------------------------------
  // appendTrace — upsert by (node, invoke)
  // -------------------------------------------------------------------------

  appendTrace(status: string, node: string, invoke: string, branch?: string): void {
    const existing = this.trace.find((e) => e.node === node && e.invoke === invoke)
    if (existing) {
      existing.status = status
      if (branch != null) {
        existing.branch = branch
      }
    } else {
      this.trace.push({
        status,
        node,
        invoke,
        branch: branch ?? undefined,
        time: formatLocalTime(),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// JSON serializer — replaces yaml frontmatter, handles multi-line values
// ---------------------------------------------------------------------------

export function serializeProcessStateJson(state: ProcessState): string {
  const obj: Record<string, any> = {}
  obj.workflow = state.workflow
  obj.instance_id = state.instance_id
  if (state.initial_input != null) obj.initial_input = state.initial_input
  obj.status = serializeStatus(state.status)
  obj.current = state.current
  obj.current_name = state.current_name
  obj.current_invoke = state.current_invoke
  obj.step = state.step
  obj.loop_count = state.loop_count
  obj.retry_count = state.retry_count
  if (state.last_node != null) obj.last_node = state.last_node
  if (state.last_invoke != null) obj.last_invoke = state.last_invoke
  if (state.completed.length > 0) obj.completed = state.completed
  obj.limits = state.limits
  return JSON.stringify(obj, null, 2)
}

export function parseProcessStateJson(json: string): ProcessState {
  const obj = JSON.parse(json)
  return {
    workflow: obj.workflow ?? '',
    instance_id: obj.instance_id ?? '',
    initial_input: obj.initial_input,
    status: typeof obj.status === 'string' ? parseStatus(obj.status) : Status.Idle,
    current: obj.current ?? '',
    current_name: obj.current_name ?? '',
    current_invoke: obj.current_invoke ?? '',
    step: obj.step ?? 0,
    loop_count: obj.loop_count ?? 0,
    retry_count: obj.retry_count ?? 0,
    last_node: obj.last_node,
    last_invoke: obj.last_invoke,
    completed: Array.isArray(obj.completed) ? obj.completed : [],
    limits: obj.limits ?? defaultLimits(),
  }
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// trace.jsonl — compact JSON, field order: ts,command,node,invoke,status,branch
// ---------------------------------------------------------------------------

export function traceJsonlPath(instDir: string): string {
  return path.join(instDir, 'trace', 'trace.jsonl')
}

export function serializeTraceLogEntry(entry: TraceLogEntry): string {
  const parts: string[] = []
  parts.push('"ts":' + JSON.stringify(entry.ts))
  parts.push('"command":' + JSON.stringify(entry.command))
  if (entry.node != null) {
    parts.push('"node":' + JSON.stringify(entry.node))
  }
  if (entry.invoke != null) {
    parts.push('"invoke":' + JSON.stringify(entry.invoke))
  }
  if (entry.status != null) {
    parts.push('"status":' + JSON.stringify(entry.status))
  }
  if (entry.branch != null) {
    parts.push('"branch":' + JSON.stringify(entry.branch))
  }
  return '{' + parts.join(',') + '}'
}

export function writeTraceLog(filePath: string, entry: TraceLogEntry): void {
  const line = serializeTraceLogEntry(entry)
  try {
    fs.appendFileSync(filePath, line + '\n')
  } catch (e: any) {
    throw new Error(`写入 trace.jsonl 失败: ${e.message}`)
  }
}

export function logTrace(instDir: string, entry: TraceLogEntry): void {
  const traceDir = path.join(instDir, 'trace')
  try {
    fs.mkdirSync(traceDir, { recursive: true })
  } catch (e: any) {
    throw new Error(`创建 trace 目录失败: ${e.message}`)
  }
  writeTraceLog(path.join(traceDir, 'trace.jsonl'), entry)
}

export function readTraceJsonl(filePath: string): TraceLogEntry[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }
  const entries: TraceLogEntry[] = []
  for (const line of content.split('\n')) {
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      entries.push({
        ts: obj.ts,
        command: obj.command,
        node: obj.node,
        invoke: obj.invoke,
        status: obj.status,
        branch: obj.branch,
      })
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

// ---------------------------------------------------------------------------
// reconstruct_trace_from_jsonl — upsert by (node, invoke)
// ---------------------------------------------------------------------------

export function reconstructTraceFromJsonl(entries: TraceLogEntry[]): TraceEvent[] {
  const trace: TraceEvent[] = []
  for (const entry of entries) {
    if (entry.node == null || entry.invoke == null || entry.status == null) continue
    const existing = trace.find((e) => e.node === entry.node && e.invoke === entry.invoke)
    if (existing) {
      existing.status = entry.status
      if (entry.branch != null) {
        existing.branch = entry.branch
      }
    } else {
      trace.push({
        status: entry.status,
        node: entry.node,
        invoke: entry.invoke,
        branch: entry.branch ?? undefined,
        time: entry.ts,
      })
    }
  }
  return trace
}

export function mergeTrace(base: TraceEvent[], updates: TraceEvent[]): void {
  for (const event of updates) {
    const existing = base.find((e) => e.node === event.node && e.invoke === event.invoke)
    if (existing) {
      existing.status = event.status
      if (event.branch != null) {
        existing.branch = event.branch
      }
    } else {
      base.push(event)
    }
  }
}

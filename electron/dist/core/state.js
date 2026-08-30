"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessFile = exports.Status = void 0;
exports.sortedJsonStringify = sortedJsonStringify;
exports.sortedJsonStringifyCompact = sortedJsonStringifyCompact;
exports.serializeStatus = serializeStatus;
exports.statusAsStr = statusAsStr;
exports.parseStatus = parseStatus;
exports.genInvokeId = genInvokeId;
exports.genId = genId;
exports.formatLocalTime = formatLocalTime;
exports.defaultLimits = defaultLimits;
exports.serializeProcessState = serializeProcessState;
exports.traceJsonlPath = traceJsonlPath;
exports.serializeTraceLogEntry = serializeTraceLogEntry;
exports.writeTraceLog = writeTraceLog;
exports.logTrace = logTrace;
exports.readTraceJsonl = readTraceJsonl;
exports.reconstructTraceFromJsonl = reconstructTraceFromJsonl;
exports.mergeTrace = mergeTrace;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
// ---------------------------------------------------------------------------
// JSON helpers — serde_json::json! macro uses BTreeMap (alphabetical key order)
// ---------------------------------------------------------------------------
function sortKeysDeep(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj))
        return obj.map(sortKeysDeep);
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
}
/** Match serde_json::to_string_pretty on a Value (alphabetical key order, 2-space indent) */
function sortedJsonStringify(obj) {
    return JSON.stringify(sortKeysDeep(obj), null, 2);
}
/** Match serde_json::to_string on a Value (alphabetical key order, compact) */
function sortedJsonStringifyCompact(obj) {
    return JSON.stringify(sortKeysDeep(obj));
}
// ---------------------------------------------------------------------------
// Status enum — dual serialization (serde rename_all="lowercase" vs as_str)
// ---------------------------------------------------------------------------
var Status;
(function (Status) {
    Status[Status["Idle"] = 0] = "Idle";
    Status[Status["Executing"] = 1] = "Executing";
    Status[Status["AwaitingChoice"] = 2] = "AwaitingChoice";
    Status[Status["Completed"] = 3] = "Completed";
    Status[Status["Aborted"] = 4] = "Aborted";
})(Status || (exports.Status = Status = {}));
/** serde_yaml 序列化用（frontmatter）：AwaitingChoice → awaitingchoice（去下划线） */
function serializeStatus(status) {
    switch (status) {
        case Status.Idle: return 'idle';
        case Status.Executing: return 'executing';
        case Status.AwaitingChoice: return 'awaitingchoice';
        case Status.Completed: return 'completed';
        case Status.Aborted: return 'aborted';
    }
}
/** as_str() — 命令输出用：AwaitingChoice → awaiting_choice（带下划线） */
function statusAsStr(status) {
    switch (status) {
        case Status.Idle: return 'idle';
        case Status.Executing: return 'executing';
        case Status.AwaitingChoice: return 'awaiting_choice';
        case Status.Completed: return 'completed';
        case Status.Aborted: return 'aborted';
    }
}
function parseStatus(s) {
    switch (s) {
        case 'idle': return Status.Idle;
        case 'executing': return Status.Executing;
        case 'awaitingchoice':
        case 'awaiting_choice':
            return Status.AwaitingChoice;
        case 'completed': return Status.Completed;
        case 'aborted': return Status.Aborted;
        default: return Status.Idle;
    }
}
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
function genInvokeId() {
    const now = new Date();
    const p = (n, w) => String(n).padStart(w, '0');
    const date = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}`;
    const time = `${p(now.getHours(), 2)}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`;
    const millis = p(now.getMilliseconds(), 3);
    return `invoke-${date}-${time}-${millis}`;
}
function genId() {
    const now = new Date();
    const p = (n, w) => String(n).padStart(w, '0');
    const date = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}`;
    const time = `${p(now.getHours(), 2)}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`;
    const hex = (now.getMilliseconds() % 10000).toString(16).padStart(4, '0');
    return `${date}T${time}-${hex}`;
}
function formatLocalTime(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function defaultLimits() {
    return { max_steps: 100, max_loop: 10, max_retry: 2 };
}
class ProcessFile {
    constructor(state, mermaid, trace) {
        this.state = state;
        this.mermaid = mermaid;
        this.trace = trace;
    }
    // -------------------------------------------------------------------------
    // read — parse process.md + merge trace.jsonl
    // -------------------------------------------------------------------------
    static read(filePath) {
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch (e) {
            throw new Error(`读取 process.md 失败 ${filePath}: ${e.message}`);
        }
        const lines = content.split('\n');
        if (lines[0] !== '---') {
            throw new Error('process.md 缺少 frontmatter 开头 ---');
        }
        const yamlLines = [];
        let i = 1;
        for (; i < lines.length; i++) {
            if (lines[i] === '---')
                break;
            yamlLines.push(lines[i]);
        }
        const yamlStr = yamlLines.join('\n');
        const body = lines.slice(i + 1).join('\n');
        const marker = '## 执行轨迹';
        let mermaid;
        let traceText;
        const idx = body.indexOf(marker);
        if (idx !== -1) {
            const raw = body.substring(0, idx).trim();
            const after = body.substring(idx + marker.length).replace(/^\n+/, '');
            mermaid = raw.startsWith('## 流程进度')
                ? raw.substring('## 流程进度'.length).trim()
                : raw;
            traceText = after;
        }
        else {
            mermaid = '';
            traceText = body;
        }
        const state = parseFrontmatter(yamlStr);
        let trace = parseTraceTable(traceText);
        const parent = path.dirname(filePath);
        const logEntries = readTraceJsonl(traceJsonlPath(parent));
        const jsonlTrace = reconstructTraceFromJsonl(logEntries);
        if (jsonlTrace.length > 0) {
            mergeTrace(trace, jsonlTrace);
        }
        return new ProcessFile(state, mermaid, trace);
    }
    // -------------------------------------------------------------------------
    // write — atomic write (.tmp + rename)
    // -------------------------------------------------------------------------
    write(filePath) {
        const yaml = serializeProcessState(this.state);
        const traceTable = renderTraceTable(this.trace);
        const body = `## 流程进度\n\n${this.mermaid}\n\n## 执行轨迹\n\n${traceTable}`;
        const content = `---\n${yaml}---\n\n${body}\n`;
        const parsed = path.parse(filePath);
        const tmp = path.join(parsed.dir, parsed.name + '.tmp');
        try {
            fs.writeFileSync(tmp, content);
        }
        catch (e) {
            throw new Error(`写入失败: ${e.message}`);
        }
        try {
            fs.renameSync(tmp, filePath);
        }
        catch (e) {
            throw new Error(`替换失败: ${e.message}`);
        }
    }
    // -------------------------------------------------------------------------
    // appendTrace — upsert by (node, invoke)
    // -------------------------------------------------------------------------
    appendTrace(status, node, invoke, branch) {
        const existing = this.trace.find((e) => e.node === node && e.invoke === invoke);
        if (existing) {
            existing.status = status;
            if (branch != null) {
                existing.branch = branch;
            }
        }
        else {
            this.trace.push({
                status,
                node,
                invoke,
                branch: branch ?? undefined,
                time: formatLocalTime(),
            });
        }
    }
}
exports.ProcessFile = ProcessFile;
// ---------------------------------------------------------------------------
// Frontmatter serializer — hand-written to match serde_yaml output
// ---------------------------------------------------------------------------
function serializeProcessState(state) {
    const lines = [];
    lines.push(`workflow: ${state.workflow}`);
    lines.push(`instance_id: ${state.instance_id}`);
    if (state.initial_input != null) {
        lines.push(`initial_input: ${state.initial_input}`);
    }
    lines.push(`status: ${serializeStatus(state.status)}`);
    lines.push(`current: ${state.current}`);
    lines.push(`current_name: ${state.current_name}`);
    lines.push(`current_invoke: ${state.current_invoke}`);
    lines.push(`step: ${state.step}`);
    lines.push(`loop_count: ${state.loop_count}`);
    lines.push(`retry_count: ${state.retry_count}`);
    if (state.last_node != null) {
        lines.push(`last_node: ${state.last_node}`);
    }
    if (state.last_invoke != null) {
        lines.push(`last_invoke: ${state.last_invoke}`);
    }
    if (state.completed.length > 0) {
        lines.push('completed:');
        for (const item of state.completed) {
            lines.push(`- ${item}`);
        }
    }
    lines.push('limits:');
    lines.push(`  max_steps: ${state.limits.max_steps}`);
    lines.push(`  max_loop: ${state.limits.max_loop}`);
    lines.push(`  max_retry: ${state.limits.max_retry}`);
    return lines.join('\n') + '\n';
}
// ---------------------------------------------------------------------------
// Frontmatter parser — reads key:value, lists, nested objects
// ---------------------------------------------------------------------------
function parseFrontmatter(yaml) {
    const lines = yaml.split('\n');
    const state = {
        workflow: '',
        instance_id: '',
        status: Status.Idle,
        current: '',
        current_name: '',
        current_invoke: '',
        step: 0,
        loop_count: 0,
        retry_count: 0,
        completed: [],
        limits: defaultLimits(),
    };
    let inCompleted = false;
    let inLimits = false;
    for (const line of lines) {
        if (line === '')
            continue;
        if (line.startsWith('  ')) {
            if (inLimits) {
                const idx = line.indexOf(':');
                const key = line.substring(0, idx).trim();
                const val = line.substring(idx + 1).trim();
                if (key === 'max_steps' || key === 'max_loop' || key === 'max_retry') {
                    state.limits[key] = parseInt(val, 10);
                }
            }
            continue;
        }
        if (line.startsWith('- ')) {
            if (inCompleted) {
                state.completed.push(line.substring(2));
            }
            continue;
        }
        inCompleted = false;
        inLimits = false;
        const idx = line.indexOf(':');
        if (idx === -1)
            continue;
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        switch (key) {
            case 'workflow':
                state.workflow = val;
                break;
            case 'instance_id':
                state.instance_id = val;
                break;
            case 'initial_input':
                if (val)
                    state.initial_input = val;
                break;
            case 'status':
                state.status = parseStatus(val);
                break;
            case 'current':
                state.current = val;
                break;
            case 'current_name':
                state.current_name = val;
                break;
            case 'current_invoke':
                state.current_invoke = val;
                break;
            case 'step':
                state.step = parseInt(val, 10);
                break;
            case 'loop_count':
                state.loop_count = parseInt(val, 10);
                break;
            case 'retry_count':
                state.retry_count = parseInt(val, 10);
                break;
            case 'last_node':
                if (val)
                    state.last_node = val;
                break;
            case 'last_invoke':
                if (val)
                    state.last_invoke = val;
                break;
            case 'completed':
                inCompleted = true;
                break;
            case 'limits':
                inLimits = true;
                break;
        }
    }
    return state;
}
// ---------------------------------------------------------------------------
// Trace table render/parse
// ---------------------------------------------------------------------------
function renderTraceTable(trace) {
    let s = '| # | 状态 | 节点 | 节点执行ID | 执行时间 |\n|---|------|------|-----------|---------|\n';
    for (let i = 0; i < trace.length; i++) {
        const e = trace[i];
        const nodeDisplay = e.branch ? `${e.node}(${e.branch})` : e.node;
        s += `| ${i + 1} | ${e.status} | ${nodeDisplay} | ${e.invoke} | ${e.time} |\n`;
    }
    return s;
}
function parseTraceTable(text) {
    const events = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line.startsWith('|'))
            continue;
        const cells = line.split('|').map((s) => s.trim());
        if (cells.length < 6)
            continue;
        const num = cells[1];
        if (!num || num === '#' || num.startsWith('-'))
            continue;
        const { node, branch } = parseNodeCell(cells[3]);
        events.push({
            status: cells[2],
            node,
            invoke: cells[4],
            branch: branch ?? undefined,
            time: cells[5],
        });
    }
    return events;
}
function parseNodeCell(cell) {
    const openIdx = cell.indexOf('(');
    if (openIdx !== -1 && cell.endsWith(')')) {
        return {
            node: cell.substring(0, openIdx),
            branch: cell.substring(openIdx + 1, cell.length - 1),
        };
    }
    return { node: cell };
}
// ---------------------------------------------------------------------------
// trace.jsonl — compact JSON, field order: ts,command,node,invoke,status,branch
// ---------------------------------------------------------------------------
function traceJsonlPath(instDir) {
    return path.join(instDir, 'trace', 'trace.jsonl');
}
function serializeTraceLogEntry(entry) {
    const parts = [];
    parts.push('"ts":' + JSON.stringify(entry.ts));
    parts.push('"command":' + JSON.stringify(entry.command));
    if (entry.node != null) {
        parts.push('"node":' + JSON.stringify(entry.node));
    }
    if (entry.invoke != null) {
        parts.push('"invoke":' + JSON.stringify(entry.invoke));
    }
    if (entry.status != null) {
        parts.push('"status":' + JSON.stringify(entry.status));
    }
    if (entry.branch != null) {
        parts.push('"branch":' + JSON.stringify(entry.branch));
    }
    return '{' + parts.join(',') + '}';
}
function writeTraceLog(filePath, entry) {
    const line = serializeTraceLogEntry(entry);
    try {
        fs.appendFileSync(filePath, line + '\n');
    }
    catch (e) {
        throw new Error(`写入 trace.jsonl 失败: ${e.message}`);
    }
}
function logTrace(instDir, entry) {
    const traceDir = path.join(instDir, 'trace');
    try {
        fs.mkdirSync(traceDir, { recursive: true });
    }
    catch (e) {
        throw new Error(`创建 trace 目录失败: ${e.message}`);
    }
    writeTraceLog(path.join(traceDir, 'trace.jsonl'), entry);
}
function readTraceJsonl(filePath) {
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return [];
    }
    const entries = [];
    for (const line of content.split('\n')) {
        if (!line)
            continue;
        try {
            const obj = JSON.parse(line);
            entries.push({
                ts: obj.ts,
                command: obj.command,
                node: obj.node,
                invoke: obj.invoke,
                status: obj.status,
                branch: obj.branch,
            });
        }
        catch {
            // skip malformed lines
        }
    }
    return entries;
}
// ---------------------------------------------------------------------------
// reconstruct_trace_from_jsonl — upsert by (node, invoke)
// ---------------------------------------------------------------------------
function reconstructTraceFromJsonl(entries) {
    const trace = [];
    for (const entry of entries) {
        if (entry.node == null || entry.invoke == null || entry.status == null)
            continue;
        const existing = trace.find((e) => e.node === entry.node && e.invoke === entry.invoke);
        if (existing) {
            existing.status = entry.status;
            if (entry.branch != null) {
                existing.branch = entry.branch;
            }
        }
        else {
            trace.push({
                status: entry.status,
                node: entry.node,
                invoke: entry.invoke,
                branch: entry.branch ?? undefined,
                time: entry.ts,
            });
        }
    }
    return trace;
}
function mergeTrace(base, updates) {
    for (const event of updates) {
        const existing = base.find((e) => e.node === event.node && e.invoke === event.invoke);
        if (existing) {
            existing.status = event.status;
            if (event.branch != null) {
                existing.branch = event.branch;
            }
        }
        else {
            base.push(event);
        }
    }
}

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
exports.list = list;
exports.view = view;
exports.search = search;
exports.timeline = timeline;
exports.diff = diff;
exports.contextSet = contextSet;
exports.contextGet = contextGet;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const state_1 = require("./state");
const artifact_1 = require("./artifact");
// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------
var ArtifactType;
(function (ArtifactType) {
    ArtifactType[ArtifactType["Detail"] = 0] = "Detail";
    ArtifactType[ArtifactType["Error"] = 1] = "Error";
    ArtifactType[ArtifactType["None"] = 2] = "None";
})(ArtifactType || (ArtifactType = {}));
function artifactTypeStr(t) {
    switch (t) {
        case ArtifactType.Detail: return 'detail';
        case ArtifactType.Error: return 'error';
        case ArtifactType.None: return 'none';
    }
}
// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
function instanceDir(root, workflow, instanceId) {
    return path.join(root, '.workflows', workflow, 'instance', instanceId);
}
function nodeDisplay(node, branch) {
    return branch ? `${node}(${branch})` : node;
}
function fileExistsNonEmpty(filePath) {
    try {
        return fs.statSync(filePath).size > 0;
    }
    catch {
        return false;
    }
}
function collectEntries(root, workflow, instanceId) {
    const pf = state_1.ProcessFile.read(path.join(instanceDir(root, workflow, instanceId), 'process.md'));
    const entries = [];
    for (let i = 0; i < pf.trace.length; i++) {
        const event = pf.trace[i];
        let atype;
        if (event.invoke === '-') {
            atype = ArtifactType.None;
        }
        else {
            const dir = (0, artifact_1.artifactDir)(root, workflow, instanceId, event.node, event.invoke);
            const detailPath = path.join(dir, 'detail.md');
            const errorPath = path.join(dir, 'error.md');
            if (fileExistsNonEmpty(detailPath)) {
                atype = ArtifactType.Detail;
            }
            else if (fileExistsNonEmpty(errorPath)) {
                atype = ArtifactType.Error;
            }
            else {
                atype = ArtifactType.None;
            }
        }
        entries.push({
            order: i + 1,
            node: event.node,
            invoke: event.invoke,
            artifact_type: atype,
            status: event.status,
            time: event.time,
            branch: event.branch,
        });
    }
    return [entries, pf];
}
function readContent(root, workflow, instanceId, node, invoke) {
    const dir = (0, artifact_1.artifactDir)(root, workflow, instanceId, node, invoke);
    const detailPath = path.join(dir, 'detail.md');
    const errorPath = path.join(dir, 'error.md');
    if (fs.existsSync(detailPath)) {
        try {
            const content = fs.readFileSync(detailPath, 'utf-8');
            if (content !== '')
                return [ArtifactType.Detail, content];
        }
        catch {
            // fall through
        }
    }
    if (fs.existsSync(errorPath)) {
        try {
            const content = fs.readFileSync(errorPath, 'utf-8');
            if (content !== '')
                return [ArtifactType.Error, content];
        }
        catch {
            // fall through
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
function list(root, workflow, instanceId, json) {
    const [entries, pf] = collectEntries(root, workflow, instanceId);
    if (json) {
        const artifacts = entries.map((e) => ({
            order: e.order,
            node: e.node,
            invoke: e.invoke,
            type: artifactTypeStr(e.artifact_type),
            status: e.status,
            time: e.time,
            branch: e.branch ?? null,
        }));
        return (0, state_1.sortedJsonStringify)({
            instance: instanceId,
            workflow,
            status: (0, state_1.statusAsStr)(pf.state.status),
            artifacts,
        });
    }
    let s = '| # | 节点 | 执行ID | 类型 | 状态 | 执行时间 |\n|---|------|--------|------|------|---------|\n';
    for (const e of entries) {
        s += `| ${e.order} | ${nodeDisplay(e.node, e.branch)} | ${e.invoke} | ${artifactTypeStr(e.artifact_type)} | ${e.status} | ${e.time} |\n`;
    }
    return s;
}
// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------
function view(root, workflow, instanceId, node, invoke, json = false) {
    const [entries] = collectEntries(root, workflow, instanceId);
    let matched;
    if (invoke) {
        matched = entries.filter((e) => e.invoke === invoke);
    }
    else if (node) {
        matched = entries.filter((e) => e.node === node);
    }
    else {
        throw new Error('请通过 --node 或 --invoke 指定要查看的产物');
    }
    if (matched.length === 0) {
        if (invoke)
            throw new Error(`未找到执行ID: ${invoke}`);
        throw new Error(`未找到节点: ${node ?? '未知节点'}`);
    }
    const results = matched.map((e) => ({
        entry: e,
        content: readContent(root, workflow, instanceId, e.node, e.invoke),
    }));
    if (json) {
        const artifacts = results.map(({ entry: e, content }) => {
            const [atype, contentVal] = content
                ? [artifactTypeStr(content[0]), content[1]]
                : ['none', null];
            return {
                order: e.order,
                node: e.node,
                invoke: e.invoke,
                type: atype,
                status: e.status,
                time: e.time,
                branch: e.branch ?? null,
                content: contentVal,
            };
        });
        return (0, state_1.sortedJsonStringify)({ instance: instanceId, artifacts });
    }
    const total = results.length;
    let s = '';
    for (let i = 0; i < results.length; i++) {
        const { entry: e, content } = results[i];
        s += `## [${i + 1}/${total}] ${nodeDisplay(e.node, e.branch)} (${e.invoke})\n`;
        if (content) {
            const [atype, text] = content;
            s += `> 类型: ${artifactTypeStr(atype)} | 状态: ${e.status} | 时间: ${e.time}\n\n`;
            s += text;
            if (!text.endsWith('\n'))
                s += '\n';
        }
        else {
            s += `> 类型: none | 状态: ${e.status} | 时间: ${e.time}\n\n> 该执行无产物\n`;
        }
        if (i + 1 < total)
            s += '\n---\n\n';
    }
    return s;
}
// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
function search(root, workflow, instanceId, keyword, json) {
    if (!keyword)
        throw new Error('搜索关键词不能为空');
    const [entries] = collectEntries(root, workflow, instanceId);
    const results = entries.filter((e) => {
        if (e.invoke === '-')
            return false;
        const content = readContent(root, workflow, instanceId, e.node, e.invoke);
        return content != null && content[1].includes(keyword);
    });
    if (json) {
        const artifacts = results.map((e) => ({
            order: e.order,
            node: e.node,
            invoke: e.invoke,
            type: artifactTypeStr(e.artifact_type),
            status: e.status,
            time: e.time,
            branch: e.branch ?? null,
        }));
        return (0, state_1.sortedJsonStringify)({ instance: instanceId, keyword, results: artifacts });
    }
    let s = '| # | 节点 | 执行ID | 类型 | 状态 | 执行时间 |\n|---|------|--------|------|------|---------|\n';
    for (const e of results) {
        s += `| ${e.order} | ${nodeDisplay(e.node, e.branch)} | ${e.invoke} | ${artifactTypeStr(e.artifact_type)} | ${e.status} | ${e.time} |\n`;
    }
    return s;
}
// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------
function timeline(root, workflow, instanceId, json) {
    const [entries, pf] = collectEntries(root, workflow, instanceId);
    const results = entries.map((e) => ({
        entry: e,
        content: e.invoke === '-' ? null : readContent(root, workflow, instanceId, e.node, e.invoke),
    }));
    const contextPath = path.join(instanceDir(root, workflow, instanceId), 'context.md');
    let context = null;
    try {
        const ctx = fs.readFileSync(contextPath, 'utf-8');
        if (ctx !== '')
            context = ctx;
    }
    catch {
        // no context
    }
    if (json) {
        const timeline = results.map(({ entry: e, content }) => {
            const [atype, contentVal] = content
                ? [artifactTypeStr(content[0]), content[1]]
                : [artifactTypeStr(e.artifact_type), null];
            return {
                order: e.order,
                node: e.node,
                invoke: e.invoke,
                type: atype,
                status: e.status,
                time: e.time,
                branch: e.branch ?? null,
                content: contentVal,
            };
        });
        return (0, state_1.sortedJsonStringify)({
            instance: instanceId,
            workflow,
            status: (0, state_1.statusAsStr)(pf.state.status),
            initial_input: pf.state.initial_input ?? null,
            context,
            timeline,
        });
    }
    let s = `# 实例: ${instanceId}\n`;
    s += `# 工作流: ${workflow}\n`;
    s += `# 状态: ${(0, state_1.statusAsStr)(pf.state.status)}\n`;
    if (pf.state.initial_input) {
        s += `# 初始任务: ${pf.state.initial_input}\n`;
    }
    if (context) {
        s += '\n## 上下文\n\n';
        s += context;
        if (!context.endsWith('\n'))
            s += '\n';
    }
    s += '\n## 执行时间线\n\n';
    s += '| # | 节点 | 执行ID | 类型 | 状态 | 执行时间 |\n|---|------|--------|------|------|---------|\n';
    for (const e of entries) {
        s += `| ${e.order} | ${nodeDisplay(e.node, e.branch)} | ${e.invoke} | ${artifactTypeStr(e.artifact_type)} | ${e.status} | ${e.time} |\n`;
    }
    s += '\n## 产物详情\n\n';
    for (const { entry: e, content } of results) {
        s += `### [${e.order}] ${nodeDisplay(e.node, e.branch)} (${e.invoke})\n`;
        if (content) {
            const [atype, text] = content;
            s += `> 类型: ${artifactTypeStr(atype)} | 状态: ${e.status} | 时间: ${e.time}\n\n`;
            s += text;
            if (!text.endsWith('\n'))
                s += '\n';
        }
        else {
            s += `> 类型: none | 状态: ${e.status} | 时间: ${e.time}\n\n> 无产物\n`;
        }
        s += '\n';
    }
    return s;
}
// ---------------------------------------------------------------------------
// diff (LCS algorithm with added-priority backtracking)
// ---------------------------------------------------------------------------
var DiffLineType;
(function (DiffLineType) {
    DiffLineType[DiffLineType["Context"] = 0] = "Context";
    DiffLineType[DiffLineType["Added"] = 1] = "Added";
    DiffLineType[DiffLineType["Removed"] = 2] = "Removed";
    DiffLineType[DiffLineType["Separator"] = 3] = "Separator";
})(DiffLineType || (DiffLineType = {}));
function computeDiff(old, new_) {
    const oldLines = old.split('\n');
    const newLines = new_.split('\n');
    // Handle empty input: Rust's .lines() on "" returns empty iterator
    if (old === '')
        oldLines.length = 0;
    if (new_ === '')
        newLines.length = 0;
    const m = oldLines.length;
    const n = newLines.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            result.push({ type: DiffLineType.Context, text: oldLines[i - 1] });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ type: DiffLineType.Added, text: newLines[j - 1] });
            j--;
        }
        else {
            result.push({ type: DiffLineType.Removed, text: oldLines[i - 1] });
            i--;
        }
    }
    result.reverse();
    return result;
}
function applyContextLimit(diff, context) {
    const changeIndices = [];
    for (let i = 0; i < diff.length; i++) {
        if (diff[i].type !== DiffLineType.Context) {
            changeIndices.push(i);
        }
    }
    if (changeIndices.length === 0)
        return [];
    const include = new Array(diff.length).fill(false);
    for (const ci of changeIndices) {
        const start = Math.max(0, ci - context);
        const end = Math.min(diff.length, ci + context + 1);
        for (let k = start; k < end; k++)
            include[k] = true;
    }
    const result = [];
    let prevIncluded = false;
    for (let i = 0; i < diff.length; i++) {
        if (include[i]) {
            result.push(diff[i]);
            prevIncluded = true;
        }
        else if (prevIncluded) {
            result.push({ type: DiffLineType.Separator, text: '' });
            prevIncluded = false;
        }
    }
    if (result.length > 0 && result[result.length - 1].type === DiffLineType.Separator) {
        result.pop();
    }
    return result;
}
function diffLineTag(t) {
    switch (t) {
        case DiffLineType.Context: return 'context';
        case DiffLineType.Added: return 'added';
        case DiffLineType.Removed: return 'removed';
        case DiffLineType.Separator: return 'separator';
    }
}
function diffLineValue(line) {
    if (line.type === DiffLineType.Separator)
        return '...';
    return line.text;
}
const MAX_DIFF_LINES = 5000;
function diff(root, workflow, instanceId, node, json, context, full) {
    const [entries] = collectEntries(root, workflow, instanceId);
    const matched = entries.filter((e) => e.node === node);
    if (matched.length < 2) {
        throw new Error(`节点 ${node} 仅执行 ${matched.length} 次，需至少 2 次才能对比`);
    }
    const contents = matched.map((e) => ({
        entry: e,
        content: readContent(root, workflow, instanceId, e.node, e.invoke)?.[1] ?? '',
    }));
    const diffs = [];
    for (let i = 0; i < contents.length - 1; i++) {
        const { entry: e1, content: text1 } = contents[i];
        const { entry: e2, content: text2 } = contents[i + 1];
        const lines1 = text1.split('\n').filter((_, idx, arr) => !(text1 === '' && arr.length === 1));
        const lines2 = text2.split('\n').filter((_, idx, arr) => !(text2 === '' && arr.length === 1));
        if (lines1.length > MAX_DIFF_LINES || lines2.length > MAX_DIFF_LINES) {
            throw new Error(`产物行数超过 ${MAX_DIFF_LINES} 行上限，已跳过 diff 计算`);
        }
        const raw = computeDiff(text1, text2);
        const display = full ? raw : applyContextLimit(raw, context);
        diffs.push({ e1, e2, lines: display });
    }
    if (json) {
        const diffArr = diffs.map(({ e1, e2, lines }) => ({
            from_invoke: e1.invoke,
            to_invoke: e2.invoke,
            from_status: e1.status,
            to_status: e2.status,
            from_time: e1.time,
            to_time: e2.time,
            changes: lines.map((l) => ({ type: diffLineTag(l.type), value: diffLineValue(l) })),
        }));
        return (0, state_1.sortedJsonStringify)({ instance: instanceId, node, diffs: diffArr });
    }
    let s = '';
    for (let i = 0; i < diffs.length; i++) {
        const { e1, e2, lines } = diffs[i];
        s += `## [${i + 1}→${i + 2}] ${nodeDisplay(e1.node, e1.branch)} (${e1.invoke})\n`;
        s += `> 对比: ${e1.invoke} (${e1.status}, ${e1.time}) → ${e2.invoke} (${e2.status}, ${e2.time})\n\n`;
        if (lines.length === 0) {
            s += '无变更\n';
        }
        else {
            s += '```diff\n';
            for (const l of lines) {
                switch (l.type) {
                    case DiffLineType.Context:
                        s += `  ${l.text}\n`;
                        break;
                    case DiffLineType.Added:
                        s += `+ ${l.text}\n`;
                        break;
                    case DiffLineType.Removed:
                        s += `- ${l.text}\n`;
                        break;
                    case DiffLineType.Separator:
                        s += '...\n';
                        break;
                }
            }
            s += '```\n';
        }
        if (i + 1 < diffs.length)
            s += '\n';
    }
    return s;
}
// ---------------------------------------------------------------------------
// context set / get
// ---------------------------------------------------------------------------
function contextSet(root, workflow, instanceId, topic, content) {
    if (!topic)
        throw new Error('topic 不能为空');
    if (!content)
        throw new Error('content 不能为空');
    const safeTopic = topic.replace(/[\n\r]/g, ' ');
    const filePath = path.join(instanceDir(root, workflow, instanceId), 'context.md');
    const time = (0, state_1.formatLocalTime)();
    const entry = `## [${time}] ${safeTopic}\n\n${content}\n`;
    try {
        fs.appendFileSync(filePath, entry);
    }
    catch (e) {
        throw new Error(`写入 context.md 失败: ${e.message}`);
    }
    return '上下文已暂存';
}
function contextGet(root, workflow, instanceId, json) {
    const filePath = path.join(instanceDir(root, workflow, instanceId), 'context.md');
    if (!fs.existsSync(filePath)) {
        if (json) {
            return (0, state_1.sortedJsonStringify)({ instance: instanceId, context: null });
        }
        return '无暂存上下文';
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (e) {
        throw new Error(`读取 context.md 失败: ${e.message}`);
    }
    if (json) {
        return (0, state_1.sortedJsonStringify)({ instance: instanceId, context: content });
    }
    return content;
}

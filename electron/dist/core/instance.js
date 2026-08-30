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
exports.create = create;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const model_1 = require("./model");
const graph_1 = require("./graph");
const state_1 = require("./state");
const executor_1 = require("./executor");
function create(root, workflow, instanceId, input, limits = (0, state_1.defaultLimits)()) {
    const wfDir = path.join(root, '.workflows', workflow);
    const flowPath = path.join(wfDir, 'meta-data', 'flow.json');
    const flow = (0, model_1.fromFile)(flowPath);
    const graph = new graph_1.Graph(flow);
    const start = (0, model_1.startNode)(flow);
    if (!start)
        throw new Error('工作流缺少 start 节点');
    const firstId = graph.nextNode(start.id);
    const first = (0, model_1.node)(flow, firstId);
    if (!first)
        throw new Error('首个节点不存在');
    const instDir = path.join(wfDir, 'instance', instanceId);
    try {
        fs.mkdirSync(instDir, { recursive: true });
    }
    catch (e) {
        throw new Error(`创建实例目录失败: ${e.message}`);
    }
    const wfMd = path.join(wfDir, 'WORKFLOW.md');
    if (fs.existsSync(wfMd)) {
        try {
            fs.copyFileSync(wfMd, path.join(instDir, 'instance.md'));
        }
        catch (e) {
            throw new Error(`复制 instance.md 失败: ${e.message}`);
        }
    }
    const state = {
        workflow,
        instance_id: instanceId,
        initial_input: input,
        status: state_1.Status.Idle,
        current: firstId,
        current_name: first.data.label,
        current_invoke: (0, state_1.genInvokeId)(),
        step: 0,
        loop_count: 0,
        retry_count: 0,
        last_node: undefined,
        last_invoke: undefined,
        completed: [],
        limits,
    };
    const mermaid = (0, executor_1.renderMermaid)(flow, state, instDir);
    const pf = new state_1.ProcessFile(state, mermaid, []);
    pf.write(path.join(instDir, 'process.md'));
    try {
        (0, state_1.logTrace)(instDir, {
            ts: (0, state_1.formatLocalTime)(), command: 'instance create',
            node: undefined, invoke: undefined, status: undefined, branch: undefined,
        });
    }
    catch {
        // ignored
    }
    return instanceId;
}

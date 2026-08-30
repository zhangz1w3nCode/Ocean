#!/usr/bin/env -S node
"use strict";
// workflow CLI — TS rewrite of Rust workflow-cli
// Usage: node workflow.js [options] <command> [subcommand] ...
Object.defineProperty(exports, "__esModule", { value: true });
const executor_1 = require("../core/executor");
const instance_1 = require("../core/instance");
const artifact_query_1 = require("../core/artifact_query");
const state_1 = require("../core/state");
// ---------------------------------------------------------------------------
// Simple argument parser (all flags are --long value)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const args = argv.slice(2); // skip node + script
    let root;
    const positional = [];
    const flags = {};
    let i = 0;
    // First, find the command (first non-flag argument, but --root is global)
    let command = '';
    let subcommand = '';
    const remaining = [];
    for (let j = 0; j < args.length; j++) {
        const arg = args[j];
        if (arg === '--root') {
            root = args[++j];
        }
        else if (arg.startsWith('--root=')) {
            root = arg.substring(7);
        }
        else if (arg.startsWith('--')) {
            const key = arg.substring(2);
            const next = args[j + 1];
            if (next && !next.startsWith('--')) {
                flags[key] = next;
                j++;
            }
            else {
                flags[key] = true;
            }
        }
        else {
            if (!command) {
                command = arg;
            }
            else if (!subcommand && (command === 'artifact' || command === 'context')) {
                subcommand = arg;
            }
            else {
                positional.push(arg);
            }
        }
    }
    return { root, command, subcommand, positional, flags };
}
function getLimit(flags, key, fallback) {
    const val = flags[key];
    if (typeof val === 'string')
        return parseInt(val, 10);
    return fallback;
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
    const args = parseArgs(process.argv);
    try {
        const root = (0, executor_1.resolveRoot)(args.root);
        switch (args.command) {
            case 'list': {
                process.stdout.write((0, executor_1.listWorkflows)(root) + '\n');
                break;
            }
            case 'instance': {
                if (args.positional[0] === 'list') {
                    const wf = typeof args.flags.workflow === 'string' ? args.flags.workflow : undefined;
                    process.stdout.write((0, executor_1.listInstances)(root, wf) + '\n');
                }
                else {
                    const workflowName = args.positional[0];
                    const id = typeof args.flags.instance === 'string' ? args.flags.instance : (0, state_1.genId)();
                    const limits = {
                        max_steps: getLimit(args.flags, 'max-steps', 100),
                        max_loop: getLimit(args.flags, 'max-loop', 10),
                        max_retry: getLimit(args.flags, 'max-retry', 2),
                    };
                    const input = typeof args.flags.input === 'string' ? args.flags.input : undefined;
                    (0, instance_1.create)(root, workflowName, id, input, limits);
                    process.stdout.write(id + '\n');
                }
                break;
            }
            case 'next': {
                const id = args.flags.instance;
                const json = args.flags.json === true;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                process.stdout.write((0, executor_1.next)(root, wf, id, json) + '\n');
                break;
            }
            case 'complete': {
                const id = args.flags.instance;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                const output = typeof args.flags.output === 'string' ? args.flags.output : undefined;
                const outputFile = typeof args.flags['output-file'] === 'string' ? args.flags['output-file'] : undefined;
                const content = (0, executor_1.readOutput)(output, outputFile);
                process.stdout.write((0, executor_1.complete)(root, wf, id, content) + '\n');
                break;
            }
            case 'fail': {
                const id = args.flags.instance;
                const reason = args.flags.reason;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                process.stdout.write((0, executor_1.fail)(root, wf, id, reason) + '\n');
                break;
            }
            case 'choose': {
                const id = args.flags.instance;
                const branch = args.flags.branch;
                const reason = typeof args.flags.reason === 'string' ? args.flags.reason : undefined;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                process.stdout.write((0, executor_1.choose)(root, wf, id, branch, reason) + '\n');
                break;
            }
            case 'status': {
                const id = args.flags.instance;
                const json = args.flags.json === true;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                (0, executor_1.logTraceCommand)(root, wf, id, 'status');
                process.stdout.write((0, executor_1.status)(root, wf, id, json) + '\n');
                break;
            }
            case 'artifact': {
                const id = args.flags.instance;
                const json = args.flags.json === true;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                switch (args.subcommand) {
                    case 'list':
                        (0, executor_1.logTraceCommand)(root, wf, id, 'artifact list');
                        process.stdout.write((0, artifact_query_1.list)(root, wf, id, json) + '\n');
                        break;
                    case 'view': {
                        (0, executor_1.logTraceCommand)(root, wf, id, 'artifact view');
                        const node = typeof args.flags.node === 'string' ? args.flags.node : undefined;
                        const invoke = typeof args.flags.invoke === 'string' ? args.flags.invoke : undefined;
                        process.stdout.write((0, artifact_query_1.view)(root, wf, id, node, invoke, json) + '\n');
                        break;
                    }
                    case 'search': {
                        (0, executor_1.logTraceCommand)(root, wf, id, 'artifact search');
                        const keyword = args.flags.keyword;
                        process.stdout.write((0, artifact_query_1.search)(root, wf, id, keyword, json) + '\n');
                        break;
                    }
                    case 'timeline':
                        (0, executor_1.logTraceCommand)(root, wf, id, 'artifact timeline');
                        process.stdout.write((0, artifact_query_1.timeline)(root, wf, id, json) + '\n');
                        break;
                    case 'diff': {
                        (0, executor_1.logTraceCommand)(root, wf, id, 'artifact diff');
                        const node = args.flags.node;
                        const context = typeof args.flags.context === 'string' ? parseInt(args.flags.context, 10) : 3;
                        const full = args.flags.full === true;
                        process.stdout.write((0, artifact_query_1.diff)(root, wf, id, node, json, context, full) + '\n');
                        break;
                    }
                    default:
                        throw new Error(`未知的 artifact 子命令: ${args.subcommand}`);
                }
                break;
            }
            case 'context': {
                const id = args.flags.instance;
                const wf = (0, executor_1.instanceWorkflow)(root, id);
                switch (args.subcommand) {
                    case 'set': {
                        (0, executor_1.logTraceCommand)(root, wf, id, 'context set');
                        const topic = args.flags.topic;
                        const content = args.flags.content;
                        process.stdout.write((0, artifact_query_1.contextSet)(root, wf, id, topic, content) + '\n');
                        break;
                    }
                    case 'get': {
                        (0, executor_1.logTraceCommand)(root, wf, id, 'context get');
                        const json = args.flags.json === true;
                        process.stdout.write((0, artifact_query_1.contextGet)(root, wf, id, json) + '\n');
                        break;
                    }
                    default:
                        throw new Error(`未知的 context 子命令: ${args.subcommand}`);
                }
                break;
            }
            default:
                throw new Error(`未知的命令: ${args.command}\n用法: workflow <list|instance|next|complete|fail|choose|status|artifact|context> [...]`);
        }
    }
    catch (e) {
        process.stderr.write(e.message + '\n');
        process.exit(1);
    }
}
main();

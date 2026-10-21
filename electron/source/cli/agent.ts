// ocean agent CLI 适配层：把 core/agent 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败（如「智能体已存在」「智能体不存在」）→ 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格）在本层完成。
// 由 bin/ocean.ts 的 handleAgent 与 printHelp('agent') 迁移而来（零行为变更）。

import {
  listAgents as listAgentsCore,
  readAgent as readAgentCore,
  createAgent as createAgentCore,
  updateAgent as updateAgentCore,
  delAgent as delAgentCore,
} from '../../core/common'
import type { AgentWriteOpts } from '../../core/common'
import {
  UsageError,
  readContent,
  stripFrontmatter,
  out,
  printJson,
  printList,
  printAction,
} from './common'
import type { CliArgs } from './common'

// ---------------------------------------------------------------------------
// core 契约 → CLI 异常语义
// ---------------------------------------------------------------------------

// 业务校验失败在 core 是 { success:false, error }，对 CLI 而言就是执行失败 → 抛出，
// 由 main() 统一按运行时错误（exit 1）输出。
function unwrap<T>(res: { success: boolean; error?: string } & Partial<T>, fallback: string): T {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
  return res as T
}

// 无数据返回的操作（create/update/delete）：只关心成功/失败
function unwrapOk(res: { success: boolean; error?: string }, fallback: string): void {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
}

export function listAgents(root: string): string[] {
  return unwrap<{ names: string[] }>(listAgentsCore(root), '列出智能体失败').names || []
}

// 返回原文（含 frontmatter）；文件不存在时 core 保留系统错误原文（ENOENT），与迁移前 CLI 输出一致
export function readAgent(root: string, name: string): string {
  return unwrap<{ content: string }>(readAgentCore(root, name), '读取智能体失败').content
}

export function createAgent(root: string, name: string, content: string, opts?: AgentWriteOpts): void {
  unwrapOk(createAgentCore(root, name, content, opts), '创建智能体失败')
}

export function updateAgent(root: string, name: string, content: string, opts?: AgentWriteOpts): void {
  unwrapOk(updateAgentCore(root, name, content, opts), '更新智能体失败')
}

export function delAgent(root: string, name: string): void {
  unwrapOk(delAgentCore(root, name), '删除智能体失败')
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printAgentHelp(): void {
  out(`ocean agent — 智能体 CRUD

用法: ocean agent <subcommand> <name> [--flags...]

子命令:
  list                          列出所有智能体
  read <name>                  读取智能体内容
  create <name>                创建智能体
  update <name>                更新智能体
  delete <name>                删除智能体

常用 flag:
  --description <text>         智能体描述
  --model <model>              模型名称
  --color <color>              颜色标识
  --tools <tools>              工具列表
  --system-prompt-mode <mode>  系统提示模式
  --inherit-project-context    继承项目上下文
  --inherit-skills             继承技能
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleAgent(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(listAgents(root))
      else printList(listAgents(root), '智能体')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(readAgent(root, name)) }) : out(stripFrontmatter(readAgent(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      createAgent(root, name, content, {
        description: typeof args.flags.description === 'string' ? args.flags.description : undefined,
        model: typeof args.flags.model === 'string' ? args.flags.model : undefined,
        color: typeof args.flags.color === 'string' ? args.flags.color : undefined,
        tools: typeof args.flags.tools === 'string' ? args.flags.tools : undefined,
        systemPromptMode: typeof args.flags['system-prompt-mode'] === 'string' ? args.flags['system-prompt-mode'] : undefined,
        inheritProjectContext: args.flags['inherit-project-context'] === true,
        inheritSkills: args.flags['inherit-skills'] === true,
      })
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      updateAgent(root, name, content, {
        description: typeof args.flags.description === 'string' ? args.flags.description : undefined,
        model: typeof args.flags.model === 'string' ? args.flags.model : undefined,
        color: typeof args.flags.color === 'string' ? args.flags.color : undefined,
        tools: typeof args.flags.tools === 'string' ? args.flags.tools : undefined,
        systemPromptMode: typeof args.flags['system-prompt-mode'] === 'string' ? args.flags['system-prompt-mode'] : undefined,
        inheritProjectContext: args.flags['inherit-project-context'] === true ? true : undefined,
        inheritSkills: args.flags['inherit-skills'] === true ? true : undefined,
      })
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      delAgent(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printAgentHelp()
        return
      }
      throw new UsageError(`未知的 agent 子命令: ${cmd}\n运行 'ocean agent --help' 查看详细用法。`)
  }
}

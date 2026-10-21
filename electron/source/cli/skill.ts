// ocean skill CLI 适配层：把 core/skill 的 { success, ...data } 统一契约转换为 CLI 语义。
// 业务校验失败（如「技能目录已存在」「技能描述为必填项」）→ 抛异常（main() 统一按运行时错误 exit 1）；
// 参数/用法错误 → UsageError（exit 2）。输出格式化（--json / 表格）在本层完成。
// 由 bin/ocean.ts 的 handleSkill 与 printHelp('skill') 迁移而来（零行为变更）。

import {
  listSkills as listSkillsCore,
  readSkill as readSkillCore,
  createSkill as createSkillCore,
  updateSkill as updateSkillCore,
  delSkill as delSkillCore,
} from '../../core/common'
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

export function listSkills(root: string): string[] {
  return unwrap<{ names: string[] }>(listSkillsCore(root), '列出技能失败').names || []
}

// 返回原文（含 frontmatter）；文件不存在时 core 保留系统错误原文（ENOENT），与迁移前 CLI 输出一致
export function readSkill(root: string, name: string): string {
  return unwrap<{ content: string }>(readSkillCore(root, name), '读取技能失败').content
}

export function createSkill(root: string, name: string, content: string, description: string): void {
  unwrapOk(createSkillCore(root, name, content, description), '创建技能失败')
}

export function updateSkill(root: string, name: string, content: string): void {
  unwrapOk(updateSkillCore(root, name, content), '更新技能失败')
}

export function delSkill(root: string, name: string): void {
  unwrapOk(delSkillCore(root, name), '删除技能失败')
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

export function printSkillHelp(): void {
  out(`ocean skill — 技能 CRUD

用法: ocean skill <subcommand> <name> [--flags...]

子命令:
  list                          列出所有技能
  read <name>                  读取技能内容
  create <name>                创建技能
  update <name>                更新技能
  delete <name>                删除技能

常用 flag:
  --description <text>         技能描述
  --content "文本"             短内容直接传
  --content-file <path>         长内容指向文件
  stdin                        管道输入（三选一）`)
}

// ---------------------------------------------------------------------------
// 命令处理
// ---------------------------------------------------------------------------

export function handleSkill(root: string, args: CliArgs): void {
  const cmd = args.subcommand
  switch (cmd) {
    case 'list':
      if (args.flags.json) printJson(listSkills(root))
      else printList(listSkills(root), '技能')
      break
    case 'read': {
      const name = args.positional[0]
      args.flags.json ? printJson({ content: stripFrontmatter(readSkill(root, name)) }) : out(stripFrontmatter(readSkill(root, name)))
      break
    }
    case 'create': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      const description = args.flags.description as string
      createSkill(root, name, content, description)
      args.flags.json ? printJson({ action: 'created', name }) : printAction('created', { name })
      break
    }
    case 'update': {
      const name = args.positional[0]
      const content = readContent(args.flags)
      updateSkill(root, name, content)
      args.flags.json ? printJson({ action: 'updated', name }) : printAction('updated', { name })
      break
    }
    case 'delete': {
      const name = args.positional[0]
      delSkill(root, name)
      args.flags.json ? printJson({ action: 'deleted', name }) : printAction('deleted', { name })
      break
    }
    default:
      if (!cmd) {
        printSkillHelp()
        return
      }
      throw new UsageError(`未知的 skill 子命令: ${cmd}\n运行 'ocean skill --help' 查看详细用法。`)
  }
}

import * as codebaseCore from '../../core/codebases'
import type { CodebaseInfo, CreateCodebaseOptions, CodebaseResult, SearchHit } from '../../core/codebases'

// 桌面端适配层：被渲染进程经 src/bridge/codebases.ts 直接 require（nodeIntegration）。
// 入口职责：参数形状校验拦截（类型/枚举/必填），拦截失败返回 { success: false }，不抛异常
// 出口职责：透传 core 统一契约（{ success: true, ...data } | { success: false, error }）。
// root 由 bridge 层从项目状态传入，本层无状态。

export type { CodebaseInfo, CreateCodebaseOptions, CodebaseResult, SearchHit }

function bad(error: string): { success: false; error: string } {
  return { success: false, error }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export async function listCodebases(root: string): Promise<CodebaseResult<{ codebases: CodebaseInfo[] }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  return codebaseCore.list(root)
}

export async function readCodebase(root: string, name: string): Promise<CodebaseResult<{ name: string; content: string }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(name)) return bad('代码库名称不能为空')
  return codebaseCore.read(root, name)
}

export async function createCodebase(root: string, name: string, opts: CreateCodebaseOptions): Promise<CodebaseResult<{ name: string }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(name)) return bad('代码库名称不能为空')
  if (!opts || typeof opts !== 'object') return bad('创建参数无效')
  if (!['url', 'blank', 'local'].includes(opts.type)) return bad(`未知的创建方式: ${opts.type}`)
  if (opts.type === 'url' && !isNonEmptyString(opts.url)) return bad('URL 添加方式必须提供仓库地址')
  if (opts.type === 'local' && !isNonEmptyString(opts.sourcePath)) return bad('本地添加方式必须提供源目录路径')
  if (opts.description != null && typeof opts.description !== 'string') return bad('描述必须是字符串')
  if (opts.content != null && typeof opts.content !== 'string') return bad('README 内容必须是字符串')
  return codebaseCore.create(root, name, opts)
}

export async function updateCodebase(root: string, name: string, content: string): Promise<CodebaseResult<{ name: string }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(name)) return bad('代码库名称不能为空')
  if (typeof content !== 'string') return bad('README 内容必须是字符串')
  return codebaseCore.update(root, name, content)
}

export async function deleteCodebase(root: string, name: string): Promise<CodebaseResult<{ name: string }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(name)) return bad('代码库名称不能为空')
  return codebaseCore.del(root, name)
}

export async function searchCodebases(root: string, keyword: string, opts?: { top?: number; context?: number }): Promise<CodebaseResult<{ results: Array<{ name: string; matches: SearchHit[] }> }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(keyword)) return bad('检索关键词不能为空')
  if (opts != null) {
    if (typeof opts !== 'object') return bad('检索选项无效')
    if (opts.top != null && (typeof opts.top !== 'number' || opts.top < 1)) return bad('top 必须是正整数')
    if (opts.context != null && (typeof opts.context !== 'number' || opts.context < 0)) return bad('context 必须是非负整数')
  }
  return codebaseCore.search(root, keyword, opts)
}

import * as harnessCore from '../../core/harness'
import type { HarnessWorktree, HarnessSessionSummary, HarnessCommand, HarnessEventPayload, HarnessResult, HarnessDirEntry, HarnessGitFileEntry, HarnessSessionInfoEntry, HarnessRepoGroup } from '../../core/harness'

// Harness 会话桌面端适配层：被渲染进程经 src/stores/harnessStore.ts 内嵌 loadDesktopModule 直接 require（nodeIntegration）。
// 入口职责：参数形状校验拦截（类型/必填/枚举），拦截失败返回 { success: false }，不抛异常
// 出口职责：透传 core 统一契约（{ success: true, ...data } | { success: false, error }）。
// root 由 store 层从项目状态传入，本层无状态（子进程句柄/事件流状态内聚在 core 模块单例）。
// CLI 端无 harness 命令面，core 当前仅此一个消费方。

export type { HarnessWorktree, HarnessSessionSummary, HarnessCommand, HarnessEventPayload, HarnessResult, HarnessDirEntry, HarnessGitFileEntry, HarnessSessionInfoEntry, HarnessRepoGroup }

function bad(error: string): { success: false; error: string } {
  return { success: false, error }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// 退出清理：不留 pi 孤儿进程（SIGTERM 主动清理；renderer 卸载后 SIGKILL 定时器不再执行，
// 兜底为子进程 stdin EOF 自退——迁移前主进程 will-quit 路径的等价替代）
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    void harnessCore.stopAllSessions()
  })
}

export async function detectAgent(): Promise<HarnessResult<{ path: string | null; version: string | null; available: boolean }>> {
  return harnessCore.detectAgent()
}

export async function listWorktrees(root: string): Promise<HarnessResult<{ worktrees: HarnessWorktree[] }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  return harnessCore.listWorktrees(root)
}

// 仓库维度视图（主仓库 + .codebases/ 登记仓库各自铺开全部 worktree）
export async function listRepoWorktrees(root: string): Promise<HarnessResult<{ repos: HarnessRepoGroup[] }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  return harnessCore.listRepoWorktrees(root)
}

export async function listBranches(root: string): Promise<HarnessResult<{ branches: string[]; current: string | null }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  return harnessCore.listBranches(root)
}

export async function createWorktree(root: string, name: string, branch?: string, baseBranch?: string): Promise<HarnessResult<{ path: string; branch: string }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(name)) return bad('工作区名称不能为空')
  if (branch != null && typeof branch !== 'string') return bad('分支名称必须是字符串')
  if (baseBranch != null && typeof baseBranch !== 'string') return bad('来源分支必须是字符串')
  return harnessCore.createWorktree(root, name, branch, baseBranch)
}

export async function listSessions(worktreePath: string): Promise<HarnessResult<{ sessions: HarnessSessionSummary[] }>> {
  if (!isNonEmptyString(worktreePath)) return bad('worktree 路径无效')
  return harnessCore.listSessions(worktreePath)
}

export async function startSession(worktreePath: string): Promise<HarnessResult<{ sessionId: string }>> {
  if (!isNonEmptyString(worktreePath)) return bad('worktree 路径无效')
  return harnessCore.startSession(worktreePath)
}

export async function openSession(sessionFile: string): Promise<HarnessResult<{ sessionId: string }>> {
  if (!isNonEmptyString(sessionFile)) return bad('会话文件路径无效')
  return harnessCore.openSession(sessionFile)
}

export async function sendCommand(sessionId: string, command: HarnessCommand): Promise<HarnessResult<Record<string, unknown>>> {
  if (!isNonEmptyString(sessionId)) return bad('会话 id 无效')
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') return bad('无效命令：需要含 type 字段的对象')
  return harnessCore.sendCommand(sessionId, command)
}

export async function stopSession(sessionId: string): Promise<HarnessResult<{ wasRunning: boolean }>> {
  if (!isNonEmptyString(sessionId)) return bad('会话 id 无效')
  return harnessCore.stopSession(sessionId)
}

export async function stopAllSessions(): Promise<HarnessResult<{ stopped: number }>> {
  return harnessCore.stopAllSessions()
}

export async function deleteSessionFile(sessionFile: string): Promise<HarnessResult<Record<string, unknown>>> {
  if (!isNonEmptyString(sessionFile)) return bad('会话文件路径无效')
  return harnessCore.deleteSessionFile(sessionFile)
}

export async function getSessionInfo(sessionId: string): Promise<HarnessResult<{ sessionId: string; worktreePath: string; sessionFile: string | null; exited: boolean; pid: number }>> {
  if (!isNonEmptyString(sessionId)) return bad('会话 id 无效')
  return harnessCore.getSessionInfo(sessionId)
}

export async function listActiveSessions(): Promise<HarnessResult<{ sessions: HarnessSessionInfoEntry[] }>> {
  return harnessCore.listActiveSessions()
}

export async function readSessionFile(sessionId: string, relativePath: string): Promise<HarnessResult<{ content: string; path: string }>> {
  if (!isNonEmptyString(sessionId)) return bad('会话 id 无效')
  if (typeof relativePath !== 'string') return bad('文件路径必须是字符串')
  return harnessCore.readSessionFile(sessionId, relativePath)
}

export async function listSessionDir(sessionId: string, relativePath: string): Promise<HarnessResult<{ entries: HarnessDirEntry[]; path: string }>> {
  if (!isNonEmptyString(sessionId)) return bad('会话 id 无效')
  if (typeof relativePath !== 'string') return bad('目录路径必须是字符串')
  return harnessCore.listSessionDir(sessionId, relativePath)
}

// Git 变更概览（仓库参数化：来源分支 vs 基线分支；工作区变更绑仓库真实 HEAD）
export async function gitRepoStatus(repoPath: string, sourceBranch: string, baseBranch: string): Promise<HarnessResult<{
  base: string
  current: string | null
  ahead: number
  behind: number
  commits: string[]
  branchFiles: HarnessGitFileEntry[]
  worktreeFiles: HarnessGitFileEntry[]
}>> {
  if (!isNonEmptyString(repoPath)) return bad('仓库路径无效')
  if (typeof sourceBranch !== 'string') return bad('来源分支必须是字符串')
  if (typeof baseBranch !== 'string') return bad('基线分支必须是字符串')
  return harnessCore.gitRepoStatus(repoPath, sourceBranch, baseBranch)
}

// 单文件 diff（仓库参数化：分支变更 base...source / 工作区变更 HEAD + 未跟踪）
export async function gitRepoDiffFile(repoPath: string, relativePath: string, source: 'branch' | 'worktree', baseBranch: string, sourceBranch: string): Promise<HarnessResult<{ diff: string; path: string }>> {
  if (!isNonEmptyString(repoPath)) return bad('仓库路径无效')
  if (typeof relativePath !== 'string') return bad('文件路径必须是字符串')
  if (source !== 'branch' && source !== 'worktree') return bad(`未知的 diff 来源: ${String(source)}`)
  if (typeof baseBranch !== 'string') return bad('基线分支必须是字符串')
  if (typeof sourceBranch !== 'string') return bad('来源分支必须是字符串')
  return harnessCore.gitRepoDiffFile(repoPath, relativePath, source, baseBranch, sourceBranch)
}

// 会话事件流订阅（core EventEmitter → store 回调；返回取消订阅函数）
export function onHarnessEvent(callback: (payload: HarnessEventPayload) => void): () => void {
  return harnessCore.onHarnessEvent(callback)
}

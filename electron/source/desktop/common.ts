// 桌面端适配层的各种公共操作：各 domain 注册模块共享的上下文契约（当前项目根等）。
// source/desktop/{domain}.ts 共用这一层；由 launch.cjs 构造 ctx 并传入各域的 register 函数，
// 网页端 stub 环境经 registry.cjs → launch.cjs 间接加载同一份契约。

import type { BrowserWindow } from 'electron'
import type { AgentToolFactory } from '../../core/common'

export interface DesktopCtx {
  /** 当前项目根目录（set-project-path 可随时切换项目；未设置时为开发默认目录） */
  getProjectRoot(): string

  /** 当前项目根的原始值（未设置时为 null，无开发默认兑底）。
  * 仅为复刻旧内联 handler 的「未设置项目返回错误」契约（如 knowledge graph-config）而设；
  * 已有域（task/resource/agent/skill）不感知，可不提供 */
  getRawProjectPath?(): string | null

  /** 主进程 → 渲染进程推送通道（事件订阅类 channel 的增量推送，如 instance-detail-delta）。
  * 仅为 workflow 域实例 watcher 推送而设；真实 Electron 下即 mainWindow.webContents.send，
  * stub（网页端）环境下由 pushEmitter 承接并经 http.cjs 转 SSE；未提供时推送 no-op。
  * 实现须带 isDestroyed 守卫（复刻原 agent-loop-event 推送守卫）。 */
  sendToRenderer?(channel: string, payload: any): void

  /** 设置项目路径（主进程状态桥：currentProjectPath 更新 + webServerHost 同步 + cli-root 写盘 + 数据迁移）。
  * 仅为 app 域 set-project-path / init-project-dir 迁移而设；
  * 主进程状态与 CJS require（webServerHost）留 launch.cjs，core 只承接纯 fs 副作用 */
  setProjectPath?(projectPath: string): void

  /** 主窗口引用（open-folder-dialog 的 dialog 父窗口；与迁移前内联一致可为 null） */
  getWindow?(): BrowserWindow | null

  /** 自研 agentic 工具工厂（tools/*.cjs 为 CJS 文件不参与 tsc 编译，由 launch.cjs require 后注入）。
  * 仅为 agentic 域 execute-agentic-tool / run-agent-loop 迁移而设 */
  getAgentTools?(): Promise<AgentToolFactory>
}

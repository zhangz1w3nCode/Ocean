// 桌面端适配层的各种公共操作：各 domain 注册模块共享的上下文契约（当前项目根等）。
// source/desktop/{domain}.ts 共用这一层；由 launch.cjs 构造 ctx 并传入各域的 register 函数，
// 网页端 stub 环境经 registry.cjs → launch.cjs 间接加载同一份契约。

export interface DesktopCtx {
  /** 当前项目根目录（set-project-path 可随时切换项目；未设置时为开发默认目录） */
  getProjectRoot(): string

  /** 当前项目根的原始值（未设置时为 null，无开发默认兑底）。
  * 仅为复刻旧内联 handler 的「未设置项目返回错误」契约（如 knowledge graph-config）而设；
  * 已有域（task/resource/agent/skill）不感知，可不提供 */
  getRawProjectPath?(): string | null
}

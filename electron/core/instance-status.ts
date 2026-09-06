// ---------------------------------------------------------------------------
// 实例整体状态（三态）—— 与引擎节点推进状态（Status 五态）解耦
//
// 规范实现。`electron/launch.cjs` 因是手写 CJS 且 `electron/dist` 被 gitignore
// 无法复用本文件，保留一份等价镜像，两侧真值表由 `instance-status.test.ts` 锁定。
// ---------------------------------------------------------------------------

/**
 * 实例作为一个整体的生命周期状态，只有三档：
 * - pending   待执行：实例已创建，尚未开始跑任何节点
 * - running   执行中：已跑过或正在跑节点，尚未到达终态
 * - completed 已完成：引擎进入终态（正常走完 end 节点，或超限中止）
 */
export type InstanceStatus = 'pending' | 'running' | 'completed'

/** 实例列表状态过滤项的唯一来源，顺序即展示顺序 */
export const INSTANCE_STATUSES: readonly InstanceStatus[] = ['pending', 'running', 'completed']

export interface InstanceStatusInput {
  /** process.md frontmatter 里 `status:` 的原始值；解析失败时传 'unknown' */
  engineStatus: string
  /** process.md frontmatter 里 `step:` 的值 */
  step: number
  /** 已交付产物的节点数（completed 列表长度） */
  completedCount: number
}

/**
 * 由引擎状态 + step + completed 派生实例整体状态。
 *
 * 关键：引擎的 `idle` 同时表示「实例从未开始」和「节点之间等待下一次 next」，
 * 因此不能直接用引擎状态当实例状态，必须联合 step / completed 判断是否已开始。
 */
export function deriveInstanceStatus({
  engineStatus,
  step,
  completedCount,
}: InstanceStatusInput): InstanceStatus {
  if (engineStatus === 'completed' || engineStatus === 'aborted') return 'completed'
  if (step > 0 || completedCount > 0) return 'running'
  return 'pending'
}

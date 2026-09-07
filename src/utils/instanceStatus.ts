// 实例「整体状态」的展示层投影。
//
// 主进程返回的实例对象里已经带了引擎的节点推进状态（`status` / detail 的 `wfStatus`）、
// `step` 与 `completedNodes`，三态完全可以在渲染层派生，不需要 core / electron 参与。
//
// 之所以不能直接把引擎态当实例态：引擎的 `idle` 同时表示「实例从未开始」和
// 「节点之间等待下一次 next」（complete/fail/choose 都会把状态打回 idle），
// 直接用会让实例状态跟着节点推进来回跳。因此必须联合 step / completed 判断是否已开始。

/** 实例作为一个整体的生命周期状态，只有三档 */
export type InstanceStatus = 'pending' | 'running' | 'completed'

/** 实例列表状态过滤项的唯一来源，顺序即展示顺序 */
export const INSTANCE_STATUSES: readonly InstanceStatus[] = ['pending', 'running', 'completed']

/** 主进程列表项 / 详情里可用于投影的原始字段 */
export interface InstanceStatusSource {
  /** 引擎节点推进状态原始值：idle | executing | awaitingchoice | awaiting_choice | completed | aborted；缺失按 unknown */
  engineStatus?: string
  step?: number
  completedNodes?: string[]
}

export function deriveInstanceStatus(source: InstanceStatusSource): InstanceStatus {
  const { engineStatus, step, completedNodes } = source
  // 引擎进入终态（正常走完 end 节点，或超限中止）即为已完成；终态优先于「是否开始过」
  if (engineStatus === 'completed' || engineStatus === 'aborted') return 'completed'
  // 跑过任何节点就是执行中——这一步把「节点间等待」的 idle 与「从未开始」的 idle 区分开
  if ((step ?? 0) > 0 || (completedNodes?.length ?? 0) > 0) return 'running'
  return 'pending'
}

/** 列表项：`WorkflowInstance` 的原始字段 */
export function instanceStatusOfInstance(inst: { status?: string; step?: number; completedNodes?: string[] }): InstanceStatus {
  return deriveInstanceStatus({ engineStatus: inst.status, step: inst.step, completedNodes: inst.completedNodes })
}

/** 详情：`read-instance-detail` / fs.watch delta 的原始字段 */
export function instanceStatusOfDetail(detail: { wfStatus?: string; wfStep?: number; completedNodes?: string[] }): InstanceStatus {
  return deriveInstanceStatus({ engineStatus: detail.wfStatus, step: detail.wfStep, completedNodes: detail.completedNodes })
}

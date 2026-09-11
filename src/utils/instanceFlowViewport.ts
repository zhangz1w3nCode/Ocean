// 执行进度图画布「视口意图」的判定逻辑。
//
// 画布有两种互斥的视口行为：
// - fit：把全部可见节点等比缩放 + 居中（默认行为）
// - follow：跟随模式，聚焦 + 放大到当前正在执行的节点
//
// 两者写的是同一个 viewport，若各跑一个 useEffect 会在同一次 commit 里争写、互相打回，
// 因此这里把「这次到底该做哪一个」抽成纯函数，由唯一的 FlowFitController 执行。
//
// fit 分支的谓词必须与 FlowFitController 引入时（40cdd5a / 9489e2f）的语义逐字等价，
// 否则就是改既有行为：isFirst / isResize / isNodeGrowth 三选一，且 isNodeGrowth 不看
// fitKey 本身，只看「effect 因依赖变化重跑 + 容器没变 + 用户没手动操作过」。

export type ViewportIntent =
  | { kind: 'follow'; animate: boolean }
  | { kind: 'fit'; animate: boolean }
  | { kind: 'none' }

export interface ViewportDecisionInput {
  /** 容器实测尺寸可用 */
  boxReady: boolean
  /** 全部节点都已测得尺寸（未测完时 bounds 不可用） */
  nodesMeasured: boolean
  /** 跟随模式开关 */
  followMode: boolean
  /** 跟随目标节点 id，null 表示当前没有正在执行的节点 */
  focusNodeId: string | null
  /** 跟随目标自身是否已测得尺寸（新节点首帧可能还没测完） */
  focusNodeMeasured: boolean
  /** 当前容器实测尺寸；跟随签名用的尺寸键由它派生，避免两份表达同一事实 */
  currentBox: { w: number; h: number }
  /** 上次成功跟随的签名，null 表示还没跟随过 */
  lastFollowKey: string | null
  /** 上次整图 fit 时的容器尺寸，null 表示还没 fit 过 */
  lastFitBox: { w: number; h: number } | null
  /** 用户是否手动拖动/缩放过失口 */
  userInteracted: boolean
}

export function followKeyOf(nodeId: string, box: { w: number; h: number }): string {
  return `${nodeId}|${box.w}x${box.h}`
}

/** 本次是否已对 viewport 做过任意一次写入（决定要不要动画，首次落位不飞入） */
function hasApplied(input: ViewportDecisionInput): boolean {
  return input.lastFitBox !== null || input.lastFollowKey !== null
}

export function resolveViewportIntent(input: ViewportDecisionInput): ViewportIntent {
  if (!input.boxReady || !input.nodesMeasured) return { kind: 'none' }

  if (input.followMode && input.focusNodeId) {
    if (!input.focusNodeMeasured) return { kind: 'none' }
    const key = followKeyOf(input.focusNodeId, input.currentBox)
    // 同目标同尺寸幂等：实时刷新会以极密的频率重跑 effect，不幂等就会反复重启过渡动画
    if (key === input.lastFollowKey) return { kind: 'none' }
    return { kind: 'follow', animate: hasApplied(input) }
  }

  // 跟随开着但没有目标（实例已终态 / currentName 为空）时回落到整图 fit
  const isFirst = input.lastFitBox === null
  const isResize =
    !!input.lastFitBox &&
    (input.lastFitBox.w !== input.currentBox.w || input.lastFitBox.h !== input.currentBox.h)
  const isNodeGrowth = !!input.lastFitBox && !isResize && !input.userInteracted
  if (!isFirst && !isResize && !isNodeGrowth) return { kind: 'none' }
  return { kind: 'fit', animate: !isFirst }
}

/** getNodesBounds 在节点未测量/空集合时会给出不可用矩形，写 viewport 前必须挡掉 */
export function isUsableRect(rect: { width: number; height: number }): boolean {
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false
  return rect.width > 0 && rect.height > 0
}

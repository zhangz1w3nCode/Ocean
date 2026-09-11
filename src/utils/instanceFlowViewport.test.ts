import { describe, expect, it } from 'vitest'

import {
  followKeyOf,
  isUsableRect,
  resolveViewportIntent,
  type ViewportDecisionInput,
} from './instanceFlowViewport'

const BOX = { w: 1000, h: 600 }

function input(over: Partial<ViewportDecisionInput> = {}): ViewportDecisionInput {
  return {
    boxReady: true,
    nodesMeasured: true,
    followMode: false,
    focusNodeId: 'n-current',
    focusNodeMeasured: true,
    lastFollowKey: null,
    lastFitBox: null,
    currentBox: BOX,
    userInteracted: false,
    ...over,
  }
}

describe('resolveViewportIntent — 就绪门槛', () => {
  it('容器尺寸不可用时什么都不做', () => {
    expect(resolveViewportIntent(input({ boxReady: false }))).toEqual({ kind: 'none' })
  })

  it('节点未全部测得尺寸时什么都不做（bounds 还算不出来）', () => {
    expect(resolveViewportIntent(input({ nodesMeasured: false }))).toEqual({ kind: 'none' })
  })

  it('跟随开着但目标节点自己还没测得尺寸时不做（等下一帧），且不得回落到整图 fit', () => {
    expect(resolveViewportIntent(input({ followMode: true, focusNodeMeasured: false })))
      .toEqual({ kind: 'none' })
  })
})

describe('resolveViewportIntent — 关闭跟随时的既有 fit 语义', () => {
  it('首次挂载（没 fit 过、没跟随过）做整图 fit 且不动画', () => {
    expect(resolveViewportIntent(input())).toEqual({ kind: 'fit', animate: false })
  })

  it('容器 resize 做整图 fit 且带动画', () => {
    expect(resolveViewportIntent(input({ lastFitBox: { w: 800, h: 500 } })))
      .toEqual({ kind: 'fit', animate: true })
  })

  it('节点增长（容器未变 + 用户没手动操作）做整图 fit', () => {
    expect(resolveViewportIntent(input({ lastFitBox: BOX })))
      .toEqual({ kind: 'fit', animate: true })
  })

  it('用户手动拖动/缩放过后不再自动复位', () => {
    expect(resolveViewportIntent(input({ lastFitBox: BOX, userInteracted: true })))
      .toEqual({ kind: 'none' })
  })

  it('用户手动操作过但容器又 resize 了，仍要重新 fit', () => {
    expect(resolveViewportIntent(input({ lastFitBox: BOX, userInteracted: true, currentBox: { w: 900, h: 600 } })))
      .toEqual({ kind: 'fit', animate: true })
  })
})

describe('resolveViewportIntent — 开启跟随模式', () => {
  it('优先跟随，压掉整图 fit', () => {
    expect(resolveViewportIntent(input({ followMode: true, lastFitBox: BOX })))
      .toEqual({ kind: 'follow', animate: true })
  })

  it('画布刚落位就直接开跟随（跟随是第一次写入）时不做飞入动画', () => {
    expect(resolveViewportIntent(input({ followMode: true })))
      .toEqual({ kind: 'follow', animate: false })
  })

  it('同一目标重复触发是幂等的，不再重启动画', () => {
    const lastFollowKey = followKeyOf('n-current', BOX)
    expect(resolveViewportIntent(input({ followMode: true, lastFitBox: BOX, lastFollowKey })))
      .toEqual({ kind: 'none' })
  })

  it('当前节点推进到新 id 后重新聚焦', () => {
    expect(resolveViewportIntent(input({
      followMode: true,
      focusNodeId: 'n-next',
      lastFitBox: BOX,
      lastFollowKey: followKeyOf('n-current', BOX),
    }))).toEqual({ kind: 'follow', animate: true })
  })

  it('容器 resize 后对同一节点重新聚焦（保持居中，而不是退回整图）', () => {
    expect(resolveViewportIntent(input({
      followMode: true,
      currentBox: { w: 900, h: 600 },
      lastFitBox: BOX,
      lastFollowKey: followKeyOf('n-current', BOX),
    }))).toEqual({ kind: 'follow', animate: true })
  })

  it('跟随态下用户手动拖过仍继续跟随（开关是唯一控制权）', () => {
    expect(resolveViewportIntent(input({ followMode: true, lastFitBox: BOX, userInteracted: true })))
      .toEqual({ kind: 'follow', animate: true })
  })

  it('无跟随目标（实例终态 / currentName 为空）时回落到整图 fit', () => {
    expect(resolveViewportIntent(input({ followMode: true, focusNodeId: null, lastFitBox: BOX })))
      .toEqual({ kind: 'fit', animate: true })
  })

  it('关闭跟随后回到整图 fit，不被上一次的跟随签名挡住', () => {
    expect(resolveViewportIntent(input({
      followMode: false,
      lastFitBox: BOX,
      lastFollowKey: followKeyOf('n-current', BOX),
    }))).toEqual({ kind: 'fit', animate: true })
  })
})

describe('followKeyOf / isUsableRect', () => {
  it('签名把节点与容器尺寸一起编码，二者任一变化都会得到不同 key', () => {
    expect(followKeyOf('a', BOX)).not.toBe(followKeyOf('b', BOX))
    expect(followKeyOf('a', BOX)).not.toBe(followKeyOf('a', { w: 900, h: 600 }))
  })

  it('挡掉 NaN / 零尺寸 / 负尺寸的矩形', () => {
    expect(isUsableRect({ width: 200, height: 80 })).toBe(true)
    expect(isUsableRect({ width: NaN, height: 80 })).toBe(false)
    expect(isUsableRect({ width: 200, height: Infinity })).toBe(false)
    expect(isUsableRect({ width: 0, height: 80 })).toBe(false)
    expect(isUsableRect({ width: 200, height: -1 })).toBe(false)
  })
})

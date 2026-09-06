import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import { deriveInstanceStatus, INSTANCE_STATUSES } from './instance-status'

describe('实例整体状态三态', () => {
  it('状态域只有 pending / running / completed 三个值', () => {
    expect(INSTANCE_STATUSES).toEqual(['pending', 'running', 'completed'])
  })

  it('派生真值表', () => {
    const cases: Array<[string, number, number, string, string]> = [
      // [engineStatus, step, completedCount, 期望实例状态, 场景]
      ['idle', 0, 0, 'pending', 'create 后从未 next'],
      ['idle', 1, 0, 'running', '首个节点执行中被打回 idle'],
      ['idle', 2, 1, 'running', 'complete 后节点之间等待 next'],
      ['idle', 40, 39, 'running', 'current 已是结束节点但未触发 Completed'],
      ['executing', 1, 0, 'running', '业务节点执行中'],
      ['executing', 12, 11, 'running', '长流程执行中'],
      ['awaitingchoice', 3, 2, 'running', '决策节点等待 choose（frontmatter 形式）'],
      ['awaiting_choice', 3, 2, 'running', '决策节点等待 choose（CLI 输出形式）'],
      ['completed', 33, 32, 'completed', '走到 end 节点正常完成'],
      ['completed', 0, 0, 'completed', '终态优先于未开始判定'],
      ['aborted', 100, 99, 'completed', '超 max_steps 中止，终态归并'],
      ['aborted', 5, 4, 'completed', '超 max_retry / max_loop 中止，终态归并'],
      ['unknown', 0, 0, 'pending', 'process.md 缺失或解析失败'],
    ]
    for (const [engineStatus, step, completedCount, expected, scene] of cases) {
      expect(
        deriveInstanceStatus({ engineStatus, step, completedCount }),
        `${scene}: ${engineStatus}/step=${step}/completed=${completedCount}`,
      ).toBe(expected)
    }
  })

  it('实例状态不再随节点推进在待执行与执行中之间跳变', () => {
    // 引擎状态序列：create → next → complete → next → complete → next(end)
    const sequence = [
      { engineStatus: 'idle', step: 0, completedCount: 0 },
      { engineStatus: 'executing', step: 1, completedCount: 0 },
      { engineStatus: 'idle', step: 1, completedCount: 1 },
      { engineStatus: 'executing', step: 2, completedCount: 1 },
      { engineStatus: 'idle', step: 2, completedCount: 2 },
      { engineStatus: 'completed', step: 3, completedCount: 2 },
    ]
    expect(sequence.map((s) => deriveInstanceStatus(s))).toEqual([
      'pending',
      'running',
      'running',
      'running',
      'running',
      'completed',
    ])
  })
})

describe('launch.cjs 镜像实现与规范实现口径一致', () => {
  const fnSource = extractMirrorFn()

  it('能在 launch.cjs 中找到 deriveInstanceStatus 镜像', () => {
    expect(fnSource).not.toBeNull()
  })

  it('两侧真值表逐项一致', () => {
    if (!fnSource) throw new Error('launch.cjs 中未找到 deriveInstanceStatus 镜像，规范实现改动后必须同步主进程')
    const mirror = new Function(`return (${fnSource})`)() as (i: {
      engineStatus: string
      step: number
      completedCount: number
    }) => string

    const engineStatuses = ['idle', 'executing', 'awaitingchoice', 'awaiting_choice', 'completed', 'aborted', 'unknown', '']
    const steps = [0, 1, 40]
    const counts = [0, 1, 39]
    for (const engineStatus of engineStatuses) {
      for (const step of steps) {
        for (const completedCount of counts) {
          const input = { engineStatus, step, completedCount }
          expect(mirror(input), JSON.stringify(input)).toBe(deriveInstanceStatus(input))
        }
      }
    }
  })
})

/** 从 electron/launch.cjs 源码里抠出 deriveInstanceStatus 箭头函数体（launch.cjs require 了 electron，无法直接 import） */
function extractMirrorFn(): string | null {
  const src = fs.readFileSync(new URL('../launch.cjs', import.meta.url), 'utf-8')
  const marker = 'const deriveInstanceStatus = ('
  const start = src.indexOf(marker)
  if (start === -1) return null
  // 必须先定位 =>，否则会从参数解构的 { 开始配对，抠出半个函数导致语法错误
  const arrow = src.indexOf('=>', start)
  if (arrow === -1) return null
  const bodyStart = src.indexOf('{', arrow)
  if (bodyStart === -1) return null
  let depth = 0
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start + 'const '.length, i + 1)
    }
  }
  return null
}

import { describe, expect, it } from 'vitest'
import {
  deriveInstanceStatus,
  instanceStatusOfInstance,
  instanceStatusOfDetail,
  INSTANCE_STATUSES,
} from './instanceStatus'

describe('实例整体状态三态（展示层投影）', () => {
  it('状态域只有 pending / running / completed 三个值', () => {
    expect(INSTANCE_STATUSES).toEqual(['pending', 'running', 'completed'])
  })

  it('派生真值表', () => {
    const cases: Array<[string | undefined, number | undefined, string[] | undefined, string, string]> = [
      // [engineStatus, step, completedNodes, 期望, 场景]
      ['idle', 0, [], 'pending', '创建后从未 next'],
      ['idle', 0, undefined, 'pending', '创建后从未 next 且无 completed 字段'],
      ['idle', 1, [], 'running', '首个节点被打回 idle'],
      ['idle', 2, ['记忆召回'], 'running', '节点之间等待 next'],
      ['idle', 40, new Array(33).fill('n'), 'running', '当前已是结束节点但未触发 Completed'],
      ['executing', 1, [], 'running', '业务节点执行中'],
      ['awaitingchoice', 3, ['a', 'b'], 'running', '决策等待 choose（frontmatter 形式）'],
      ['awaiting_choice', 3, ['a', 'b'], 'running', '决策等待 choose（CLI 输出形式）'],
      ['completed', 33, ['a'], 'completed', '走完 end 节点'],
      ['completed', 0, [], 'completed', '终态优先于未开始判定'],
      ['aborted', 100, ['a'], 'completed', '超限中止归为终态'],
      ['unknown', undefined, undefined, 'pending', 'process.md 缺失或解析失败'],
      [undefined, undefined, undefined, 'pending', '字段全缺失'],
    ]
    for (const [engineStatus, step, completedNodes, expected, scene] of cases) {
      expect(
        deriveInstanceStatus({ engineStatus, step, completedNodes }),
        `${scene}: ${engineStatus}/step=${step}/completed=${completedNodes?.length}`,
      ).toBe(expected)
    }
  })

  it('实例状态不随节点推进在待执行与执行中之间回落', () => {
    // 引擎态序列：create → next → complete → next → complete → next(end)
    const sequence = [
      { engineStatus: 'idle', step: 0, completedNodes: [] },
      { engineStatus: 'executing', step: 1, completedNodes: [] },
      { engineStatus: 'idle', step: 1, completedNodes: ['A'] },
      { engineStatus: 'executing', step: 2, completedNodes: ['A'] },
      { engineStatus: 'idle', step: 2, completedNodes: ['A', 'B'] },
      { engineStatus: 'completed', step: 3, completedNodes: ['A', 'B'] },
    ]
    expect(sequence.map((s) => deriveInstanceStatus(s))).toEqual([
      'pending', 'running', 'running', 'running', 'running', 'completed',
    ])
  })

  it('列表项与详情两个适配器口径一致', () => {
    const inst = { status: 'idle', step: 40, completedNodes: ['a', 'b'] }
    const detail = { wfStatus: 'idle', wfStep: 40, completedNodes: ['a', 'b'] }
    expect(instanceStatusOfInstance(inst)).toBe('running')
    expect(instanceStatusOfDetail(detail)).toBe('running')
    expect(instanceStatusOfInstance({ status: 'aborted', step: 6, completedNodes: ['a'] })).toBe('completed')
    expect(instanceStatusOfDetail({ wfStatus: 'aborted', wfStep: 6, completedNodes: ['a'] })).toBe('completed')
  })
})

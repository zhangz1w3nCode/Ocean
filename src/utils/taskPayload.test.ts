import { describe, it, expect } from 'vitest'
import { buildContentSavePayload } from './taskPayload'

// 守护用例：任务内容保存必须回填全部字段（core updateTask 为全量覆写语义，漏字段即被清空）
describe('buildContentSavePayload', () => {
  const task = {
    name: '任务A',
    content: '旧内容',
    handler: '张三',
    relatedCodebases: ['Ocean'],
    tags: ['前端'],
    relatedTasks: ['任务B'],
    workflow: 'wf-a',
    workflowInstance: 'inst-1',
  }

  it('回填全部非内容字段，避免全量覆写时被清空', () => {
    const payload = buildContentSavePayload(task, '新内容')
    expect(payload).toEqual({
      name: '任务A',
      content: '新内容',
      handler: '张三',
      relatedCodebases: ['Ocean'],
      tags: ['前端'],
      relatedTasks: ['任务B'],
      workflow: 'wf-a',
      workflowInstance: 'inst-1',
    })
  })

  it('空值字段也显式带上（relatedTasks/绑定为空时同样回填为空）', () => {
    const payload = buildContentSavePayload(
      { ...task, handler: '', relatedCodebases: [], tags: [], relatedTasks: [], workflow: '', workflowInstance: '' },
      '内容',
    )
    expect(payload.relatedTasks).toEqual([])
    expect(payload.relatedCodebases).toEqual([])
    expect(payload.workflow).toBe('')
    expect(payload.workflowInstance).toBe('')
  })
})

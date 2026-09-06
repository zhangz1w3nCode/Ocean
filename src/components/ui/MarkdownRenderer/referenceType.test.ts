import { describe, expect, it } from 'vitest'
import { getReferenceType } from './WikiLink'

const WORKFLOW = { icon: '工作流', color: '#DC2626', bgColor: '#FEE2E2' }
const SKILL = { icon: '技能', color: '#7C3AED', bgColor: '#EDE9FE' }

describe('getReferenceType 纯名称引用', () => {
  it('已知工作流名称判定为工作流', () => {
    expect(getReferenceType('standard-task-pipeline', { workflowNames: ['standard-task-pipeline'] })).toEqual(WORKFLOW)
  })

  it('已知技能名称判定为技能', () => {
    expect(getReferenceType('ocean-cli', { skillNames: ['ocean-cli'] })).toEqual(SKILL)
  })

  it('同名同时命中技能与工作流时技能优先（保持既有行为）', () => {
    expect(getReferenceType('dup-name', { skillNames: ['dup-name'], workflowNames: ['dup-name'] })).toEqual(SKILL)
  })

  it('名称均未知时兜底为技能（保持 PR #26 行为）', () => {
    expect(getReferenceType('unknown-name', { skillNames: ['ocean-cli'], workflowNames: ['demo-wf'] })).toEqual(SKILL)
  })

  it('不传名称集合时纯名称仍判定为技能（向后兼容）', () => {
    expect(getReferenceType('standard-task-pipeline')).toEqual(SKILL)
  })

  it('反引号包裹的纯名称同样按已知名称判定', () => {
    expect(getReferenceType('`demo-wf`', { workflowNames: ['demo-wf'] })).toEqual(WORKFLOW)
  })

  it('带扩展名的纯名称不走纯名称分支', () => {
    expect(getReferenceType('notes.md', { workflowNames: ['notes'] })).not.toEqual(WORKFLOW)
  })
})

describe('getReferenceType 路径形态引用（不回归）', () => {
  it('.workflows/{name}/WORKFLOW.md 判定为工作流', () => {
    expect(getReferenceType('.workflows/example/WORKFLOW.md')).toEqual(WORKFLOW)
  })

  it('{资产根目录}/skills/{name}/SKILL.md 判定为技能', () => {
    expect(getReferenceType('.pi/skills/example/SKILL.md')).toEqual(SKILL)
  })
})

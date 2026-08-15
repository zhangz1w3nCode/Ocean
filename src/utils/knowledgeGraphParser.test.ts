import { describe, expect, it } from 'vitest'
import { parseKnowledgeLinks } from './knowledgeGraphParser'

describe('parseKnowledgeLinks', () => {
  it('识别项目根 .workflows 引用为工作流关系', () => {
    const [link] = parseKnowledgeLinks('请参考 `.workflows/example/WORKFLOW.md`。')

    expect(link).toMatchObject({
      targetName: '.workflows/example/WORKFLOW',
      relation: '引用工作流',
    })
  })
})

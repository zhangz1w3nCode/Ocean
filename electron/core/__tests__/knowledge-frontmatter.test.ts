import { describe, expect, it } from 'vitest'

// CJS 主进程模块用 require 引入（electron tsconfig types:node 提供 require 声明）
const {
  buildKnowledgeCard,
  parseKnowledgeCard,
  mergeUnionArrays,
  validateRelations,
  RELATION_VOCABULARY,
}: any = require('../knowledge-frontmatter.cjs')

describe('buildKnowledgeCard', () => {
  it('基本拼装：type/sources/relations/tags + body', () => {
    const md = buildKnowledgeCard({
      name: 'OpenAI',
      summary: 'AI 公司',
      tags: ['ai', 'llm'],
      type: 'entity',
      sources: [{ path: '.knowledges/.raw/report.pdf', anchor: '', kind: 'pdf' }],
      relations: [{ to: 'Transformer架构', rel: '依赖' }],
      domain: 'ai/entities',
      body: '# OpenAI\n\n正文 [[Transformer架构]]',
    })
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('status: pending')
    expect(md).toContain('type: entity')
    expect(md).toContain('name: OpenAI')
    expect(md).toContain('domain: ai/entities')
    expect(md).toContain('tags: [ai, llm]')
    expect(md).toContain('path: .knowledges/.raw/report.pdf')
    expect(md).toContain('kind: pdf')
    expect(md).toContain('rel: 依赖')
    expect(md.endsWith('# OpenAI\n\n正文 [[Transformer架构]]')).toBe(true)
  })

  it('status 恒为 pending：raw 里传 validated 也被强制覆盖', () => {
    const md = buildKnowledgeCard({
      name: 'x',
      type: 'concept',
      raw: { status: 'validated' },
      body: 'b',
    })
    expect(md).toContain('status: pending')
    expect(md).not.toContain('validated')
  })

  it('raw 未知字段保留，显式字段覆盖同名键', () => {
    const md = buildKnowledgeCard({
      name: 'new-name',
      raw: { custom: 'keep-me', summary: 'old', status: 'validated' },
      summary: 'new-summary',
      type: 'source',
      body: 'b',
    })
    expect(md).toContain('custom: keep-me')
    expect(md).toContain('summary: new-summary')
    expect(md).not.toContain('summary: old')
  })

  it('非法卡型抛错', () => {
    expect(() => buildKnowledgeCard({ name: 'x', type: 'contract', body: 'b' })).toThrow(/非法卡型/)
    expect(() => buildKnowledgeCard({ name: 'x', type: 'index', body: 'b' })).toThrow(/非法卡型/)
  })

  it('relations 非词表取值抛错', () => {
    expect(() =>
      buildKnowledgeCard({ name: 'x', type: 'entity', relations: [{ to: 'A', rel: '引用' }], body: 'b' }),
    ).toThrow(/封闭词表/)
    expect(() =>
      buildKnowledgeCard({ name: 'x', type: 'entity', relations: [{ rel: '依赖' }], body: 'b' }),
    ).toThrow(/to 缺失/)
  })

  it('summary 含冒号加引号（YAML 安全）', () => {
    const md = buildKnowledgeCard({ name: 'x', summary: 'a: b # c', type: 'concept', body: 'b' })
    const parsed = parseKnowledgeCard(md)
    expect(parsed.frontmatter.summary).toBe('a: b # c')
  })

  it('build → parse 往返：对象数组保真', () => {
    const sources = [
      { path: '.knowledges/.raw/a.pdf', anchor: '', kind: 'pdf' },
      { path: '.knowledges/.raw/b.md', anchor: 'ch2', kind: 'md' },
    ]
    const relations = [
      { to: 'X', rel: '佐证' },
      { to: 'Y', rel: '矛盾' },
    ]
    const md = buildKnowledgeCard({ name: 'x', type: 'synthesis', sources, relations, tags: ['t1'], body: 'body' })
    const parsed = parseKnowledgeCard(md)
    expect(parsed.frontmatter.sources).toEqual(sources)
    expect(parsed.frontmatter.relations).toEqual(relations)
    expect(parsed.frontmatter.tags).toEqual(['t1'])
    expect(parsed.frontmatter.type).toBe('synthesis')
  })
})

describe('validateRelations', () => {
  it('词表全部通过', () => {
    for (const rel of RELATION_VOCABULARY) {
      expect(validateRelations([{ to: 'a', rel }]).valid).toBe(true)
    }
  })
  it('空与非数组通过', () => {
    expect(validateRelations(undefined).valid).toBe(true)
    expect(validateRelations([]).valid).toBe(true)
  })
})

describe('mergeUnionArrays', () => {
  it('字符串数组并集去重（保留首现写法）', () => {
    expect(mergeUnionArrays(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('对象数组按内容等价去重（键序无关）', () => {
    const old = [{ path: 'x.pdf', anchor: '', kind: 'pdf' }]
    const neu = [{ kind: 'pdf', path: 'x.pdf', anchor: '' }, { path: 'y.md', anchor: '', kind: 'md' }]
    const merged = mergeUnionArrays(old, neu)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toEqual(old[0])
  })
  it('单边非数组原样返回另一边', () => {
    expect(mergeUnionArrays(undefined, [1, 2])).toEqual([1, 2])
    expect(mergeUnionArrays([1], undefined)).toEqual([1])
  })
})

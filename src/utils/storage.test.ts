import { describe, it, expect } from 'vitest'
import { generateKnowledgeMarkdown } from './storage'

describe('generateKnowledgeMarkdown', () => {
  // 解析 frontmatter 块，返回 frontmatter 字符串和 body
  const parse = (md: string) => {
    const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!m) throw new Error('invalid markdown')
    return { frontmatter: m[1], body: m[2] }
  }

  const getTagsLine = (md: string) => {
    return parse(md).frontmatter.split('\n').find(l => l.startsWith('tags:'))
  }

  describe('正常 tags → flow 格式', () => {
    it('多个 tags 输出为 flow [a, b] 而非多行 block', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'desc', tags: ['标签1', '标签2'] },
        '内容'
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain(']')
      expect(tagsLine).toContain('标签1')
      expect(tagsLine).toContain('标签2')
      expect(parse(md).frontmatter).not.toMatch(/tags:\s*\n\s*-\s/)
    })

    it('单个 tag 也输出为 flow 格式', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'desc', tags: ['only'] },
        '内容'
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain('only')
    })

    it('顶层字段（name/summary）保持 block（每行一个 key）', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'desc', tags: ['a'] },
        '内容'
      )
      const fm = parse(md).frontmatter
      const blockLines = fm.split('\n').filter(l => l.trim() && !l.startsWith(' '))
      expect(blockLines.length).toBeGreaterThanOrEqual(3)
      expect(fm).toContain('name: test')
      expect(fm).toContain('summary: desc')
    })

    it('body 内容正确拼接到 frontmatter 之后', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: ['a'] },
        '这是正文'
      )
      expect(md).toContain('---\n')
      expect(md).toContain('这是正文')
      expect(md.endsWith('这是正文')).toBe(true)
    })
  })

  describe('无 tags 场景', () => {
    it('tags 为空数组时不生成 tags 字段', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'desc', tags: [] },
        '内容'
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('tags:')
    })

    it('无 rawFrontmatter 且 tags 为空时 frontmatter 为 name/summary/status', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'desc', tags: [] },
        '内容'
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('name: test')
      expect(fm).toContain('summary: desc')
      expect(fm).toContain('status: pending')
      expect(fm.split('\n').filter(l => l.trim() && !l.startsWith(' ')).length).toBe(3)
    })
  })

  describe('status 语义', () => {
    it('未指定 status 且无 rawFrontmatter 时默认 pending', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: [] },
        '内容'
      )
      expect(parse(md).frontmatter).toContain('status: pending')
    })

    it('显式指定 status=validated 时以其为准', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: [], status: 'validated' },
        '内容',
        { status: 'pending' }
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('status: validated')
      expect(fm).not.toContain('status: pending')
    })

    it('未指定 status 但 rawFrontmatter 已有 status 时保留原值', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: [] },
        '内容',
        { status: 'validated' }
      )
      expect(parse(md).frontmatter).toContain('status: validated')
    })
  })

  describe('未知字段保留（rawFrontmatter 合并）', () => {
    it('保留 rawFrontmatter 中的 domain/status 等未知字段', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: ['a'] },
        '内容',
        { domain: 'ocean/sub', status: 'validated' }
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('domain: ocean/sub')
      expect(fm).toContain('status: validated')
      expect(fm).toContain('summary: d')
      expect(fm).toContain('name: test')
    })

    it('rawFrontmatter 含 tags（旧格式）且本次提供新 tags 时用新值覆盖', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: ['新标签'] },
        '内容',
        { tags: ['旧标签1', '旧标签2'] }
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('新标签')
      expect(tagsLine).not.toContain('旧标签1')
    })

    it('rawFrontmatter 含 tags 但本次 tags 为空时删除 tags 键', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: [] },
        '内容',
        { tags: ['旧标签'] }
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('tags:')
    })
  })

  describe('summary 边界', () => {
    it('summary 为空时删除 summary 键（rawFrontmatter 有 summary）', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: '', tags: ['a'] },
        '内容',
        { summary: '旧摘要' }
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('summary:')
    })

    it('历史 description 字段迁移为 summary 并删除 description', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: '新摘要', tags: ['a'] },
        '内容',
        { description: '旧描述' }
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('summary: 新摘要')
      expect(fm).not.toContain('description:')
    })
  })

  describe('旧 block 格式 → flow 转换', () => {
    it('rawFrontmatter 的 tags 即便是 block 格式，重新保存后转为 flow', () => {
      const rawFm = { name: 'old', tags: ['block1', 'block2'] }
      const md = generateKnowledgeMarkdown(
        { name: 'old', summary: 'd', tags: ['block1', 'block2'] },
        '内容',
        rawFm
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain('block1')
      expect(tagsLine).toContain('block2')
      expect(tagsLine).not.toContain('\n')
    })

    it('仅保留 rawFrontmatter tags 不提供新 tags 时仍为 flow', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', summary: 'd', tags: ['保留标签'] },
        '内容',
        { domain: 'ocean', tags: ['旧'] }
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain('保留标签')
      expect(tagsLine).not.toContain('旧')
    })
  })
})

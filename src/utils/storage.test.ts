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
        { name: 'test', description: 'desc', tags: ['标签1', '标签2'] },
        '内容'
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain(']')
      expect(tagsLine).toContain('标签1')
      expect(tagsLine).toContain('标签2')
      // 不应有多行 block 格式
      expect(parse(md).frontmatter).not.toMatch(/tags:\s*\n\s*-\s/)
    })

    it('单个 tag 也输出为 flow 格式', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'desc', tags: ['only'] },
        '内容'
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain('only')
    })

    it('顶层字段（name/description）保持 block（每行一个 key）', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'desc', tags: ['a'] },
        '内容'
      )
      const fm = parse(md).frontmatter
      const blockLines = fm.split('\n').filter(l => l.trim() && !l.startsWith(' '))
      // name, description, tags 至少 3 行顶层字段
      expect(blockLines.length).toBeGreaterThanOrEqual(3)
      expect(fm).toContain('name: test')
      expect(fm).toContain('description: desc')
    })

    it('body 内容正确拼接到 frontmatter 之后', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'd', tags: ['a'] },
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
        { name: 'test', description: 'desc', tags: [] },
        '内容'
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('tags:')
    })

    it('无 rawFrontmatter 且 tags 为空时 frontmatter 仅有 name/description', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'desc', tags: [] },
        '内容'
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('name: test')
      expect(fm).toContain('description: desc')
      expect(fm.split('\n').filter(l => l.trim() && !l.startsWith(' ')).length).toBe(2)
    })
  })

  describe('未知字段保留（rawFrontmatter 合并）', () => {
    it('保留 rawFrontmatter 中的 domain/status/summary 等未知字段', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'd', tags: ['a'] },
        '内容',
        { domain: 'ocean/sub', status: 'pending', summary: 's' }
      )
      const fm = parse(md).frontmatter
      expect(fm).toContain('domain: ocean/sub')
      expect(fm).toContain('status: pending')
      expect(fm).toContain('summary: s')
      expect(fm).toContain('name: test')
    })

    it('rawFrontmatter 含 tags（旧格式）且本次提供新 tags 时用新值覆盖', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'd', tags: ['新标签'] },
        '内容',
        { tags: ['旧标签1', '旧标签2'] }
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('新标签')
      expect(tagsLine).not.toContain('旧标签1')
    })

    it('rawFrontmatter 含 tags 但本次 tags 为空时删除 tags 键', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'd', tags: [] },
        '内容',
        { tags: ['旧标签'] }
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('tags:')
    })
  })

  describe('旧 block 格式 → flow 转换', () => {
    it('rawFrontmatter 的 tags 即便是 block 格式，重新保存后转为 flow', () => {
      // 模拟旧文件 frontmatter 解析后传入 rawFrontmatter
      // parse 会将 block 格式 tags 解析为数组，所以 rawFrontmatter.tags 已是数组
      const rawFm = { name: 'old', tags: ['block1', 'block2'] }
      const md = generateKnowledgeMarkdown(
        { name: 'old', description: 'd', tags: ['block1', 'block2'] },
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
      // 如果 metadata.tags 为空但 rawFrontmatter 有 tags，tags 会被删除
      // 这里测试正常更新路径：metadata.tags 提供值
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'd', tags: ['保留标签'] },
        '内容',
        { domain: 'ocean', tags: ['旧'] }
      )
      const tagsLine = getTagsLine(md)
      expect(tagsLine).toContain('[')
      expect(tagsLine).toContain('保留标签')
      expect(tagsLine).not.toContain('旧')
    })
  })

  describe('description 边界', () => {
    it('description 为空时删除键（rawFrontmatter 有 description）', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: '', tags: ['a'] },
        '内容',
        { description: '旧描述' }
      )
      const fm = parse(md).frontmatter
      expect(fm).not.toContain('description:')
    })

    it('description 来自 summary 回退且未改动时不写入 description', () => {
      const md = generateKnowledgeMarkdown(
        { name: 'test', description: 'fallback', tags: ['a'] },
        '内容',
        { summary: 'fallback' }
      )
      const fm = parse(md).frontmatter
      // summary 存在但 description 不应被写入（cameFromSummaryFallback）
      expect(fm).not.toContain('description:')
      expect(fm).toContain('summary: fallback')
    })
  })
})

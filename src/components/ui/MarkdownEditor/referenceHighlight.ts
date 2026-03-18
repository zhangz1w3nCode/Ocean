import { StateField, RangeSetBuilder, type EditorState, type Transaction } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

// 引用块正则：`xxx/xxx.md` 或 `xxx/`（库引用）- 蓝色高亮
const REFERENCE_PATTERN = /`([^`\n]+(\.md|\/))`/g

// WikiLink 正则：[[`xxx.md`]] 或 [[`xxx.md`|关系]] - 黄色高亮
// 匹配格式: [[`path.md`]] 或 [[`path.md`|relation]]
const WIKI_LINK_PATTERN = /\[\[`([^`]+)`(\|[^\]]+)?\]\]/g

// 引用块高亮样式 - 蓝色（@ 引用）
const referenceMark = Decoration.mark({
  class: 'cm-reference-mark',
  attributes: {
    style: 'background-color: #DBEAFE; color: #1D4ED8; border-radius: 4px; padding: 1px 2px; cursor: pointer;'
  }
})

// 反引号样式（蓝色）
const backtickMark = Decoration.mark({
  class: 'cm-backtick',
  attributes: {
    style: 'color: #1D4ED8;'
  }
})

// WikiLink 整体高亮样式 - 黄色
const wikiLinkMark = Decoration.mark({
  class: 'cm-wikilink-mark',
  attributes: {
    style: 'background-color: #FEF3C7; color: #D97706; border-radius: 4px; padding: 1px 2px; cursor: pointer;'
  }
})

/**
 * 构建引用块和 WikiLink 高亮装饰器
 */
function buildDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>()
  const text = state.doc.toString()

  // 收集所有需要装饰的区域，避免重叠
  const decorations: Array<{ start: number; end: number; decoration: Decoration }> = []

  // 重置正则索引
  REFERENCE_PATTERN.lastIndex = 0
  WIKI_LINK_PATTERN.lastIndex = 0

  // 首先收集 WikiLink 区域（优先级更高）
  const wikiLinkRanges: Array<{ start: number; end: number }> = []
  let match

  while ((match = WIKI_LINK_PATTERN.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    wikiLinkRanges.push({ start, end })
    // 整个 WikiLink 块使用黄色高亮
    decorations.push({ start, end, decoration: wikiLinkMark })
  }

  // 然后收集普通引用块（排除 WikiLink 内部的）
  REFERENCE_PATTERN.lastIndex = 0
  while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length

    // 检查是否在 WikiLink 范围内
    const isInWikiLink = wikiLinkRanges.some(
      range => start >= range.start && end <= range.end
    )

    if (!isInWikiLink) {
      // 开始反引号
      decorations.push({ start, end: start + 1, decoration: backtickMark })
      // 路径部分（加背景色）
      decorations.push({ start: start + 1, end: end - 1, decoration: referenceMark })
      // 结束反引号
      decorations.push({ start: end - 1, end, decoration: backtickMark })
    }
  }

  // 按起始位置排序
  decorations.sort((a, b) => a.start - b.start)

  // 构建装饰器
  for (const dec of decorations) {
    builder.add(dec.start, dec.end, dec.decoration)
  }

  return builder.finish()
}

/**
 * 引用块和 WikiLink 高亮扩展
 */
export const referenceHighlightExtension = StateField.define<ReturnType<typeof buildDecorations>>({
  create(state: EditorState) {
    return buildDecorations(state)
  },
  update(value: ReturnType<typeof buildDecorations>, tr: Transaction) {
    if (tr.docChanged) {
      return buildDecorations(tr.state)
    }
    return value.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})

// 导出 WikiLink 正则供其他组件使用
export { WIKI_LINK_PATTERN }

export { referenceMark, backtickMark, wikiLinkMark }
import { eastAsianWidth } from 'get-east-asian-width'

// CLI 终端渲染内核：宽度来源 / 显宽测量 / 换行 / 框 / 表 / 树。
//
// 设计约束（与 pi-tui 的 utils 同构）：
// 1. 渲染函数全部接收 width 参数，只有 termWidth() 读终端；便于在固定宽度下做回归断言。
// 2. 显宽统一由 visibleWidth() 一把尺子计算：剥 ANSI → 按 grapheme 切 → 查 East Asian Width。
// 3. 换行必须处理三件事：CJK 逐字可断、超长 token 逐 grapheme 硬断、ANSI 状态跨行重放。
// 4. 边框一律细线单线（┌─┐│└┘├┤┬┴┼），不使用重线（━┃┏┓）。

// ---------------------------------------------------------------------------
// 宽度来源
// ---------------------------------------------------------------------------

const MIN_TERM_WIDTH = 20
const MAX_TERM_WIDTH = 120
const FALLBACK_TERM_WIDTH = 100
// 单行正文超过这个宽度就很难扫读了，即使终端更宽也不再拉长。
const MAX_CONTENT_WIDTH = 100
const TAB_WIDTH = 2

/**
 * 终端可用宽度。优先级：OCEAN_WIDTH（显式覆盖）→ COLUMNS → stdout.columns → 兜底。
 * 管道 / CI / spawn 环境下 stdout.columns 与 COLUMNS 都可能缺失，必须留兜底，
 * 否则会退化成某个硬编码宽度，进而在真实终端里溢出。
 */
function termWidth(): number {
  const override = Number(process.env.OCEAN_WIDTH) || 0
  const envColumns = Number(process.env.COLUMNS) || 0
  const ttyColumns = process.stdout.columns || 0
  // TTY 下 columns 是 ioctl 真值，优先于可能过期的 COLUMNS（tmux/docker/CI 常继承旧值）；
  // 管道下没有 columns，才退回 COLUMNS。
  const raw = override || (process.stdout.isTTY ? ttyColumns : 0) || envColumns || ttyColumns || FALLBACK_TERM_WIDTH
  return Math.max(MIN_TERM_WIDTH, Math.min(raw, MAX_TERM_WIDTH))
}

function colorEnabled(): boolean {
  return !process.env.NO_COLOR
}

// ---------------------------------------------------------------------------
// ANSI 处理
// ---------------------------------------------------------------------------

// 字符串型转义序列（OSC/DCS/APC/PM）的最大扫描长度：超限即认定非法，防止无终止符输入拖垮性能
const ANSI_STRING_SCAN_LIMIT = 512

interface AnsiCode {
  code: string
  length: number
}

/** 从 pos 处解析一个转义序列（CSI / OSC / APC / 两字节 ESC）。不是序列则返回 null。 */
function extractAnsiCode(s: string, pos: number): AnsiCode | null {
  if (s.charCodeAt(pos) !== 0x1b) return null
  const next = s[pos + 1]
  if (next === undefined) return null
  if (next === '[') {
    let i = pos + 2
    while (i < s.length && s[i] >= '0' && s[i] <= '?') i++
    while (i < s.length && s[i] >= ' ' && s[i] <= '/') i++
    if (i < s.length && s[i] >= '@' && s[i] <= '~') return { code: s.slice(pos, i + 1), length: i + 1 - pos }
    return null
  }
  if (next === ']' || next === '_' || next === '^' || next === 'P') {
    // 字符串型序列必须以 BEL 或 ST 收尾。若在扫描上限内找不到终止符，就判定「不是合法序列」
    // 并返回 null —— 否则一段永远不闭合的 OSC（损坏内容/二进制被当文本渲染）会让每次扫描
    // 都跑到串尾，调用方再只前进 1 个字符，整体退化成 O(n^2)。
    const end = Math.min(s.length, pos + 2 + ANSI_STRING_SCAN_LIMIT)
    let i = pos + 2
    while (i < end) {
      if (s.charCodeAt(i) === 0x07) return { code: s.slice(pos, i + 1), length: i + 1 - pos }
      if (s.charCodeAt(i) === 0x1b && s[i + 1] === '\\') return { code: s.slice(pos, i + 2), length: i + 2 - pos }
      if (s.charCodeAt(i) === 0x0a) return null
      i++
    }
    return null
  }
  return { code: s.slice(pos, pos + 2), length: 2 }
}

function stripAnsi(s: string): string {
  if (s.indexOf('\x1b') === -1) return s
  let out = ''
  let i = 0
  while (i < s.length) {
    const ansi = extractAnsiCode(s, i)
    if (ansi) {
      i += ansi.length
      continue
    }
    out += s[i]
    i++
  }
  return out
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>
}

const segmenterCtor = (
  Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter
  }
).Segmenter

const graphemeSegmenter: GraphemeSegmenter | undefined = segmenterCtor
  ? new segmenterCtor(undefined, { granularity: 'grapheme' })
  : undefined

function splitGraphemes(s: string): string[] {
  if (!s) return []
  if (!graphemeSegmenter) return Array.from(s)
  const out: string[] = []
  for (const { segment } of graphemeSegmenter.segment(s)) out.push(segment)
  return out
}

// 整个 cluster 都不占位的字符（默认可忽略 / 控制符 / 格式符 / 组合符）。
// 注意不能包含 \p{Surrogate}：孤立代理项在内存里没有宽度，但 Node 写到 stdout 时会被
// 替换成 U+FFFD（占 1 列）；按 0 列算会让真实终端里的行宽少算，进而把边框顶破。
const ZERO_WIDTH_CLUSTER = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Nonspacing_Mark}\p{Enclosing_Mark}]+$/u
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const KEYCAP = /^[\d#*]\uFE0F?\u20E3$/u

function graphemeWidth(segment: string): number {
  if (segment === '\t') return TAB_WIDTH
  if (ZERO_WIDTH_CLUSTER.test(segment)) return 0
  const first = segment.codePointAt(0)
  if (first === undefined) return 0
  // 区域指示符（国旗）在终端里普遍按整簇 2 列渲染
  if (first >= 0x1f1e6 && first <= 0x1f1ff) return 2
  if (KEYCAP.test(segment)) return 2
  // 含 pictographic 的簇（emoji、ZWJ 家族、带 VS16 的符号）整体按 2 列
  if (PICTOGRAPHIC.test(segment)) return 2
  let width = eastAsianWidth(first, { ambiguousAsWide: false })
  if (segment.length > 1) {
    // 与基础字符组合在一起的全角/半角形式需要额外计入
    const rest = Array.from(segment).slice(1)
    for (const ch of rest) {
      const cp = ch.codePointAt(0)
      if (cp === undefined) continue
      if (cp >= 0xff00 && cp <= 0xffef) width += eastAsianWidth(cp, { ambiguousAsWide: false })
    }
  }
  return width
}

const widthCache = new Map<string, number>()
const WIDTH_CACHE_LIMIT = 4096

/** 字符串在终端里占的列数（ANSI 序列不计宽，全角/emoji 计 2）。 */
export function visibleWidth(s: string): number {
  if (!s) return 0
  const cached = widthCache.get(s)
  if (cached !== undefined) return cached
  let width = 0
  for (const segment of splitGraphemes(stripAnsi(s))) width += graphemeWidth(segment)
  if (widthCache.size >= WIDTH_CACHE_LIMIT) {
    const oldest = widthCache.keys().next().value
    if (oldest !== undefined) widthCache.delete(oldest)
  }
  widthCache.set(s, width)
  return width
}

// ---------------------------------------------------------------------------
// 换行
// ---------------------------------------------------------------------------

// CJK（汉字/假名/谚文/注音）逐字可断；拉丁词按空白断
const CJK = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u

// 中文避头尾：这些字符不能出现在行首
const NO_LINE_START = /^[，。、；：！？）〕］｝〉》」』】’”%‰℃…—～·]/
// 这些字符不能出现在行尾
const NO_LINE_END = /[（〔［｛〈《「『【‘“]$/

type TokenKind = 'word' | 'space' | 'cjk'

interface Token {
  text: string
  kind: TokenKind
}

type Piece = { ansi: string } | { text: string }

/** 把一行切成「ANSI 序列」与「可见文本」两类片段，保证转义序列不被 grapheme 切碎。 */
function splitAnsiPieces(line: string): Piece[] {
  const pieces: Piece[] = []
  let i = 0
  let buffer = ''
  const flushText = (): void => {
    if (buffer) {
      pieces.push({ text: buffer })
      buffer = ''
    }
  }
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i)
    if (ansi) {
      flushText()
      pieces.push({ ansi: ansi.code })
      i += ansi.length
      continue
    }
    buffer += line[i]
    i++
  }
  flushText()
  return pieces
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let current = ''
  let kind: TokenKind | null = null
  const flush = (): void => {
    if (current) {
      tokens.push({ text: current, kind: kind as TokenKind })
      current = ''
      kind = null
    }
  }
  for (const piece of splitAnsiPieces(line)) {
    if ('ansi' in piece) {
      // 转义序列跟随它后面那个 token，避免换行后颜色与内容分离
      current += piece.ansi
      continue
    }
    for (const grapheme of splitGraphemes(piece.text)) {
      const isSpace = /^\s$/.test(grapheme)
      if (isSpace) {
        if (kind !== 'space') flush()
        kind = 'space'
        current += grapheme
        continue
      }
      if (CJK.test(grapheme)) {
        flush()
        tokens.push({ text: grapheme, kind: 'cjk' })
        continue
      }
      if (kind !== 'word') {
        flush()
        kind = 'word'
      }
      current += grapheme
    }
  }
  flush()
  return tokens
}

/** 超长不可断 token：逐 grapheme 硬断，尽量不让 ANSI 序列被切断。 */
function breakToken(token: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  let currentWidth = 0
  for (const piece of splitAnsiPieces(token)) {
    if ('ansi' in piece) {
      current += piece.ansi
      continue
    }
    for (const grapheme of splitGraphemes(piece.text)) {
      const w = graphemeWidth(grapheme)
      if (currentWidth > 0 && currentWidth + w > width) {
        lines.push(current)
        current = ''
        currentWidth = 0
      }
      current += grapheme
      currentWidth += w
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/** 单行着色状态跟踪：行内未闭合的 SGR 需要在本行补 reset，并在下一行重放。 */
function sgrState(line: string): { active: string; ended: boolean } {
  let active: string[] = []
  let i = 0
  while (i < line.length) {
    const ansi = extractAnsiCode(line, i)
    if (!ansi) {
      i++
      continue
    }
    const code = ansi.code
    if (code.endsWith('m') && code.startsWith('\x1b[')) {
      const params = code.slice(2, -1)
      if (params === '' || params === '0' || /^0*(;0)*$/.test(params)) active = []
      else active.push(code)
    }
    i += ansi.length
  }
  return { active: active.join(''), ended: active.length > 0 }
}

function wrapOneLine(line: string, width: number): string[] {
  if (visibleWidth(line) <= width) return [line]
  const lines: string[] = []
  // 续行沿用原行的缩进：否则代码块/mermaid 这类带缩进的内容折行后，
  // 续行会顶格，看起来像是新的一行语句
  const indentMatch = /^[ \t]*/.exec(line)
  const indent = indentMatch ? indentMatch[0] : ''
  let current = ''
  let currentWidth = 0
  for (const token of tokenize(line)) {
    const tokenWidth = visibleWidth(token.text)
    if (token.kind === 'space') {
      if (currentWidth + tokenWidth > width) continue
      current += token.text
      currentWidth += tokenWidth
      continue
    }
    if (tokenWidth > width) {
      if (currentWidth > 0) {
        lines.push(current.trimEnd())
        current = ''
        currentWidth = 0
      }
      const broken = breakToken(token.text, width)
      for (let k = 0; k < broken.length - 1; k++) lines.push(broken[k])
      current = broken[broken.length - 1]
      currentWidth = visibleWidth(current)
      continue
    }
    if (currentWidth + tokenWidth > width) {
      lines.push(current.trimEnd())
      current = indent + token.text
      currentWidth = visibleWidth(current)
      continue
    }
    current += token.text
    currentWidth += tokenWidth
  }
  if (current.trim()) lines.push(current.trimEnd())
  // 缩进兜底：续行前缀 + 长 token 的组合仍可能略微超出上限，超了就退回硬断，保证不溢出
  const safe: string[] = []
  for (const segment of lines) {
    if (visibleWidth(segment) <= width) safe.push(segment)
    else safe.push(...breakToken(segment.trimStart(), width))
  }
  return safe.length ? safe : ['']
}

/** 中文避头尾：把行首标点上一行的末字挪下来，避免标点顶格。只作用于无 ANSI 的纯文本行。 */
function applyKinsoku(lines: string[], width: number): string[] {
  const out = lines.slice()
  for (let i = 1; i < out.length; i++) {
    if (out[i].indexOf('\x1b') !== -1 || out[i - 1].indexOf('\x1b') !== -1) continue
    let moved = splitGraphemes(out[i - 1])
    const head = splitGraphemes(out[i])
    // 只在上方行仍然装得下时才挪字，否则会把行顶出宽度上限
    const fits = (candidate: string[]): boolean => visibleWidth(candidate.join('')) <= width
    while (head.length > 0 && NO_LINE_START.test(head[0]) && moved.length > 1) {
      const candidate = [moved[moved.length - 1], ...head]
      if (!fits(candidate)) break
      moved = moved.slice(0, -1)
      head.unshift(candidate[0])
    }
    while (moved.length > 1 && NO_LINE_END.test(moved[moved.length - 1])) {
      const candidate = [moved[moved.length - 1], ...head]
      if (!fits(candidate)) break
      moved = moved.slice(0, -1)
      head.unshift(candidate[0])
    }
    out[i - 1] = moved.join('')
    out[i] = head.join('')
  }
  return out
}

/** 按显示列宽换行，ANSI 状态跨行保持，行尾 trimEnd。 */
export function wrapTextWithAnsi(text: string, width: number): string[] {
  if (!text) return ['']
  const limit = Math.max(1, width)
  const result: string[] = []
  let active = ''
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = active + rawLine
    const wrapped = wrapOneLine(line, limit)
    for (const w of wrapped) {
      // 软换行同样要重放上一段的活动 SGR，否则被切开的彩色文本只有首段有色
      const segment = active && !w.startsWith(active) ? active + w : w
      const state = sgrState(segment)
      result.push(state.ended ? segment + '\x1b[0m' : segment)
      active = state.active
    }
  }
  return applyKinsoku(result.length ? result : [''], limit)
}

/**
 * 纯文本块（无边框）：按宽度换行，保留每行原有缩进，续行沿用相同缩进。
 * 用于搜索结果这类自带排版、不适合套框的输出。
 */
export function wrapBlock(text: string, width: number = termWidth()): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line) {
      out.push('')
      continue
    }
    const indent = /^\s*/.exec(line)?.[0] ?? ''
    const body = line.slice(indent.length)
    const wrapped = wrapTextWithAnsi(body, Math.max(1, width - visibleWidth(indent)))
    out.push(indent + (wrapped[0] ?? ''))
    for (let i = 1; i < wrapped.length; i++) out.push(indent + wrapped[i])
  }
  return out
}

// ---------------------------------------------------------------------------
// 边框字符（细线单线）
// ---------------------------------------------------------------------------

const CH = {
  h: '\u2500', // ─
  v: '\u2502', // │
  tl: '\u250c', // ┌
  tr: '\u2510', // ┐
  bl: '\u2514', // └
  br: '\u2518', // ┘
  lt: '\u251c', // ├
  rt: '\u2524', // ┤
  tt: '\u252c', // ┬
  bt: '\u2534', // ┴
  cross: '\u253c', // ┼
} as const

function expandTabs(s: string): string {
  if (s.indexOf('\t') === -1) return s
  return s.replace(/\t/g, ' '.repeat(TAB_WIDTH))
}

// ---------------------------------------------------------------------------
// 框
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Markdown 排版（只影响内容框的观感，不解析语法树）
// ---------------------------------------------------------------------------

const HEADING_LINE = /^#{1,6}\s+(.*)$/
const TABLE_ROW_LINE = /^\s*\|.*\|\s*$/
const TABLE_SEP_LINE = /^\s*\|[\s:|-]+\|\s*$/
const FENCE_LINE = /^\s*```/

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const bodyOfCells = inner.endsWith('|') ? inner.slice(0, -1) : inner
  return bodyOfCells.split('|').map(cell => cell.trim())
}

/**
 * markdown 表格块直接交给表格渲染器输出（带边框与行分隔），
 * 与 CLI 其它表格保持同一种视觉，不再用「无边框对齐列」。
 */
function formatMarkdownTable(header: string[], body: string[][], budget: number): string[] {
  const columns = header.length
  if (body.length === 0) return ['（无数据）']

  // 列数过多时硬压成每列几个字符毫无可读性，改成逐条「字段: 值」纵向排列
  if (columns * 8 > budget) {
    const out: string[] = []
    for (let r = 0; r < body.length; r++) {
      if (r > 0) out.push('')
      for (let c = 0; c < columns; c++) {
        const value = body[r][c] ?? ''
        out.push(`${header[c] || `列${c + 1}`}: ${value}`.trimEnd())
      }
    }
    return out
  }
  return table(header, body, { width: budget }).split('\n')
}

/**
 * 轻量 markdown 排版：标题去掉 `#` 后加粗，表格转成对齐列，代码块原样保留，其余不变。
 * 目的是让内容框里不再出现 `| a | b |` 这种原始竖线，不追求完整的 markdown 渲染。
 */
export function renderMarkdown(text: string, width: number, tableBudget = width): string {
  const source = text.split(/\r\n|\r|\n/)
  const out: string[] = []
  let inFence = false
  let i = 0
  while (i < source.length) {
    const line = source[i]
    if (FENCE_LINE.test(line)) {
      inFence = !inFence
      out.push(line)
      i++
      continue
    }
    if (inFence) {
      out.push(line)
      i++
      continue
    }
    if (TABLE_ROW_LINE.test(line) && i + 1 < source.length && TABLE_SEP_LINE.test(source[i + 1])) {
      const header = splitTableRow(line)
      const columns = header.length
      // 某行单元格数多于列数，说明单元格里有未转义的 `|`（markdown 表格本身无法表达）。
      // 把多出来的片段合并回「合并后总长最大」的那一段——通常就是被 | 拆开的那句正文，
      // 这样既不会凭空多出空列头，也不会把数值挂到错误的列下。
      const normalizeRow = (cells: string[]): string[] => {
        let out = cells.slice()
        let surplus = out.length - columns
        while (surplus > 0) {
          let bestStart = 0
          let bestLen = -1
          for (let s = 0; s + surplus < out.length; s++) {
            const len = out.slice(s, s + surplus + 1).reduce((a, b) => a + b.length, 0)
            if (len > bestLen) {
              bestLen = len
              bestStart = s
            }
          }
          out = [
            ...out.slice(0, bestStart),
            out.slice(bestStart, bestStart + surplus + 1).join(' | '),
            ...out.slice(bestStart + surplus + 1),
          ]
          surplus = out.length - columns
        }
        while (out.length < columns) out.push('')
        return out
      }
      const body: string[][] = []
      let j = i + 2
      while (j < source.length && TABLE_ROW_LINE.test(source[j])) {
        body.push(normalizeRow(splitTableRow(source[j])))
        j++
      }
      out.push(...formatMarkdownTable(header, body, tableBudget))
      i = j
      continue
    }
    const heading = HEADING_LINE.exec(line)
    if (heading) {
      out.push(`\x1b[1m${heading[1]}\x1b[0m`)
      i++
      continue
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

/**
 * markdown 内容框：按 markdown 排版后套细线方框（供 out() 输出节点内容、任务内容等）。
 */
export function markdownBox(text: string, options: { width?: number } = {}): string {
  const term = options.width ?? termWidth()
  // 正文按可读性上限折行，表格块用满终端可用宽度（否则宽表会被压得莫名换行）
  const proseLimit = Math.max(1, Math.min(term, MAX_CONTENT_WIDTH) - 4)
  const tableLimit = Math.max(1, term - 4)
  return box(renderMarkdown(expandTabs(text), proseLimit, tableLimit), { width: term })
}

/**
 * 细线方框。宽度自适应：内容短则框窄（保持原观感），内容长则在终端宽度内换行。
 */
export function box(text: string, options: { width?: number } = {}): string {
  const term = options.width ?? termWidth()
  const inner = Math.max(1, term - 4)
  const lines = wrapTextWithAnsi(expandTabs(text), inner)
  let widest = 0
  for (const line of lines) widest = Math.max(widest, visibleWidth(line))
  // 兜底：上游若给出超过内宽的行（例如折叠 tab / 异常字符导致量宽与实际不符），
  // 这里再硬断一次，保证方框宽度恒等于 min(term, MAX_CONTENT_WIDTH)，绝不溢出终端
  if (widest > inner) {
    const reflowed: string[] = []
    for (const line of lines) {
      if (visibleWidth(line) <= inner) reflowed.push(line)
      else reflowed.push(...breakToken(line, inner))
    }
    lines.length = 0
    lines.push(...reflowed)
    widest = 0
    for (const line of lines) widest = Math.max(widest, visibleWidth(line))
  }
  const contentW = Math.max(widest, 1)
  const h = CH.h.repeat(contentW + 2)
  const out: string[] = [`${CH.tl}${h}${CH.tr}`]
  for (const line of lines) {
    const padding = ' '.repeat(contentW - visibleWidth(line))
    out.push(`${CH.v} ${line}${padding} ${CH.v}`)
  }
  out.push(`${CH.bl}${h}${CH.br}`)
  return out.join('\n')
}

/**
 * 无表头单列细线框，用于树形展示（保留缩进与 ├── └── 符号，行间无分隔线）。
 */
export function treeBox(lines: string[], options: { width?: number } = {}): string {
  const term = options.width ?? termWidth()
  const inner = Math.max(1, Math.min(term, MAX_CONTENT_WIDTH) - 4)
  const wrapped: string[] = []
  // 逐行 push 而不是 wrapped.push(...arr)：后者在行数很多时会超出调用栈上限
  for (const line of lines) {
    for (const piece of wrapTextWithAnsi(expandTabs(line), inner)) wrapped.push(piece)
  }
  let widest = 0
  for (const line of wrapped) widest = Math.max(widest, visibleWidth(line))
  const contentW = Math.max(widest, 1)
  const h = CH.h.repeat(contentW + 2)
  const out: string[] = [`${CH.tl}${h}${CH.tr}`]
  for (const line of wrapped) {
    const padding = ' '.repeat(contentW - visibleWidth(line))
    out.push(`${CH.v} ${line}${padding} ${CH.v}`)
  }
  out.push(`${CH.bl}${h}${CH.br}`)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// 表
// ---------------------------------------------------------------------------

export interface TableOptions {
  /** 表格最大总宽，默认终端宽度 */
  width?: number
  /** 表头颜色，默认 cyan */
  headColor?: 'cyan' | 'green'
  /** 各列对齐，默认 center */
  align?: ('left' | 'center' | 'right')[]
}

type Align = 'left' | 'center' | 'right'

function padCell(text: string, width: number, align: Align): string {
  const w = visibleWidth(text)
  const gap = Math.max(0, width - w)
  if (align === 'left') return text + ' '.repeat(gap)
  if (align === 'right') return ' '.repeat(gap) + text
  const left = Math.floor(gap / 2)
  return ' '.repeat(left) + text + ' '.repeat(gap - left)
}

/** 先上色再补空白，保证表头既能着色又不丢居中。 */
function padStyledCell(text: string, width: number, align: Align, style: (s: string) => string): string {
  const trimmed = text.trim()
  if (!trimmed) return ' '.repeat(width)
  const gap = Math.max(0, width - visibleWidth(trimmed))
  const left = align === 'left' ? 0 : align === 'right' ? gap : Math.floor(gap / 2)
  return ' '.repeat(left) + style(trimmed) + ' '.repeat(gap - left)
}

const MIN_COLUMN_WIDTH = 4
// 自然宽度不超过这个值的列视为「短列」（状态、-、标签这种），优先保留自然宽度，
// 压缩只发生在长文本列上，避免把「处理中」拆成两行。
const SHORT_COLUMN_WIDTH = 10
// 堆叠降级的阈值：平均每列不足这么多列时，多列表格会被压成竖排单字，堆叠更可读
const STACK_FALLBACK_MIN_COL = 8

/**
 * 列宽分配：短列固定为自然宽度；剩余预算在长列之间按自然宽度比例分配，
 * 低于下限（MIN_COLUMN_WIDTH）的列再被固定为下限、剩余列重新分配。
 */
function fitWidths(natural: number[], available: number, protect: boolean[] = []): number[] {
  const count = natural.length
  const naturalTotal = natural.reduce((a, b) => a + b, 0)
  if (naturalTotal <= available) return natural.slice()

  // 终端很窄时保不住 4 列下限，否则算出来的总宽会超过预算（边框又会溢出）
  const minColumn = Math.max(2, Math.min(MIN_COLUMN_WIDTH, Math.floor(available / count)))

  // 只有「固定短列 + 其余列保底」都装得下时，才优先保留短列的自然宽度
  const shortColumns = natural.map(w => w <= SHORT_COLUMN_WIDTH)
  const pinnedTotal = natural.reduce((a, w, i) => (shortColumns[i] ? a + w : a), 0)
  const freeCount = shortColumns.filter(v => !v).length
  const pinShort = pinnedTotal + freeCount * minColumn <= available
  // 不可断列（ID、时间戳这类没有空白也没有 CJK 的内容）整组放得下时全部按自然宽度固定，
  // 否则它们会被宽文本列按比例挤掉、把一个标识符切成好几行。
  const protectTotal = natural.reduce((a, w, i) => (protect[i] ? a + w : a), 0)
  const protectedCount = protect.filter(Boolean).length
  const canProtect = protectedCount > 0
    && protectTotal + (count - protectedCount) * minColumn <= available

  // 首列是行标识（任务名/实例 ID/字段名），它被切断时扫表成本最高：
  // 全部不可断列装不下时，至少把首列按自然宽度钉住，缺口让其它列去承担。
  // 仅当首列本身是「不可断标识符」（无空白无 CJK）时才钉住，避免长文本首列挤掉其它列
  const pinFirstColumn = count > 1
    && Boolean(protect[0])
    && natural[0] + (count - 1) * minColumn <= available

  const pinned = natural.map(
    (w, i) => (shortColumns[i] && pinShort) || (canProtect && protect[i]) || (i === 0 && pinFirstColumn),
  )

  const widths = natural.slice()
  for (let round = 0; round <= count; round++) {
    let fixedTotal = 0
    let freeNatural = 0
    let remaining = 0
    for (let i = 0; i < count; i++) {
      if (pinned[i]) fixedTotal += widths[i]
      else {
        freeNatural += natural[i]
        remaining++
      }
    }
    const freeSpace = Math.max(0, available - fixedTotal)
    let changed = false
    for (let i = 0; i < count; i++) {
      if (pinned[i]) continue
      const share = freeNatural > 0 ? (natural[i] / freeNatural) * freeSpace : freeSpace / Math.max(1, remaining)
      if (share < minColumn) {
        widths[i] = minColumn
        pinned[i] = true
        changed = true
      } else {
        widths[i] = Math.floor(share)
      }
    }
    if (!changed) break
  }

  // 取整误差：从最宽的列里逐步回收，直到落入预算
  let total = widths.reduce((a, b) => a + b, 0)
  let guard = 0
  while (total > available && guard++ < 2000) {
    let target = -1
    for (let i = 0; i < count; i++) {
      if (widths[i] <= minColumn) continue
      if (target === -1 || widths[i] > widths[target]) target = i
    }
    if (target === -1) break
    widths[target] -= 1
    total -= 1
  }

  // 把剩余预算按「缺口最小者优先」补回去，尽量减少被换行的列数
  let spare = available - total
  if (spare > 0) {
    const gaps = natural
      .map((w, i) => ({ i, gap: w - widths[i] }))
      .filter(entry => entry.gap > 0)
      .sort((a, b) => a.gap - b.gap)
    for (const { i, gap } of gaps) {
      if (spare <= 0) break
      const give = Math.min(gap, spare)
      widths[i] += give
      spare -= give
    }
  }
  return widths
}

function styleHead(text: string, color: 'cyan' | 'green'): string {
  if (!colorEnabled()) return text
  const prefix = color === 'green' ? '\x1b[32m' : '\x1b[36m'
  return `${prefix}\x1b[1m${text}\x1b[0m`
}

/**
 * 细线表格。列宽按内容自然宽度计算，总宽超过终端时收缩最宽的列并换行单元格，
 * 不会出现超宽行，也不会用省略号丢内容。
 */
export function table(headers: string[], rows: string[][], options: TableOptions = {}): string {
  const term = Math.min(options.width ?? termWidth(), MAX_TERM_WIDTH)
  const columnCount = Math.max(headers.length, ...rows.map(r => r.length), 1)
  const aligns: Align[] = Array.from({ length: columnCount }, (_, i) => options.align?.[i] ?? 'center')
  const headText = Array.from({ length: columnCount }, (_, i) => headers[i] ?? '')
  const bodyText = rows.map(row => Array.from({ length: columnCount }, (_, i) => expandTabs(row[i] ?? '')))

  // 固定开销：columnCount+1 条竖线 + 每列左右各一个空格
  const overhead = columnCount + 1 + columnCount * 2
  const available = Math.max(0, term - overhead)

  const natural = headText.map((h, i) =>
    Math.max(visibleWidth(h), ...bodyText.map(r => visibleWidth(r[i]))),
  )
  const naturalTotal = natural.reduce((a, b) => a + b, 0)
  const tooNarrow = available < columnCount * MIN_COLUMN_WIDTH

  // 窄屏降级：只有「自然宽度确实装不下」且「平均每列不足 8 列」时才改成「字段: 值」堆叠。
  // 只看平均列宽会误伤自然宽度很小的表（自然宽 25 的 6 列表在 60 列终端也能放得下）。
  if (tooNarrow || (bodyText.length > 0 && naturalTotal > available && available / columnCount < STACK_FALLBACK_MIN_COL)) {
    if (bodyText.length === 0) return box(headText.join('\n'), { width: term })
    return bodyText
      .map(record =>
        box(
          headText.map((h, i) => `${h}: ${record[i] ?? ''}`.trimEnd()).join('\n'),
          { width: term },
        ),
      )
      .join('\n')
  }

  // 只看数据单元格：含空白或 CJK 就认为该列可以就地换行，否则是不可断列（ID/时间戳这类标识符）。
  // 不能把表头算进来——表头基本都是中文，会把每一列都判成可断，保护逻辑就失效了。
  const breakable = natural.map((_, i) =>
    bodyText.length === 0
      || bodyText.some(row => /\s/.test(row[i] ?? '') || CJK.test(row[i] ?? '')),
  )
  const widths = fitWidths(natural, available, breakable.map(v => !v))

  const border = (left: string, mid: string, right: string): string =>
    left + widths.map(w => CH.h.repeat(w + 2)).join(mid) + right

  const renderRow = (cells: string[], headStyle?: (s: string) => string): string[] => {
    const wrapped = cells.map((cell, i) => wrapTextWithAnsi(cell, widths[i]))
    const height = Math.max(...wrapped.map(w => w.length), 1)
    // 被折行的单元格改用左对齐：多行文本居中后每行起点都不一样，读起来很散
    const rowAligns = aligns.map((align, i) => (wrapped[i].length > 1 ? 'left' : align))
    const lines: string[] = []
    for (let line = 0; line < height; line++) {
      const parts = wrapped.map((cellLines, i) => {
        const raw = cellLines[line] ?? ''
        return headStyle
          ? padStyledCell(raw, widths[i], rowAligns[i], headStyle)
          : padCell(raw, widths[i], rowAligns[i])
      })
      lines.push(`${CH.v} ${parts.join(` ${CH.v} `)} ${CH.v}`)
    }
    return lines
  }

  const out: string[] = []
  out.push(border(CH.tl, CH.tt, CH.tr))
  const headStyle = (s: string): string => styleHead(s, options.headColor ?? 'cyan')
  out.push(...renderRow(headText, headStyle))
  // 表头下方与每个数据行之间都画分隔线：多行记录时靠横线划分边界，避免两行挨在一起看不出分界
  for (let i = 0; i < bodyText.length; i++) {
    out.push(border(CH.lt, CH.cross, CH.rt))
    out.push(...renderRow(bodyText[i]))
  }
  out.push(border(CH.bl, CH.bt, CH.br))
  return out.join('\n')
}
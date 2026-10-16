/**
 * 知识源格式解析层（P2）：
 * - parseSourceBuffer(fileName, buffer)：md/txt 直读；pdf → pdf-parse 2.x（PDFParse/getText）；
 *   docx → mammoth(HTML) → turndown(Markdown)
 * - 缓存语义照抄 llm_wiki fs.rs read_cache/write_cache：
 *   .raw/.cache/<name>.txt（解析文本）+ <name>.parser（解析器版本标记）
 *   命中条件 = 标记匹配 && 缓存 mtime >= 源文件 mtime；版本升级整库失效；
 *   写入顺序：先删标记 → 写文本 → 写标记（崩溃只导致重建，不会拿到陈旧缓存）
 *   md/txt 不缓存（llm_wiki 语义：纯文本直读零成本）
 * 重依赖（pdf-parse/mammoth/turndown）惰性 require，不影响应用启动。
 */

const fs = require('node:fs')
const path = require('node:path')

// 解析器版本：解析逻辑变更（换库/换转换参数）时 bump，所有 .cache 失效整库重建
const PARSER_VERSION = 'ocean-source-parser-v1'

// 源文件大小上限（对齐 09-18 版 read-knowledge-raw-source 的 8MB 口径）
const SOURCE_SIZE_LIMIT = 8 * 1024 * 1024

const SOURCE_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx']

function sourceExt(fileName) {
  const i = String(fileName).lastIndexOf('.')
  return i > 0 ? String(fileName).slice(i).toLowerCase() : ''
}

function isParsableSource(fileName) {
  return SOURCE_EXTENSIONS.includes(sourceExt(fileName))
}

async function parsePdf(buffer) {
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    let text = result && typeof result.text === 'string' ? result.text : ''
    // pdf.js 对无文本层的页面会输出页码分隔符（如 "-- 1 of 1 --"）作为杂讯；
    // 剔除该模式与空白后为空，才能判为真正的无文本层（扫描件）。
    const stripped = text.replace(/-{2,}\s*\d+\s*of\s*\d+\s*-{2,}/g, '')
    if (!stripped.trim()) {
      throw new Error('PDF 无文本层（扫描件需先 OCR，或换用带文本层的 PDF）')
    }
    return text
  } finally {
    try { parser.destroy() } catch { /* 释放失败不影响结果 */ }
  }
}

async function parseDocx(buffer) {
  const mammoth = require('mammoth')
  const TurndownService = require('turndown')
  const { value: html } = await mammoth.convertToHtml({ buffer })
  const md = new TurndownService({ headingStyle: 'atx' }).turndown(html || '')
  return md
}

/**
 * 解析源文件字节流为文本。
 * 返回 { kind, content }；kind ∈ 'text' | 'pdf' | 'docx'。
 * 不支持/失败抛 Error（错误文案面向用户可执行）。
 */
async function parseSourceBuffer(fileName, buffer) {
  const ext = sourceExt(fileName)
  if (ext === '.md' || ext === '.txt') {
    return { kind: 'text', content: buffer.toString('utf-8') }
  }
  if (ext === '.pdf') {
    return { kind: 'pdf', content: await parsePdf(buffer) }
  }
  if (ext === '.docx') {
    return { kind: 'docx', content: await parseDocx(buffer) }
  }
  throw new Error(`不支持的源格式: ${ext || '(无扩展名)'}（支持 ${SOURCE_EXTENSIONS.join('/')}）`)
}

// ── 缓存层（仅二进制格式：pdf/docx） ─────────────────────────────

function cachePaths(cacheDir, fileName) {
  return {
    textPath: path.join(cacheDir, `${fileName}.txt`),
    markerPath: path.join(cacheDir, `${fileName}.parser`),
  }
}

function usesParseCache(fileName) {
  const ext = sourceExt(fileName)
  return ext === '.pdf' || ext === '.docx'
}

/**
 * 读取有效缓存；返回文本或 null。
 * 命中条件：parser 标记与当前版本一致，且缓存 mtime >= 源文件 mtime。
 */
function readCachedParse(cacheDir, fileName, sourceMtimeMs) {
  if (!usesParseCache(fileName)) return null
  const { textPath, markerPath } = cachePaths(cacheDir, fileName)
  try {
    const marker = fs.readFileSync(markerPath, 'utf-8').trim()
    if (marker !== PARSER_VERSION) return null
    const cacheStat = fs.statSync(textPath)
    if (cacheStat.mtimeMs < sourceMtimeMs) return null
    const content = fs.readFileSync(textPath, 'utf-8')
    return content || null
  } catch {
    return null
  }
}

/**
 * 写入解析缓存（文本 + 版本标记）。
 * 顺序：先删标记 → 写文本 → 写标记。
 */
function writeCachedParse(cacheDir, fileName, text) {
  if (!usesParseCache(fileName)) return
  const { textPath, markerPath } = cachePaths(cacheDir, fileName)
  fs.mkdirSync(cacheDir, { recursive: true })
  try { fs.unlinkSync(markerPath) } catch { /* 不存在即跳过 */ }
  fs.writeFileSync(textPath, text, 'utf-8')
  fs.writeFileSync(markerPath, PARSER_VERSION, 'utf-8')
}

module.exports = {
  PARSER_VERSION,
  SOURCE_EXTENSIONS,
  SOURCE_SIZE_LIMIT,
  isParsableSource,
  parseSourceBuffer,
  parsePdf,
  parseDocx,
  readCachedParse,
  writeCachedParse,
  usesParseCache,
}

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'

const {
  parseSourceBuffer,
  parsePdf,
  parseDocx,
  readCachedParse,
  writeCachedParse,
  isParsableSource,
  PARSER_VERSION,
}: any = require('../source-parser.cjs')

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-source-parser-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/**
 * 生成最小合法 PDF（精确 xref 偏移），文本内容为 text。
 */
function buildMinimalPdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // 占位：内容流，长度依赖 text，下面单独算
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const streamBody = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET\n`
  objects[3] = `<< /Length ${streamBody.length} >>\nstream\n${streamBody}endstream`

  const chunks: string[] = ['%PDF-1.4\n']
  const offsets: number[] = []
  let length = chunks[0].length
  objects.forEach((body, i) => {
    offsets.push(length)
    const obj = `${i + 1} 0 obj\n${body}\nendobj\n`
    chunks.push(obj)
    length += obj.length
  })
  const xrefPos = length
  const xrefEntries = ['0000000000 65535 f \n']
  for (const off of offsets) xrefEntries.push(`${String(off).padStart(10, '0')} 00000 n \n`)
  chunks.push(`xref\n0 ${objects.length + 1}\n${xrefEntries.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
  return Buffer.from(chunks.join(''), 'latin1')
}

/**
 * 用 python3 zipfile 生成最小 docx（macOS/Linux runner 均自带 python3）。
 */
function buildMinimalDocx(heading: string, paragraph: string): Buffer {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${heading}</w:t></w:r></w:p>
<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>
</w:body></w:document>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const py = `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    z.writestr('[Content_Types].xml', open(sys.argv[2]).read())
    z.writestr('_rels/.rels', open(sys.argv[3]).read())
    z.writestr('word/document.xml', open(sys.argv[4]).read())
`
  const zipPath = path.join(tmpDir, 'min.docx')
  const files = [docXml, contentTypes, rels].map((c, i) => {
    const p = path.join(tmpDir, `part${i}.xml`)
    fs.writeFileSync(p, c)
    return p
  })
  execFileSync('python3', ['-c', py, zipPath, files[1], files[2], files[0]])
  return fs.readFileSync(zipPath)
}

describe('parseSourceBuffer 分发', () => {
  it('md/txt 直读为 text', async () => {
    expect((await parseSourceBuffer('a.md', Buffer.from('# h\nbody'))).kind).toBe('text')
    expect((await parseSourceBuffer('a.txt', Buffer.from('plain'))).content).toBe('plain')
  })
  it('pdf 分发并提取文本', async () => {
    const r = await parseSourceBuffer('doc.pdf', buildMinimalPdf('HelloKnowledgeCompile'))
    expect(r.kind).toBe('pdf')
    expect(r.content).toContain('HelloKnowledgeCompile')
  })
  it('docx 分发并转 Markdown', async () => {
    const r = await parseSourceBuffer('doc.docx', buildMinimalDocx('HeadingTitle', 'ParagraphBody'))
    expect(r.kind).toBe('docx')
    expect(r.content).toContain('HeadingTitle')
    expect(r.content).toContain('ParagraphBody')
  })
  it('不支持格式抛错', async () => {
    await expect(parseSourceBuffer('a.doc', Buffer.from('x'))).rejects.toThrow(/不支持的源格式/)
    await expect(parseSourceBuffer('noext', Buffer.from('x'))).rejects.toThrow()
  })
})

describe('parsePdf', () => {
  it('无文本层的 PDF 抛可执行错误', async () => {
    // 只有 BT/ET 定位无 Tj 文本
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
      '<< /Length 18 >>\nstream\nBT /F1 12 Tf ET\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    const chunks = ['%PDF-1.4\n']
    const offsets: number[] = []
    let length = chunks[0].length
    objects.forEach((body, i) => {
      offsets.push(length)
      const obj = `${i + 1} 0 obj\n${body}\nendobj\n`
      chunks.push(obj)
      length += obj.length
    })
    const xrefPos = length
    const entries = ['0000000000 65535 f \n']
    for (const off of offsets) entries.push(`${String(off).padStart(10, '0')} 00000 n \n`)
    chunks.push(`xref\n0 6\n${entries.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
    await expect(parsePdf(Buffer.from(chunks.join(''), 'latin1'))).rejects.toThrow(/无文本层/)
  })
})

describe('解析缓存', () => {
  it('pdf/docx 命中缓存与失效（mtime / 版本标记）', () => {
    const cacheDir = path.join(tmpDir, '.cache')
    const fileName = 'doc.pdf'
    const now = Date.now()
    // 未写缓存 → null
    expect(readCachedParse(cacheDir, fileName, now)).toBeNull()
    // 写入后命中
    writeCachedParse(cacheDir, fileName, 'parsed text')
    expect(readCachedParse(cacheDir, fileName, now)).toBe('parsed text')
    // 源文件更新（mtime 更大）→ miss
    expect(readCachedParse(cacheDir, fileName, now + 10_000)).toBeNull()
    // 版本标记不匹配 → miss（模拟旧解析器缓存）
    writeCachedParse(cacheDir, fileName, 'v2 text')
    const marker = path.join(cacheDir, `${fileName}.parser`)
    fs.writeFileSync(marker, 'ocean-source-parser-v0', 'utf-8')
    expect(readCachedParse(cacheDir, fileName, now)).toBeNull()
    // md/txt 不使用缓存
    expect(readCachedParse(cacheDir, 'a.md', now)).toBeNull()
  })

  it('isParsableSource 白名单', () => {
    for (const n of ['a.md', 'a.txt', 'a.pdf', 'a.docx']) expect(isParsableSource(n)).toBe(true)
    for (const n of ['a.doc', 'a.epub', 'noext']) expect(isParsableSource(n)).toBe(false)
  })

  it('PARSER_VERSION 非空（版本升级即整库缓存失效的锚点）', () => {
    expect(typeof PARSER_VERSION).toBe('string')
    expect(PARSER_VERSION.length).toBeGreaterThan(0)
  })
})

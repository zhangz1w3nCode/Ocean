import Table from 'cli-table3'

// CLI 端公共基建：输出格式 / 错误语义 / 内容输入。
// 提取自 electron/bin/ocean.ts（保持行为一致，ocean.ts 经 import 复用），
// 供各域 CLI 适配层（source/cli/{domain}.ts）与 CLI 入口共享。

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

let helpJsonBuf: string[] | null = null

export function setHelpJsonCapture(buf: string[] | null): void {
  helpJsonBuf = buf
}

export function getHelpJsonCapture(): string[] | null {
  return helpJsonBuf
}

export function rawOut(s: string): void {
  process.stdout.write(s + '\n')
}

export function displayWidth(s: string): number {
  return [...s].reduce((w, c) => {
    const code = c.charCodeAt(0)
    if (code < 0x80) return w + 1
    if ((code >= 0x1100 && code <= 0x115F) ||
        (code >= 0x2E80 && code <= 0x303E) ||
        (code >= 0x3040 && code <= 0x33BF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0xA000 && code <= 0xA4CF) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFE30 && code <= 0xFE4F) ||
        (code >= 0xFF00 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6)) {
      return w + 2
    }
    return w + 1
  }, 0)
}

export function out(s: string): void {
  if (helpJsonBuf !== null) { helpJsonBuf.push(s); return }
  const maxBoxW = Math.min((process.stdout.columns || 120) - 4, 70)
  const wrapped: string[] = []
  for (const line of s.split('\n')) {
    if (displayWidth(line) <= maxBoxW) {
      wrapped.push(line)
    } else {
      let cur = ''
      let curW = 0
      for (const c of [...line]) {
        const cw = displayWidth(c)
        if (curW + cw > maxBoxW) {
          wrapped.push(cur)
          cur = c
          curW = cw
        } else {
          cur += c
          curW += cw
        }
      }
      if (cur) wrapped.push(cur)
    }
  }
  const widths = wrapped.map(l => displayWidth(l))
  const maxW = Math.max(...widths, 0)
  const h = '\u2501'.repeat(maxW + 2)
  rawOut('\u250f' + h + '\u2513')
  for (let i = 0; i < wrapped.length; i++) {
    const pad = ' '.repeat(maxW - widths[i])
    rawOut('\u2503 ' + wrapped[i] + pad + ' \u2503')
  }
  rawOut('\u2517' + h + '\u251b')
}

export const TABLE_CHARS = {
  'top': '\u2501', 'top-mid': '\u2533', 'top-left': '\u250f', 'top-right': '\u2513',
  'bottom': '\u2500', 'bottom-mid': '\u2534', 'bottom-left': '\u2514', 'bottom-right': '\u2518',
  'left': '\u2502', 'right': '\u2502', 'mid': '\u2501', 'mid-mid': '\u2547',
  'left-mid': '\u2521', 'right-mid': '\u2529', 'middle': '\u2502',
}

export function printDataTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    out('（无数据）')
    return
  }
  const table = new Table({
    head: headers.map(h => ({ content: '\x1b[1m' + h + '\x1b[0m', hAlign: 'center' as const })) as any[],
    style: { head: ['cyan'] },
    colAligns: headers.map(() => 'center' as const),
    chars: TABLE_CHARS,
  })
  for (const row of rows) {
    table.push(row)
  }
  const lines = table.toString().split('\n')
  let separatorSeen = false
  const filtered = lines.filter(line => {
    if (line.includes('\u2521')) {
      if (!separatorSeen) {
        separatorSeen = true
        return true
      }
      return false
    }
    return true
  })
  if (filtered.length > 2) {
    filtered[1] = filtered[1].replace(/\u2502/g, '\u2503')
  }
  rawOut(filtered.join('\n'))
}

export function printList(items: string[], header: string): void {
  printDataTable([header], items.map(item => [item]))
}

export function printJson(data: any): void {
  rawOut(JSON.stringify(data, null, 2))
}

export function printAction(action: string, fields: Record<string, string>): void {
  const keys = Object.keys(fields)
  const table = new Table({
    head: [{ content: '\x1b[1mAction\x1b[0m', hAlign: 'center' as const }, ...keys.map(k => ({ content: '\x1b[1m' + k + '\x1b[0m', hAlign: 'center' as const }))] as any[],
    style: { head: ['green'] },
    colAligns: ['center', ...keys.map(() => 'center' as const)],
    chars: {
      'top': '\u2501', 'top-mid': '\u2533', 'top-left': '\u250f', 'top-right': '\u2513',
      'bottom': '\u2500', 'bottom-mid': '\u2534', 'bottom-left': '\u2514', 'bottom-right': '\u2518',
      'left': '\u2502', 'right': '\u2502', 'mid': '\u2501', 'mid-mid': '\u2547',
      'left-mid': '\u2521', 'right-mid': '\u2529', 'middle': '\u2502',
    },
  })
  table.push([action, ...keys.map(k => fields[k])])
  const lines = table.toString().split('\n')
  let separatorSeen = false
  const filtered = lines.filter(line => {
    if (line.includes('\u2521')) {
      if (!separatorSeen) {
        separatorSeen = true
        return true
      }
      return false
    }
    return true
  })
  if (filtered.length > 2) {
    filtered[1] = filtered[1].replace(/\u2502/g, '\u2503')
  }
  rawOut(filtered.join('\n'))
}

export function readContent(flags: Record<string, string | boolean>): string {
  const content = typeof flags.content === 'string' ? flags.content : undefined
  const contentFile = typeof flags['content-file'] === 'string' ? flags['content-file'] : undefined
  if (contentFile) {
    try {
      return require('fs').readFileSync(contentFile, 'utf-8')
    } catch (e: any) {
      throw new Error(`读取内容文件失败 ${contentFile}: ${e.message}`)
    }
  }
  if (content != null) return content
  // read stdin
  return require('fs').readFileSync(0, 'utf-8')
}

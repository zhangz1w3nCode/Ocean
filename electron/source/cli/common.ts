import { markdownBox, table } from './ui'

// 显宽 / 换行 / 框 / 表 / 树统一在 ./ui.ts（剥 ANSI + grapheme + East Asian Width 一把尺子）。

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

/**
 * 通用文本输出：markdown 排版（标题加粗、表格转对齐列）+ 细线方框 + 自适应换行。
 * 宽度来自 ui.termWidth()（OCEAN_WIDTH → COLUMNS → stdout.columns → 兜底 100）。
 */
export function out(s: string): void {
  if (helpJsonBuf !== null) { helpJsonBuf.push(s); return }
  rawOut(markdownBox(s))
}

export function printDataTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    out('（无数据）')
    return
  }
  rawOut(table(headers, rows))
}

export function printList(items: string[], header: string): void {
  printDataTable([header], items.map(item => [item]))
}

export function printJson(data: any): void {
  rawOut(JSON.stringify(data, null, 2))
}

export function printAction(action: string, fields: Record<string, string>): void {
  const keys = Object.keys(fields)
  rawOut(table(['Action', ...keys], [[action, ...keys.map(k => fields[k])]], { headColor: 'green' }))
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

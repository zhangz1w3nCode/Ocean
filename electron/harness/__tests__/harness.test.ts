import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// 会话目录根须在 require 之前钉死到临时目录（模块加载时读取 env）
const tmp = mkdtempSync(join(tmpdir(), 'ocean-harness-'))
process.env.OCEAN_HARNESS_SESSIONS_ROOT = join(tmp, 'sessions-root')

const req = createRequire(import.meta.url)
const harness = req('../sessionManager.cjs')

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('splitJsonlBuffer（LF-only 分帧）', () => {
  it('按 LF 切分并跳过空行', () => {
    const [lines, rest] = harness.splitJsonlBuffer('{"a":1}\n\n{"b":2}\n')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('')
  })

  it('剥离行尾 CR（容忍 \\r\\n 输入）', () => {
    const [lines] = harness.splitJsonlBuffer('{"a":1}\r\n{"b":2}\r\n')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('U+2028/U+2029 不作为换行（JSON 字符串内合法，readline 会切坏）', () => {
    const payload = JSON.stringify({ text: 'line1\u2028line2\u2029end' })
    const [lines, rest] = harness.splitJsonlBuffer(payload + '\n{"next":1}\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).text).toBe('line1\u2028line2\u2029end')
    expect(rest).toBe('')
  })

  it('半行缓冲保留在 rest', () => {
    const [lines, rest] = harness.splitJsonlBuffer('{"a":1}\n{"par')
    expect(lines).toEqual(['{"a":1}'])
    expect(rest).toBe('{"par')
  })

  it('空输入返回空结果', () => {
    const [lines, rest] = harness.splitJsonlBuffer('')
    expect(lines).toEqual([])
    expect(rest).toBe('')
  })
})

describe('parseJsonlLine', () => {
  it('合法 JSON 返回对象', () => {
    expect(harness.parseJsonlLine('{"type":"response"}')).toEqual({ type: 'response' })
  })
  it('非法 JSON 返回 null', () => {
    expect(harness.parseJsonlLine('not json')).toBeNull()
    expect(harness.parseJsonlLine('')).toBeNull()
  })
})

describe('sanitizeCwdForSessionDir', () => {
  it('cwd 的 / 转写为 -，首尾补 -（非 hash）', () => {
    expect(harness.sanitizeCwdForSessionDir('/Users/x/dev/Ocean')).toBe('--Users-x-dev-Ocean--')
  })
  it('worktree 路径带点号保留', () => {
    expect(harness.sanitizeCwdForSessionDir('/a/b/.worktrees/w-1')).toBe('--a-b-.worktrees-w-1--')
  })
})

describe('parseWorktreeList（git worktree list --porcelain）', () => {
  const fixture = [
    'worktree /repo/main',
    'branch refs/heads/main',
    '',
    'worktree /repo/main/.worktrees/api-core-unification',
    'branch refs/heads/refactor/api-core-unification',
    '',
    'worktree /repo/main/.worktrees/issue42-baseline',
    'detached',
    '',
    'worktree /repo/main/.worktrees/harness-session',
    'branch refs/heads/feat/harness-session',
    'prunable',
    '',
  ].join('\n')

  it('解析主仓/分支名/detached/prunable', () => {
    const worktrees = harness.parseWorktreeList(fixture)
    expect(worktrees).toHaveLength(4)
    expect(worktrees[0]).toMatchObject({ path: '/repo/main', branch: 'main', isMain: true })
    expect(worktrees[1]).toMatchObject({
      path: '/repo/main/.worktrees/api-core-unification',
      branch: 'refactor/api-core-unification',
      isMain: false,
    })
    expect(worktrees[2]).toMatchObject({ branch: null, detached: true, prunable: false })
    expect(worktrees[3]).toMatchObject({ branch: 'feat/harness-session', prunable: true })
  })

  it('尾部条目（无结尾空行）不遗漏', () => {
    const worktrees = harness.parseWorktreeList('worktree /repo\nbranch refs/heads/main')
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0].branch).toBe('main')
  })

  it('空输入返回空数组', () => {
    expect(harness.parseWorktreeList('')).toEqual([])
    expect(harness.parseWorktreeList(null)).toEqual([])
  })
})

describe('listSessions（隔离会话根目录）', () => {
  const wtDir = join(tmp, 'wt-a')
  mkdirSync(wtDir, { recursive: true })
  const realWt = realpathSync(wtDir)

  function writeSessionFile(fileName: string, lines: string[], mtime: Date) {
    const dir = join(process.env.OCEAN_HARNESS_SESSIONS_ROOT as string, harness.sanitizeCwdForSessionDir(realWt))
    const file = join(dir, fileName)
    writeFileSync(file, lines.join('\n') + '\n', 'utf8')
    utimesSync(file, mtime, mtime)
    return file
  }

  it('解析 header/名称/首条用户消息/最后一条消息，损坏文件跳过不崩列表', () => {
    mkdirSync(wtDir, { recursive: true })
    const dir = join(process.env.OCEAN_HARNESS_SESSIONS_ROOT as string, harness.sanitizeCwdForSessionDir(realWt))
    mkdirSync(dir, { recursive: true })

    const header = JSON.stringify({ type: 'session', version: 3, id: 'sess-uuid-1', timestamp: '2026-10-23T00:00:00.000Z', cwd: realWt })
    writeSessionFile(
      '2026-10-23T00-00-00-000Z_uuid1.jsonl',
      [
        header,
        JSON.stringify({ type: 'message', id: 'e1', parentId: null, timestamp: 'x', message: { role: 'user', content: '帮我修个 bug' } }),
        JSON.stringify({ type: 'message', id: 'e2', parentId: 'e1', timestamp: 'x', message: { role: 'assistant', content: [{ type: 'text', text: '好的' }] } }),
        JSON.stringify({ type: 'session_info', id: 'e3', parentId: 'e2', timestamp: 'x', name: '修 bug 会话' }),
        JSON.stringify({ type: 'message', id: 'e4', parentId: 'e3', timestamp: 'x', message: { role: 'user', content: '再看看别的问题' } }),
      ],
      new Date('2026-10-23T01:00:00Z')
    )
    // 损坏文件：无合法 header
    writeSessionFile(
      '2026-10-23T00-30-00-000Z_uuid2.jsonl',
      ['this is not json', 'still not json'],
      new Date('2026-10-23T02:00:00Z')
    )

    const res = harness.listSessions(wtDir)
    expect(res.success).toBe(true)
    // 损坏文件被跳过
    expect(res.sessions).toHaveLength(1)
    const s = res.sessions[0]
    expect(s.id).toBe('sess-uuid-1')
    expect(s.name).toBe('修 bug 会话')
    expect(s.cwd).toBe(realWt)
    expect(s.firstUserText).toBe('帮我修个 bug')
    expect(s.lastMessage).toEqual({ role: 'user', text: '再看看别的问题' })
    expect(s.file.endsWith('.jsonl')).toBe(true)
  })

  it('路径不存在返回失败', () => {
    const res = harness.listSessions(join(tmp, 'no-such-dir'))
    expect(res.success).toBe(false)
    expect(typeof res.error).toBe('string')
  })

  it('无会话目录返回空列表', () => {
    const emptyWt = join(tmp, 'wt-empty')
    mkdirSync(emptyWt, { recursive: true })
    const res = harness.listSessions(emptyWt)
    expect(res.success).toBe(true)
    expect(res.sessions).toEqual([])
  })

  it('按 mtime 倒序排列', () => {
    const dir = join(process.env.OCEAN_HARNESS_SESSIONS_ROOT as string, harness.sanitizeCwdForSessionDir(realWt))
    mkdirSync(dir, { recursive: true })
    const mk = (name: string, ts: string) => {
      const file = join(dir, name)
      writeFileSync(file, JSON.stringify({ type: 'session', version: 3, id: name, timestamp: ts, cwd: realWt }) + '\n', 'utf8')
      return file
    }
    const older = mk('2026-10-20T00-00-00-000Z_a.jsonl', '2026-10-20T00:00:00.000Z')
    const newer = mk('2026-10-22T00-00-00-000Z_b.jsonl', '2026-10-22T00:00:00.000Z')
    utimesSync(older, new Date('2026-10-20T00:00:00Z'), new Date('2026-10-20T00:00:00Z'))
    utimesSync(newer, new Date('2026-10-22T00:00:00Z'), new Date('2026-10-22T00:00:00Z'))
    const res = harness.listSessions(realWt)
    expect(res.sessions.length).toBeGreaterThanOrEqual(2)
    const ids = res.sessions.map((s: { id: string | null }) => s.id)
    expect(ids.indexOf('2026-10-22T00-00-00-000Z_b.jsonl')).toBeLessThan(ids.indexOf('2026-10-20T00-00-00-000Z_a.jsonl'))
  })
})

describe('sendCommand / stopSession 对不存在会话的防御', () => {
  it('未知会话返回失败而非抛异常', () => {
    const res = harness.sendCommand('sess-not-exist', { type: 'abort' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('sess-not-exist')
  })
  it('无效命令结构返回失败', () => {
    // 无会话时先命中会话校验；这里验证参数校验顺序不抛异常即可
    const res = harness.sendCommand('sess-not-exist', null)
    expect(res.success).toBe(false)
  })
  it('停止不存在的会话返回 wasRunning false', () => {
    const res = harness.stopSession('sess-not-exist')
    expect(res).toEqual({ success: true, wasRunning: false })
  })
})

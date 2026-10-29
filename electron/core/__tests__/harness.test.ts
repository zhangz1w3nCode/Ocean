import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarnessCommand, HarnessResult } from '../harness'

// 会话目录根须在模块加载之前钉死到临时目录（core 模块加载时读取 env，
// 故用 beforeAll 内动态 import 延迟加载，静态 import 会被提升到 env 设置之前）
let harness: typeof import('../harness')
let tmp = ''

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ocean-harness-'))
  process.env.OCEAN_HARNESS_SESSIONS_ROOT = join(tmp, 'sessions-root')
  harness = await import('../harness')
})

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

// core 统一契约：{ success, ...data } | { success: false, error }，全 async，不向调用方抛出。
// unwrap 取数据（失败抛错便于定位）。
async function unwrap<T extends object>(p: Promise<HarnessResult<T>>): Promise<T & { success: true }> {
  const r = await p
  if (!r.success) throw new Error(r.error)
  return r as T & { success: true }
}

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

  it('解析 header/名称/首条用户消息/最后一条消息，损坏文件跳过不崩列表', async () => {
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

    const { sessions } = await unwrap(harness.listSessions(wtDir))
    // 损坏文件被跳过
    expect(sessions).toHaveLength(1)
    const s = sessions[0]
    expect(s.id).toBe('sess-uuid-1')
    expect(s.name).toBe('修 bug 会话')
    expect(s.cwd).toBe(realWt)
    expect(s.firstUserText).toBe('帮我修个 bug')
    expect(s.lastMessage).toEqual({ role: 'user', text: '再看看别的问题' })
    expect(s.file.endsWith('.jsonl')).toBe(true)
  })

  it('路径不存在返回失败', async () => {
    const res = await harness.listSessions(join(tmp, 'no-such-dir'))
    if (res.success !== false) throw new Error('预期业务失败，实际成功')
    expect(typeof res.error).toBe('string')
  })

  it('无会话目录返回空列表', async () => {
    const emptyWt = join(tmp, 'wt-empty')
    mkdirSync(emptyWt, { recursive: true })
    const { sessions } = await unwrap(harness.listSessions(emptyWt))
    expect(sessions).toEqual([])
  })

  it('按 mtime 倒序排列', async () => {
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
    const { sessions } = await unwrap(harness.listSessions(realWt))
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    const ids = sessions.map((s) => s.id)
    expect(ids.indexOf('2026-10-22T00-00-00-000Z_b.jsonl')).toBeLessThan(ids.indexOf('2026-10-20T00-00-00-000Z_a.jsonl'))
  })
})

describe('sendCommand / stopSession 对不存在会话的防御', () => {
  it('未知会话返回失败而非抛异常', async () => {
    const res = await harness.sendCommand('sess-not-exist', { type: 'abort' })
    if (res.success !== false) throw new Error('预期业务失败，实际成功')
    expect(res.error).toContain('sess-not-exist')
  })
  it('无效命令结构返回失败', async () => {
    // 无会话时先命中会话校验；这里验证参数校验顺序不抛异常即可
    const res = await harness.sendCommand('sess-not-exist', null as unknown as HarnessCommand)
    if (res.success !== false) throw new Error('预期业务失败，实际成功')
  })
  it('停止不存在的会话返回 wasRunning false', async () => {
    const res = await harness.stopSession('sess-not-exist')
    expect(res).toEqual({ success: true, wasRunning: false })
  })
})

describe('listRepoWorktrees（仓库维度视图）', () => {
  it('主仓库 + .codebases/ git 仓库铺开，非 git 条目跳过', async () => {
    const { execFileSync } = await import('node:child_process')
    const proj = join(tmp, 'repo-view')
    const cb = join(proj, '.codebases', 'cb-a')
    const blank = join(proj, '.codebases', 'cb-blank')
    mkdirSync(blank, { recursive: true })
    execFileSync('git', ['init', '-q', '-b', 'main', proj])
    execFileSync('git', ['-C', proj, 'config', 'user.email', 't@t'])
    execFileSync('git', ['-C', proj, 'config', 'user.name', 't'])
    execFileSync('git', ['-C', proj, 'commit', '--allow-empty', '-qm', 'init'])
    execFileSync('git', ['clone', '-q', proj, cb])

    const { repos } = await unwrap(harness.listRepoWorktrees(proj))
    expect(repos).toHaveLength(2)
    expect(repos[0]).toMatchObject({ isMain: true, name: 'repo-view' })
    expect(repos[0].worktrees).toHaveLength(1)
    expect(repos[1]).toMatchObject({ isMain: false, name: 'cb-a' })
    expect(repos[1].worktrees[0].branch).toBe('main')
    // blank 条目（非 git）不出现
    expect(repos.some((r) => r.name === 'cb-blank')).toBe(false)
  })

  it('主仓库 git 失败时整体失败（错误优先，与既有语义一致）', async () => {
    const res = await harness.listRepoWorktrees(join(tmp, 'not-a-repo'))
    if (res.success !== false) throw new Error('预期业务失败，实际成功')
    expect(res.error).toMatch(/worktree list 失败/)
  })
})

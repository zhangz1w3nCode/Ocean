import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  TASK_STATUSES,
  listTasks,
  readTaskDetail,
  createTask,
  updateTask,
  saveTaskContext,
  searchTasks,
  type TaskResult,
} from '../task'
import { filterTasks } from '../../source/cli/task'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-task-'))
  fs.mkdirSync(path.join(root, '.workflows'), { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(root, { recursive: true, force: true })
})

// core 统一契约：{ success, ...data } | { success: false, error }，全 async，不向调用方抛出。
// 测试辅助：unwrap 取数据（失败抛错便于定位），fail 断言业务失败契约。
async function unwrap<T>(p: Promise<TaskResult<T>>): Promise<T & { success: true }> {
  const r = await p
  if (!r.success) throw new Error(r.error)
  return r as T & { success: true }
}
async function fail<T>(p: Promise<TaskResult<T>>, re: RegExp): Promise<void> {
  const r = await p
  if (r.success !== false) throw new Error('预期业务失败，实际成功')
  expect(r.error).toMatch(re)
}

const mk = async (name: string, content = '正文', extra?: Record<string, unknown>) =>
  (await unwrap(createTask(root, { name, content, ...extra }))).task
const detail = async (name: string) => (await unwrap(readTaskDetail(root, name))).detail
const upd = async (payload: Record<string, unknown>) => (await unwrap(updateTask(root, payload as any))).task
const saveCtx = async (payload: { taskName: string; contextName: string; content: string }) =>
  (await unwrap(saveTaskContext(root, payload))).isUpdate
const search = async (kw: string, opts?: { top?: number; context?: number; status?: string }) =>
  (await unwrap(searchTasks(root, kw, opts))).results
const list = async (r = root) => (await unwrap(listTasks(r))).tasks

describe('core 契约与状态常量', () => {
  it('状态常量四值', () => {
    expect(TASK_STATUSES).toEqual(['等待处理', '处理中', '已完成', '已取消'])
  })

  it('业务失败返回契约结果（CLI 层据此转 exit 1，不以 rejection 冒泡）', async () => {
    const r = await readTaskDetail(root, '不存在')
    if (r.success !== false) throw new Error('预期失败')
    expect(r.error).toMatch(/任务不存在/)
  })
})

describe('createTask', () => {
  it('初始状态恒为等待处理，即使传了处理人', async () => {
    const t = await mk('甲', '内容', { handler: '张三' })
    expect(t.status).toBe('等待处理')
    expect(t.handler).toBe('张三')
  })

  it('缺内容 / 空名称 / 重名 被拒绝', async () => {
    await fail(createTask(root, { name: '甲', content: '   ' }), /任务内容不能为空/)
    await fail(createTask(root, { name: '   ' }), /任务名称不能为空/)
    await mk('甲')
    await fail(createTask(root, { name: '甲', content: '别的' }), /任务名称已存在/)
  })

  it('非法名称：路径分隔符、上跳、超长', async () => {
    for (const bad of ['a/b', 'a\\b', '../逃逸', '.', 'x'.repeat(101)]) {
      await fail(createTask(root, { name: bad, content: '正文' }), /任务名称/)
    }
  })

  it('relatedCodebases/tags 去重去空并截断到 20 项', async () => {
    const t = await mk('甲', '内容', { relatedCodebases: ['Ocean', 'Ocean', ' pi ', ''], tags: Array.from({ length: 25 }, (_, i) => `t${i}`) })
    expect(t.relatedCodebases).toEqual(['Ocean', 'pi'])
    expect(t.tags).toHaveLength(20)
  })

  it('关联任务只收录已存在的任务', async () => {
    await mk('乙')
    const t = await mk('甲', '内容', { relatedTasks: ['乙', '不存在'] })
    expect(t.relatedTasks).toEqual(['乙'])
  })

  it('创建时写 trace 首事件 task-created', async () => {
    await mk('甲')
    expect((await detail('甲')).trace[0].type).toBe('task-created')
  })

  it('--context 写入名为「初始上下文」的上下文文件', async () => {
    await mk('甲', '内容', { context: '  背景  ' })
    const d = await detail('甲')
    expect(d.contexts.map(c => c.name)).toContain('初始上下文')
    expect(d.contexts.find(c => c.name === '初始上下文')!.content.trim()).toBe('背景')
  })

  it('TASK.md 落盘为 YAML frontmatter + 流式数组', async () => {
    await mk('甲', '正文内容', { relatedCodebases: ['Ocean'], tags: ['前端'] })
    const raw = fs.readFileSync(path.join(root, '.tasks', '甲', 'TASK.md'), 'utf-8')
    expect(raw.startsWith('---\nname: 甲\n')).toBe(true)
    expect(raw).toContain('related_codebases: [ Ocean ]')
    expect(raw).toContain('tags: [ 前端 ]')
    expect(raw.trimEnd().endsWith('正文内容')).toBe(true)
  })
})

describe('listTasks', () => {
  it('只收录直接含 TASK.md 的一级目录，日期目录被排除', async () => {
    await mk('甲')
    fs.mkdirSync(path.join(root, '.tasks', '2026-10-16', 'TASKS'), { recursive: true })
    fs.mkdirSync(path.join(root, '.tasks', '空目录'), { recursive: true })
    expect((await list()).map(t => t.name)).toEqual(['甲'])
  })

  it('按更新时间倒序', async () => {
    // updated_at 只有毫秒精度，用假时钟拉开间隔，避免同一毫秒内排序不稳定
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    await mk('甲')
    await mk('乙')
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    await upd({ name: '甲', content: '甲的新正文' })
    expect((await list())[0].name).toBe('甲')
  })

  it('任务根目录不存在时返回空列表且不创建目录', async () => {
    const r = await listTasks(path.join(root, 'nope'))
    if (r.success !== true) throw new Error(r.error)
    expect(r.tasks).toEqual([])
    expect(fs.existsSync(path.join(root, 'nope', '.tasks'))).toBe(false)
  })
})

describe('updateTask 状态机', () => {
  it('处理人由空变有时自动流转等待处理 → 处理中', async () => {
    await mk('甲')
    const t = await upd({ name: '甲', content: '正文', handler: '张三' })
    expect(t.status).toBe('处理中')
  })

  it('门禁：无处理人时不能推进到处理中', async () => {
    await mk('甲')
    await fail(updateTask(root, { name: '甲', content: '正文', status: '处理中' }), /请先指定任务处理人/)
  })

  it('本次同时指定处理人即可推进（门禁看最终处理人）', async () => {
    await mk('甲')
    const t = await upd({ name: '甲', content: '正文', handler: '张三', status: '处理中' })
    expect(t.status).toBe('处理中')
  })

  it('等待处理可直接进入终态，无需处理人', async () => {
    await mk('甲')
    expect((await upd({ name: '甲', content: '正文', status: '已完成' })).status).toBe('已完成')
  })

  it('处理中可到已完成 / 已取消', async () => {
    await mk('甲', '正文', { handler: '张三' })
    await upd({ name: '甲', content: '正文', handler: '张三', status: '处理中' })
    expect((await upd({ name: '甲', content: '正文', handler: '张三', status: '已取消' })).status).toBe('已取消')
  })

  it('终态锁定：已完成不能再变更状态', async () => {
    await mk('甲', '正文', { handler: '张三' })
    await upd({ name: '甲', content: '正文', handler: '张三', status: '处理中' })
    await upd({ name: '甲', content: '正文', handler: '张三', status: '已完成' })
    await fail(updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' }), /不能变更为/)
  })

  it('终态仍可更新正文字段（只锁状态）', async () => {
    await mk('甲')
    await upd({ name: '甲', content: '正文', status: '已完成' })
    const t = await upd({ name: '甲', content: '改过的正文', status: '已完成' })
    expect(t.status).toBe('已完成')
    expect((await detail('甲')).task.content).toContain('改过的正文')
  })

  it('未知状态值被忽略（不改变状态）', async () => {
    await mk('甲')
    expect((await upd({ name: '甲', content: '正文', status: '乱写' })).status).toBe('等待处理')
  })

  it('全量覆写语义：不传 relatedCodebases/tags 会被清空（CLI 侧负责回填）', async () => {
    await mk('甲', '正文', { relatedCodebases: ['Ocean'], tags: ['前端'] })
    const t = await upd({ name: '甲', content: '正文', handler: '' })
    expect(t.relatedCodebases).toEqual([])
    expect(t.tags).toEqual([])
  })

  it('无实质变更时不写事件、不刷新 updated_at', async () => {
    const created = await mk('甲', '正文')
    const before = await detail('甲')
    const t = await upd({ name: '甲', content: '正文', handler: '', relatedCodebases: [], tags: [], relatedTasks: [] })
    expect(t.updatedAt).toBe(created.updatedAt)
    expect((await detail('甲')).trace.length).toBe(before.trace.length)
  })

  it('同一轮更新内：字段变更事件在状态变更事件之前', async () => {
    await mk('甲')
    await upd({ name: '甲', content: '正文', handler: '张三', status: '处理中' })
    const types = (await detail('甲')).trace.map(e => e.type)
    expect(types).toEqual(['task-created', 'task-updated', 'status-changed'])
  })

  it('TASK.md 里未知的 frontmatter 字段被原样保留', async () => {
    await mk('甲', '正文')
    const p = path.join(root, '.tasks', '甲', 'TASK.md')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8').replace('name: 甲\n', 'name: 甲\n自定义: 保留我\n'), 'utf-8')
    await upd({ name: '甲', content: '新正文' })
    expect(fs.readFileSync(p, 'utf-8')).toContain('自定义: 保留我')
  })
})

describe('saveTaskContext', () => {
  it('同名覆盖判定新建 / 更新', async () => {
    await mk('甲')
    expect(await saveCtx({ taskName: '甲', contextName: '需求', content: '一' })).toBe(false)
    expect(await saveCtx({ taskName: '甲', contextName: '需求', content: '二' })).toBe(true)
    expect((await detail('甲')).contexts.find(c => c.name === '需求')!.content.trim()).toBe('二')
  })

  it('空内容 / 非法主题 / 任务不存在 被拒绝', async () => {
    await mk('甲')
    await fail(saveTaskContext(root, { taskName: '甲', contextName: '需求', content: '  ' }), /上下文内容不能为空/)
    await fail(saveTaskContext(root, { taskName: '甲', contextName: 'a/b', content: 'x' }), /上下文主题/)
    await fail(saveTaskContext(root, { taskName: '没有', contextName: '需求', content: 'x' }), /任务不存在/)
  })

  it('保存上下文会刷新任务 updated_at 并写事件', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const created = await mk('甲')
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    await saveCtx({ taskName: '甲', contextName: '需求', content: '一' })
    const d = await detail('甲')
    expect(d.task.updatedAt).not.toBe(created.updatedAt)
    expect(d.trace.map(e => e.type)).toContain('context-created')
  })
})

describe('searchTasks（正文维度全文检索）', () => {
  it('命中任务正文，返回位置/行号/命中行', async () => {
    await mk('登录重构', '第一行\n使用 JWT 签发 token\n第三行')
    const r = await search('jwt')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('登录重构')
    expect(r[0].matches[0]).toMatchObject({ where: '任务内容', line: 2, text: '使用 JWT 签发 token' })
  })

  it('不区分大小写', async () => {
    await mk('甲', 'Token Refresh')
    expect(await search('token')).toHaveLength(1)
    expect(await search('TOKEN')).toHaveLength(1)
  })

  it('命中上下文正文并以主题名作为位置', async () => {
    await mk('甲', '正文无关')
    await saveCtx({ taskName: '甲', contextName: '需求背景', content: '背景一\n要求支持降级\n背景三' })
    const r = await search('降级')
    expect(r[0].matches[0].where).toBe('需求背景')
    expect(r[0].matches[0].line).toBe(2)
  })

  it('before/after 受 context 行数控制', async () => {
    await mk('甲', 'L1\nL2\nL3\nL4\nL5')
    const tight = (await search('L3', { context: 1 }))[0].matches[0]
    expect(tight.before).toEqual(['L2'])
    expect(tight.after).toEqual(['L4'])
    const wide = (await search('L3', { context: 2 }))[0].matches[0]
    expect(wide.before).toEqual(['L1', 'L2'])
    expect(wide.after).toEqual(['L4', 'L5'])
  })

  it('不匹配摘要字段（名称/处理人/仓库/标签）', async () => {
    await mk('登录重构', '正文', { handler: '张三', relatedCodebases: ['Ocean'], tags: ['前端'] })
    expect(await search('登录')).toEqual([])
    expect(await search('张三')).toEqual([])
    expect(await search('Ocean')).toEqual([])
  })

  it('多命中按命中数倒序，且受 --top 限制', async () => {
    await mk('甲', 'kw\nkw')
    await mk('乙', 'kw')
    await mk('丙', 'kw\nkw\nkw')
    const all = await search('kw', { top: 10 })
    expect(all.map(r => r.name)).toEqual(['丙', '甲', '乙'])
    expect(await search('kw', { top: 2 })).toHaveLength(2)
  })

  it('可按状态限定检索范围', async () => {
    await mk('甲', 'kw')
    await mk('乙', 'kw')
    await upd({ name: '乙', content: 'kw', status: '已完成' })
    expect((await search('kw', { status: '已完成' })).map(r => r.name)).toEqual(['乙'])
    expect((await search('kw', { status: '等待处理' })).map(r => r.name)).toEqual(['甲'])
  })

  it('日期目录不参与检索', async () => {
    await mk('甲', 'kw')
    fs.mkdirSync(path.join(root, '.tasks', '2026-10-15', 'TASKS'), { recursive: true })
    fs.writeFileSync(path.join(root, '.tasks', '2026-10-15', 'kw.md'), 'kw\n')
    expect((await search('kw')).map(r => r.name)).toEqual(['甲'])
  })

  it('空关键词 / 无命中 / 无目录 都返回空数组', async () => {
    await mk('甲', '正文')
    expect(await search('   ')).toEqual([])
    expect(await search('查无此词')).toEqual([])
    const r = await searchTasks(path.join(root, 'nope'), 'kw')
    if (r.success !== true) throw new Error(r.error)
    expect(r.results).toEqual([])
  })

  it('结果携带摘要字段，供 CLI 直接展示', async () => {
    await mk('登录重构', 'kw', { handler: '张三', relatedCodebases: ['Ocean'], tags: ['前端'] })
    const r = (await search('kw'))[0]
    expect(r).toMatchObject({ name: '登录重构', status: '等待处理', handler: '张三', relatedCodebases: ['Ocean'], tags: ['前端'] })
  })
})

describe('filterTasks（与桌面端任务库同语义）', () => {
  const seed = async () => {
    await mk('登录重构', '正文', { handler: '张三', relatedCodebases: ['Ocean'], tags: ['前端'] })
    await mk('支付联调', '正文', { handler: '李四', relatedCodebases: ['pi-agent'], tags: ['后端'] })
  }

  it('状态精确过滤', async () => {
    await seed()
    await upd({ name: '登录重构', content: '正文', handler: '张三', relatedCodebases: ['Ocean'], tags: ['前端'], status: '处理中' })
    expect(filterTasks(await list(), '处理中').map(t => t.name)).toEqual(['登录重构'])
  })

  it('关键词覆盖 名称/处理人/仓库/标签/状态 且大小写不敏感', async () => {
    await seed()
    const tasks = await list()
    const byName = filterTasks(tasks, undefined, '登录')
    const byHandler = filterTasks(tasks, undefined, '李四')
    const byRepo = filterTasks(tasks, undefined, 'PI-AGENT')
    const byTag = filterTasks(tasks, undefined, '前端')
    const byStatus = filterTasks(tasks, undefined, '等待处理')
    expect(byName.map(t => t.name)).toEqual(['登录重构'])
    expect(byHandler.map(t => t.name)).toEqual(['支付联调'])
    expect(byRepo).toHaveLength(1)
    expect(byTag.map(t => t.name)).toEqual(['登录重构'])
    expect(byStatus).toHaveLength(2)
  })

  it('无命中返回空数组', async () => {
    await seed()
    expect(filterTasks(await list(), undefined, '查无此词')).toEqual([])
  })
})

describe('IO 异常收敛（guard，renderer 直连防线）', () => {
  it('listTasks：.tasks 被文件占用时返回 IO 错误而非 rejection', async () => {
    fs.writeFileSync(path.join(root, '.tasks'), 'not a dir')
    const r = await listTasks(root)
    if (r.success !== false) throw new Error('预期 IO 收敛失败')
    expect(r.error).toContain('IO 错误')
  })

  it('readTaskDetail：TASK.md 是目录时收敛 EISDIR', async () => {
    await mk('甲')
    const md = path.join(root, '.tasks', '甲', 'TASK.md')
    fs.rmSync(md)
    fs.mkdirSync(md)
    const r = await readTaskDetail(root, '甲')
    if (r.success !== false) throw new Error('预期 IO 收敛失败')
    expect(r.error).toContain('IO 错误')
  })

  it('saveTaskContext：context 目录被文件占用时收敛 IO 错误', async () => {
    await mk('甲')
    const ctxDir = path.join(root, '.tasks', '甲', 'context')
    fs.rmSync(ctxDir, { recursive: true, force: true })
    fs.writeFileSync(ctxDir, 'occupied')
    const r = await saveTaskContext(root, { taskName: '甲', contextName: '需求', content: 'x' })
    if (r.success !== false) throw new Error('预期 IO 收敛失败')
    expect(r.error).toContain('IO 错误')
  })

  it('searchTasks：.tasks 被文件占用时同样收敛', async () => {
    fs.writeFileSync(path.join(root, '.tasks'), 'not a dir')
    const r = await searchTasks(root, 'kw')
    if (r.success !== false) throw new Error('预期 IO 收敛失败')
    expect(r.error).toContain('IO 错误')
  })
})

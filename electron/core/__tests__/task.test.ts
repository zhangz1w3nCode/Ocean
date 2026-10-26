import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { TASK_STATUSES } from '../../core/common'
import {
  listTasks,
  readTaskDetail,
  createTask,
  updateTask,
  saveTaskContext,
  searchTasks,
  filterTasks,
} from '../../source/cli/task'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-task-'))
  fs.mkdirSync(path.join(root, '.workflows'), { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(root, { recursive: true, force: true })
})

const mk = (name: string, content = '正文', extra?: Record<string, unknown>) =>
  createTask(root, { name, content, ...extra })

describe('core 契约与 CLI 适配层', () => {
  it('状态常量为唯一约定值（core/task 唯一事实源）', () => {
    expect(TASK_STATUSES).toEqual(['等待处理', '处理中', '已完成', '已取消'])
  })

  it('业务失败被转成异常（CLI 据此输出错误并非 0 退出）', () => {
    expect(() => readTaskDetail(root, '不存在')).toThrow(/任务不存在/)
  })
})

describe('createTask', () => {
  it('初始状态恒为等待处理，即使传了处理人', () => {
    const t = mk('甲', '内容', { handler: '张三' })
    expect(t.status).toBe('等待处理')
    expect(t.handler).toBe('张三')
  })

  it('缺内容 / 空名称 / 重名 被拒绝', () => {
    expect(() => mk('甲', '   ')).toThrow(/任务内容不能为空/)
    expect(() => mk('   ')).toThrow(/任务名称不能为空/)
    mk('甲')
    expect(() => mk('甲', '别的')).toThrow(/任务名称已存在/)
  })

  it('非法名称：路径分隔符、上跳、超长', () => {
    for (const bad of ['a/b', 'a\\b', '../逃逸', 'x'.repeat(101)]) {
      expect(() => mk(bad)).toThrow(/任务名称/)
    }
  })

  it('repo/tags 去重去空并截断到 20 项', () => {
    const t = mk('甲', '内容', { repo: ['Ocean', 'Ocean', ' pi ', ''], tags: Array.from({ length: 25 }, (_, i) => `t${i}`) })
    expect(t.repo).toEqual(['Ocean', 'pi'])
    expect(t.tags).toHaveLength(20)
  })

  it('关联任务只收录已存在的任务', () => {
    mk('乙')
    const t = mk('甲', '内容', { relatedTasks: ['乙', '不存在'] })
    expect(t.relatedTasks).toEqual(['乙'])
  })

  it('创建时写 trace 首事件 task-created', () => {
    mk('甲')
    expect(readTaskDetail(root, '甲').trace[0].type).toBe('task-created')
  })

  it('--context 写入名为「初始上下文」的上下文文件', () => {
    mk('甲', '内容', { context: '  背景  ' })
    const d = readTaskDetail(root, '甲')
    expect(d.contexts.map(c => c.name)).toContain('初始上下文')
    expect(d.contexts.find(c => c.name === '初始上下文')!.content.trim()).toBe('背景')
  })

  it('TASK.md 落盘为 YAML frontmatter + 流式数组', () => {
    mk('甲', '正文内容', { repo: ['Ocean'], tags: ['前端'] })
    const raw = fs.readFileSync(path.join(root, '.tasks', '甲', 'TASK.md'), 'utf-8')
    expect(raw.startsWith('---\nname: 甲\n')).toBe(true)
    expect(raw).toContain('repo: [ Ocean ]')
    expect(raw).toContain('tags: [ 前端 ]')
    expect(raw.trimEnd().endsWith('正文内容')).toBe(true)
  })
})

describe('listTasks', () => {
  it('只收录直接含 TASK.md 的一级目录，日期目录被排除', () => {
    mk('甲')
    fs.mkdirSync(path.join(root, '.tasks', '2026-10-16', 'TASKS'), { recursive: true })
    fs.mkdirSync(path.join(root, '.tasks', '空目录'), { recursive: true })
    expect(listTasks(root).map(t => t.name)).toEqual(['甲'])
  })

  it('按更新时间倒序', () => {
    // updated_at 只有毫秒精度，用假时钟拉开间隔，避免同一毫秒内排序不稳定
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    mk('甲')
    mk('乙')
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    updateTask(root, { name: '甲', content: '甲的新正文' })
    expect(listTasks(root)[0].name).toBe('甲')
  })

  it('任务根目录不存在时返回空列表且不创建目录', () => {
    expect(listTasks(path.join(root, 'nope'))).toEqual([])
    expect(fs.existsSync(path.join(root, 'nope', '.tasks'))).toBe(false)
  })
})

describe('updateTask 状态机', () => {
  it('处理人由空变有时自动流转等待处理 → 处理中', () => {
    mk('甲')
    const t = updateTask(root, { name: '甲', content: '正文', handler: '张三' })
    expect(t.status).toBe('处理中')
  })

  it('门禁：无处理人时不能推进到处理中', () => {
    mk('甲')
    expect(() => updateTask(root, { name: '甲', content: '正文', status: '处理中' }))
      .toThrow(/请先指定任务处理人/)
  })

  it('本次同时指定处理人即可推进（门禁看最终处理人）', () => {
    mk('甲')
    const t = updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' })
    expect(t.status).toBe('处理中')
  })

  it('等待处理可直接进入终态，无需处理人', () => {
    mk('甲')
    expect(updateTask(root, { name: '甲', content: '正文', status: '已完成' }).status).toBe('已完成')
  })

  it('处理中可到已完成 / 已取消', () => {
    mk('甲', '正文', { handler: '张三' })
    updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' })
    expect(updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '已取消' }).status).toBe('已取消')
  })

  it('终态锁定：已完成不能再变更状态', () => {
    mk('甲', '正文', { handler: '张三' })
    updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' })
    updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '已完成' })
    expect(() => updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' }))
      .toThrow(/不能变更为/)
  })

  it('终态仍可更新正文字段（只锁状态）', () => {
    mk('甲')
    updateTask(root, { name: '甲', content: '正文', status: '已完成' })
    const t = updateTask(root, { name: '甲', content: '改过的正文', status: '已完成' })
    expect(t.status).toBe('已完成')
    expect(readTaskDetail(root, '甲').task.content).toContain('改过的正文')
  })

  it('未知状态值被忽略（不改变状态）', () => {
    mk('甲')
    expect(updateTask(root, { name: '甲', content: '正文', status: '乱写' }).status).toBe('等待处理')
  })

  it('全量覆写语义：不传 repo/tags 会被清空（CLI 侧负责回填）', () => {
    mk('甲', '正文', { repo: ['Ocean'], tags: ['前端'] })
    const t = updateTask(root, { name: '甲', content: '正文', handler: '' })
    expect(t.repo).toEqual([])
    expect(t.tags).toEqual([])
  })

  it('无实质变更时不写事件、不刷新 updated_at', () => {
    const created = mk('甲', '正文')
    const before = readTaskDetail(root, '甲')
    const t = updateTask(root, { name: '甲', content: '正文', handler: '', repo: [], tags: [], relatedTasks: [] })
    expect(t.updatedAt).toBe(created.updatedAt)
    expect(readTaskDetail(root, '甲').trace.length).toBe(before.trace.length)
  })

  it('同一轮更新内：字段变更事件在状态变更事件之前', () => {
    mk('甲')
    updateTask(root, { name: '甲', content: '正文', handler: '张三', status: '处理中' })
    const types = readTaskDetail(root, '甲').trace.map(e => e.type)
    expect(types).toEqual(['task-created', 'task-updated', 'status-changed'])
  })

  it('TASK.md 里未知的 frontmatter 字段被原样保留', () => {
    mk('甲', '正文')
    const p = path.join(root, '.tasks', '甲', 'TASK.md')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8').replace('name: 甲\n', 'name: 甲\n自定义: 保留我\n'), 'utf-8')
    updateTask(root, { name: '甲', content: '新正文' })
    expect(fs.readFileSync(p, 'utf-8')).toContain('自定义: 保留我')
  })
})

describe('saveTaskContext', () => {
  it('同名覆盖判定新建 / 更新', () => {
    mk('甲')
    expect(saveTaskContext(root, { taskName: '甲', contextName: '需求', content: '一' })).toBe(false)
    expect(saveTaskContext(root, { taskName: '甲', contextName: '需求', content: '二' })).toBe(true)
    expect(readTaskDetail(root, '甲').contexts.find(c => c.name === '需求')!.content.trim()).toBe('二')
  })

  it('空内容 / 非法主题 / 任务不存在 被拒绝', () => {
    mk('甲')
    expect(() => saveTaskContext(root, { taskName: '甲', contextName: '需求', content: '  ' })).toThrow(/上下文内容不能为空/)
    expect(() => saveTaskContext(root, { taskName: '甲', contextName: 'a/b', content: 'x' })).toThrow(/上下文主题/)
    expect(() => saveTaskContext(root, { taskName: '没有', contextName: '需求', content: 'x' })).toThrow(/任务不存在/)
  })

  it('保存上下文会刷新任务 updated_at 并写事件', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const created = mk('甲')
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    saveTaskContext(root, { taskName: '甲', contextName: '需求', content: '一' })
    const d = readTaskDetail(root, '甲')
    expect(d.task.updatedAt).not.toBe(created.updatedAt)
    expect(d.trace.map(e => e.type)).toContain('context-created')
  })
})

describe('searchTasks（正文维度全文检索）', () => {
  it('命中任务正文，返回位置/行号/命中行', () => {
    mk('登录重构', '第一行\n使用 JWT 签发 token\n第三行')
    const r = searchTasks(root, 'jwt')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('登录重构')
    expect(r[0].matches[0]).toMatchObject({ where: '任务内容', line: 2, text: '使用 JWT 签发 token' })
  })

  it('不区分大小写', () => {
    mk('甲', 'Token Refresh')
    expect(searchTasks(root, 'token')).toHaveLength(1)
    expect(searchTasks(root, 'TOKEN')).toHaveLength(1)
  })

  it('命中上下文正文并以主题名作为位置', () => {
    mk('甲', '正文无关')
    saveTaskContext(root, { taskName: '甲', contextName: '需求背景', content: '背景一\n要求支持降级\n背景三' })
    const r = searchTasks(root, '降级')
    expect(r[0].matches[0].where).toBe('需求背景')
    expect(r[0].matches[0].line).toBe(2)
  })

  it('before/after 受 context 行数控制', () => {
    mk('甲', 'L1\nL2\nL3\nL4\nL5')
    const tight = searchTasks(root, 'L3', { context: 1 })[0].matches[0]
    expect(tight.before).toEqual(['L2'])
    expect(tight.after).toEqual(['L4'])
    const wide = searchTasks(root, 'L3', { context: 2 })[0].matches[0]
    expect(wide.before).toEqual(['L1', 'L2'])
    expect(wide.after).toEqual(['L4', 'L5'])
  })

  it('不匹配摘要字段（名称/处理人/仓库/标签）', () => {
    mk('登录重构', '正文', { handler: '张三', repo: ['Ocean'], tags: ['前端'] })
    expect(searchTasks(root, '登录')).toEqual([])
    expect(searchTasks(root, '张三')).toEqual([])
    expect(searchTasks(root, 'Ocean')).toEqual([])
  })

  it('多命中按命中数倒序，且受 --top 限制', () => {
    mk('甲', 'kw\nkw')
    mk('乙', 'kw')
    mk('丙', 'kw\nkw\nkw')
    const all = searchTasks(root, 'kw', { top: 10 })
    expect(all.map(r => r.name)).toEqual(['丙', '甲', '乙'])
    expect(searchTasks(root, 'kw', { top: 2 })).toHaveLength(2)
  })

  it('可按状态限定检索范围', () => {
    mk('甲', 'kw')
    mk('乙', 'kw')
    updateTask(root, { name: '乙', content: 'kw', status: '已完成' })
    expect(searchTasks(root, 'kw', { status: '已完成' }).map(r => r.name)).toEqual(['乙'])
    expect(searchTasks(root, 'kw', { status: '等待处理' }).map(r => r.name)).toEqual(['甲'])
  })

  it('日期目录不参与检索', () => {
    mk('甲', 'kw')
    fs.mkdirSync(path.join(root, '.tasks', '2026-10-15', 'TASKS'), { recursive: true })
    fs.writeFileSync(path.join(root, '.tasks', '2026-10-15', 'kw.md'), 'kw\n')
    expect(searchTasks(root, 'kw').map(r => r.name)).toEqual(['甲'])
  })

  it('空关键词 / 无命中 / 无目录 都返回空数组', () => {
    mk('甲', '正文')
    expect(searchTasks(root, '   ')).toEqual([])
    expect(searchTasks(root, '查无此词')).toEqual([])
    expect(searchTasks(path.join(root, 'nope'), 'kw')).toEqual([])
  })

  it('结果携带摘要字段，供 CLI 直接展示', () => {
    mk('登录重构', 'kw', { handler: '张三', repo: ['Ocean'], tags: ['前端'] })
    const r = searchTasks(root, 'kw')[0]
    expect(r).toMatchObject({ name: '登录重构', status: '等待处理', handler: '张三', repo: ['Ocean'], tags: ['前端'] })
  })
})

describe('filterTasks（与桌面端任务库同语义）', () => {
  const seed = () => {
    mk('登录重构', '正文', { handler: '张三', repo: ['Ocean'], tags: ['前端'] })
    mk('支付联调', '正文', { handler: '李四', repo: ['pi-agent'], tags: ['后端'] })
  }

  it('状态精确过滤', () => {
    seed()
    updateTask(root, { name: '登录重构', content: '正文', handler: '张三', repo: ['Ocean'], tags: ['前端'], status: '处理中' })
    expect(filterTasks(listTasks(root), '处理中').map(t => t.name)).toEqual(['登录重构'])
  })

  it('关键词覆盖 名称/处理人/仓库/标签/状态 且大小写不敏感', () => {
    seed()
    const byName = filterTasks(listTasks(root), undefined, '登录')
    const byHandler = filterTasks(listTasks(root), undefined, '李四')
    const byRepo = filterTasks(listTasks(root), undefined, 'PI-AGENT')
    const byTag = filterTasks(listTasks(root), undefined, '前端')
    const byStatus = filterTasks(listTasks(root), undefined, '等待处理')
    expect(byName.map(t => t.name)).toEqual(['登录重构'])
    expect(byHandler.map(t => t.name)).toEqual(['支付联调'])
    expect(byRepo).toHaveLength(1)
    expect(byTag.map(t => t.name)).toEqual(['登录重构'])
    expect(byStatus).toHaveLength(2)
  })

  it('无命中返回空数组', () => {
    seed()
    expect(filterTasks(listTasks(root), undefined, '查无此词')).toEqual([])
  })
})

import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const tmp = mkdtempSync(join(tmpdir(), 'ocean-registry-'))
// 桩在模块加载时读 OCEAN_USER_DATA，必须在 require 之前设置
process.env.OCEAN_USER_DATA = join(tmp, 'user-data')
// set-project-path 会写 ~/.ocean/cli-root（launch.cjs:79），重定向 HOME 避免污染真实 CLI 配置
process.env.HOME = tmp
// 测试中禁止触发 osascript 真实弹框
process.env.OCEAN_NO_DIALOG = '1'

const req = createRequire(import.meta.url)
const { handlers, ready } = req('./registry.cjs')

// 期望值从 launch.cjs 源码推导：handler 注册数应等于 ipcMain.handle 调用数。
// 硬编码计数会随 channel 增删过期（84 在任务模块合入后已过期为 91）。
const launchSrc = readFileSync(new URL('../launch.cjs', import.meta.url), 'utf-8')
const handleCallCount = (launchSrc.match(/ipcMain\.handle\(/g) || []).length

const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!(null, ...args)

afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('handler 注册表', () => {
  it('launch.cjs 的 handler 全部注册（数量与源码一致）', () => {
    expect(handlers.size).toBe(handleCallCount)
    for (const ch of ['set-project-path', 'save-workflow-file', 'run-agent-loop', 'subscribe-instance-detail', 'get-app-version']) {
      expect(handlers.has(ch)).toBe(true)
    }
  })

  it('ready resolve 后 handler 表仍然完整', async () => {
    await ready
    expect(handlers.size).toBe(handleCallCount)
  })

  it('纯 node 下完成 项目设置→保存→读取 真实落盘回路', async () => {
    const project = join(tmp, 'proj')
    mkdirSync(project, { recursive: true })

    const r1 = await call('set-project-path', project)
    expect(r1.success).toBe(true)
    expect(r1.projectName).toBe('proj')

    const r2 = await call('save-workflow-file', 'reg-demo', '# registry demo\n')
    expect(r2.success).toBe(true)

    const r3 = await call('load-workflow-file', 'reg-demo')
    expect(r3.success).toBe(true)
    expect(r3.content).toBe('# registry demo\n')

    // 落盘证据：真实文件系统
    expect(existsSync(join(project, '.workflows', 'reg-demo.md'))).toBe(true)
    expect(readFileSync(join(project, '.workflows', 'reg-demo.md'), 'utf-8')).toBe('# registry demo\n')
  })
})

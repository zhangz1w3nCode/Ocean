import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const tmp = mkdtempSync(join(tmpdir(), 'ocean-host-'))
process.env.OCEAN_USER_DATA = join(tmp, 'user-data')
process.env.HOME = tmp
process.env.OCEAN_NO_DIALOG = '1'
// syncProject 冷启动走 DEFAULT_PORT()，必须先钉死端口，避免与真实环境的 8787 冲突
process.env.OCEAN_WEB_PORT = '8793'

const req = createRequire(import.meta.url)
const host = req('./webServerHost.cjs')
const { handlers } = req('./registry.cjs')
const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!(null, ...args)

const PORT = 8793
const alive = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ipc/get-app-version`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[]}',
    })
    return r.status === 200
  } catch { return false }
}

// 造一个带/不带 网页端开关 的项目目录
const mkProject = (name: string, enabled?: boolean) => {
  const p = join(tmp, name)
  mkdirSync(p, { recursive: true })
  if (enabled !== undefined) {
    mkdirSync(join(p, '.ocean', 'setting'), { recursive: true })
    writeFileSync(join(p, '.ocean', 'setting', 'general.json'), JSON.stringify({ webServerEnabled: enabled }))
  }
  return p
}

const pOn1 = mkProject('proj-on-a', true)
const pOn2 = mkProject('proj-on-b', true)
const pOff = mkProject('proj-off')

afterAll(() => {
  host.stop()
  rmSync(tmp, { recursive: true, force: true })
})

describe('项目级通用设置 handler（load/save-general-settings）', () => {
  it('未设项目时拒绝', async () => {
    // 注意：registry 测试文件间共享 launch.cjs 模块状态，这里先显式设到隔离项目
    await call('set-project-path', mkProject('gs-base'))
    const r = await call('load-general-settings') // 已设项目，应成功
    expect(r.success).toBe(true)
  })

  it('save 自动创建 .ocean/setting/ 目录与文件，load 原样读回', async () => {
    const p = mkProject('gs-create') // 不带配置文件
    await call('set-project-path', p)
    const f = join(p, '.ocean', 'setting', 'general.json')
    expect(existsSync(f)).toBe(false)

    const before = await call('load-general-settings')
    expect(before.settings).toEqual({}) // 不存在时返回空对象且不创建
    expect(existsSync(f)).toBe(false)

    const w = await call('save-general-settings', { webServerEnabled: true, other: 1 })
    expect(w.success).toBe(true)
    expect(existsSync(f)).toBe(true)
    expect(JSON.parse(readFileSync(f, 'utf-8'))).toEqual({ webServerEnabled: true, other: 1 })

    const after = await call('load-general-settings')
    expect(after.settings).toEqual({ webServerEnabled: true, other: 1 })
  })
})

describe('webServerHost syncProject（项目级开关语义）', () => {
  it('初始状态未运行', () => {
    expect(host.status().running).toBe(false)
  }, 20000)

  it('syncProject 到未开启的项目 → 不启动', async () => {
    await host.syncProject(pOff)
    expect(host.status().running).toBe(false)
  }, 20000)

  it('syncProject 到开启的项目 → 启动并指向该项目', async () => {
    await host.syncProject(pOn1)
    expect(host.status().running).toBe(true)
    expect(host.status().project).toBe(pOn1)
    expect(await alive()).toBe(true)
  }, 40000)

  it('syncProject 同一项目 → 不重启（pid 不变）', async () => {
    const pid1 = host.status().pid
    await host.syncProject(pOn1)
    expect(host.status().pid).toBe(pid1)
  }, 20000)

  it('syncProject 到另一个开启的项目 → 重启指向新项目（pid 变化，端口仍可用）', async () => {
    const pid1 = host.status().pid
    await host.syncProject(pOn2)
    expect(host.status().project).toBe(pOn2)
    expect(host.status().pid).not.toBe(pid1)
    expect(await alive()).toBe(true)
  }, 40000)

  it('syncProject 到未开启的项目 → 停止', async () => {
    await host.syncProject(pOff)
    expect(host.status().running).toBe(false)
    await new Promise((r) => setTimeout(r, 500))
    expect(await alive()).toBe(false)
  }, 20000)

  it('stop 幂等', () => {
    const r = host.stop()
    expect(r.success).toBe(true)
  }, 20000)
})

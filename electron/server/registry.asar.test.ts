import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// 模拟打包版（asar）环境：app.asar 内没有 node_modules/electron，
// 任何对 'electron' 的解析都会失败——这正是 dmg 里网页端子进程启动即退出的根因。
const tmp = mkdtempSync(join(tmpdir(), 'ocean-asarsim-'))
process.env.OCEAN_USER_DATA = join(tmp, 'user-data')
process.env.HOME = tmp
process.env.OCEAN_NO_DIALOG = '1'

const req = createRequire(import.meta.url)
const Module = req('module')
const origResolve = Module._resolveFilename

afterAll(() => {
  Module._resolveFilename = origResolve
  rmSync(tmp, { recursive: true, force: true })
})

describe('registry 在打包版（electron 不可解析）环境下', () => {
  it('仍能加载 launch.cjs 并注册全部 99 个 handler', () => {
    Module._resolveFilename = function (request: string, ...rest: unknown[]) {
      if (request === 'electron') {
        const err = new Error("Cannot find module 'electron'")
        ;(err as { code?: string }).code = 'MODULE_NOT_FOUND'
        throw err
      }
      return origResolve.call(this, request, ...rest)
    }

    // 旧实现（用 require.resolve('electron') 定位 require.cache 键）在此处会直接抛错
    const { handlers } = req('./registry.cjs')
    expect(handlers.size).toBe(99)
    expect(handlers.has('set-project-path')).toBe(true)
    expect(handlers.has('list-knowledge-raw-files')).toBe(true)
  })
})

// 桌面端应用与项目状态域 IPC 薄壳：把 IPC 参数转换为 core/app 的调用，
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 应用/项目状态内联段迁移而来（零行为变更）。
//
// Electron API 边界：get-app-version / userData 路径直接用 electron 的 app（stub 环境
// 语义由 electron-stub.cjs 提供：package.json 版本 / OCEAN_USER_DATA）；
// open-folder-dialog 用 dialog + ctx.getWindow()（主窗口桥）；项目状态切换经
// ctx.setProjectPath 桥（主进程 currentProjectPath / webServerHost / cli-root / 数据迁移）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain, dialog, app } from 'electron'
import {
  readAppConfig,
  writeAppConfig,
  readGeneralSettings,
  writeGeneralSettings,
  initProjectDirs,
  projectIdentity,
  syncProjectState,
  readAssetRoot,
  writeAssetRoot,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerAppHandlers(ctx: DesktopCtx): void {
  // raw 项目根（未设置时为 null；general-settings / asset-root 的「未设置项目」契约用）
  const rawRoot = () => ctx.getRawProjectPath?.() ?? null

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // 打开文件夹选择对话框
  ipcMain.handle('open-folder-dialog', async () => {
    try {
      // 与原内联一致：窗口引用可能为 null（已关闭窗口场景抛错走 catch 兜底）
      const result = await dialog.showOpenDialog((ctx.getWindow?.() ?? null) as never, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择项目文件夹',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, path: null }
      }

      return { success: true, path: result.filePaths[0] }
    } catch (error) {
      console.error('打开文件夹对话框失败:', error)
      return { success: false, error: String(error), path: null }
    }
  })

  // 加载应用配置（userData 路径由 app.getPath 提供；stub 环境 OCEAN_USER_DATA 语义）
  ipcMain.handle('load-app-config', () => {
    try {
      return readAppConfig(app.getPath('userData'))
    } catch (error) {
      console.error('加载应用配置失败:', error)
      return {
        success: false,
        error: String(error),
        config: {
          recentProjects: [],
          lastProjectPath: null,
          maxRecentProjects: 10,
        },
      }
    }
  })

  // 保存应用配置
  ipcMain.handle('save-app-config', (_, config) => {
    try {
      return writeAppConfig(app.getPath('userData'), config)
    } catch (error) {
      console.error('保存应用配置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载通用设置（文件不存在返回空对象，不创建文件）
  ipcMain.handle('load-general-settings', () => {
    try {
      return readGeneralSettings(rawRoot())
    } catch (error) {
      console.error('加载通用设置失败:', error)
      return { success: false, error: String(error), settings: null }
    }
  })

  // 保存通用设置（目录/文件不存在则创建）
  ipcMain.handle('save-general-settings', (_, settings) => {
    try {
      return writeGeneralSettings(rawRoot(), settings)
    } catch (error) {
      console.error('保存通用设置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 初始化项目目录（主进程状态切换经 ctx.setProjectPath 桥；cli-root 写盘与数据迁移在 core）
  ipcMain.handle('init-project-dir', (_, projectPath: string) => {
    try {
      ctx.setProjectPath?.(projectPath)
      syncProjectState(projectPath)
      return initProjectDirs(projectPath)
    } catch (error) {
      console.error('初始化项目目录失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 设置项目路径（用于切换项目）
  ipcMain.handle('set-project-path', (_, projectPath: string) => {
    try {
      ctx.setProjectPath?.(projectPath)
      syncProjectState(projectPath)
      return projectIdentity(projectPath)
    } catch (error) {
      console.error('设置项目路径失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载资产加载来源（core 内含特例兜底：未设项目/文件缺失/坏 JSON 均返回 claude 默认）
  ipcMain.handle('load-asset-root', () => {
    return readAssetRoot(rawRoot())
  })

  // 保存资产加载来源（项目级）
  ipcMain.handle('save-asset-root', (_, assetRoot: string) => {
    try {
      return writeAssetRoot(rawRoot(), assetRoot)
    } catch (error) {
      console.error('保存资产加载来源失败:', error)
      return { success: false, error: String(error) }
    }
  })
}

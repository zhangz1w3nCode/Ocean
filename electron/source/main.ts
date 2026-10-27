// Electron 主进程入口（TS 化，由原 launch.cjs 迁移而来——该 CJS 入口已删除）。
// 编译产物 electron/dist/source/main.js 即 package.json 的 main 字段；
// 网页端 registry.cjs require 同一产物加载（stub 环境自动复用注册链）。
//
// 保留的职责（与原 launch.cjs 一致）：窗口生命周期 + 主进程闭包状态桥
// （getProjectRoot / setProjectPath / mainWindow 推送）+ CJS 文件 require 桥
// （tools/*.cjs 与 server/webServerHost.cjs 不参与 tsc 编译，运行时按 electron 根定位）。
//
// 路径定位（产物 __dirname = electron/dist/source，上两级即 electron 根）——
// 开发态与 asar 打包态同构：electron/ 整目录进 asar（files 含 electron/**），层级一致：
//   preload.dev.cjs          → ../../preload.dev.cjs
//   tools/*.cjs              → ../../tools/*.cjs
//   server/webServerHost.cjs → ../../server/webServerHost.cjs
//   生产前端 index.html      → ../../../dist/index.html（仓库根 dist）
//   开发默认项目根           → ../../../（仓库根）
//   域模块（同层）            → ./desktop/*.js（dist/source/desktop/）

import { app, BrowserWindow } from 'electron'
import * as path from 'node:path'

let mainWindow: BrowserWindow | null = null
let currentProjectPath: string | null = null  // 当前项目路径

const electronRoot = () => path.join(__dirname, '..', '..')

// 获取当前项目路径
const getProjectRoot = (): string => {
  if (currentProjectPath) {
    return currentProjectPath
  }
  // 开发环境默认使用仓库根（产物位置 electron/dist/source 上三级）
  return path.join(__dirname, '..', '..', '..')
}

// 设置项目路径（主进程状态桥：currentProjectPath 更新 + 网页端宿主同步。
// cli-root 写盘与 .workflow-maker 数据迁移在 core/app 的 syncProjectState，
// 由 desktop 壳在 set-project-path / init-project-dir 内紧随本桥调用，顺序与原实现一致）
const setProjectPath = (projectPath: string): void => {
  currentProjectPath = projectPath
  // 网页端按目标项目的通用设置自动启停/跟随
  try { require(path.join(electronRoot(), 'server', 'webServerHost.cjs')).syncProject(projectPath) } catch {}
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(electronRoot(), 'preload.dev.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // 判断是开发环境还是生产环境
  const devServerURL = process.env.VITE_DEV_SERVER_URL

  if (devServerURL) {
    // 开发环境：加载 Vite 开发服务器
    console.log('Loading from dev server:', devServerURL)
    mainWindow.loadURL(devServerURL)

    // 开发环境自动打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的 index.html（仓库根 dist，asar 内与 electron/ 同级）
    const indexPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.html')
    console.log('Loading from production build:', indexPath)
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ===== IPC 通信 =====
// 全部 handler 已迁移：业务域（task/resource/agent/skill/knowledge/node/workflow）与
// 基础设施域（app/llm/agentic）的唯一实现在 electron/core/{domain}/operate.ts（TS），
// IPC 薄壳在 electron/source/desktop/{domain}.ts（编译产物），由下方尾段注册；
// CLI 端与网页端（registry stub）复用同一份 core。

// 主进程 → 渲染进程推送（事件订阅类 channel 的增量推送）。
// 守卫复刻原 agent-loop-event 推送（窗口销毁后不发送）；对 workflow 实例推送而言，
// 迁移前为无守卫的 mainWindow?.webContents?.send，销毁场景从「可能抛错」收紧为不发送。
const sendToRenderer = (channel: string, payload: unknown): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// 自研 agentic 工具工厂桥（原 launch.cjs loadPiCodingAgentTools：懒加载缓存 + CJS require）
let piAgentTools: {
  createReadTool: unknown
  createWriteTool: unknown
  createEditTool: unknown
  createBashTool: unknown
} | null = null
const getAgentTools = async () => {
  if (!piAgentTools) {
    piAgentTools = {
      createReadTool: require(path.join(electronRoot(), 'tools', 'readTool.cjs')),
      createWriteTool: require(path.join(electronRoot(), 'tools', 'writeTool.cjs')),
      createEditTool: require(path.join(electronRoot(), 'tools', 'editTool.cjs')),
      createBashTool: require(path.join(electronRoot(), 'tools', 'bashTool.cjs')),
    }
  }
  return piAgentTools
}

// ==================== 业务域注册（六域，同层 dist/source/desktop/） ====================
require('./desktop/task.js').registerTaskHandlers({ getProjectRoot })
require('./desktop/resource.js').registerResourceHandlers({ getProjectRoot })
require('./desktop/agent.js').registerAgentHandlers({ getProjectRoot })
require('./desktop/skill.js').registerSkillHandlers({ getProjectRoot })
require('./desktop/knowledge.js').registerKnowledgeHandlers({ getProjectRoot, getRawProjectPath: () => currentProjectPath })
require('./desktop/node.js').registerNodeHandlers({ getProjectRoot })
require('./desktop/workflow.js').registerWorkflowHandlers({
  getProjectRoot,
  // 实例 watcher 增量推送：真实 Electron 即 mainWindow.webContents.send；
  // stub（网页端）环境经 pushEmitter → http.cjs SSE（与原内联实现同一推送路径）
  sendToRenderer,
})

// ==================== 基础设施域注册（app / llm / agentic） ====================
require('./desktop/app.js').registerAppHandlers({
  getProjectRoot,
  getRawProjectPath: () => currentProjectPath,
  setProjectPath,
  getWindow: () => mainWindow,
})
require('./desktop/llm.js').registerLlmHandlers({
  getProjectRoot,
  getRawProjectPath: () => currentProjectPath,
})
require('./desktop/setting.js').registerSettingHandlers({
  getProjectRoot,
  getRawProjectPath: () => currentProjectPath,
})
require('./desktop/agentic.js').registerAgenticHandlers({
  getProjectRoot,
  // agent-loop-event 推送（timestamp 附加在壳层，守卫在 sendToRenderer 实现）
  sendToRenderer,
  getAgentTools,
})

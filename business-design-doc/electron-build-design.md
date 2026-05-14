# Electron 打包构建设计文档

> **版本**: 1.1
> **日期**: 2026-05-14
> **状态**: 已完成

---

## 1. 概述

本文档描述 Ocean 桌面应用的 Electron 打包构建设计方案，包括打包配置、平台支持、常见问题处理等。

## 2. 技术栈

- **Electron**: 40.4.0
- **electron-builder**: 26.7.0
- **打包格式**:
  - macOS: DMG (arm64)
  - Windows: NSIS Installer (x64)

## 3. 打包架构

### 3.1 入口文件

生产环境使用统一的 CommonJS 入口文件：

```
electron/
├── launch.cjs        # 主进程入口（开发/生产统一）
└── preload.dev.cjs   # Preload 脚本
```

### 3.2 窗口加载逻辑

```javascript
function createWindow() {
  // ... 窗口配置 ...

  const devServerURL = process.env.VITE_DEV_SERVER_URL

  if (devServerURL) {
    // 开发环境：加载 Vite 开发服务器
    console.log('Loading from dev server:', devServerURL)
    mainWindow.loadURL(devServerURL)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的 index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    console.log('Loading from production build:', indexPath)
    mainWindow.loadFile(indexPath)
  }
}
```

### 3.3 关键注意事项

⚠️ **白屏问题常见原因**:

1. **开发/生产环境判断错误**
   - 只使用 `loadURL` 而没有处理 `loadFile`
   - 环境变量 `VITE_DEV_SERVER_URL` 未正确检测

2. **路径错误**
   - `index.html` 路径计算错误
   - `__dirname` 在打包后的相对位置变化

3. **文件缺失**
   - `dist` 目录未正确复制到打包后的应用
   - `electron-builder` 的 `files` 配置不正确

## 4. 打包配置

### 4.1 package.json 配置

```json
{
  "main": "electron/launch.cjs",
  "build": {
    "appId": "com.ocean.app",
    "productName": "Ocean",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "electron/**/*"
    ],
    "mac": {
      "icon": "build/icon.icns",
      "category": "public.app-category.productivity",
      "target": [
        {
          "target": "dmg",
          "arch": ["arm64"]
        }
      ]
    },
    "dmg": {
      "contents": [
        {
          "x": 130,
          "y": 220
        },
        {
          "x": 410,
          "y": 220,
          "type": "link",
          "path": "/Applications"
        }
      ]
    },
    "win": {
      "icon": "build/icon.ico",
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ]
    }
  }
}
```

### 4.2 平台支持

| 平台 | 架构 | 格式 | 输出路径 |
|------|------|------|----------|
| macOS | arm64 | DMG | `release/Ocean-1.0.0-arm64.dmg` |
| Windows | x64 | NSIS Installer | `release/Ocean Setup 1.0.0.exe` |

## 5. 应用图标配置

### 5.1 图标文件目录

图标资源统一存放在 `build/` 目录下，来源与 gain 项目保持一致：

```
build/
├── icon.icns        # macOS 图标（icns 格式，包含多分辨率）
├── icon.ico         # Windows 图标（ico 格式）
├── icon.png         # 通用 PNG 图标（BrowserWindow 运行时使用）
├── 128x128.png      # 128x128 分辨率
├── 128x128@2x.png   # 128x128 @2x（Retina）
└── 32x32.png        # 32x32 分辨率
```

### 5.2 图标引用方式

**electron-builder 打包配置**（`package.json` 的 `build` 字段）：

```json
{
  "mac": {
    "icon": "build/icon.icns"
  },
  "win": {
    "icon": "build/icon.ico"
  }
}
```

**BrowserWindow 运行时图标**（`electron/launch.cjs`）：

```javascript
mainWindow = new BrowserWindow({
  icon: path.join(__dirname, '..', 'build', 'icon.png'),
  // ... 其他配置
})
```

### 5.3 图标格式说明

| 平台 | 格式 | 路径 | 用途 |
|------|------|------|------|
| macOS | `.icns` | `build/icon.icns` | DMG 安装包、Dock 图标、Finder 图标 |
| Windows | `.ico` | `build/icon.ico` | NSIS 安装包、任务栏图标、桌面快捷方式 |
| 运行时 | `.png` | `build/icon.png` | BrowserWindow 窗口图标 |

## 6. 构建流程

### 6.1 本地开发

```bash
# 启动开发服务器 + Electron
pnpm electron:dev
```

### 6.2 生产构建

```bash
# 构建前端资源
pnpm build

# 打包 Electron 应用
pnpm electron:build
```

### 6.3 打包输出结构

```
release/
├── build/
│   └── builder-effective-config.yaml
├── mac-arm64/
│   └── Ocean.app/
├── Ocean-1.0.0-arm64.dmg      # macOS 安装包
└── Ocean Setup 1.0.0.exe       # Windows 安装包
```

## 7. 调试技巧

### 7.1 生产环境调试

在 `launch.cjs` 中临时启用 DevTools：

```javascript
// 生产环境也打开 DevTools（临时调试）
if (!devServerURL) {
  mainWindow.loadFile(indexPath)
  mainWindow.webContents.openDevTools()  // 临时启用
}
```

### 7.2 日志检查

查看 Electron 控制台输出的路径信息：

```
Loading from production build: /Applications/Ocean.app/Contents/Resources/app/dist/index.html
```

### 7.3 打包内容检查

验证 `app.asar` 内容：

```bash
# macOS
npx asar list /Applications/Ocean.app/Contents/Resources/app.asar

# 查找 index.html
npx asar list /Applications/Ocean.app/Contents/Resources/app.asar | grep index.html
```

## 8. 常见问题

### 8.1 白屏（仅显示窗口控制按钮）

**症状**: 应用启动后只有红黄绿按钮，页面内容空白

**原因**: `createWindow` 只处理了 `loadURL`，没有处理生产环境的 `loadFile`

**解决**: 参考本文档第 3.2 节的窗口加载逻辑

### 8.2 文件找不到

**症状**: 控制台报错 `Error: ENOENT: no such file or directory`

**原因**: `files` 配置未正确包含 `dist` 目录

**解决**: 确保 `package.json` 中 `build.files` 包含 `"dist/**/*"`

### 8.3 编码错误

**症状**: 页面显示乱码或 JavaScript 执行错误

**原因**: ES 模块和 CommonJS 混用问题

**解决**: 统一使用 CommonJS 格式（`.cjs`）作为主进程入口

## 9. 相关文件

| 文件 | 说明 |
|------|------|
| `electron/launch.cjs` | 主进程入口，包含窗口创建和业务逻辑 |
| `electron/preload.dev.cjs` | Preload 脚本，暴露 IPC API |
| `package.json` | electron-builder 配置 |
| `vite.config.ts` | Vite 构建配置 |
| `build/icon.icns` | macOS 应用图标 |
| `build/icon.ico` | Windows 应用图标 |
| `build/icon.png` | BrowserWindow 运行时图标 |

## 10. 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-03-19 | 初始文档，包含白屏修复方案和跨平台配置 |
| 1.1 | 2026-05-14 | 新增应用图标配置章节，macOS/Windows/BrowserWindow 图标引用，构建版本 v1.0.7 |

---

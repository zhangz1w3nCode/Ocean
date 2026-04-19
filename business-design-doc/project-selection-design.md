# 项目选择功能设计文档

## 功能概述

应用启动后先显示项目选择页面，选择项目后再进入主界面。支持记住上次打开的项目，下次自动进入。

## 核心需求

1. 启动后显示项目选择页面
2. 显示"最近打开的项目列表" + "浏览文件系统选择文件夹"
3. 项目本质是一个文件夹
4. 数据保存在项目的 `.claude/` 目录下
5. 记住上次打开的项目，下次自动进入
6. 数据迁移：自动将 `.workflow-maker/` 重命名为 `.claude/`

---

## 启动流程

```
应用启动 -> loadAppConfig()
                    |
          lastProjectPath 存在?
           /              \
         是                否
          |                |
          v                v
   自动打开项目      项目选择页面
          |
          v
       主界面
```

---

## 数据结构设计

### Project 类型

```typescript
export interface Project {
  id: string                    // 唯一标识（路径 hash）
  name: string                  // 项目名称（文件夹名）
  path: string                  // 项目绝对路径
  lastOpenedAt: string          // 最后打开时间
}
```

### AppConfig 类型

```typescript
export interface AppConfig {
  recentProjects: Project[]     // 最近打开的项目列表
  lastProjectPath: string | null  // 上次打开的项目路径
  maxRecentProjects: number     // 最大最近项目数（默认10）
}
```

### 存储位置

- **应用配置**：存储在用户目录的 `flow-editor-config.json`
  - macOS: `~/Library/Application Support/flow-editor/flow-editor-config.json`
  - Windows: `%APPDATA%/flow-editor/flow-editor-config.json`

- **项目数据**：存储在项目文件夹的 `.claude/` 目录下
  ```
  项目文件夹/
  └── .claude/
      ├── workflows/     # 工作流文件
      ├── nodes/         # 节点文件
      ├── resources/     # 资源文件
      ├── agents/        # 工具文件
      └── commands/      # 命令文件
  ```

---

## IPC 通信设计

### 新增 IPC 通道

| 通道名 | 说明 | 参数 | 返回值 |
|-------|------|-----|--------|
| `open-folder-dialog` | 打开文件夹选择对话框 | 无 | `{ success: boolean, path: string \| null }` |
| `load-app-config` | 加载应用配置 | 无 | `{ success: boolean, config: AppConfig }` |
| `save-app-config` | 保存应用配置 | `config: AppConfig` | `{ success: boolean }` |
| `init-project-dir` | 初始化项目目录 | `projectPath: string` | `{ success: boolean, projectId?: string, projectName?: string }` |
| `set-project-path` | 设置当前项目路径 | `projectPath: string` | `{ success: boolean, projectId?: string, projectName?: string }` |

### 主进程关键实现

```typescript
// 当前项目路径（动态）
let currentProjectPath: string | null = null

// 数据迁移
const migrateDataDir = (projectPath: string) => {
  const oldDir = path.join(projectPath, '.workflow-maker')
  const newDir = path.join(projectPath, '.claude')

  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir)
  }
}

// 获取数据目录时使用当前项目路径
const getWorkflowsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'workflows')
  // ...
}
```

---

## 状态管理设计

### projectStore.ts

```typescript
interface ProjectState {
  // 状态
  isProjectLoaded: boolean      // 是否已选择项目
  currentProject: Project | null  // 当前项目
  recentProjects: Project[]     // 最近项目列表
  isLoading: boolean            // 加载状态
  loadingMessage: string        // 加载提示文字

  // 方法
  loadAppConfigOnStart: () => Promise<boolean>  // 启动时加载配置
  selectProject: (project: Project) => Promise<void>  // 选择项目
  openProjectFromFolder: () => Promise<Project | null>  // 从文件夹打开
  removeRecentProject: (projectId: string) => Promise<void>  // 移除最近项目
  setCurrentProject: (project: Project | null) => void  // 设置当前项目
}
```

### appStore.ts 扩展

```typescript
// 新增页面类型
export type PageType = 'project' | 'tools' | 'workflows' | 'nodes' | 'resources' | 'commands'

// 新增状态
isSwitchingProject: boolean
startSwitchingProject: () => void
finishSwitchingProject: () => void
```

---

## UI 组件设计

### ProjectSelectionPage.tsx

**页面结构**：
```
- Logo 和标题（居中）
  - 简约现代海洋风格 Logo
  - 产品名称 "Ocean"（使用项目默认Inter字体）
- 打开文件夹按钮
- 最近项目列表（卡片形式）
  - 无项目时不显示空状态提示
```

**设计规范**（遵循项目整体风格）：
- 背景：`#F5F5F7` (bg-macos-bg)
- 卡片：白色，圆角 `rounded-2xl`
- 边框：`#E5E7EB` (border-gray-200)
- 按钮：灰色主题 `bg-[#E5E7EB]`
- 不使用蓝色主题
- Logo：深色背景 `#1f2937`，圆角 `rounded-2xl` (16px)
- 字体：使用项目默认的 Inter 字体，不使用 font-mono

**Logo 悬浮效果**：
```tsx
// Logo 悬浮时上浮 + 阴影增强
className="... cursor-pointer"
style={{
  transition: 'transform 0.2s, box-shadow 0.2s',
}}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = 'translateY(-2px)'
  e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5)'
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)'
}}
```

**注意**：SVG 元素需添加 `pointer-events-none` 避免事件穿透问题。

**卡片悬浮效果**：
```tsx
// 即时响应的悬浮效果
onMouseEnter={(e) => {
  e.currentTarget.style.transform = 'translateY(-2px)'
  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = 'none'
}}

// 过渡动画
style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
```

**"打开文件夹"按钮悬浮效果**：
```tsx
// 与项目卡片保持一致的悬浮效果
style={{
  transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s'
}}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = 'translateY(-2px)'
  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
  e.currentTarget.style.backgroundColor = '#D1D5DB' // 变深
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = 'none'
  e.currentTarget.style.backgroundColor = '#E5E7EB' // 恢复
}}
```

**交互细节**：
- 点击"打开文件夹"按钮 -> 直接弹出系统对话框（无加载遮罩）
- 用户选择文件夹并确认后 -> 显示"初始化项目..."加载遮罩
- 项目卡片悬浮时显示移除按钮
- 项目卡片悬浮时上浮 2px + 阴影发光
- "打开文件夹"按钮悬浮时上浮 2px + 阴影发光 + 背景色变深（与卡片保持一致的交互体验）
- 无最近项目时不显示任何空状态提示

### Sidebar.tsx 设计

**结构**：
```
- Logo区域（固定显示产品名称 "Ocean"）
- 导航菜单（工具、命令、工作流、节点、资源文件）
- 底部区域（切换项目按钮）
```

**设计规范**：
- Logo：深色背景 `#1f2937`，圆角 `rounded-lg` (8px)，像素风格 OCEAN 图标
- 底部区域：无顶部分割线，简洁风格
- 切换项目按钮：样式与导航菜单项一致（text-sm font-medium）
- 不显示用户中心
- 字体：使用项目默认的 Inter 字体

**Logo 悬浮效果**：
```tsx
// 与项目选择页 Logo 保持一致的悬浮效果
className="... cursor-pointer"
style={{
  transition: 'transform 0.2s, box-shadow 0.2s',
}}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = 'translateY(-2px)'
  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)'
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4)'
}}
```

**交互**：
- 点击"切换项目"按钮 -> 返回项目选择页面

---

## 数据迁移

启动时自动检测：
- 如果存在 `.workflow-maker/` 且不存在 `.claude/`
- 自动重命名为 `.claude/`

```typescript
const migrateDataDir = (projectPath: string) => {
  const oldDir = path.join(projectPath, '.workflow-maker')
  const newDir = path.join(projectPath, '.claude')

  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir)
    console.log('数据迁移成功:', oldDir, '->', newDir)
  }
}
```

---

## 文件修改清单

### 新增文件

| 文件 | 说明 |
|-----|------|
| `src/stores/projectStore.ts` | 项目状态管理 |
| `src/pages/ProjectSelectionPage.tsx` | 项目选择页面 |

### 修改文件

| 文件 | 修改内容 |
|-----|---------|
| `electron/main.ts` | 新增项目 IPC，修改数据目录逻辑 |
| `electron/launch.cjs` | 同 main.ts（开发环境） |
| `electron/preload.ts` | 新增项目 API |
| `electron/preload.dev.cjs` | 同 preload.ts（开发环境） |
| `src/App.tsx` | 添加项目选择流程 |
| `src/stores/appStore.ts` | 新增 project 页面类型和切换项目功能 |
| `src/components/layout/Sidebar.tsx` | 显示当前项目名称，添加切换项目按钮 |
| `src/components/layout/MainContent.tsx` | 添加 project 页面类型处理 |
| `src/utils/storage.ts` | 新增应用配置方法 |
| `src/types/index.ts` | 新增 Project 和 AppConfig 类型 |

---

## 验证方案

1. **启动测试**：启动应用，确认显示项目选择页面
2. **选择项目**：点击"打开文件夹"，选择一个目录，确认进入主界面
3. **最近项目**：确认最近打开的项目出现在列表中
4. **自动打开**：关闭应用后重新打开，确认自动进入上次的项目
5. **数据存储**：在工作流、节点等创建数据后，确认保存在 `.claude/` 目录
6. **数据迁移**：在旧项目（含 `.workflow-maker/`）中打开，确认自动迁移到 `.claude/`
7. **切换项目**：点击侧边栏"切换项目"按钮，确认返回项目选择页面

---

## ProjectCard 卡片设计 - 2025-02-25 重新设计

### 整体布局

```
┌─────────────────────────────────────┐
│  [📁] 项目名称               [🗑]    │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 项目路径预览...             │   │  <- 内容预览区 (bg-gray-50)
│  │ /Users/xxx/project          │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### 设计规范

```tsx
<motion.button
  className="relative w-full bg-white rounded-2xl border border-gray-200 text-left group overflow-hidden"
>
  {/* 头部区域 */}
  <div className="px-4 pb-0 pt-4">
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        {/* FolderOpen 图标 */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
          <FolderOpen size={18} className="text-gray-600" strokeWidth={1.5} />
        </div>
        {/* 名称 */}
        <h3 className="font-bold text-[17px] text-gray-900">
          {project.name}
        </h3>
      </div>

      {/* 操作按钮区 */}
      <div className="flex items-center gap-1">
        <button className="opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>

  {/* 内容预览区 - 浅灰色背景 */}
  <div className="mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
      {project.path}
    </p>
  </div>
</motion.button>
```

### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | 圆角 `rounded-2xl` | 与其他卡片保持一致 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| FolderOpen 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色 |
| 操作按钮 | 右上角，悬浮显示 | 移除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 显示完整项目路径 |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字 |

### 与旧版设计的差异

| 特性 | 旧版设计 | 新版设计 |
|------|----------|----------|
| 图标 | 渐变背景大图标 | 统一灰色 FolderOpen 图标 |
| 名称字体 | 16px medium | 17px bold |
| 项目路径 | 显示完整路径 | 显示完整路径（灰色背景预览区） |
| 最后打开时间 | 显示 Clock 图标 + 时间 | 移除 |
| 移除按钮 | X 图标，圆形背景 | Trash2 图标，悬浮显示 |
| 整体布局 | 多行信息布局 | 图标 + 名称 + 预览区布局 |

---

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.2 | 2025-02-25 | 重新设计 ProjectCard 卡片布局：采用与 AgentCard 一致的简约灰白色调，移除最后打开时间显示，改为 FolderOpen 图标 + 路径预览区设计 |
| 1.1 | 2025-02-18 | 优化：移除副标题、底部提示、空状态提示，项目卡片 Logo 改为灰色系 |
| 1.0 | 2025-02-17 | 初始版本，项目选择功能 |
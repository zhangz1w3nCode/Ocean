<div align="center">

# Ocean

**CLI Agent 资产和能力可视化管理平台**

一款基于 Electron + React + TypeScript 构建的桌面应用，以 Markdown 文件为核心数据载体，为 CLI Agent（如 Claude Code）提供智能体、命令、能力、知识库、工作流等资产的统一管理与可视化编排能力。

</div>

---

## 核心特性

- **本地优先** - 所有数据以 Markdown 文件形式存储在本地 `.claude/` 目录，完全掌控数据
- **可视化编辑** - 使用 `@xyflow/react` 提供专业的流程图编辑能力，支持拖拽、连线、撤销重做
- **知识图谱** - 基于 WikiLink 引用关系构建知识图谱，支持力导向布局可视化
- **多维引用** - 支持 `@引用` 和 `[[WikiLink]]` 两种引用语法，建立业务实体间的关联
- **Markdown 优先** - 所有业务数据以 `.md` 文件存储，易于版本控制和人机协作
- **双环境支持** - Electron 桌面应用 + 浏览器预览，灵活适配不同场景

---

## 业务模块

Ocean 包含七大核心业务模块，每个模块的数据以 Markdown 文件形式独立存储：

| 模块 | 存储目录 | 文件类型 | 描述 |
|------|----------|----------|------|
| **智能体** | `.claude/agents/` | `sub-agent`, `mcp` | AI 智能体配置与角色定义 |
| **命令** | `.claude/commands/` | `command` | 可执行命令与斜杠指令 |
| **能力** | `.claude/abilities/` | `ability` | AI 能力单元定义 |
| **知识** | `.claude/knowledges/` | `knowledge` | 业务知识库管理 |
| **工作流** | `.claude/workflows/` | `workflow` | 可视化流程定义与编排 |
| **节点** | `.claude/nodes/` | `business`, `process`, `decision` | 工作流节点模板 |
| **资源文件** | `.claude/resources/` | `rule`, `reference`, `tool` | 规则说明、参考文档、工具说明 |

### 工作流节点类型

流程编辑器支持五种节点类型：

| 节点类型 | 图标颜色 | 功能描述 |
|----------|----------|----------|
| 开始节点 | 绿色 | 工作流入口点 |
| 处理节点 | 蓝色 | 通用处理步骤，支持在线编辑任务 |
| 判断节点 | 黄色 | 条件分支，支持自定义分支配置 |
| 业务节点 | 紫色 | 引用节点模板，承载复杂业务逻辑 |
| 结束节点 | 红色 | 工作流出口点 |

---

## 技术栈

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 前端框架 | React | 19.2.4 |
| 构建工具 | Vite | 5.4.21 |
| 语言 | TypeScript | 5.9.3 |
| 状态管理 | Zustand | 5.0.11 |
| 流程图引擎 | @xyflow/react | 12.10.0 |
| 桌面框架 | Electron | 40.4.0 |
| 样式 | Tailwind CSS | 3.4.19 |
| 动画 | framer-motion | 12.34.0 |
| 图标 | lucide-react | 0.563.0 |
| Markdown 渲染 | react-markdown + remark-gfm | 10.1.0 |
| 代码编辑器 | @uiw/react-codemirror | 4.25.4 |
| 知识图谱 | react-force-graph-2d + d3-force | 1.29.1 |
| 图表渲染 | mermaid | 11.12.3 |

---

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发模式

#### 方式一：Electron 桌面端调试（推荐）

同时启动 Vite 开发服务器和 Electron 应用，支持热更新：

```bash
pnpm electron:dev
```

该命令会：
1. 启动 Vite 开发服务器（默认端口 5173）
2. 等待 Vite 服务就绪后自动启动 Electron
3. 自动打开 DevTools 调试工具

#### 方式二：仅启动 Web 开发服务器

```bash
pnpm dev
```

然后在浏览器中访问 `http://localhost:5173`

#### 方式三：预览已构建的 Electron 应用

```bash
# 先构建前端
pnpm build

# 再启动 Electron 预览
pnpm electron:preview
```

### 构建打包

```bash
# 构建前端资源
pnpm build

# 构建 Electron 主进程
pnpm build:electron

# 打包桌面应用（输出到 release/ 目录）
pnpm electron:build
```

---

## 项目结构

```
ocean/
├── electron/                   # Electron 主进程
│   ├── main.ts                # 主进程入口（ESM）
│   ├── launch.cjs             # 开发环境启动脚本（CommonJS）
│   ├── preload.ts             # 生产环境 Preload 脚本
│   └── preload.dev.cjs        # 开发环境 Preload 脚本
├── src/
│   ├── components/
│   │   ├── ability/           # 能力模块组件
│   │   ├── agent/             # 智能体模块组件
│   │   ├── command/           # 命令模块组件
│   │   ├── flow/              # 流程编辑器组件
│   │   │   ├── FlowCanvas.tsx
│   │   │   ├── FlowToolbar.tsx
│   │   │   ├── NodePanel.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   └── nodes/         # 节点组件
│   │   ├── knowledge/         # 知识模块组件
│   │   │   ├── KnowledgeCard.tsx
│   │   │   ├── KnowledgeDetailModal.tsx
│   │   │   ├── KnowledgeGraph.tsx
│   │   │   └── KnowledgeModal.tsx
│   │   ├── layout/            # 布局组件
│   │   │   ├── Sidebar.tsx    # 侧边栏（支持拖拽排序）
│   │   │   └── MainContent.tsx
│   │   ├── node/              # 节点管理组件
│   │   ├── resource/          # 资源文件组件
│   │   ├── ui/                # 通用 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── MarkdownEditor/    # Markdown 编辑器
│   │   │   └── MarkdownRenderer/  # Markdown 渲染器
│   │   │       ├── WikiLink.tsx
│   │   │       └── MermaidBlock.tsx
│   │   └── workflow/          # 工作流组件
│   ├── pages/                 # 页面组件
│   │   ├── ProjectSelectionPage.tsx
│   │   ├── AgentsPage.tsx
│   │   ├── CommandsPage.tsx
│   │   ├── AbilitiesPage.tsx
│   │   ├── KnowledgesPage.tsx
│   │   ├── WorkflowsPage.tsx
│   │   ├── NodesPage.tsx
│   │   └── ResourcesPage.tsx
│   ├── stores/                # Zustand 状态管理
│   │   ├── appStore.ts
│   │   ├── projectStore.ts
│   │   ├── workflowStore.ts
│   │   ├── flowEditorStore.ts
│   │   ├── agentStore.ts
│   │   ├── commandStore.ts
│   │   ├── abilityStore.ts
│   │   ├── knowledgeStore.ts
│   │   ├── nodeStore.ts
│   │   ├── resourceStore.ts
│   │   └── toastStore.ts
│   ├── types/                 # TypeScript 类型定义
│   │   ├── index.ts
│   │   └── flow.ts
│   ├── utils/                 # 工具函数
│   │   ├── storage.ts         # 存储层
│   │   └── knowledgeGraphParser.ts
│   └── hooks/                 # React Hooks
│       ├── useKnowledgeGraph.ts
│       └── useReferenceItems.ts
├── dist/                      # Web 构建输出
├── dist-electron/             # Electron 构建输出
└── release/                   # 打包后的应用程序
```

---

## 数据存储

### 存储目录

所有业务数据以 Markdown 文件形式存储在项目根目录的 `.claude/` 隐藏目录中：

```
项目根目录/
└── .claude/
    ├── agents/        # 智能体文件 (*.md)
    ├── commands/      # 命令文件 (*.md)
    ├── abilities/     # 能力文件 (*.md)
    ├── knowledges/    # 知识库文件 (*.md)
    ├── workflows/     # 工作流文件 (*.md)
    ├── nodes/         # 节点定义文件 (*.md)
    └── resources/     # 资源文件 (*.md)
```

### Markdown 格式规范

所有业务实体使用 YAML Frontmatter 存储元数据：

```markdown
---
name: 示例智能体
description: 这是一个AI智能体
model: haiku
color: blue
---

# 智能体内容

这里是智能体的详细说明...
```

### 工作流 Markdown 输出示例

```markdown
---
type: workflow
id: wf-xxx
name: 示例工作流
flowData: '{"nodes": [...], "edges": [...]}'
---

# 示例工作流

## 描述
- 这是一个示例工作流

## 输入物料
- 输入1
- 输入2

## 流程

### 第一阶段：开始
- 工作流开始执行

### 第二阶段：业务处理
- 强制读取 `nodes/业务节点.md` 完成该阶段的任务

#### 情况一：条件成立
- 执行 `nodes/处理节点.md` 完成该阶段的任务

### 第三阶段：结束
- 工作流执行完毕
```

---

## 核心功能

### 引用功能

支持两种引用语法：

#### @ 引用

在编辑器中输入 `@` 符号触发引用选择弹窗，支持引用各业务模块的实体：

```
@智能体名 → `.claude/agents/智能体名.md`
@节点名 → `.claude/nodes/节点名.md`
```

#### WikiLink

支持 Obsidian 风格的 WikiLink 语法：

```
[[xxx.md|关系]]     # 带关系名称的链接
[[xxx.md]]          # 普通链接，默认关系为"关联"
```

不同业务类型自动识别颜色：
- `/agents/` - 紫色（智能体）
- `/nodes/` - 蓝色（节点）
- `/workflows/` - 红色（工作流）
- `/commands/` - 紫色（命令）
- `/resources/` - 绿色（资源）
- `/abilities/` - 黄色（能力）
- `/knowledges/` - 蓝色（知识）

### 知识图谱

基于 WikiLink 引用关系构建知识图谱，特性包括：

- **力导向布局** - 节点互斥力、向心力、连线吸引力可调节
- **双向引用合并** - 自动合并双向引用关系，避免标签重叠
- **交互功能** - 悬浮高亮、拖拽节点、点击跳转详情
- **可配置参数** - 节点大小、连线长度、标签大小等

### 流程编辑器快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Z | 撤销 |
| Ctrl+Y / Ctrl+Shift+Z | 重做 |
| Ctrl+C | 复制选中节点 |
| Ctrl+V | 粘贴节点 |
| Delete / Backspace | 删除选中项 |
| Ctrl+点击 | 多选节点 |
| Shift+拖拽 | 框选节点 |

---

## 开发指南

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                      前端层 (React)                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐ │
│  │  页面   │ │ 组件库  │ │ 状态管理 │ │   流程编辑器     │ │
│  │ Pages   │ │Components│ │ Stores  │ │  Flow Editor    │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                      存储层 (Storage)                     │
│         localStorage (浏览器) / Node FS (Electron)        │
├─────────────────────────────────────────────────────────┤
│                      IPC 通信层                           │
│         window.electronAPI / Preload Script              │
├─────────────────────────────────────────────────────────┤
│                      Electron 主进程                      │
│         文件系统操作 + 对话框 + 配置管理                   │
└─────────────────────────────────────────────────────────┘
```

### 状态管理

使用 Zustand 进行状态管理，各 Store 职责：

| Store | 用途 | 关键状态 |
|-------|------|----------|
| `appStore` | 应用路由 | `currentPage`, `sidebarNavOrder` |
| `projectStore` | 项目管理 | `currentProject`, `recentProjects` |
| `workflowStore` | 工作流列表 | `workflows`, CRUD 操作 |
| `flowEditorStore` | 流程编辑器 | `nodes`, `edges`, `history` |
| `agentStore` | 智能体 | `agents`, CRUD 操作 |
| `commandStore` | 命令 | `commands`, CRUD 操作 |
| `abilityStore` | 能力 | `abilities`, CRUD 操作 |
| `knowledgeStore` | 知识库 | `knowledges`, CRUD 操作 |
| `nodeStore` | 节点定义 | `nodeDefinitions`, CRUD 操作 |
| `resourceStore` | 资源 | `resources`, CRUD 操作 |

### Electron IPC 通道

主进程定义的 IPC API：

**文件操作**

| 通道 | 说明 |
|------|------|
| `save-workflow-file` / `load-workflow-file` | 工作流文件 |
| `save-node-file` / `load-node-file` | 节点文件 |
| `save-resource-file` / `load-resource-file` | 资源文件 |
| `save-agent-file` / `load-agent-file` | 智能体文件 |
| `save-command-file` / `load-command-file` | 命令文件 |
| `save-ability-file` / `load-ability-file` | 能力文件 |
| `save-knowledge-file` / `load-knowledge-file` | 知识库文件 |

**项目管理**

| 通道 | 说明 |
|------|------|
| `open-folder-dialog` | 打开文件夹选择对话框 |
| `init-project-dir` | 初始化项目目录结构 |
| `set-project-path` | 切换项目 |
| `load-app-config` / `save-app-config` | 应用配置管理 |

---

## 常见问题

### Electron 安装失败

如果 Electron 安装失败，可以使用国内镜像：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
pnpm install
```

### 端口被占用

如果默认端口 5173 被占用，Vite 会自动尝试下一个可用端口。

### DevTools 调试

在 Electron 应用中：
- 快捷键：`Cmd + Option + I`（macOS）
- 菜单：View → Toggle Developer Tools

---

## 设计规范

详细的设计规范文档位于项目根目录的 `business-design-doc/` 目录：

- `agent-design.md` - 智能体模块设计
- `command-design.md` - 命令模块设计
- `ability-design.md` - 能力模块设计
- `knowledge-design.md` - 知识模块设计
- `workflow-design.md` - 工作流编辑器设计
- `node-design.md` - 节点模块设计
- `resources-design.md` - 资源文件模块设计
- `project-selection-design.md` - 项目选择功能设计
- `reference-feature-design.md` - 引用功能设计
- `knowledge-graph-design.md` - 知识图谱设计
- `ui-components-design.md` - UI 组件设计

---

## License
- ISC
<div align="center">

# Ocean

**Claude Code 资产与能力可视化管理平台**

基于 `Electron` + `React` + `TypeScript` 构建的桌面应用，以 Markdown 文件为核心数据载体，完全本地存储，专为 Claude Code 打造，提供智能体、命令、能力、技能、知识库、工作流等资产的统一管理与可视化编排。

[English](./README.md) | [中文](./README_CN.md)

</div>

---

## 为什么需要 Ocean

Claude Code 是一个强大的 AI 编码智能体，但其资产管理（智能体、命令、能力、技能、知识、工作流）分散在各个目录和文本文件中。Ocean 是专为 Claude Code 打造的统一可视化管理平台，将这些分散的 Markdown 文件转化为一个连贯、可管理的系统。

- **引用而非复制** -- 资产之间通过 `@` 引用和 `%` WikiLink 建立关联，而非复制内容。单一数据源意味着修改一个能力或知识条目后，所有引用处自动同步，无需重复维护多份副本。
- **知识图谱化** -- 每条知识以独立 Markdown 文件存储，通过带关系标签的 WikiLink 互联。整个知识网络渲染为可交互的力导向图谱，点击节点即可查看详情，还可调节向心力、节点距离等物理参数。
- **零数据锁定** -- 所有数据以标准 Markdown 文件存储在 `.claude/` 目录中。你可以用任何文本编辑器直接编辑，也可以使用 Ocean 的可视化界面管理。
- **完全本地** -- 没有云服务、没有账号注册、没有数据上传。你的资产始终在你的机器上。
- **可视化编排** -- 在画布上拖拽和连接节点来组合复杂工作流。每个节点可交互 -- 点击配置属性，拖动调整位置，分支创建决策路径。可视化操作让多步骤工作流变得直观可触。

## 功能特性

### 资产管理

Ocean 管理 8 种 Claude Code 资产，每种资产均支持完整的增删改查、Markdown 预览和引用链接：

| 模块 | 存储位置 | 说明 |
|------|---------|------|
| 智能体 (Agents) | `.claude/agents/` | 定义 AI 智能体配置，支持模型选择、角色指令、图标自定义 |
| 命令 (Commands) | `.claude/commands/` | 创建可复用的斜杠命令，支持 Frontmatter 元数据 |
| 能力 (Abilities) | `.claude/abilities/` | 定义最小能力单元，可被其他资产引用 |
| 技能 (Skills) | `.claude/skills/` | 以目录结构打包复杂技能，包含脚本、参考文档和示例 |
| 知识库 (Knowledge) | `.claude/knowledges/` | 管理业务知识，支持标签、分类、WikiLink 引用和可视化知识图谱 |
| 节点 (Nodes) | `.claude/nodes/` | 定义可复用的工作流构建块 |
| 资源 (Resources) | `.claude/resources/` | 管理参考资源文件 |
| 工作流 (Workflows) | `.claude/workflows/` | 设计和管理工作流定义 |

### 可视化工作流编辑器

通过直接的可视化操作构建复杂的多步骤工作流，而非手动编辑配置文件。

- 基于 React Flow 构建的拖拽式流程编辑器
- 6 种节点类型：开始、结束、处理、判断、业务、局部
- 点击任意节点打开属性面板进行内联编辑
- 拖动调整节点位置，绘制连线定义执行路径
- 判断节点支持分支管理，动态生成输出端口
- 基于 Dagre 算法的自动布局
- 网格吸附、多选、复制粘贴、右键菜单
- 生成结构化 WORKFLOW.md 文档，包含 Mermaid 流程图和分步执行路径

### 知识图谱

每条知识以独立 Markdown 文件存储，通过带关系标签的 WikiLink（`[[file.md|关系]]`）相互关联，整个知识网络以力导向图谱的形式可视化呈现。

- 基于 D3-force 的力导向图可视化
- WikiLink 语法支持关系标签（如 `[[架构设计.md|依赖]]`）
- 点击图谱中任意节点直接打开详情查看
- 基于引用次数的动态节点大小 -- 被引用越多的条目越醒目
- 悬浮高亮交互，平滑淡入淡出动画
- 可配置物理参数：向心力、节点连线距离、速度衰减等
- 连线上的关系标签支持显示/隐藏切换
- 节点颜色根据出入度区分，一眼识别知识枢纽和叶子节点

### AI 驱动的内容创建

通过 LLM 集成提供多种创建模式：

- **手动创建** -- 直接编写内容
- **LLM 创建** -- 使用 AI 生成内容，支持自定义提示词模板
- **Agentic 创建** -- AI 自主使用工具和文件系统访问能力创建内容
- **Claude Code CLI** -- 直接调用 Claude Code 生成内容

其他 AI 功能：
- 内容优化，支持 git diff 风格的可视化对比
- 通过 pi-mono SDK 支持 20+ LLM 服务商
- 可配置的模型参数（temperature、max_tokens 等）

### 跨资产引用系统

Ocean 采用引用架构而非复制内容的方式组织资产间的关系：

- **`@` 引用** -- 在 Markdown 编辑器中输入 `@` 即可引用任意资产（智能体、命令、能力、技能、知识条目、资源、节点）。引用以文件路径的形式存储，而非复制内容。当源资产更新时，所有引用处自动同步。
- **`%` WikiLink** -- 输入 `%` 插入 WikiLink（`[[file.md|关系]]`），在知识条目之间建立双向链接。这些关系会在知识图谱中可视化展示。

这意味着每份内容只存在于一个位置。修改源文件后自动反映到所有引用处 -- 不会出现版本漂移，不会有陈旧的副本。对一个共享资产的每次改进，都会在整个系统中产生复利效应：引用越多，收益越大。

### Markdown 编辑器与渲染

- 基于 CodeMirror 6 的 Markdown 编辑器，支持语法高亮
- GitHub Flavored Markdown 渲染（表格、删除线、任务列表）
- Mermaid 图表渲染
- 代码块语法高亮（highlight.js）
- 通过 rehype-raw 支持内嵌 HTML

## 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 19.2 |
| 语言 | TypeScript | 5.9 |
| 构建工具 | Vite | 5.4 |
| 桌面端 | Electron | 40.4 |
| 样式 | Tailwind CSS | 3.4 |
| 动画 | Framer Motion | 12.34 |
| 图标 | Lucide React | 0.563 |
| 状态管理 | Zustand | 5.0 |
| 流程编辑器 | @xyflow/react (React Flow) | 12.10 |
| 自动布局 | Dagre | 2.0 |
| 力导向图 | D3-force + react-force-graph-2d | 3.0 / 1.29 |
| 代码编辑器 | CodeMirror 6 (@uiw/react-codemirror) | 4.25 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight | 10.1 |
| 图表 | Mermaid | 11.12 |
| 拖拽排序 | @dnd-kit | 6.3 |
| AI/LLM | pi-mono SDK (pi-agent-core, pi-ai, pi-coding-agent) | 0.57 |
| 包管理器 | pnpm | 10.19 |

## 快速开始

### 环境要求

- **Node.js** >= 18
- **pnpm** >= 8（推荐 10.19+）

### 安装

```bash
# 克隆仓库
git clone https://github.com/zhangz1w3nCode/ocean.git
cd ocean

# 安装依赖
pnpm install
```

### 开发

```bash
# 启动 Vite 开发服务器（Web 模式）
pnpm dev

# 启动 Electron 开发模式
pnpm electron:dev
```

Web 开发服务器启动地址为 `http://localhost:5173`。Electron 开发模式会启动桌面应用并支持热重载。

### 构建

```bash
# 构建 Web 产物
pnpm build

# 构建并打包 Electron 应用
pnpm electron:build
```

构建产物：
- **Web**: `dist/`
- **macOS**: `release/`（Apple Silicon arm64 的 DMG 安装包）
- **Windows**: `release/`（x64 的 NSIS 安装包）

## 项目结构

```
ocean/
├── electron/                    # Electron 主进程
│   ├── launch.cjs               # 主进程入口（IPC 处理、文件系统操作）
│   └── preload.dev.cjs          # 预加载脚本（暴露 electronAPI）
├── src/
│   ├── main.tsx                 # 应用入口
│   ├── App.tsx                  # 根组件（路由、布局）
│   ├── pages/                   # 页面组件
│   │   ├── ProjectSelectionPage.tsx
│   │   ├── AgentsPage.tsx
│   │   ├── CommandsPage.tsx
│   │   ├── AbilitiesPage.tsx
│   │   ├── SkillsPage.tsx
│   │   ├── KnowledgesPage.tsx
│   │   ├── NodesPage.tsx
│   │   ├── ResourcesPage.tsx
│   │   ├── WorkflowsPage.tsx
│   │   ├── FlowEditorPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── LLMSettings.tsx
│   ├── components/              # UI 组件
│   │   ├── ability/             # 能力模块组件
│   │   ├── agent/               # 智能体模块组件
│   │   ├── command/             # 命令模块组件
│   │   ├── flow/                # 流程编辑器组件及节点类型
│   │   ├── knowledge/           # 知识模块及图谱组件
│   │   ├── layout/              # 布局组件（Sidebar, MainContent）
│   │   ├── node/                # 节点模块组件
│   │   ├── resource/            # 资源模块组件
│   │   ├── settings/            # 设置页面组件
│   │   ├── skill/               # 技能模块组件
│   │   ├── ui/                  # 通用 UI 组件
│   │   │   ├── MarkdownEditor/  # 基于 CodeMirror 的 Markdown 编辑器
│   │   │   └── MarkdownRenderer/ # Markdown 渲染（Mermaid, WikiLink）
│   │   └── workflow/            # 工作流模块组件
│   ├── hooks/                   # 自定义 React Hooks
│   │   ├── useAgentLoop.ts      # Agent 循环执行 Hook
│   │   └── useAgenticExecutor.tsx # Agentic 模式执行器 Hook
│   ├── services/                # 业务逻辑服务
│   │   ├── llmService.ts        # LLM API 集成
│   │   ├── agentLoopService.ts  # Agent 循环执行服务
│   │   └── agenticService.ts    # Agentic 创建服务
│   ├── stores/                  # Zustand 状态管理（13 个 Store）
│   ├── types/                   # TypeScript 类型定义
│   └── utils/                   # 工具函数
│       ├── storage.ts           # 存储辅助函数
│       ├── workflow-generator.ts # 工作流文档生成器
│       └── knowledgeGraphParser.ts # 知识图谱数据解析器
├── build/                       # 构建资源（应用图标）
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── LICENSE                      # MIT 许可证
```

## 数据存储

所有数据以 Markdown 文件存储在项目的 `.claude/` 目录中：

```
your-project/
└── .claude/
    ├── agents/                  # 智能体定义 (*.md)
    ├── commands/                # 命令定义 (*.md)
    ├── abilities/               # 能力定义 (*.md)
    ├── skills/                  # 技能包（每个技能一个目录）
    │   └── skill-name/
    │       ├── SKILL.md
    │       ├── scripts/
    │       ├── references/
    │       └── examples/
    ├── knowledges/              # 知识条目 (*.md)
    ├── nodes/                   # 节点定义 (*.md)
    ├── resources/               # 资源文件 (*.md)
    └── workflows/               # 工作流定义
        └── workflow-name/
            ├── flow.json        # 图结构数据
            └── WORKFLOW.md      # 生成的工作流文档
```

每个资产都是标准的 Markdown 文件，支持可选的 YAML Frontmatter 元数据。这意味着你可以用 Git 对资产进行版本控制，也可以用任何文本编辑器直接编辑。

## 许可证

[MIT](./LICENSE)

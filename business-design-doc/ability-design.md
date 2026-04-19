# 能力模块前端设计规范

> 本文档总结了能力模块的前端UI设计、交互效果和视觉规范，参考命令模块设计规范编写。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：与节点模块、资源文件模块、智能体模块、命令模块保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 颜色点缀仅用于图标标识
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、模块定位

### 2.1 能力模块概念
能力是**最小的能力单元**，是构建智能体、节点等更复杂业务模块的基础。与命令模块类似，能力模块采用简洁的设计，专注于定义单一、可复用的能力。

### 2.2 与命令模块的差异
- 能力是最小能力单元，更细粒度
- 命令是执行流程，是多个能力的组合
- 两者结构相似，但定位不同

---

## 三、数据持久化设计

### 3.1 存储格式

能力模块采用 **Markdown 文件持久化**，与命令模块类似：

```markdown
---
name: code-review
description: 执行代码审查...
---
# 能力内容
执行代码审查的步骤：
1. 检查代码规范
2. 分析代码逻辑
...
```

### 3.2 存储位置

```
.claude/
├── agents/           # 智能体文件（sub-agent）
├── resources/        # 资源文件
├── commands/         # 命令文件
├── abilities/        # 能力文件存储目录（新增）
│   └── {name}.md
└── ...
```

### 3.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 能力名称，作为文件名 |
| description | string | 否 | 能力描述 |

---

## 四、颜色体系

### 4.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF
```

### 4.2 能力图标颜色

#### 列表页和编辑页 - 深灰色（与主题保持一致）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 深灰 | #374151 | #E5E7EB |

#### 详情页 - 黄色主题（突出闪电图标）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 黄色 | #F59E0B | #FEF3C7 |

**设计说明**：能力详情页使用黄色主题，配合 Zap（闪电）图标，突出能力模块作为"最小能力单元"的核心定位，给用户清晰的视觉区分。

---

## 五、组件设计

### 5.1 能力卡片 (AbilityCard)

#### 整体布局

```
┌─────────────────────────────────────┐
│  [⚡] 能力名称               [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 能力说明 - 这是一个...    │   │  <- 内容预览区 (bg-gray-50)
│  │ - 第一步：检查...           │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 设计规范

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| Zap 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |

#### 交互状态

| 状态 | 效果 |
|------|------|
| 默认 | 卡片无边框阴影，操作按钮隐藏 |
| 悬浮 | 卡片上浮 2px + 阴影，操作按钮显示 |
| 点击 | 触发 `onClick`，打开详情弹窗 |

---

### 5.2 创建/编辑弹窗 (AbilityModal)

#### 创建模式选择界面（2026-03-15 新增）

创建能力时，首先展示三种创建模式选择界面，无标题，保持简洁：

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│     ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│     │    ✏️    │  │    🧠    │  │    🤖    │        │
│     │ 手动创建 │  │ LLM创建  │  │Agentic创 │        │
│     └──────────┘  └──────────┘  └──────────┘        │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### 三种创建模式设计规范

| 模式 | 图标 | 图标颜色 | 背景色 | 说明 |
|------|------|----------|--------|------|
| 手动创建 | PenLine ✓ | `text-yellow-500` (#EAB308) | `bg-yellow-50` (#FEF9C3) | 用户手动填写表单 |
| LLM创建 | Brain 🧠 | `text-pink-400` (#F472B6) | `bg-pink-50` (#FDF2F8) | 单次LLM调用生成 |
| Agentic创建 | Bot 🤖 | `text-blue-500` (#3B82F6) | `bg-blue-50` (#EFF6FF) | Agent自主循环执行 |

#### 创建模式按钮实现

```tsx
// 手动创建 - 黄色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
    <PenLine size={24} className="text-yellow-500" />
  </div>
  <span className="text-sm font-medium text-gray-700">手动创建</span>
</button>

// LLM创建 - 粉肉色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center">
    <Brain size={24} className="text-pink-400" />
  </div>
  <span className="text-sm font-medium text-gray-700">LLM创建</span>
</button>

// Agentic创建 - 蓝色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
    <Bot size={24} className="text-blue-500" />
  </div>
  <span className="text-sm font-medium text-gray-700">Agentic创建</span>
</button>
```

#### 弹窗标题规范

| 模式 | 标题 | 说明 |
|------|------|------|
| 创建模式 | 无标题 | 保持简洁，直接展示创建模式选择 |
| 编辑模式 | "编辑能力" | 明确标识编辑功能 |

#### 弹窗结构（编辑模式或选择创建模式后）

```
┌─────────────────────────────────────────┐
│  编辑能力                         × 关闭 │  <- 头部区域（创建时无标题）
├─────────────────────────────────────────┤
│                                         │
│  能力名称 *                             │
│  [________________________]             │
│                                         │
│  能力描述                               │
│  [________________________]             │
│  [________________________]             │
│                                         │
│  能力内容 *                       编辑│预览│
│  [________________________]             │
│  [________________________]             │
│  [________________________]             │
│                                         │
├─────────────────────────────────────────┤
│                         取消      创建   │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

#### 表单字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 能力名称 | Input | 是 | 唯一标识，编辑时不可修改 |
| 能力描述 | Textarea | 否 | 简要描述能力用途 |
| 能力内容 | Textarea | 是 | 支持 Markdown 格式，支持编辑/预览切换 |

---

### 5.3 详情弹窗 (AbilityDetailModal)

#### 弹窗结构

```
┌─────────────────────────────────────────┐
│  [⚡] 能力名称           [ability]      │  <- 头部固定区域（黄色主题）
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  能力描述                               │
│  [描述内容...]                          │
│                                         │
│  能力内容                               │
│  [Markdown 渲染内容...]                 │
│                                         │
├─────────────────────────────────────────┤
│  关闭                         [编辑]    │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

#### 黄色主题设计

```tsx
// 能力详情页使用黄色主题，突出闪电图标
const colorConfig = {
  color: '#F59E0B',     // 黄色图标
  bgColor: '#FEF3C7',   // 浅黄色背景
}

// 头部图标区域
<div className="w-14 h-14 rounded-xl flex items-center justify-center"
     style={{ backgroundColor: colorConfig.bgColor }}>
  <Zap size={28} style={{ color: colorConfig.color }} />
</div>

// 标签区域（只显示文字，不带图标）
<span style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}>
  ability
</span>
```

#### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 图标背景 | `#FEF3C7` | 浅黄色背景 |
| 图标颜色 | `#F59E0B` | 黄色 Zap 图标 |
| 标签背景 | `#FEF3C7` | 浅黄色背景 |
| 标签文字 | `#F59E0B` | 黄色文字，只显示文字不带图标 |

---

### 5.4 创建按钮悬浮动画（2026-03-15 新增）

#### 设计理念

创建按钮采用简约交互设计，默认只显示图标，悬浮时文字缓缓展开，营造高级感和惊喜感。

#### 交互效果

| 状态 | 展示内容 | 说明 |
|------|----------|------|
| 默认 | `+` 图标 | 紧凑简洁 |
| 鼠标悬浮 | `+ 新建能力` | 文字从右侧缓缓展开 |

#### 实现规范

```tsx
<Button
  className="group bg-[#E5E7EB] border border-gray-300 text-gray-700
             hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2
             text-sm overflow-hidden"
>
  <Plus size={16} className="flex-shrink-0" />
  <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden
                   whitespace-nowrap transition-[max-width,margin]
                   duration-500 ease-in-out group-hover:ml-1.5">
    新建能力
  </span>
</Button>
```

#### 动画参数

| 参数 | 值 | 说明 |
|------|------|------|
| 动画时长 | 500ms | 平滑自然的展开速度 |
| 缓动函数 | ease-in-out | 先慢后快再慢，更自然 |
| 文字最大宽度 | 80px | 刚好容纳"新建能力"四个字 |
| 左边距过渡 | 0 → 6px | 图标与文字间距 |

#### 技术要点

1. **只过渡必要属性**：使用 `transition-[max-width,margin]` 避免按钮本身参与动画
2. **防止图标收缩**：使用 `flex-shrink-0` 确保加号图标固定不动
3. **文字隐藏**：使用 `overflow-hidden whitespace-nowrap` 确保文字不换行
4. **Group 悬浮**：使用 Tailwind 的 `group` 和 `group-hover` 实现父子联动

---

## 六、表单验证设计

### 6.1 验证规则

| 字段 | 规则 |
|------|------|
| 能力名称 | 必填，创建时检查唯一性 |
| 能力内容 | 必填 |

### 6.2 验证反馈方式

```tsx
// 1. Toast 提示
addToast('请输入能力名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

---

## 七、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/types/index.ts | 修改 | 添加 AbilityFile 和 AbilityFileType 类型 |
| src/stores/abilityStore.ts | 新建 | 能力状态管理 |
| src/utils/storage.ts | 修改 | 添加能力文件存储方法 |
| electron/main.ts | 修改 | 添加能力文件 IPC 通道 |
| electron/preload.ts | 修改 | 暴露能力文件 API |
| electron/launch.cjs | 修改 | 开发环境 IPC |
| electron/preload.dev.cjs | 修改 | 开发环境 API |
| src/components/ability/AbilityCard.tsx | 新建 | 能力卡片组件 |
| src/components/ability/AbilityModal.tsx | 新建 | 创建/编辑弹窗组件 |
| src/components/ability/AbilityDetailModal.tsx | 新建 | 详情查看弹窗组件 |
| src/components/ability/index.ts | 新建 | 统一导出 |
| src/pages/AbilitiesPage.tsx | 新建 | 能力页面组件 |
| src/stores/appStore.ts | 修改 | 添加 'abilities' 到 PageType |
| src/components/layout/Sidebar.tsx | 修改 | 添加能力导航项 |
| src/components/layout/MainContent.tsx | 修改 | 添加能力页面路由 |
| src/hooks/useReferenceItems.ts | 修改 | 添加能力引用支持 |
| src/components/ui/ReferenceSelectModal.tsx | 修改 | 添加能力分类 |
| src/App.tsx | 修改 | 添加能力数据加载 |

---

## 八、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.15 | 2026-03-16 | 能力创建页面交互优化：返回确认弹窗、生成按钮图标+动画、MiniMax 思考标签过滤 |
| 1.14 | 2026-03-16 | Agentic 创建简化：不再写文件到本地、只输出能力内容、与 LLM 创建逻辑一致 |
| 1.13 | 2026-03-15 | LLM 创建能力简化优化：JSON 输出改为 Markdown、删除复杂解析逻辑、添加占位符降级处理 |
| 1.12 | 2026-03-15 | LLM 创建能力提示词模板优化：新增角色定义、工作流程指导、增强注意事项（标准化格式、量化指标、验收维度） |
| 1.11 | 2026-03-15 | Agentic 创建页面 UI 优化：移除冗余文字、调整按钮布局、日志可折叠、交互优化 |
| 1.10 | 2026-03-15 | 优化功能扩展至手动创建模式，创建新能力时也可使用渐变色魔法棒进行内容优化 |
| 1.9 | 2026-03-15 | 模板文件持久化，从 localStorage 迁移到本地 Markdown 文件存储 |
| 1.8 | 2026-03-15 | 组件重构：AbilityOptimizeModal → 通用 OptimizeModal，支持多模块复用 |
| 1.7 | 2026-03-15 | 新增优化内容对比功能，支持原始/优化结果并排查看 |
| 1.6 | 2026-03-15 | 新增 Agentic 创建/优化模板配置，统一模板命名规范（llm-create, llm-optimize） |
| 1.5 | 2026-03-14 | 优化 Agentic 创建功能，复用 `useAgentLoop` hook 和 `AgentLoopLogger` 组件，统一与设置页面的样式 |
| 1.4 | 2026-03-13 | 新增 Agentic 创建功能，支持 Agent Loop 智能生成能力并参考已有文档 |
| 1.3 | 2026-03-10 | 新增智能创建功能，支持AI辅助生成能力内容 |
| 1.2 | 2026-03-02 | 详情页标签只保留文字，移除图标，避免与头部图标冗余 |
| 1.1 | 2026-03-01 | 能力详情页使用黄色主题（闪电图标 + ability 标签），与列表页/编辑页区分 |
| 1.0 | 2026-03-01 | 初始版本，基于命令模块设计规范创建 |

---

## 九、智能创建功能设计（v1.3 新增）

### 9.1 功能概述

智能创建功能允许用户通过自然语言描述，由LLM自动生成能力的名称、描述和详细内容，提高创建效率。

### 9.2 创建模式选择界面

#### 界面布局

```
┌─────────────────────────────────────────┐
│  创建新能力                              │
├─────────────────────────────────────────┤
│                                         │
│         ┌──────────┐  ┌──────────┐      │
│         │   [✏️]   │  │   [✨]   │      │
│         │ 手动创建  │  │ 智能创建  │      │
│         └──────────┘  └──────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

#### 设计规范

| 元素 | 规范 |
|------|------|
| 按钮容器 | `flex gap-4` 居中排列 |
| 单个按钮 | `w-40 p-6` 固定宽度，圆角 `rounded-xl` |
| 图标区域 | `w-12 h-12 rounded-full` 圆形背景 |
| 手动创建图标 | 灰色背景 `bg-gray-100`，灰色图标 `text-gray-600` |
| 智能创建图标 | 黄色背景 `bg-yellow-50`，黄色图标 `text-yellow-500` |
| 按钮名称 | `text-sm font-medium text-gray-700` |

### 9.3 智能创建流程

#### 流程图

```
用户输入描述 → 调用LLM → 解析JSON → 填充表单 → 用户编辑确认 → 保存
```

#### 智能创建界面

```
┌─────────────────────────────────────────┐
│  创建新能力                        × 关闭 │
├─────────────────────────────────────────┤
│  ← 返回选择                              │
│                                         │
│  描述你想要创建的能力                     │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │  (用户输入能力描述)                  ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│  AI 将根据你的描述生成能力内容            │
│                                         │
│                    [✨ 开始生成]         │
└─────────────────────────────────────────┘
```

#### 生成功效

- **加载状态**: 按钮显示 `Loader2` 旋转动画，文案变为"正在生成..."
- **生成成功**: 自动切换到手动编辑模式，表单已填充生成的内容
- **生成失败**: Toast 提示错误信息，用户可重试

### 9.4 提示词模板配置

#### 配置位置

设置页面 → 能力分类 → 提示词模板

#### 默认模板

```
## 角色
- 你是一个专业的AI能力设计助手。请根据用户提供的描述，详细理解用户的需求 生成一个结构化的能力定义。

## 用户描述
{{userDescription}}

## 工作流程
- 1.理解用户输入的`用户描述`
- 2.详细思考和设计能力
- 3.输出

## 注意事项
- content的能力详情中 必须详细不可以广泛的给出一个能力的设计 要求输出的能力详情
  - 1.输出内容有标准的格式 格式清晰
  - 2.要求有可衡量/量化的指标
  - 3.有验收的维度和验收的指标

## 输出要求
请以JSON格式输出，包含以下字段：
1. name: 能力名称（简洁、有意义的中文名称，3-10个字）
2. description: 能力描述（一句话概括能力用途，20-50个字）
3. content: 能力详情（Markdown格式，包含能力说明、使用场景、注意事项等）

## 输出格式示例
\`\`\`json
{
  "name": "代码审查",
  "description": "对代码进行专业审查，发现潜在问题并提供改进建议",
  "content": "# 代码审查能力\\n\\n## 能力说明\\n本能力用于对代码进行全面审查...\\n\\n## 审查维度\\n1. 代码规范\\n2. 逻辑正确性\\n3. 性能优化\\n4. 安全性\\n\\n## 注意事项\\n- 审查前需了解项目背景\\n- 给出具体可执行的改进建议"
}
\`\`\`
```

#### 模板优化说明（v1.12）

**核心改进点**：

1. **角色定义明确** - 明确AI助手的专业定位和能力范围
2. **工作流程指导** - 分步骤指导AI理解和设计能力
3. **质量要求强化** - 三大核心要求：
   - 标准化格式：确保输出结构一致性
   - 量化指标：能力需可衡量、可评估
   - 验收维度：明确的验收标准和指标

**与旧版本对比**：

| 维度 | 旧版本 | 新版本（v1.12） |
|------|--------|----------------|
| 角色定义 | 无明确角色 | 专业AI能力设计助手 |
| 工作流程 | 无 | 理解→设计→输出 |
| 质量要求 | 简单提及 | 三大核心要求 |
| 量化指标 | 无 | 必须包含可衡量指标 |
| 验收标准 | 无 | 必须有验收维度和指标 |

#### 模板占位符

| 占位符 | 说明 |
|--------|------|
| `{{userDescription}}` | 用户输入的能力描述 |

### 9.5 技术实现要点

#### LLM调用

- 通过 Electron 主进程发送请求，绑过 CORS 限制
- 支持 OpenAI、Anthropic 和自定义提供商
- `max_tokens` 设置为 262144 (256K)，确保长内容不被截断

#### JSON解析

- 支持从 Markdown 代码块中提取 JSON
- 使用贪婪匹配到最后一个代码块结束符，支持嵌套代码块

#### 配置文件

- LLM提供商列表存储在 `.ocean/llm-config.json`
- 增量更新：创建/更新/删除单个提供商，不全量覆盖

### 9.6 文件修改清单（智能创建功能）

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/services/llmService.ts | 新建 | LLM调用服务 |
| src/components/ability/AbilityModal.tsx | 修改 | 添加智能创建模式 |
| src/components/settings/AbilitySettings.tsx | 新建 | 能力设置组件（提示词配置） |
| src/components/settings/SettingsSidebar.tsx | 修改 | 添加能力导航项 |
| src/pages/SettingsPage.tsx | 修改 | 添加能力设置路由 |
| src/stores/settingsStore.ts | 修改 | 添加能力配置状态管理 |
| src/utils/storage.ts | 修改 | 添加LLM配置文件存储方法 |
| src/types/index.ts | 修改 | 添加 AbilityConfig 类型 |
| electron/launch.cjs | 修改 | 添加 call-llm-api、save-llm-config、load-llm-config IPC |
| electron/main.ts | 修改 | 同上 |
| electron/preload.dev.cjs | 修改 | 暴露 callLLMApi、saveLLMConfig、loadLLMConfig API |
| electron/preload.ts | 修改 | 同上 |

### 9.7 智能创建能力校验逻辑（2026-03-11 新增）

#### 完整校验流程

```typescript
const handleSmartGenerate = async () => {
  // 1. 验证用户描述
  if (!userDescription.trim()) {
    addToast('请输入能力描述', 'warning')
    return
  }

  // 2. 获取启用的 LLM 提供商
  const defaultProvider = await getDefaultLLMProvider()
  if (!defaultProvider) {
    addToast('请先在设置中配置并启用 LLM 提供商', 'warning')
    return
  }

  // 3. 校验 Base URL
  if (!defaultProvider.baseUrl) {
    addToast('请先配置 Base URL', 'warning')
    return
  }

  // 4. 校验 API Key
  if (!defaultProvider.apiKey) {
    addToast('请先配置 API Key', 'warning')
    return
  }

  // 5. 校验默认模型
  if (!defaultProvider.defaultModel) {
    addToast('请先配置默认模型', 'warning')
    return
  }

  // 调用 LLM 生成...
}
```

#### 校验规则说明

| 校验项 | 规则 | 说明 |
|--------|------|------|
| 用户描述 | 必填 | 不能为空 |
| 启用的提供商 | 必须存在 | 至少有一个 isEnabled: true 的提供商 |
| Base URL | 必填 | 提供商必须配置 Base URL |
| API Key | 必填 | 提供商必须配置 API Key |
| 默认模型 | 必填 | 提供商必须配置默认模型 |
| 连接测试状态 | 不校验 | 允许未测试连接也可使用 |

#### LLM 提供商选择逻辑

系统自动选择第一个启用的 LLM 提供商进行调用：

```typescript
// storage.ts
export const getDefaultLLMProvider = async (): Promise<LLMProvider | null> => {
  const providers = await loadLLMProvidersFromFile()
  // 返回第一个启用的提供商
  return providers.find(p => p.isEnabled) || null
}
```

**选择优先级**：
1. 查找第一个 `isEnabled: true` 的提供商
2. 如果没有启用的提供商，返回 `null`

**互斥保证**：
- 启用某个提供商时，自动禁用其他所有提供商
- 同一时间只能有一个提供商处于启用状态

---

## 十、提示词模板 Markdown 编辑器支持（2026-03-11 新增）

### 10.1 功能概述

将能力智能创建提示词模板的输入框升级为支持 Markdown 格式的可编辑和预览输入框。

### 10.2 组件结构

```
┌─────────────────────────────────────────┐
│  📄 能力智能创建提示词模板    [编辑] [预览] │
├─────────────────────────────────────────┤
│  描述文字...                              │
│                                          │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │  编辑模式: MarkdownEditor            ││
│  │  预览模式: MarkdownRenderer          ││
│  │                                     ││
│  └─────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### 10.3 编辑/预览切换

**切换按钮设计**：

```tsx
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button
    onClick={() => setViewMode('edit')}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
      viewMode === 'edit'
        ? 'bg-white text-gray-800 shadow-sm'
        : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    <Edit3 size={14} />
    编辑
  </button>
  <button
    onClick={() => setViewMode('preview')}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
      viewMode === 'preview'
        ? 'bg-white text-gray-800 shadow-sm'
        : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    <Eye size={14} />
    预览
  </button>
</div>
```

### 10.4 编辑模式

**组件**：MarkdownEditor

**特性**：
- 基于 CodeMirror 实现
- 支持语法高亮
- 支持完整的 Markdown 语法
- 等宽字体显示

**Props**：
```typescript
<MarkdownEditor
  placeholder="请输入提示词模板..."
  value={promptTemplate}
  onChange={(e) => setPromptTemplate(e.target.value)}
  rows={20}
  className="font-mono text-sm"
/>
```

### 10.5 预览模式

**组件**：MarkdownRenderer

**特性**：
- 支持 GFM（GitHub Flavored Markdown）
- 支持代码块语法高亮
- 支持表格、任务列表等扩展语法

**样式**：
- 浅灰色背景：`bg-gray-50`
- 圆角容器：`rounded-lg`
- 固定高度范围：`min-h-[400px] max-h-[600px]`
- 支持滚动：`overflow-y-auto`

**空内容提示**：
```tsx
{promptTemplate.trim() ? (
  <MarkdownRenderer content={promptTemplate} />
) : (
  <p className="text-sm text-gray-400 text-center py-8">
    暂无内容，请切换到编辑模式输入内容
  </p>
)}
```

### 10.6 相关文件

| 文件 | 说明 |
|------|------|
| src/components/settings/AbilitySettings.tsx | 能力设置组件（已更新）|
| src/components/ui/MarkdownEditor | Markdown 编辑器组件 |
| src/components/ui/MarkdownRenderer | Markdown 渲染器组件 |

---

## 十一、Agentic 创建功能设计（v1.4 新增）

### 11.1 功能概述

Agentic 创建功能利用 Agent Loop 能力，让 AI Agent 能够主动读取本地已有能力文档作为参考，然后直接写入文件到能力库，最后回显给用户进行编辑确认。

与智能创建的区别：
- **智能创建**：直接调用 LLM 生成内容，不参考已有文档
- **Agentic 创建**：Agent 使用工具读取已有文档，参考格式后再生成

### 11.2 创建模式选择界面扩展

#### 界面布局

```
┌─────────────────────────────────────────┐
│  创建新能力                              │
├─────────────────────────────────────────┤
│                                         │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│    │  [✏️]   │ │  [✨]   │ │  [🤖]   │ │
│    │手动创建  │ │智能创建  │ │Agentic │ │
│    └─────────┘ └─────────┘ └─────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

#### 设计规范

| 元素 | 规范 |
|------|------|
| 按钮容器 | `flex gap-4` 居中排列，三个按钮等分 |
| 单个按钮 | `w-36 p-6` 固定宽度，圆角 `rounded-xl` |
| Agentic 创建图标背景 | `bg-blue-50` 浅蓝色背景 |
| Agentic 创建图标颜色 | `text-blue-500` 蓝色图标（Bot） |
| 按钮名称 | `text-sm font-medium text-gray-700` |

### 11.3 Agentic 创建流程

#### 流程图

```
用户输入描述 → 启动 Agent Loop
                     ↓
              ls 查看能力目录
                     ↓
              read 读取已有文档（参考格式）
                     ↓
              write 生成临时文件
                     ↓
              读取临时文件 → 解析 frontmatter → 回显到表单
                     ↓
              用户编辑确认 → 保存为正式文件（删除临时文件）
                     ↓
              用户取消 → 删除临时文件
```

#### Agentic 创建界面

```
┌─────────────────────────────────────────┐
│  创建新能力                        × 关闭 │
├─────────────────────────────────────────┤
│  ← 返回选择                              │
│                                         │
│  描述你想要创建的能力                     │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │ (用户输入能力描述)                  ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│  Agentic 将自动读取已有能力文档作为参考    │
│                                         │
│  执行日志                                │
│  ┌─────────────────────────────────────┐│
│  │ [🧠] 准备 Agentic 任务        [✓]  ││
│  │ [⚙️] 调用工具: ls                    ││
│  │ [✓] 工具执行结果                    ││
│  │ [🧠] 思考过程                       ││
│  │ [⚙️] 调用工具: read                 ││
│  │ ...                                 ││
│  └─────────────────────────────────────┘│
│                                         │
│                    [🤖 Agentic 执行中...] │
└─────────────────────────────────────────┘
```

#### 执行步骤类型

| 类型 | 图标 | 说明 |
|------|------|------|
| `thinking` | Brain | 思考/规划过程 |
| `tool_call` | Wrench | 工具调用（显示工具名称和参数） |
| `tool_result` | Check | 工具执行结果（可展开查看详情） |
| `result` | Check | 最终结果（生成成功） |
| `error` | AlertCircle | 错误信息 |

### 11.4 临时文件管理

#### 临时文件命名

```typescript
// 格式：temp-${timestamp}-${random}.md
temp-1773412049096-abc123xyz.md
```

#### 文件生命周期

| 阶段 | 操作 | 说明 |
|------|------|------|
| 生成 | `write` 工具写入 | Agent 直接写入 `.claude/abilities/` |
| 读取 | `loadAbilityFile` 读取 | 解析 frontmatter 和正文 |
| 确认保存 | 创建正式文件 | 以真实名称创建新文件，删除临时文件 |
| 取消/关闭 | `deleteAbilityFile` 删除 | 清理临时文件，避免垃圾文件 |

#### 临时文件引用管理

```typescript
// 使用 useRef 存储临时文件名
const tempFileIdRef = useRef<string>('')

// 生成临时文件名
tempFileIdRef.current = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// 删除临时文件
const deleteTempAbilityFile = async () => {
  if (tempFileIdRef.current && isElectron()) {
    await window.electronAPI?.deleteAbilityFile?.(tempFileIdRef.current)
  }
}
```

### 11.5 配置来源

Agentic 创建复用设置中的 Agentic 配置：

| 配置项 | 来源 | 说明 |
|--------|------|------|
| `enabled` | `agenticConfig.enabled` | 是否启用 Agentic 模式 |
| `tools` | `agenticConfig.tools` | 启用的工具列表（ls, read, write 等） |
| `provider` | `agenticConfig.providerId` 或默认 | LLM 提供商 |
| `model` | `agenticConfig.modelId` | 模型 ID |
| `maxIterations` | `agenticConfig.maxIterations` | 最大迭代次数 |
| `timeout` | `agenticConfig.timeout` | 超时时间 |

### 11.6 任务提示词设计

```typescript
const task = `请帮我创建一个能力文档并保存到本地。能力描述：${userDescription}

任务步骤：
1. 首先使用 ls 工具查看 .claude/abilities/ 目录下是否已有能力文档
2. 如果有，使用 read 工具读取参考这些文档的格式和风格
3. 根据用户描述，生成一个符合规范的能力文档，包含：
   - name: 能力名称（简洁、有意义的中文名称）
   - description: 能力描述（一句话概括用途）
   - content: 能力详情（Markdown格式正文）

非常重要：
- 使用 write 工具直接将文件保存到 .claude/abilities/${tempFileIdRef.current}.md
- 文件内容必须符合以下格式（包含 frontmatter）：

---
name: 能力名称
description: 能力描述
---

# 能力标题

正文内容...

- 先生成文件名（基于能力名称的英文或拼音），再写入文件`
```

### 11.7 文件修改清单（Agentic 创建功能）

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/components/ability/AbilityModal.tsx | 修改 | 添加 Agentic 创建模式、handleAgenticGenerate 函数、临时文件管理 |
| src/utils/storage.ts | 修改 | 导出 parseAbilityFrontmatter 函数 |
| src/services/llmService.ts | 修改 | 优化 parseAbilityJSON 函数，处理嵌套代码块 |

### 11.8 关键实现要点

#### 1. Agent Loop 调用

```typescript
const result = await window.electronAPI?.runAgentLoop?.({
  provider: selectedProvider,
  model: selectedModel,
  tools: enabledTools,
  maxIterations: agenticConfig.maxIterations,
  timeout: agenticConfig.timeout,
  projectPath: currentProject.path,
  task
})
```

#### 2. 事件监听处理

```typescript
const eventUnsubscribe = window.electronAPI?.onAgentLoopEvent?.((event: AgentLoopEvent) => {
  handleAgentLoopEvent(event)
})

// 完成后取消订阅
eventUnsubscribe?.()
```

#### 3. 文件解析回显

```typescript
const { metadata, body } = parseAbilityFrontmatter(fileResult.content)
setName(metadata.name)
setDescription(metadata.description || '')
setContent(body)
```

#### 4. 关闭时清理

```typescript
const handleClose = async (skipConfirm = false) => {
  // 删除临时文件
  if (tempFileIdRef.current && agenticSteps.length > 0) {
    await deleteTempAbilityFile()
  }
  // ... 其他清理逻辑
}
```

---

## 十二、Agentic 创建功能优化（v1.5 新增）

### 12.1 优化概述

2026-03-14 对 Agentic 创建功能进行重构，复用设置页面的 Agent Loop 封装能力，统一代码架构和 UI 样式。

**优化目标**：
- 复用 `useAgentLoop` hook，减少重复代码
- 统一使用 `AgentLoopLogger` 组件，保持与设置页面一致的日志展示样式
- 简化状态管理逻辑，提高代码可维护性
- 添加中止执行功能

### 12.2 架构对比

#### 优化前（自定义实现）

```
AbilityModal
├── agenticSteps (自定义状态)
├── agenticStatus (自定义状态)
├── expandedSteps (自定义状态)
├── handleAgentLoopEvent (自定义事件处理)
└── renderAgenticSteps (自定义渲染)
```

#### 优化后（复用封装）

```
AbilityModal
├── useAgentLoop (hook 封装)
│   ├── steps
│   ├── isRunning
│   ├── expandedSteps
│   ├── execute()
│   ├── abort()
│   └── clearSteps()
└── AgentLoopLogger (组件封装)
    ├── 统一的卡片式步骤展示
    ├── 可折叠详情区域
    └── 自动滚动到底部
```

### 12.3 代码优化详情

#### Hook 使用方式

```typescript
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'

// 使用 hook
const {
  steps,
  isRunning,
  expandedSteps,
  toggleStepExpand,
  clearSteps,
  execute,
  abort,
} = useAgentLoop({
  onComplete: (result) => {
    if (result.success) {
      handleAgenticComplete()
    }
  },
  onError: (error) => {
    addToast(error.message, 'error')
  }
})

// 执行 Agent Loop
const handleAgenticGenerate = async () => {
  await execute({
    task,
    tools: enabledTools,
    provider: selectedProvider,
    model: selectedModel,
    projectPath: currentProject.path,
    maxIterations: agenticConfig.maxIterations,
    timeout: agenticConfig.timeout
  })
}

// 中止执行
const handleAbort = async () => {
  await abort()
}
```

#### UI 组件使用

```tsx
<AgentLoopLogger
  steps={steps}
  isRunning={isRunning}
  expandedSteps={expandedSteps}
  onToggleExpand={toggleStepExpand}
  maxHeight={300}
  emptyContent={
    <div className="bg-gray-50 rounded-lg p-8 text-center">
      <Bot size={32} className="mx-auto text-gray-300 mb-3" />
      <p className="text-sm text-gray-400">输入描述后点击开始，Agent 将自动执行</p>
    </div>
  }
/>
```

### 12.4 UI 样式统一

优化后的 Agentic 创建界面与设置页面的"Agentic 调试"区域保持一致的样式：

| 元素 | 样式规范 |
|------|----------|
| 日志容器 | `bg-white rounded-lg border border-gray-200` |
| 头部区域 | `px-4 py-3 bg-gray-50 border-b border-gray-200` |
| 步骤卡片 | `border-gray-200 bg-gray-50`，错误状态使用红色系 |
| 图标颜色 | 统一使用灰色系，仅错误使用红色 |
| 控制按钮 | 与设置页面完全一致的样式 |

### 12.5 控制按钮设计

```tsx
<div className="flex items-center justify-end gap-3">
  {!isRunning ? (
    <button
      onClick={handleAgenticGenerate}
      disabled={!agenticConfig.enabled || !userDescription.trim()}
      className="flex items-center gap-2 px-4 py-2.5 bg-gray-900
                 text-white rounded-lg font-medium text-sm
                 hover:bg-gray-800 active:bg-gray-700
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all duration-200"
    >
      <Send size={16} />
      开始执行
    </button>
  ) : (
    <button
      onClick={handleAbort}
      className="flex items-center gap-2 px-4 py-2.5 bg-red-600
                 text-white rounded-lg font-medium text-sm
                 hover:bg-red-700 active:bg-red-800
                 transition-all duration-200"
    >
      <Square size={16} />
      中止执行
    </button>
  )}

  <button
    onClick={clearSteps}
    disabled={isRunning || steps.length === 0}
    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100
               text-gray-700 rounded-lg font-medium text-sm
               hover:bg-gray-200 active:bg-gray-300
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-all duration-200"
  >
    <RotateCcw size={16} />
    清除结果
  </button>
</div>
```

### 12.6 优化收益

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 代码行数 | ~250 行自定义逻辑 | ~100 行 hook 调用 |
| 状态管理 | 5+ 个本地状态 | 从 hook 获取 |
| 事件处理 | 自定义 50+ 行 | hook 自动处理 |
| 样式一致性 | 自定义样式 | 与设置页面完全一致 |
| 中止功能 | 无 | 有 |
| 可维护性 | 中 | 高 |

### 12.7 文件修改清单（v1.5 优化）

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/components/ability/AbilityModal.tsx | 修改 | 使用 `useAgentLoop` hook 和 `AgentLoopLogger` 组件替换自定义实现 |

---

## 十三、能力优化功能设计（v1.6 新增）

### 13.1 功能概述

在能力编辑页面添加"优化"功能，允许用户通过 LLM 对现有能力内容进行智能优化改进。

**与智能创建的区别**：
- **智能创建**：根据用户描述从零生成完整能力内容
- **优化**：基于现有能力内容进行针对性改进

### 13.2 入口设计

#### 优化按钮位置

在能力编辑模式和手动创建模式下，能力内容区域的标签栏右侧添加优化按钮：

**支持模式**：
- **编辑模式**（`mode === 'edit'`）：编辑已有能力时
- **手动创建模式**（`createMode === 'manual'`）：创建新能力时选择手动创建

```
┌─────────────────────────────────────────────────────┐
│  ⚡ 能力内容 *         [🎨]  [编辑] [预览]           │
│  ┌─────────────────────────────────────────────────┐│
│  │                                                 ││
│  │  能力内容编辑区域...                             ││
│  │                                                 ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

#### 优化按钮样式

采用炫彩渐变设计，仅显示图标：

```tsx
<button
  className="flex items-center justify-center w-7 h-7 rounded-md
             bg-gradient-to-r from-rose-400 via-fuchsia-500 to-indigo-500
             text-white hover:from-rose-500 hover:via-fuchsia-600 hover:to-indigo-600
             transition-all shadow-sm"
  title="优化能力内容"
>
  <Wand2 size={14} />
</button>
```

### 13.3 优化弹窗设计

#### 弹窗结构

```
┌─────────────────────────────────────────────────────────┐
│  优化能力内容                                      × 关闭 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  优化目标                                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │                                                     ││
│  │  (用户输入优化目标)                                  ││
│  │                                                     ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  优化结果                              [预览] [编辑]     │
│  ┌─────────────────────────────────────────────────────┐│
│  │                                                     ││
│  │  (LLM 生成的优化结果)                               ││
│  │                                                     ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
├─────────────────────────────────────────────────────────┤
│  清除结果                      取消    [优化]  确认使用  │
└─────────────────────────────────────────────────────────┘
```

#### 组件设计规范

| 元素 | 规范 |
|------|------|
| 弹窗尺寸 | `size="xl"` |
| 优化目标输入框 | 2 行高度 |
| 优化结果区 | 支持预览/编辑模式切换 |
| 优化按钮 | 放置在右下角，与确认使用按钮相邻 |

### 13.4 交互流程

```
用户点击优化按钮
        ↓
弹出优化弹窗
        ↓
用户输入优化目标
        ↓
点击"优化"按钮 → 调用 LLM
        ↓
展示优化结果
        ↓
┌─────────┬─────────┬─────────┐
│ 确认使用 │  优化   │ 清除结果 │
└────┬────┴────┬────┴─────────┘
     │         │
     ↓         ↓
 应用到编辑框  基于原始内容重新优化
```

### 13.5 提示词模板设计

#### 默认优化提示词模板

```
你是一个专业的AI能力优化助手。请根据用户提供的优化目标，对现有的能力内容进行优化改进。

## 现有能力内容
{{currentContent}}

## 优化目标
{{optimizeTarget}}

## 输出要求
请直接输出优化后的能力内容（Markdown格式），不需要包含名称和描述字段。

## 优化原则
1. 保持原有核心功能和价值
2. 根据优化目标有针对性地改进
3. 结构清晰，表述准确
4. 如有必要，可补充使用场景或注意事项

请直接输出优化后的Markdown内容，不要包含代码块标记。
```

#### 占位符说明

| 占位符 | 说明 |
|--------|------|
| `{{currentContent}}` | 当前能力内容（始终为原始编辑区内容） |
| `{{optimizeTarget}}` | 用户输入的优化目标 |

### 13.6 设置页面配置

在设置页面 → 能力分类中，使用 Tab 切换展示两种模板配置：

| Tab | 模板类型 | 占位符 |
|-----|----------|--------|
| 智能创建模板 | 能力智能创建提示词 | `{{userDescription}}` |
| 优化模板 | 能力优化提示词 | `{{currentContent}}`, `{{optimizeTarget}}` |

### 13.7 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/types/index.ts | 修改 | `AbilityConfig` 添加 `optimizePromptTemplate` 字段 |
| src/utils/storage.ts | 修改 | 添加优化模板默认值和相关函数 |
| src/services/llmService.ts | 修改 | 添加 `optimizeAbilityWithLLM` 函数 |
| src/components/ability/AbilityOptimizeModal.tsx | 新建 | 优化弹窗组件 |
| src/components/ability/AbilityModal.tsx | 修改 | 添加优化按钮和弹窗集成 |
| src/components/settings/AbilitySettings.tsx | 修改 | 添加优化模板配置 Tab |

### 13.8 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.10 | 2026-03-15 | 优化功能扩展至手动创建模式，创建新能力时也可使用优化功能 |
| 1.7 | 2026-03-14 | 新增优化内容对比功能，支持 git diff 风格的优化前后对比 |
| 1.6 | 2026-03-14 | 新增能力优化功能，支持基于 LLM 的内容改进 |

---

## 十四、优化内容对比功能设计（v1.7 新增）

### 14.1 功能概述

在能力编辑模式下，当用户使用优化功能后，可以在优化弹窗中点击"对比"按钮，查看优化前后的内容差异对比，采用类似 git diff 的可视化方式展示。

### 14.2 入口设计

#### 对比按钮位置

在优化弹窗的底部按钮区域，与"清除结果"按钮并列：

```
┌─────────────────────────────────────────────────────────┐
│  优化能力内容                                      × 关闭 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  优化目标                                               │
│  [________________________]                             │
│                                                         │
│  优化结果                              [预览] [编辑]     │
│  [________________________]                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [对比] [清除结果]              取消    [优化]  确认使用  │
└─────────────────────────────────────────────────────────┘
```

#### 对比按钮样式

采用灰色幽灵按钮样式，与"清除结果"按钮保持一致：

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShowDiffModal(true)}
  disabled={isOptimizing}
  className="text-gray-600 hover:text-gray-800"
>
  <GitCompare size={14} className="mr-1.5" />
  对比
</Button>
```

**设计说明**：
- 仅在有优化结果时显示
- 使用 `GitCompare` 图标，语义清晰
- 灰色幽灵按钮，不抢主操作按钮的视觉权重

### 14.3 对比弹窗设计

#### 弹窗结构

```
┌─────────────────────────────────────────────────────────┐
│  内容对比                                         × 关闭 │
├─────────────────────────────────────────────────────────┤
│  [▓] 删除的内容  [▓] 新增的内容  [□] 未改变的内容       │
├─────────────────────────────────────────────────────────┤
│  原始内容                  │  优化后内容                 │
├─────────────────────────────┼───────────────────────────┤
│  1   第一行内容(未改变)     │  1   第一行内容(未改变)    │
│  2 - 删除的行(红色背景)     │                            │
│                             │  2 + 新增的行(绿色背景)    │
│  3   第三行内容(未改变)     │  3   第三行内容(未改变)    │
├─────────────────────────────┴───────────────────────────┤
│              删除 1 行  |  新增 1 行  |  未改变 2 行      │
└─────────────────────────────────────────────────────────┘
```

#### 组件设计规范

| 元素 | 规范 | 说明 |
|------|------|------|
| 弹窗尺寸 | `size="xl"` | 超大弹窗，提供足够的对比空间 |
| 图例区域 | `bg-gray-50` | 浅灰背景，清晰标注颜色含义 |
| 标题栏 | 左右各一个 | 分别标注"原始内容"和"优化后内容" |
| 双栏布局 | `grid grid-cols-2` | 左右各占一半 |
| 删除行 | `bg-red-50 text-red-900` | 红色背景+深红文字，左侧 4px 红色边框 |
| 新增行 | `bg-green-50 text-green-900` | 绿色背景+深绿文字，左侧 4px 绿色边框 |
| 未改变行 | `bg-white text-gray-700` | 白色背景，无边框 |
| 行号显示 | 灰色+右对齐 | `text-gray-300`，最小宽度 2rem |
| 统计信息 | 底部居中 | 显示删除、新增、未改变的行数 |

### 14.4 Diff 算法实现

采用**行级 diff 算法**，无需引入第三方库：

#### 算法步骤

```typescript
1. 将内容按行分割
2. 使用双指针遍历旧行和新行
3. 对比每一行：
   - 如果行内容相同：标记为 unchanged
   - 如果旧行在新内容中找到：中间的新行标记为 added
   - 如果新行在旧内容中找到：中间的旧行标记为 removed
   - 都找不到：标记为修改（removed + added）
4. 返回差异结果数组
```

#### 性能优化

- 使用 `useMemo` 缓存 diff 计算结果
- 仅在内容变化时重新计算
- 时间复杂度: O(n*m)，n 和 m 为新旧内容的行数

### 14.5 交互流程

```
用户点击优化按钮 → 弹出优化弹窗
        ↓
用户输入优化目标 → 点击"优化"
        ↓
LLM 生成优化结果 → 展示优化结果
        ↓
用户点击"对比" → 弹出对比弹窗
        ↓
查看优化前后差异 → 关闭对比弹窗
        ↓
点击"确认使用" → 应用优化结果
```

### 14.6 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/components/ui/ContentDiffModal.tsx | 新建 | 内容对比弹窗组件 |
| src/components/ability/AbilityOptimizeModal.tsx | 修改 | 添加对比按钮和弹窗集成 |
| src/components/ui/index.ts | 修改 | 导出 ContentDiffModal 组件 |

### 14.7 组件复用性

`ContentDiffModal` 组件设计为通用组件，可在其他需要内容对比的场景复用：

**Props 接口**：

```typescript
interface ContentDiffModalProps {
  isOpen: boolean
  onClose: () => void
  oldContent: string      // 原始内容
  newContent: string      // 新内容
  oldTitle?: string       // 左侧标题（默认："原始内容"）
  newTitle?: string       // 右侧标题（默认："新内容"）
}
```

**可应用场景**：
- 命令模块的内容优化对比
- 知识库文档的版本对比
- 节点模板的修改对比
- 智能体配置的变更对比

### 14.8 视觉设计细节

#### 颜色方案

遵循 git diff 的经典配色：

```css
/* 删除的行 */
background: #FEF2F2 (bg-red-50)
text: #7F1D1D (text-red-900)
border-left: #F87171 (border-red-400)

/* 新增的行 */
background: #F0FDF4 (bg-green-50)
text: #14532D (text-green-900)
border-left: #4ADE80 (border-green-400)
```

#### 字体设计

```css
/* 代码风格 */
font-family: monospace
font-size: 0.75rem (text-xs)
```

**设计考虑**：
- 使用等宽字体，保持字符对齐
- 小字号紧凑展示，最大化内容密度
- 行号右对齐，便于视觉追踪

### 14.9 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.9 | 2026-03-15 | 新增模板文件持久化功能，解决模板加载失败问题 |
| 1.8 | 2026-03-15 | 重构 AbilityOptimizeModal 为通用 OptimizeModal 组件，支持其他业务模块复用 |
| 1.7 | 2026-03-14 | 新增优化内容对比功能，支持 git diff 风格的优化前后对比 |

---

## 十六、模板文件持久化设计（v1.9 新增）

### 16.1 问题背景

在能力模块优化功能使用过程中发现：
- 模板仅存储在 localStorage，未持久化到本地文件系统
- 用户首次使用优化功能时，如果未访问设置页面，模板为空字符串
- 空模板发送给 LLM 会导致非预期的输出内容

### 16.2 解决方案

将模板从 localStorage 迁移到本地文件系统存储，实现真正的持久化。

### 16.3 目录结构

```
.ocean/
└── template/
    └── ability/              # 能力模块模板目录
        ├── smart-create.json # 智能创建模板
        └── optimize.json     # 优化模板
```

**设计说明**：
- 在 `.ocean` 下创建 `template` 目录，统一管理所有业务模块的模板
- 能力模块模板存储在 `ability/` 子目录下，为其他模块预留空间
- 文件以 JSON 格式存储，便于扩展其他元数据字段

### 16.4 文件格式

```json
{
  "content": "模板内容...",
  "updatedAt": "2026-03-15T10:30:00.000Z"
}
```

### 16.5 存储层实现

**位置**：`ocean/src/utils/storage.ts`

#### 保存模板

```typescript
export const saveAbilityTemplateFile = async (
  templateType: 'smart-create' | 'optimize',
  content: string
): Promise<void> => {
  if (!isElectron()) {
    // 浏览器环境使用 localStorage
    const key = `ability-template-${templateType}`
    localStorage.setItem(key, content)
    return
  }

  try {
    await window.electronAPI?.saveAbilityTemplateFile?.(templateType, content)
  } catch (error) {
    console.error(`保存能力模板文件失败 (${templateType}):`, error)
    throw error
  }
}
```

#### 加载模板

```typescript
export const loadAbilityTemplateFile = async (
  templateType: 'smart-create' | 'optimize'
): Promise<string> => {
  if (!isElectron()) {
    // 浏览器环境从 localStorage 读取
    const key = `ability-template-${templateType}`
    const stored = localStorage.getItem(key)
    if (stored) {
      return stored
    }
    // 返回默认模板
    return templateType === 'smart-create'
      ? DEFAULT_ABILITY_PROMPT_TEMPLATE
      : DEFAULT_ABILITY_OPTIMIZE_PROMPT_TEMPLATE
  }

  try {
    const result = await window.electronAPI?.loadAbilityTemplateFile?.(templateType)
    if (result && result.success && result.content) {
      return result.content
    }
    // 文件不存在，返回默认模板
    return templateType === 'smart-create'
      ? DEFAULT_ABILITY_PROMPT_TEMPLATE
      : DEFAULT_ABILITY_OPTIMIZE_PROMPT_TEMPLATE
  } catch (error) {
    console.error(`加载能力模板文件失败 (${templateType}):`, error)
    // 出错时返回默认模板
    return templateType === 'smart-create'
      ? DEFAULT_ABILITY_PROMPT_TEMPLATE
      : DEFAULT_ABILITY_OPTIMIZE_PROMPT_TEMPLATE
  }
}
```

### 16.6 默认模板机制

**内置默认模板**：

```typescript
// 智能创建默认模板
const DEFAULT_ABILITY_PROMPT_TEMPLATE = `你是一个专业的AI能力设计助手...`

// 优化默认模板
const DEFAULT_ABILITY_OPTIMIZE_PROMPT_TEMPLATE = `你是一个专业的AI能力优化助手...`
```

**降级流程**：

```
调用 LLM 功能
     ↓
loadAbilityTemplateFile()
     ↓
本地文件存在？ ──Yes──→ 返回文件内容
     │
     No
     ↓
返回内置默认模板
```

### 16.7 懒加载设计

**加载时机**：在调用 LLM 前才加载模板，而非应用启动时

**智能创建示例**：

```typescript
const handleSmartGenerate = async () => {
  // ... 校验逻辑

  setIsGenerating(true)

  try {
    // 从本地文件加载模板
    const promptTemplate = await loadAbilityTemplateFile('smart-create')

    const result = await generateWithLLM(
      defaultProvider,
      promptTemplate,  // 使用加载的模板
      userDescription
    )
    // ...
  }
}
```

**优化功能示例**：

```typescript
const handleOptimize = async () => {
  // ... 校验逻辑

  setIsOptimizing(true)

  try {
    // 加载模板：优先使用传入的模板，否则从本地文件加载
    let promptTemplate = providedPromptTemplate
    if (!promptTemplate) {
      promptTemplate = await loadAbilityTemplateFile('optimize')
    }

    const result = await optimizeAbilityWithLLM(
      defaultProvider,
      promptTemplate,
      currentContent,
      optimizeTarget
    )
    // ...
  }
}
```

### 16.8 错误处理

**主进程层面**：

```typescript
// electron/main.ts
ipcMain.handle('load-ability-template-file', async (_, templateType) => {
  try {
    const filePath = path.join(projectRoot, '.ocean', 'template', 'ability', `${templateType}.json`)

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.log('能力模板文件不存在:', filePath)
      return { success: false, content: null }  // 不抛出异常
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const templateData = JSON.parse(fileContent)

    return { success: true, content: templateData.content }
  } catch (error) {
    return { success: false, error: error.message, content: null }
  }
})
```

**前端层面**：
- 捕获所有异常，确保永远返回有效字符串
- TypeScript 类型保证返回值永远是 `string`，不会是 `null`

### 16.9 组件层修改

#### AbilitySettings.tsx

```typescript
export const AbilitySettings: FC = () => {
  // 移除对 settingsStore 的依赖
  const [promptTemplate, setPromptTemplate] = useState('')
  const [optimizePromptTemplate, setOptimizePromptTemplate] = useState('')

  // 加载模板文件
  useEffect(() => {
    const loadTemplates = async () => {
      const smartCreateTemplate = await loadAbilityTemplateFile('smart-create')
      const optimizeTemplate = await loadAbilityTemplateFile('optimize')
      setPromptTemplate(smartCreateTemplate)
      setOptimizePromptTemplate(optimizeTemplate)
    }
    loadTemplates()
  }, [])

  const handleSave = async () => {
    // 保存到本地文件
    await saveAbilityTemplateFile('smart-create', promptTemplate)
    await saveAbilityTemplateFile('optimize', optimizePromptTemplate)
    addToast('保存成功', 'success')
  }
}
```

#### OptimizeModal.tsx

```typescript
interface OptimizeModalProps {
  isOpen: boolean
  onClose: () => void
  currentContent: string
  onConfirm: (optimizedContent: string) => void
  title?: string
  templateType?: 'ability-optimize' | 'command-optimize' | 'agent-optimize'  // 新增
  promptTemplate?: string  // 改为可选
  placeholders?: { ... }
}

// 在 handleOptimize 中加载模板
let promptTemplate = providedPromptTemplate
if (!promptTemplate) {
  promptTemplate = await loadAbilityTemplateFile('optimize')
}
```

### 16.10 技术优势

| 特性 | 说明 |
|------|------|
| **持久化存储** | 模板保存到本地文件，不受浏览器缓存影响 |
| **懒加载** | 只在需要时加载，减少不必要的文件读取 |
| **多重降级** | 文件不存在 → 内置默认模板，保证功能可用 |
| **类型安全** | TypeScript 保证永远返回字符串，不会为 null |
| **模块化** | 按业务分类存储，预留扩展空间 |
| **向下兼容** | 浏览器环境降级使用 localStorage |

### 16.11 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `ocean/src/utils/storage.ts` | 修改 | 添加模板文件读写函数和类型声明 |
| `ocean/electron/main.ts` | 修改 | 添加 IPC 处理器（生产环境） |
| `ocean/electron/launch.cjs` | 修改 | 添加 IPC 处理器（开发环境） |
| `ocean/electron/preload.ts` | 修改 | 暴露 API（生产环境） |
| `ocean/electron/preload.dev.cjs` | 修改 | 暴露 API（开发环境） |
| `ocean/src/components/settings/AbilitySettings.tsx` | 修改 | 使用文件存储 |
| `ocean/src/components/ability/AbilityModal.tsx` | 修改 | 调用 LLM 前加载模板 |
| `ocean/src/components/ui/OptimizeModal.tsx` | 修改 | 调用 LLM 前加载模板 |
| `business-design-doc/ability-design.md` | 修改 | 添加 v1.9 版本记录 |

### 16.12 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.9 | 2026-03-15 | 新增模板文件持久化功能，解决模板加载失败问题 |

---

## 十五、组件重构：AbilityOptimizeModal → OptimizeModal（v1.8 新增）

### 15.1 重构背景

在完成能力优化功能（v1.6）和优化内容对比功能（v1.7）后，发现优化弹窗组件具有很高的通用性，可以被命令模块、智能体模块、知识库模块等其他业务模块复用。因此将 `AbilityOptimizeModal` 重构为通用的 `OptimizeModal` 组件。

### 15.2 文件迁移

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `src/components/ability/AbilityOptimizeModal.tsx` | `src/components/ui/OptimizeModal.tsx` | 从业务组件迁移到通用组件库 |

### 15.3 接口设计演进

#### 原接口（业务专用）

```typescript
interface AbilityOptimizeModalProps {
  isOpen: boolean
  onClose: () => void
  currentContent: string
  onConfirm: (optimizedContent: string) => void
}
```

#### 新接口（通用可配置）

```typescript
interface OptimizeModalProps {
  isOpen: boolean
  onClose: () => void
  currentContent: string
  onConfirm: (optimizedContent: string) => void
  title?: string              // 弹窗标题，默认"优化内容"
  promptTemplate: string      // 提示词模板
  placeholders?: {            // 占位符配置
    currentContent?: string   // 默认 {{currentContent}}
    optimizeTarget?: string   // 默认 {{optimizeTarget}}
  }
}
```

### 15.4 可扩展性设计

#### 自定义标题

不同业务模块可以设置不同的弹窗标题：

```tsx
// 能力模块
<OptimizeModal title="优化能力内容" ... />

// 命令模块
<OptimizeModal title="优化命令内容" ... />

// 智能体模块
<OptimizeModal title="优化智能体内容" ... />
```

#### 自定义提示词模板

每个业务模块可传入自己的优化策略：

```tsx
// 能力模块
<OptimizeModal
  promptTemplate={abilityConfig.optimizePromptTemplate}
  ...
/>

// 命令模块
<OptimizeModal
  promptTemplate={commandConfig.optimizePromptTemplate}
  ...
/>
```

#### 自定义占位符

支持不同语言或命名风格的占位符：

```tsx
<OptimizeModal
  placeholders={{
    currentContent: '{{原始内容}}',
    optimizeTarget: '{{优化目标}}'
  }}
  ...
/>
```

### 15.5 使用示例

#### 能力模块使用

```tsx
import { OptimizeModal } from '../ui'

// 在组件中
const [showOptimizeModal, setShowOptimizeModal] = useState(false)

// 渲染优化弹窗
<OptimizeModal
  isOpen={showOptimizeModal}
  onClose={() => setShowOptimizeModal(false)}
  currentContent={content}
  onConfirm={(optimizedContent) => {
    setContent(optimizedContent)
    addToast('已应用优化结果', 'success')
  }}
  title="优化能力内容"
  promptTemplate={abilityConfig.optimizePromptTemplate}
/>
```

#### 命令模块使用（示例）

```tsx
import { OptimizeModal } from '../ui'

// 在命令编辑器中
const [showOptimizeModal, setShowOptimizeModal] = useState(false)

// 渲染优化弹窗
<OptimizeModal
  isOpen={showOptimizeModal}
  onClose={() => setShowOptimizeModal(false)}
  currentContent={commandContent}
  onConfirm={(optimizedContent) => {
    setCommandContent(optimizedContent)
    addToast('已应用优化结果', 'success')
  }}
  title="优化命令内容"
  promptTemplate={commandConfig.optimizePromptTemplate}
/>
```

### 15.6 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/components/ui/OptimizeModal.tsx` | 新建 | 通用优化弹窗组件 |
| `src/components/ui/index.ts` | 修改 | 导出 OptimizeModal |
| `src/components/ability/AbilityModal.tsx` | 修改 | 使用新组件，传入提示词模板 |
| `src/components/ability/AbilityOptimizeModal.tsx` | 删除 | 旧组件已废弃 |

### 15.7 架构优势

| 优势项 | 说明 |
|--------|------|
| 低耦合 | 组件不再依赖特定业务模块的配置（如 settingsStore.abilityConfig） |
| 高复用 | 可被命令、智能体、知识库等多个模块使用 |
| 易扩展 | 通过 props 传入配置，灵活适配不同业务场景 |
| 类型安全 | 完整的 TypeScript 类型定义和 JSDoc 文档注释 |
| 统一体验 | 所有业务模块使用一致的优化交互界面 |

### 15.8 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.8 | 2026-03-15 | 重构 AbilityOptimizeModal 为通用 OptimizeModal 组件，支持其他业务模块复用 |

---

## 十七、Agentic 创建页面 UI 优化（v1.11 新增）

### 17.1 功能概述

对 Agentic 创建页面进行 UI 简化和交互优化，提升用户体验。

### 17.2 优化内容

#### 17.2.1 移除冗余元素

**移除内容：**
- 输入框下方的灰色说明文字："Agentic 将自动读取已有能力文档作为参考，创建符合项目规范的新能力"
- 空状态提示：日志区域的灰色框框和"输入描述后点击开始，Agent 将自动执行"提示

#### 17.2.2 按钮布局调整

**调整前：**
```
┌─────────────────────────────────────────┐
│  [返回选择]                              │  <- 顶部
│                                         │
│  描述输入框                              │
│                                         │
│  日志区域                                │
│                                         │
│              [开始执行] [清除结果]        │  <- 底部
└─────────────────────────────────────────┘
```

**调整后：**
```
┌─────────────────────────────────────────┐
│                                         │
│  描述输入框                              │
│                                         │
│  日志区域（可折叠）                       │
│                                         │
│    [返回选择] [开始生成]                  │  <- 底部
└─────────────────────────────────────────┘
```

#### 17.2.3 按钮样式统一

| 按钮 | 样式 | 说明 |
|------|------|------|
| 返回选择 | `Button variant="ghost" size="sm"` | 与手动创建页面的"取消"按钮一致 |
| 开始生成/中止生成 | `Button variant="outline" size="sm"` | 与手动创建页面的"创建"按钮一致 |

#### 17.2.4 日志折叠功能

`AgentLoopLogger` 组件新增整个区域折叠功能：

**新增属性：**
- `defaultCollapsed?: boolean` - 默认折叠状态，默认 `false`
- `collapsible?: boolean` - 是否允许折叠，默认 `true`

**交互效果：**
- 点击日志区域标题栏可折叠/展开整个内容区
- 折叠时显示向右箭头图标 `ChevronRight`
- 展开时箭头旋转90度变成向下箭头

#### 17.2.5 交互优化

**开始生成按钮：**
- 默认可点击（不再因描述为空而禁用）
- 点击时验证描述是否为空，为空则弹出 toast 提示

**状态清空：**
- 点击"返回选择"时：清空输入框内容和日志记录
- 点击"开始生成"时：清空之前的日志，开始新生成

### 17.3 LLM 创建页面同步优化

为保持一致性，LLM 创建页面同步修改：
- 移除输入框下方的灰色说明文字
- 移除顶部的返回按钮，移到底部
- 统一按钮样式

### 17.4 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/components/ability/AbilityModal.tsx | 修改 | UI 优化、交互逻辑调整 |
| src/components/agent/AgentLoopLogger.tsx | 修改 | 新增整个区域折叠功能 |

### 17.5 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.11 | 2026-03-15 | Agentic 创建页面 UI 优化：移除冗余文字、调整按钮布局、日志可折叠、交互优化 |

---

## 十八、LLM 创建能力简化优化（v1.13 新增）

### 18.1 功能概述

**优化目标**：简化 LLM 创建能力的输出格式，提高稳定性和用户体验。

**核心变化**：
- 从"要求 JSON 格式输出"改为"直接输出 Markdown 内容"
- 简化解析逻辑，删除复杂的 JSON 提取函数
- 用户可自由编辑 name 和 description，不受 LLM 限制

### 18.2 问题分析

#### 当前痛点
1. **JSON 输出不稳定**：LLM 生成的 JSON 格式容易出错
2. **解析逻辑复杂**：需要处理嵌套代码块、多层提取策略
3. **用户体验受限**：name 和 description 由 LLM 决定，用户无法自定义

#### 示例对比

**修改前**（要求 JSON）：
```json
{
  "name": "代码审查",
  "description": "对代码进行专业审查，发现潜在问题并提供改进建议",
  "content": "# 代码审查能力\n\n## 能力说明\n..."
}
```

**修改后**（直接输出 Markdown）：
```markdown
# 代码审查能力

## 能力说明
本能力用于对代码进行全面审查，发现潜在问题并提供改进建议。

## 审查维度
1. 代码规范 - 检查命名、格式、注释等
2. 逻辑正确性 - 验证业务逻辑和边界条件
...
```

### 18.3 技术实现

#### 18.3.1 提示词模板简化

**文件**：`ocean/src/utils/storage.ts`

**核心变化**：
- 移除 `{{userDescription}}` 显式占位符要求
- 移除 JSON 格式要求
- 简化为直接输出 Markdown 内容

#### 18.3.2 解析逻辑简化

**文件**：`ocean/src/services/llmService.ts`

**删除**：
- `extractJSONFromCodeBlock` 函数（约 60 行）
- 多层 JSON 提取策略
- 嵌套代码块处理逻辑

**新增**：
```typescript
export const parseAbilityContent = (content: string): AbilityGenerateResult | null => {
  // 移除可能的 markdown 代码块标记
  let cleanedContent = content.trim()

  if (cleanedContent.startsWith('```')) {
    const firstNewline = cleanedContent.indexOf('\n')
    const lastBackticks = cleanedContent.lastIndexOf('```')
    if (firstNewline !== -1 && lastBackticks !== -1) {
      cleanedContent = cleanedContent.substring(firstNewline + 1, lastBackticks).trim()
    }
  }

  return { content: cleanedContent }
}
```

#### 18.3.3 类型定义简化

```typescript
// 修改前
export interface AbilityGenerateResult {
  name: string
  description: string
  content: string
}

// 修改后
export interface AbilityGenerateResult {
  content: string
}
```

#### 18.3.4 前端调用优化

**文件**：`ocean/src/components/ability/AbilityModal.tsx`

```typescript
// 修改前
setName(parsed.name)
setDescription(parsed.description)
setContent(parsed.content)

// 修改后
// 只填充内容，名称和描述由用户填写
setContent(parsed.content)
```

### 18.4 降级处理机制

#### 问题场景
用户反馈：如果模板中没有 `{{userDescription}}` 占位符怎么办？

#### 解决方案
在 `llmService.ts` 中添加智能降级处理：

```typescript
let prompt = promptTemplate
if (promptTemplate.includes('{{userDescription}}')) {
  // 标准情况：模板中有占位符，直接替换
  prompt = promptTemplate.replace('{{userDescription}}', userDescription)
} else {
  // 降级处理：模板中没有占位符，自动追加用户描述
  console.warn('提示词模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
  prompt = `${promptTemplate}\n\n## 用户需求\n${userDescription}`
}
```

同样的逻辑也应用到优化功能。

#### 容错性优势
1. 用户不需要记住占位符语法
2. 即使模板没有占位符也能正常工作
3. 控制台输出警告帮助调试
4. 自动追加标题和内容

### 18.5 优化效果

| 维度 | 优化前 | 优化后 |
|------|--------|--------|
| 代码量 | ~60 行复杂解析逻辑 | ~20 行简单解析逻辑 |
| 稳定性 | JSON 格式错误易导致解析失败 | 无格式要求，稳定性提升 |
| 用户体验 | name/description 受 LLM 限制 | 用户可自由编辑 |
| 提示词复杂度 | 需要明确 JSON 格式要求 | 简洁直观 |

### 18.6 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.13 | 2026-03-15 | LLM 创建能力简化优化：JSON 输出改为 Markdown、删除复杂解析逻辑、添加占位符降级处理 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*
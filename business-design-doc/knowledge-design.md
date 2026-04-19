# 知识模块前端设计规范

> 本文档总结了知识模块的前端UI设计、交互效果和视觉规范，参考能力模块设计规范编写。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：与节点模块、资源文件模块、智能体模块、命令模块、能力模块保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 颜色点缀仅用于图标标识
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、模块定位

### 2.1 知识模块概念
知识模块是**业务知识存储单元**，每次创建的是单篇知识文档，用于存储和管理业务相关的知识内容。与能力模块类似，知识模块采用简洁的设计，专注于定义可复用的业务知识。

### 2.2 与能力模块的差异
- 知识侧重业务知识存储
- 能力侧重最小能力单元
- 两者结构相似，但定位不同

---

## 三、数据持久化设计

### 3.1 存储格式

知识模块采用 **Markdown 文件持久化**，与能力模块类似：

```markdown
---
name: business-knowledge
description: 业务知识描述...
---
# 知识内容
业务知识的详细说明：
1. 知识点一
2. 知识点二
...
```

### 3.2 存储位置

```
.claude/
├── agents/           # 智能体文件（sub-agent）
├── resources/        # 资源文件
├── commands/         # 命令文件
├── abilities/        # 能力文件
├── knowledges/       # 知识文件存储目录（新增）
│   └── {name}.md
└── ...
```

### 3.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 知识库名称，作为文件名 |
| description | string | 否 | 知识描述 |

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

### 4.2 知识图标颜色

#### 列表页和编辑页 - 深灰色（与主题保持一致）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 深灰 | #374151 | #E5E7EB |

#### 详情页 - 蓝色主题（突出书本图标）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 蓝色 | #3B82F6 | #DBEAFE |

**设计说明**：知识详情页使用蓝色主题，配合 BookOpen（打开的书本）图标，区别于能力的黄色主题，给用户清晰的视觉区分。

---

## 五、组件设计

### 5.1 知识卡片 (KnowledgeCard)

#### 整体布局

```
┌─────────────────────────────────────┐
│  [📖] 知识名称                 [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 知识说明 - 这是一个...    │   │  <- 内容预览区 (bg-gray-50)
│  │ - 知识点一：...            │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 设计规范

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| BookOpen 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
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

### 5.2 创建/编辑弹窗 (KnowledgeModal)

#### 弹窗结构

```
┌─────────────────────────────────────────┐
│  创建新知识                          × 关闭 │  <- 头部区域
├─────────────────────────────────────────┤
│                                         │
│  知识名称 *                             │
│  [________________________]             │
│                                         │
│  知识描述                               │
│  [________________________]             │
│  [________________________]             │
│                                         │
│  知识内容 *                        编辑│预览│
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
| 知识名称 | Input | 是 | 唯一标识，编辑时不可修改 |
| 知识描述 | Textarea | 否 | 简要描述知识用途 |
| 知识内容 | Textarea | 是 | 支持 Markdown 格式，支持编辑/预览切换 |

---

### 5.3 详情弹窗 (KnowledgeDetailModal)

#### 弹窗结构

```
┌─────────────────────────────────────────┐
│  [📖] 知识名称          [knowledge]     │  <- 头部固定区域（蓝色主题）
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  知识描述                               │
│  [描述内容...]                          │
│                                         │
│  知识内容                               │
│  [Markdown 渲染内容...]                 │
│                                         │
├─────────────────────────────────────────┤
│  关闭                         [编辑]    │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

#### 蓝色主题设计

```tsx
// 知识库详情页使用蓝色主题，区别于能力的黄色
const colorConfig = {
  color: '#3B82F6',     // 蓝色图标
  bgColor: '#DBEAFE',   // 浅蓝色背景
}

// 头部图标区域
<div className="w-14 h-14 rounded-xl flex items-center justify-center"
     style={{ backgroundColor: colorConfig.bgColor }}>
  <BookOpen size={28} style={{ color: colorConfig.color }} />
</div>

// 标签区域（只显示文字，不带图标）
<span style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}>
  knowledge
</span>
```

#### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 图标背景 | `#DBEAFE` | 浅蓝色背景 |
| 图标颜色 | `#3B82F6` | 蓝色 BookOpen 图标 |
| 标签背景 | `#DBEAFE` | 浅蓝色背景 |
| 标签文字 | `#3B82F6` | 蓝色文字，只显示文字不带图标 |

---

## 六、表单验证设计

### 6.1 验证规则

| 字段 | 规则 |
|------|------|
| 知识库名称 | 必填，创建时检查唯一性 |
| 知识库内容 | 必填 |

### 6.2 验证反馈方式

```tsx
// 1. Toast 提示
addToast('请输入知识库名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

---

## 七、知识标签功能设计

### 7.1 数据结构

```typescript
export interface KnowledgeFile {
  // ... 其他字段
  tags: string[]  // 标签数组
}
```

### 7.2 Frontmatter 存储格式

```markdown
---
name: business-knowledge
description: 业务知识描述
tags: [标签1, 标签2, 标签3]
---
# 知识内容
...
```

### 7.3 标签输入交互

#### 添加标签流程

```
┌─────────────────────────────────────┐
│  知识标签                            │
│  ┌──────┐ ┌──────┐ ┌────────────┐  │
│  │ 标签1 ×│ │ 标签2 ×│ │ + 添加标签  │  │  <- 虚线边框
│  └──────┘ └──────┘ └────────────┘  │
└─────────────────────────────────────┘

点击添加按钮后：

┌─────────────────────────────────────┐
│  知识标签                            │
│  ┌──────┐ ┌──────┐ ┌────────┐      │
│  │ 标签1 ×│ │ 标签2 ×│ │[输入框] │ ✓ ✕ │  │
│  └──────┘ └──────┘ └────────┘      │
└─────────────────────────────────────┘
```

#### 交互细节

| 操作 | 效果 |
|------|------|
| 点击 `+ 添加标签` | 显示输入框 |
| 输入后按 Enter | 确认添加标签 |
| 输入后点击 ✓ | 确认添加标签 |
| 按 Esc 或点击 ✕ | 取消添加 |
| 点击标签上的 × | 删除该标签 |

#### 验证规则

| 规则 | 说明 |
|------|------|
| 长度限制 | 单个标签不超过20个字符 |
| 重复检查 | 不允许添加重复标签 |
| 空白处理 | 空输入自动取消 |

### 7.4 标签展示样式

#### 编辑弹窗中的标签

```tsx
// 已添加的标签 - 蓝色胶囊
<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm">
  {tag}
  <button onClick={() => handleRemoveTag(index)}>
    <X size={14} />
  </button>
</span>

// 添加按钮 - 虚线边框
<button className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-500 rounded-full text-sm">
  <Plus size={14} />
  添加标签
</button>
```

#### 卡片上的标签

```tsx
// 最多显示3个标签
{knowledge.tags.slice(0, 3).map((tag, index) => (
  <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">
    {tag}
  </span>
))}
// 超出显示 +N
{knowledge.tags.length > 3 && (
  <span className="text-xs text-gray-400">+{knowledge.tags.length - 3}</span>
)}
```

### 7.5 搜索增强

支持通过标签搜索知识：

```typescript
const filteredKnowledges = knowledgeFiles.filter((knowledge) => {
  const query = searchQuery.toLowerCase()
  return knowledge.name.toLowerCase().includes(query) ||
         knowledge.description?.toLowerCase().includes(query) ||
         knowledge.content?.toLowerCase().includes(query) ||
         knowledge.tags?.some(tag => tag.toLowerCase().includes(query))
})
```

---

## 八、全局索引功能设计

### 8.1 功能概述

全局索引是知识库的特殊文件，用于存储知识库的整体索引信息。该文件命名为 `INDEX.md`，存储在知识库根目录下。具有以下特性：
- 不在知识首页列表中展示
- 通过独立的"全局索引"按钮访问
- **动态生成**：如果本地没有 INDEX.md，根据当前知识库文件结构自动生成嵌套树形目录
- **本地优先**：如果本地存在 INDEX.md，直接读取显示其内容
- 支持刷新（重新生成并覆盖）和保存操作
- 名称字段固定为"INDEX"，不可修改

### 8.2 入口设计

全局索引按钮位于知识图谱按钮旁边：

```
┌──────────────────────────────────────────────────────┐
│ [知识图谱] [全局索引]         [搜索框]    [新建知识]   │
└──────────────────────────────────────────────────────┘
```

按钮样式：
```tsx
<button
  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
>
  <FileSearch size={16} />
  <span>全局索引</span>
</button>
```

### 8.3 弹窗设计 (GlobalIndexModal)

#### 整体结构

```
┌─────────────────────────────────────────┐
│  [🔍] 全局索引              [INDEX.md]   │  <- 头部（浅灰色主题）
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）         │
│                                         │
│  ```                                    │
│  zoloz                                  │
│  ├── zoloz-ekyc-介绍.md                 │
│  └── zoloz-系统说明                      │
│      ├── 审理平台                        │
│      │   ├── 审理平台-业务背景介绍.md      │
│      │   └── 审理平台-存储结构            │
│      │       └── 审理平台-ES索引结构.md    │
│      └── Zmng系统                        │
│          └── zmng-常用功能接口            │
│              └── ekyc-业务总结果说明.md    │
│  ```                                    │
│                                         │
├─────────────────────────────────────────┤
│  关闭                   [刷新] [保存]     │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

#### 内容渲染规则

内容区域直接展示 markdown 渲染的树形目录或本地 INDEX.md 内容，不显示额外标签。

| 状态 | 显示内容 | 副标题 |
|------|----------|--------|
| 本地存在 INDEX.md | 读取并渲染本地文件内容 | 知识库全局索引 |
| 本地不存在 INDEX.md | 动态生成嵌套树形目录 | 知识库全局索引 |

#### 树形目录生成规则

通过 `generateIndexContent` 函数根据知识库文件列表动态生成：
- 根据 category 路径递归构建嵌套 TreeNode 结构
- 文件项显示 `.md` 后缀，文件夹不显示后缀
- 与目录节点同名的文件保留展示（如 zoloz/zoloz.md）
- 使用 box-drawing 字符渲染：`├──`、`└──`、`│`
- 文件和文件夹统一排序，先文件后文件夹
- 树形内容用 markdown 代码块包裹，确保渲染格式正确

#### 主题颜色

```tsx
// 全局索引使用浅灰色主题，区别于普通知识的蓝色
const colorConfig = {
  color: '#6B7280',     // 灰色图标
  bgColor: '#F3F4F6',   // 浅灰色背景
}
```

#### 按钮逻辑

| 按钮 | 图标 | 说明 |
|------|------|------|
| 刷新 | RefreshCw | 异步从磁盘重新加载知识库文件（`await loadKnowledgeFiles()`），再用最新数据 `generateIndexContent` 生成树形目录。刷新期间按钮显示 loading 状态 |
| 保存 | Save | 将当前显示的树形目录内容保存为 INDEX.md 到知识库根目录；已存在则覆盖更新，不存在则新建。保存操作仅写入 INDEX.md 单个文件，不触发其他知识文件的全量保存 |

#### 操作反馈

刷新和保存操作均通过 toast 提示反馈结果：
- 刷新成功：`刷新成功` (success)
- 保存成功：`保存成功` (success)

#### 刷新交互机制

刷新不直接写入文件，而是通过 `onRefresh` 回调返回最新生成的内容，由 GlobalIndexModal 内部 `refreshedContent` 状态管理：
- 刷新后 `displayContent` 优先使用 `refreshedContent`
- 副标题和标签同步切换为"自动生成"状态
- 关闭弹窗时重置 `refreshedContent`

### 8.4 代码生成逻辑

#### generateIndexContent 函数

```typescript
// 树形节点结构
interface TreeNode {
  name: string
  children: Map<string, TreeNode>
  files: string[]
}

// 根据 knowledgeFiles 动态生成树形目录 markdown
export const generateIndexContent = (
  knowledgeFiles: { name: string; category?: string }[]
): string
```

核心处理步骤：
1. 将知识文件按 category 路径构建 TreeNode 树
2. 同名文件保留（如目录 `zoloz/` 下的 `zoloz.md` 仍正常展示）
3. 统一排列文件和文件夹，按名称排序
4. 递归渲染，使用 box-drawing 字符
5. 用 markdown 代码块包裹输出

### 8.5 列表过滤

INDEX.md 文件从知识列表中排除：

```tsx
const filteredKnowledges = useMemo(() => {
  return knowledgeFiles
    .filter((k) => k.name.toLowerCase() !== 'index') // 排除全局索引
    .filter((knowledge) => {
      // 搜索过滤逻辑
    })
}, [knowledgeFiles, searchQuery])
```

### 8.6 名称锁定

全局索引的名称字段固定为"INDEX"，通过 KnowledgeModal 的 `isNameLocked` 属性实现：

```tsx
// KnowledgeModal 组件
interface KnowledgeModalProps {
  // ...
  isNameLocked?: boolean  // 是否锁定名称字段
}

<Input
  disabled={mode === 'edit' || isNameLocked}
/>

{isNameLocked && (
  <p className="mt-1 text-xs text-macos-text-tertiary">
    全局索引文件名固定为 INDEX
  </p>
)}
```

### 8.7 空状态处理

当知识库中没有任何文档时，显示提示：

```
┌─────────────────────────────────────┐
│                                     │
│            [🔍] (灰色圆形背景)        │
│                                     │
│       当前知识库中没有文档             │
│                                     │
└─────────────────────────────────────┘
```

---

## 九、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/types/index.ts | 修改 | 添加 KnowledgeFile 和 KnowledgeFileType 类型 |
| src/stores/knowledgeStore.ts | 新建 | 知识库状态管理 |
| src/utils/storage.ts | 修改 | 添加知识库文件存储方法 |
| electron/main.ts | 修改 | 添加知识库文件 IPC 通道 |
| electron/preload.ts | 修改 | 暴露知识库文件 API |
| electron/launch.cjs | 修改 | 开发环境 IPC |
| electron/preload.dev.cjs | 修改 | 开发环境 API |
| src/components/knowledge/KnowledgeCard.tsx | 新建 | 知识库卡片组件 |
| src/components/knowledge/KnowledgeModal.tsx | 新建 | 创建/编辑弹窗组件 |
| src/components/knowledge/KnowledgeDetailModal.tsx | 新建 | 详情查看弹窗组件 |
| src/components/knowledge/index.ts | 新建 | 统一导出 |
| src/pages/KnowledgesPage.tsx | 新建 | 知识库页面组件 |
| src/stores/appStore.ts | 修改 | 添加 'knowledges' 到 PageType |
| src/components/layout/Sidebar.tsx | 修改 | 添加知识库导航项 |
| src/components/layout/MainContent.tsx | 修改 | 添加知识库页面路由 |
| src/hooks/useReferenceItems.ts | 修改 | 添加知识库引用支持 |
| src/components/ui/ReferenceSelectModal.tsx | 修改 | 添加知识库分类 |
| src/App.tsx | 修改 | 添加知识库数据加载 |
| src/components/knowledge/GlobalIndexModal.tsx | 新建 | 全局索引弹窗组件 |
| src/components/settings/KnowledgeSettings.tsx | 新建 | 知识模块设置组件 |

---

## 十、Agentic 创建功能设计

### 10.1 功能概述

Agentic 创建功能允许用户通过 LLM Agent 智能生成知识文档内容。用户只需描述想要创建的知识内容，Agent 会自动执行任务，包括：
- 查看已有知识文档作为参考
- 根据用户描述生成符合格式的知识内容
- 生成后用户可二次编辑确认

### 10.2 创建模式选择界面

当用户点击「新建知识」按钮时，显示模式选择界面：

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         ┌──────────┐    ┌──────────┐                   │
│         │   ✏️     │    │   🤖     │                   │
│         │ 手动创建  │    │ Agentic  │                   │
│         │          │    │   创建   │                   │
│         └──────────┘    └──────────┘                   │
│            蓝色             紫色                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 10.3 Agentic 创建界面

```
┌─────────────────────────────────────────┐
│  🤖 描述你想要创建的知识                  │
│  ┌─────────────────────────────────────┐│
│  │ 例如：帮我创建一个代码规范的知识文档   ││
│  │ 包含命名规范、代码风格、注释规范...   ││
│  │                                     ││
│  │ Agentic 模式会：                    ││
│  │ 1. 查看 .claude/knowledges/ 已有文档 ││
│  │ 2. 参考已有文档的格式和风格           ││
│  │ 3. 根据描述创建新的知识文档           ││
│  └─────────────────────────────────────┘│
│                                         │
│  [Agent 执行日志区域 - 可展开/折叠]       │
│                                         │
│                    [返回选择]  [开始生成] │
└─────────────────────────────────────────┘
```

### 10.4 创建模式类型

| 模式 | 图标 | 颜色 | 说明 |
|------|------|------|------|
| 手动创建 | PenLine | 蓝色 | 直接编辑知识内容 |
| Agentic创建 | Bot | 紫色 | 通过 LLM Agent 智能生成 |

### 10.5 设置页面集成

在设置页面添加「知识」分类，提供 Agentic 创建模板的配置：

```
┌─────────────────────────────────────────┐
│  [Agentic创建模板]                       │
├─────────────────────────────────────────┤
│  🪄 知识Agentic创建提示词模板             │
│                                         │
│  模板中使用 {{userDescription}} 作为    │
│  用户输入描述的占位符。                   │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ ## 角色                              ││
│  │ 你是一个专业的知识库文档设计助手...   ││
│  │                                     ││
│  │ ## 任务                              ││
│  │ 根据用户描述，生成详细的知识文档内容。 ││
│  │                                     ││
│  │ 用户描述：{{userDescription}}        ││
│  └─────────────────────────────────────┘│
│                                         │
│  [使用说明]                              │
│  • Agentic 创建知识时，系统会将用户输入   │
│    的描述替换模板中的占位符               │
│  • Agent 会根据提示词自主执行任务生成     │
│    知识内容                              │
│  • 生成后用户可以二次编辑，确认后才会保存  │
└─────────────────────────────────────────┘
```

### 10.6 模板存储位置

```
.ocean/
├── template/
│   ├── ability/           # 能力模块模板
│   ├── skill/             # 技能模块模板
│   └── knowledge/         # 知识模块模板（新增）
│       └── agentic-create.json
```

### 10.7 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/utils/storage.ts | 修改 | 添加知识模板存储函数和 IPC 类型定义 |
| electron/preload.dev.cjs | 修改 | 添加知识模板 API |
| electron/launch.cjs | 修改 | 添加知识模板 IPC 通道 |
| src/components/knowledge/KnowledgeModal.tsx | 重构 | 添加创建模式和 Agentic 执行逻辑 |
| src/components/settings/KnowledgeSettings.tsx | 新建 | 知识模块设置组件 |
| src/components/settings/SettingsSidebar.tsx | 修改 | 添加知识设置选项 |
| src/components/settings/index.ts | 修改 | 添加 KnowledgeSettings 导出 |
| src/pages/SettingsPage.tsx | 修改 | 添加 KnowledgeSettings 渲染 |
| src/types/index.ts | 修改 | SettingsCategory 添加 'knowledge' |

---

## 十一、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.5 | 2026-04-13 | 全局索引缓存修复：刷新改为异步从磁盘重新加载、保存改为单文件写入、category始终从磁盘路径推导不依赖frontmatter、同名文件保留展示、移除多余标签文案 |
| 1.4 | 2026-04-13 | 全局索引功能重构：本地优先+动态生成树形目录，移除编辑按钮改为刷新+保存，generateIndexContent 递归嵌套树渲染，刷新即时显示+toast反馈 |
| 1.3 | 2026-03-26 | 新增 Agentic 创建功能设计，支持 LLM Agent 智能生成知识文档 |
| 1.2 | 2026-03-26 | 新增全局索引功能设计，支持 INDEX.md 文件的独立管理和编辑 |
| 1.1 | 2026-03-02 | 详情页标签只保留文字，移除图标，避免与头部图标冗余 |
| 1.0 | 2026-03-02 | 初始版本，基于能力模块设计规范创建 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*
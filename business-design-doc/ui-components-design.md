# 通用UI组件设计规范

> 本文档定义了项目中通用UI组件的设计规范，确保各业务模块保持一致的视觉和交互体验。

---

## 一、Card卡片组件

### 1.1 基础样式

```tsx
// Card 组件属性
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean    // 是否可悬浮，默认 true
  selected?: boolean     // 是否选中状态
  children: ReactNode
}
```

### 1.2 悬浮效果

**设计理念**：即时响应，无延迟感

```tsx
// 悬浮事件处理
const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
  if (hoverable && !selected) {
    e.currentTarget.style.transform = 'translateY(-2px)'
    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
  }
}

const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = 'none'
}

// 过渡动画
style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
```

### 1.3 悬浮效果对比

| 项目 | 旧方案 (framer-motion) | 新方案 (原生事件) |
|------|----------------------|------------------|
| 响应速度 | 有延迟感 | 即时响应 |
| 实现方式 | whileHover 属性 | onMouseEnter/Leave |
| 过渡时间 | duration: 0.2s | 0.2s |
| 视觉效果 | y: -2 + shadow | translateY(-2px) + shadow |

### 1.4 视觉效果

```
默认状态：
┌─────────────────┐
│    卡片内容     │
└─────────────────┘

悬浮状态：
    ┌─────────────────┐
    │    卡片内容     │  ↑ 上浮 2px
    └─────────────────┘
    ┌─────────────────┐
    │█阴影发光效果█│
    └─────────────────┘
```

---

## 二、业务卡片组件

### 2.1 组件列表

| 组件 | 文件路径 | 用途 |
|------|---------|------|
|WorkflowCard | `components/workflow/WorkflowCard.tsx` | 工作流卡片 |
| NodeCard | `components/node/NodeCard.tsx` | 节点卡片 |
| ToolCard | `components/tool/ToolCard.tsx` | 工具卡片 |
| ResourceCard | `components/resource/ResourceCard.tsx` | 资源文件卡片 |
| CommandCard | `components/command/CommandCard.tsx` | 命令卡片 |
| ProjectCard | `pages/ProjectSelectionPage.tsx` | 项目卡片 |

### 2.2 统一规范

所有业务卡片组件应：

1. **使用 Card 基础组件**：不单独实现悬浮效果
2. **移除外层 motion.div**：避免重复动画
3. **保持一致的交互体验**：即时响应的悬浮效果

### 2.3 组件模板

```tsx
import { Card } from '../ui/Card'

export const BusinessCard: FC<BusinessCardProps> = ({ data, onClick, onEdit, onDelete }) => {
  return (
    <Card className="group relative p-4 cursor-pointer h-full" onClick={onClick}>
      {/* 悬浮显示的操作按钮 */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button onClick={(e) => { e.stopPropagation(); onEdit?.() }}>
          <Edit3 size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete?.() }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* 卡片内容 */}
      {/* ... */}
    </Card>
  )
}
```

---

## 三、操作按钮悬浮效果

### 3.1 编辑按钮

```tsx
<button className="p-1.5 rounded-md hover:bg-gray-100 text-macos-text-secondary hover:text-macos-text">
  <Edit3 size={14} />
</button>
```

### 3.2 删除按钮

```tsx
<button className="p-1.5 rounded-md hover:bg-red-50 text-macos-text-secondary hover:text-macos-error">
  <Trash2 size={14} />
</button>
```

### 3.3 显示时机

- 默认隐藏：`opacity-0`
- 卡片悬浮时显示：`group-hover:opacity-100`
- 过渡动画：`transition-opacity`

---

## 四、卡片网格布局

### 4.1 页面布局

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map(item => (
    <BusinessCard key={item.id} data={item} />
  ))}
</div>
```

### 4.2 响应式断点

| 断点 | 列数 |
|------|------|
| 默认 | 1列 |
| sm (640px+) | 2列 |
| lg (1024px+) | 3列 |
| xl (1280px+) | 4列 |

---

## 五、文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/components/ui/Card.tsx` | 悬浮效果改为原生事件实现 |
| `src/components/workflow/WorkflowCard.tsx` | 移除外层 motion.div |
| `src/components/node/NodeCard.tsx` | 移除外层 motion.div |
| `src/components/tool/ToolCard.tsx` | 移除外层 motion.div |
| `src/components/resource/ResourceCard.tsx` | 移除外层 motion.div |
| `src/components/command/CommandCard.tsx` | 移除外层 motion.div |
| `src/pages/ProjectSelectionPage.tsx` | 项目卡片悬浮效果 |

---

## 六、Electron 窗口拖动区域

### 6.1 背景

Electron 使用 `titleBarStyle: 'hiddenInset'` 隐藏 macOS 原生标题栏，需要前端自行定义窗口拖动区域。

### 6.2 CSS 类定义

在 `src/styles/tailwind.css` 中定义：

```css
@layer utilities {
  /* 可拖拽区域 */
  .drag-region {
    -webkit-app-region: drag;
  }

  /* 禁用拖拽 */
  .no-drag {
    -webkit-app-region: no-drag;
  }
}
```

### 6.3 使用规范

**拖动区域**：
- 顶部固定定位的透明区域
- 高度：32px (`h-8`)
- 层级：最高 (`z-50`)
- 样式：`fixed top-0 left-0 right-0 h-8 drag-region z-50`

**交互元素**：
- 所有需要点击的元素必须添加 `no-drag` 类
- 包括：Logo、按钮、卡片列表、导航菜单等

### 6.4 布局适配

主界面需要在顶部留出拖动区域的空间：

```tsx
// App.tsx
<>
  {/* 窗口拖动区域 */}
  <div className="fixed top-0 left-0 right-0 h-8 drag-region z-50" />

  {/* 主内容区 - 顶部留出 32px 空间 */}
  <div className="h-screen w-full flex bg-macos-bg overflow-hidden pt-8">
    <Sidebar />
    <MainContent />
  </div>
</>
```

### 6.5 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/styles/tailwind.css` | 定义 `drag-region` 和 `no-drag` 类 |
| `src/App.tsx` | 添加拖动区域 + 主容器 `pt-8` |
| `src/pages/ProjectSelectionPage.tsx` | 添加拖动区域 + 交互元素 `no-drag` |
| `src/components/layout/Sidebar.tsx` | `pt-12` 改为 `pt-4` |

### 6.6 视觉示意

```
┌─────────────────────────────────────────┐
│ [🔴🟡🟢]        drag-region (32px)       │ ← 可拖动区域
├─────────────────────────────────────────┤
│                                         │
│              主内容区域                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## 七、页面头部简化设计

### 7.1 设计理念

保持界面极简风格，移除 redundant（冗余）的引导文字，让用户通过交互自然理解页面功能。

### 7.2 页面头部布局

**修改前**：
```
┌────────────────────────────────────────────────────────┐
│ 工作流                    [搜索工作流...] [新建工作流] │
└────────────────────────────────────────────────────────┘
```

**修改后**：
```
┌────────────────────────────────────────────────────────┐
│                          [搜索] [新建工作流]           │
└────────────────────────────────────────────────────────┘
```

### 7.3 移除内容清单

| 页面 | 移除的标题 | 移除的搜索 placeholder |
|------|-----------|----------------------|
| CommandsPage | "命令" | "搜索命令..." |
| WorkflowsPage | "工作流" | "搜索工作流..." |
| NodesPage | "节点" | "搜索节点..." |
| ResourcesPage | "资源文件" | "搜索资源..." |
| AgentsPage | "智能体" | "搜索智能体..." |

### 7.4 布局代码

```tsx
{/* 页面头部 */}
<div className="h-16 px-6 flex items-center justify-end">
  <div className="flex items-center gap-3">
    {/* 搜索框 - 无 placeholder */}
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
      <input
        type="text"
        placeholder=""
        className="pl-9 pr-4 py-2 w-48 ..."
      />
    </div>
    {/* 新建按钮 */}
    <Button>新建工作流</Button>
  </div>
</div>
```

### 7.5 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/pages/CommandsPage.tsx` | 移除标题、placeholder |
| `src/pages/WorkflowsPage.tsx` | 移除标题、placeholder |
| `src/pages/NodesPage.tsx` | 移除标题、placeholder |
| `src/pages/ResourcesPage.tsx` | 移除标题、placeholder |
| `src/pages/AgentsPage.tsx` | 移除标题、placeholder |

---

## 八、空状态简化设计

### 8.1 设计理念

空状态只显示图标，移除文字引导，保持极简风格。用户可通过顶部按钮或侧边栏了解页面功能。

### 8.2 空状态布局

**修改前**：
```
        ┌───────┐
        │  📁   │
        └───────┘
      还没有工作流
  创建工作流来开始设计你的业务流程
```

**修改后**：
```
        ┌───────┐
        │  📁   │
        └───────┘
```

### 8.3 移除内容清单

| 页面 | 移除的空状态文字 |
|------|-----------------|
| CommandsPage | "还没有命令"、"创建命令来管理和复用常用的操作指令" |
| WorkflowsPage | "还没有工作流"、"创建工作流来开始设计你的业务流程" |
| NodesPage | "还没有节点"、"创建节点来构建你的业务流程" |
| ResourcesPage | "还没有资源文件"、"创建资源文件来管理你的规则..." |
| AgentsPage | "还没有智能体"、"创建 sub-agent 智能体..." |

### 8.4 代码实现

```tsx
{/* 空状态 */}
<div className="h-full flex flex-col items-center justify-center text-center">
  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
    <Terminal size={32} className="text-macos-text-tertiary" />
  </div>
</div>
```

---

## 九、侧边栏导航项拖拽排序

### 9.1 功能概述

允许用户通过拖拽调整侧边栏导航项（智能体、命令、能力、知识、工作流、节点、资源文件）的顺序，并自动保存到本地配置，下次打开时恢复。

### 9.2 技术实现

**依赖库**：
- `@dnd-kit/core` - 拖拽核心库
- `@dnd-kit/sortable` - 排序功能
- `@dnd-kit/utilities` - 工具函数

**数据结构**：
```typescript
// AppConfig 中添加 sidebarNavOrder 字段
export interface AppConfig {
  recentProjects: Project[]
  lastProjectPath: string | null
  maxRecentProjects: number
  sidebarNavOrder?: string[]  // 侧边栏导航项顺序（存储 PageType 的 id）
}

// 默认导航顺序
const DEFAULT_NAV_ORDER: PageType[] = [
  'agents', 'commands', 'abilities', 'knowledges',
  'workflows', 'nodes', 'resources'
]
```

**状态管理**：
```typescript
// appStore.ts
interface AppState {
  // ...其他状态
  sidebarNavOrder: PageType[]
  setSidebarNavOrder: (order: PageType[]) => void
  initSidebarNavOrder: (order: PageType[] | undefined) => void
}
```

### 9.3 交互设计

**拖拽激活**：
- 激活方式：长按 200ms 后激活
- 容差：允许手指/鼠标移动 5px
- 无需特定手柄，整个导航项可拖拽

**视觉反馈**：
- 默认光标：`cursor-grab`（可抓取）
- 拖拽中光标：`cursor-grabbing`（抓取中）
- 拖拽中：透明度降低到 0.8，层级提升到 1000

```
默认状态：
┌─────────────────────┐
│ 🤖 智能体           │  ← 整个区域可长按拖拽
│ 💻 命令             │
│ ⚡ 能力             │
│ ...                 │
└─────────────────────┘

拖拽中：
┌─────────────────────┐
│ 💻 命令        (拖动中，透明度0.8)
│ ⚡ 能力             │
│ 🤖 智能体           │  ← 交换位置
│ ...                 │
└─────────────────────┘
```

### 9.4 组件代码

```tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// 可排序导航项组件 - 长按拖拽，无手柄图标
const SortableNavItem: FC<SortableNavItemProps> = ({ id, label, icon, isActive, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={onClick}
        className="... cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <Icon size={20} />
        <span>{label}</span>
        {/* 无手柄图标，整个按钮可长按拖拽 */}
      </button>
    </div>
  )
}

// Sidebar 组件
const Sidebar: FC = () => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,      // 长按 200ms 后激活拖拽
        tolerance: 5,    // 允许最多移动 5px
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const newOrder = arrayMove(sidebarNavOrder, oldIndex, newIndex)
      setSidebarNavOrder(newOrder)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sidebarNavOrder} strategy={verticalListSortingStrategy}>
        {sortedNavItems.map(item => (
          <SortableNavItem key={item.id} {...item} />
        ))}
      </SortableContext>
    </DndContext>
  )
}
```

### 9.5 数据持久化

导航顺序保存在应用配置中：

**浏览器环境**：localStorage
**Electron环境**：通过 IPC 保存到本地配置文件

应用启动时自动加载并恢复上次的导航顺序。

### 9.6 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/types/index.ts` | AppConfig 添加 sidebarNavOrder 字段 |
| `src/utils/storage.ts` | DEFAULT_APP_CONFIG 添加默认导航顺序 |
| `src/stores/appStore.ts` | 添加 sidebarNavOrder 状态和管理方法 |
| `src/stores/projectStore.ts` | 添加 appConfig 状态，修改保存逻辑保留导航顺序 |
| `src/components/layout/Sidebar.tsx` | 实现拖拽排序功能 |

---

## 十、Modal 组件设计规范

### 10.1 ESC 关闭功能

所有弹窗组件支持通过 ESC 键关闭，与点击遮罩层关闭方式一致，提升键盘操作体验。

### 10.2 ESC 键实现方式

在 Modal 基础组件中统一实现，使用 **capture 阶段**捕获事件：

```tsx
// Modal.tsx
import { useEffect } from 'react'

export const Modal: FC<ModalProps> = ({ isOpen, onClose, ... }) => {
  // 监听 ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation()  // 阻止事件冒泡
        e.preventDefault()   // 阻止默认行为
        onClose()
      }
    }

    if (isOpen) {
      // 使用 capture 阶段，确保嵌套弹窗时内层优先处理
      document.addEventListener('keydown', handleKeyDown, true)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isOpen, onClose])

  // ... 渲染弹窗内容
}
```

**关键点**：
- 使用 `capture: true`（第三个参数）确保内层弹窗优先处理 ESC 事件
- 调用 `e.stopPropagation()` 阻止事件继续传播
- 调用 `e.preventDefault()` 阻止浏览器默认行为

### 10.3 覆盖范围

**使用 Modal 基础组件的弹窗**（自动获得 ESC 关闭功能）：
- AgentDetailModal、AgentModal
- NodeDetailModal、NodeModal
- ResourceDetailModal、ResourceModal
- CommandDetailModal、CommandModal
- AbilityDetailModal、AbilityModal
- KnowledgeDetailModal、KnowledgeModal
- CreateWorkflowModal

**独立实现的弹窗**（需单独添加）：
- ConfirmModal - 已添加 ESC 监听
- WorkflowEditorModal - 已自行实现 ESC 监听
- ReferenceSelectModal - 键盘事件中已处理 ESC
- KnowledgeGraphModal - 已自行实现 ESC 监听

### 10.4 弹窗层级规范

当存在嵌套弹窗时，需要正确设置 z-index 层级：

| 弹窗类型 | z-index | 说明 |
|---------|---------|------|
| 通用 Modal | z-50 | 默认层级，用于详情、编辑弹窗 |
| KnowledgeGraphModal | z-40 | 知识图谱弹窗，低于详情弹窗 |
| 遮罩层 | 与弹窗同级 | 每个弹窗自带遮罩层 |

**设计原则**：后打开的弹窗（如详情弹窗）应显示在先打开的弹窗（如知识图谱）之上。

### 10.5 滚动锁定与防抖动

弹窗打开时锁定 body 滚动，防止背景页面滚动：

```tsx
// 打开弹窗时锁定 body 滚动
useEffect(() => {
  if (isOpen) {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }
}, [isOpen])
```

**防抖动方案**：使用 CSS `scrollbar-gutter: stable`

```css
/* tailwind.css */
body {
  /* 始终为滚动条保留空间，防止弹窗打开时布局抖动 */
  scrollbar-gutter: stable;
}
```

**原理**：浏览器会始终为滚动条预留空间，即使滚动条消失，页面宽度也不会变化。

### 10.6 ESC 关闭后焦点处理

关闭弹窗后，浏览器会将焦点返回到之前聚焦的元素，可能导致按钮显示 focus 样式（如黄色边框）。

**解决方案**：在关闭前 blur 当前焦点元素

```tsx
// KnowledgeGraphModal.tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen) {
    // 移除当前焦点，避免关闭后按钮显示 focus 样式
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    onClose()
  }
}
```

### 10.7 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/ui/Modal.tsx` | ESC 键监听、滚动锁定 |
| `src/components/ui/ConfirmModal.tsx` | ESC 键监听 |
| `src/components/knowledge/KnowledgeGraph.tsx` | ESC 键监听、焦点处理、z-index 调整 |
| `src/styles/tailwind.css` | scrollbar-gutter 防抖动 |

---

## 十一、默认页面选择逻辑

### 11.1 设计原则

应用首次进入主界面或切换项目后，默认选中**导航顺序的第一个页面**，而非固定选择智能体页面。

### 11.2 核心逻辑

```typescript
// appStore.ts

// 默认导航顺序
const DEFAULT_NAV_ORDER: PageType[] = ['agents', 'commands', 'abilities', 'knowledges', 'workflows', 'nodes', 'resources']

export const useAppStore = create<AppState>((set, get) => ({
  // 默认选中导航顺序的第一个页面
  currentPage: DEFAULT_NAV_ORDER[0],

  // 切换项目后，选中导航顺序的第一个页面
  finishSwitchingProject: () => {
    const { sidebarNavOrder } = get()
    const firstPage = sidebarNavOrder[0] || DEFAULT_NAV_ORDER[0]
    set({ isSwitchingProject: false, currentPage: firstPage })
  },

  // 初始化导航顺序时，同步更新当前页面
  initSidebarNavOrder: (order) => {
    if (order && order.length > 0) {
      set({ sidebarNavOrder: order, currentPage: order[0] })
    } else {
      set({ sidebarNavOrder: DEFAULT_NAV_ORDER, currentPage: DEFAULT_NAV_ORDER[0] })
    }
  },
}))
```

### 11.3 行为示例

| 场景 | 导航顺序 | 默认选中页面 |
|------|---------|-------------|
| 首次进入（默认顺序） | [智能体, 命令, 能力, ...] | 智能体 |
| 拖动后重新进入 | [工作流, 智能体, 命令, ...] | 工作流 |
| 切换项目 | [节点, 资源文件, ...] | 节点 |

### 11.4 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/stores/appStore.ts` | `currentPage` 初始值改为动态获取，`finishSwitchingProject` 和 `initSidebarNavOrder` 方法更新 |

---

## 十二、OptimizeModal 优化弹窗组件

### 12.1 组件概述

通用的内容优化弹窗组件,支持通过 LLM 对任意文本内容进行智能优化。可被能力模块、命令模块、智能体模块等多个业务场景复用。

### 12.2 组件路径

```
src/components/ui/OptimizeModal.tsx
```

### 12.3 接口定义

```typescript
interface OptimizeModalProps {
  /** 弹窗是否打开 */
  isOpen: boolean
  /** 关闭弹窗的回调 */
  onClose: () => void
  /** 当前待优化的内容 */
  currentContent: string
  /** 确认使用优化结果的回调 */
  onConfirm: (optimizedContent: string) => void
  /** 弹窗标题,默认为"优化内容" */
  title?: string
  /** 提示词模板,用于指导 LLM 如何优化内容 */
  promptTemplate: string
  /** 占位符配置,用于替换提示词模板中的变量 */
  placeholders?: {
    /** 当前内容的占位符,默认为 {{currentContent}} */
    currentContent?: string
    /** 优化目标的占位符,默认为 {{optimizeTarget}} */
    optimizeTarget?: string
  }
}
```

### 12.4 核心功能

| 功能项 | 说明 |
|--------|------|
| 优化目标输入 | 用户输入优化目标,指导 LLM 优化方向 |
| LLM 调用 | 通过配置的 LLM 提供商调用优化接口 |
| 结果预览/编辑 | 支持预览模式和编辑模式切换 |
| 内容对比 | Git diff 风格的优化前后对比 |
| 清除/确认 | 支持清除结果重新优化,确认使用优化结果 |

### 12.5 使用示例

#### 能力模块

```tsx
import { OptimizeModal } from '../ui'

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

#### 命令模块

```tsx
import { OptimizeModal } from '../ui'

<OptimizeModal
  isOpen={showOptimizeModal}
  onClose={() => setShowOptimizeModal(false)}
  currentContent={commandContent}
  onConfirm={(optimizedContent) => {
    setCommandContent(optimizedContent)
  }}
  title="优化命令内容"
  promptTemplate={commandConfig.optimizePromptTemplate}
/>
```

### 12.6 设计优势

| 优势项 | 说明 |
|--------|------|
| 低耦合 | 组件不依赖特定业务模块配置 |
| 高复用 | 可被多个业务模块使用 |
| 易扩展 | 通过 props 灵活配置 |
| 类型安全 | 完整的 TypeScript 类型定义 |
| 统一体验 | 所有业务模块使用一致的优化界面 |

### 12.7 相关组件

| 组件 | 说明 |
|------|------|
| Modal | 基础弹窗组件 |
| ContentDiffModal | 内容对比组件 |
| MarkdownRenderer | Markdown 渲染组件 |

---

## 十三、创建按钮滑动展开效果

### 13.1 设计理念

**目标**：提供优雅、现代化的创建按钮交互体验，减少视觉干扰。

**核心思想**：
- 默认状态仅显示图标，节省空间，保持界面简洁
- 悬浮时文字平滑展开，提供清晰的功能提示
- 统一所有业务模块的交互体验

### 13.2 实现原理

使用 Tailwind CSS 的 `group` 伪类实现父子元素联动：

```tsx
<Button
  variant="outline"
  onClick={handleCreateClick}
  className="group bg-[#E5E7EB] border border-gray-300 text-gray-700
             hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
>
  <Plus size={16} className="flex-shrink-0" />
  <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap
                   transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
    新建XX
  </span>
</Button>
```

### 13.3 样式详解

#### 容器样式

| 类名 | 作用 | 说明 |
|------|------|------|
| `group` | 分组标识 | 启用 group-hover 伪类选择器 |
| `overflow-hidden` | 隐藏溢出 | 确保文字超出时被裁剪 |
| `py-2` | 垂直内边距 | 固定垂直方向的内边距 |
| 移除 `px-3` | 移除水平内边距 | 让文字展开更自然 |

#### 图标样式

| 类名 | 作用 | 说明 |
|------|------|------|
| `flex-shrink-0` | 禁止压缩 | 防止图标在动画过程中被压缩变形 |

#### 文字样式

| 类名 | 作用 | 说明 |
|------|------|------|
| `max-w-0` | 初始宽度 | 默认状态下宽度为 0 |
| `group-hover:max-w-[80px]` | 悬浮宽度 | 悬浮时展开到 80px |
| `overflow-hidden` | 隐藏溢出 | 配合 max-w 使用 |
| `whitespace-nowrap` | 禁止换行 | 确保文字单行显示 |
| `transition-[max-width,margin]` | 过渡属性 | 只对宽度和边距进行过渡 |
| `duration-500` | 动画时长 | 500ms，给人优雅感 |
| `ease-in-out` | 缓动函数 | 开始和结束时较慢，中间较快 |
| `group-hover:ml-1.5` | 左边距 | 悬浮时添加 6px 左边距 |

### 13.4 动画时序

```
时间轴: 0ms ────────────── 500ms
       │                    │
状态:  max-w: 0          max-w: 80px
       margin-left: 0     margin-left: 6px
```

### 13.5 应用场景

适用于所有业务模块的首页创建按钮：

| 模块 | 文字内容 | 文件路径 |
|------|---------|---------|
| 知识模块 | 新建知识 | `ocean/src/pages/KnowledgesPage.tsx` |
| 资源文件模块 | 新建资源 | `ocean/src/pages/ResourcesPage.tsx` |
| 智能体模块 | 新建智能体 | `ocean/src/pages/AgentsPage.tsx` |
| 节点模块 | 新建节点 | `ocean/src/pages/NodesPage.tsx` |
| 工作流模块 | 新建工作流 | `ocean/src/pages/WorkflowsPage.tsx` |
| 命令模块 | 新建命令 | `ocean/src/pages/CommandsPage.tsx` |
| 能力模块 | 新建能力 | `ocean/src/pages/AbilitiesPage.tsx` |

### 13.6 视觉效果对比

#### 修改前

```
┌─────────────────┐
│  + 新建工作流   │  ← 固定宽度，始终显示文字
└─────────────────┘
```

#### 修改后

```
默认状态:
┌──┐
│+ │  ← 仅显示图标
└──┘

悬浮状态:
┌─────────────────┐
│+ 新建工作流     │  ← 文字平滑展开
└─────────────────┘
```

### 13.7 性能优化

- **只对必要属性进行过渡**：仅 `max-width` 和 `margin` 参与动画，避免布局抖动
- **避免按钮本身参与动画**：按钮容器固定高度，只有内部文字展开
- **使用 CSS 过渡而非 JS 动画**：利用浏览器优化，性能更好

### 13.8 可访问性考虑

- 按钮功能完整，键盘可访问
- 悬浮提示清晰，用户能理解按钮用途
- 动画不会影响功能使用

---

## 十四、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.9 | 2026-03-15 | 新增创建按钮滑动展开效果设计规范 |
| 1.8 | 2026-03-15 | 新增 OptimizeModal 通用优化弹窗组件设计规范 |
| 1.7 | 2026-03-02 | 新增默认页面选择逻辑：选中导航顺序第一个页面，支持拖动后动态变化 |
| 1.6 | 2026-03-02 | Modal 组件设计规范完善：ESC 键 capture 阶段、弹窗层级、滚动锁定防抖动、焦点处理 |
| 1.5 | 2026-03-02 | 侧边栏拖拽改为长按激活，移除手柄图标；新增 Modal ESC 关闭功能规范 |
| 1.4 | 2026-03-02 | 新增侧边栏导航项拖拽排序设计规范 |
| 1.3 | 2026-03-02 | 新增侧边栏导航项拖拽排序设计规范 |
| 1.2 | 2025-02-25 | 新增页面头部简化和空状态简化设计规范 |
| 1.1 | 2025-02-25 | 新增 Electron 窗口拖动区域设计规范 |
| 1.0 | 2025-02-18 | 初始版本，定义卡片悬浮效果规范 |

---

*本文档持续更新中，如有新的UI组件规范请及时补充。*
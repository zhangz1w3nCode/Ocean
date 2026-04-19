# 判断节点属性面板设计规范

> 本文档详细描述了工作流编辑器中判断节点属性面板的 UI 设计、交互逻辑和视觉规范。

---

## 一、设计概述

### 1.1 设计目标

为判断节点提供一个清晰、直观、易于配置的属性面板，支持用户自定义分支配置，同时保持良好的视觉一致性和操作体验。

### 1.2 核心特点

- **浮动面板设计**：不占用固定空间，选中节点时才显示
- **自定义分支**：支持添加任意数量的分支，"其他"分支始终在底部
- **视觉一致性**：与其他字段（名称、描述）保持统一的视觉风格
- **操作便捷**：分支配置简单直观，支持快速添加/删除

---

## 二、面板结构

### 2.1 整体布局

```
┌─────────────────────────────────┐
│ ● 判断节点名称            ×    │  ← 头部（无分割线）
├─────────────────────────────────┤
│                                 │
│ 🔖 名称                         │
│ [输入框]                        │
│                                 │
│ 〓 描述                         │
│ [文本域]                        │
│                                 │
│ ❓ 判断内容                     │
│ [文本域]                        │
│                                 │
│ 🔗 分支配置                     │
│                                 │
│ ├── 分支 1 ───────────┐         │
│ │   [输入框]          删除      │
│ │                     按钮      │
│ ├── 分支 2 ───────────┐         │
│ │   [输入框]          删除      │
│ │                     按钮      │
│ ├── 分支 3 ───────────┐         │
│ │   [输入框]          删除      │
│ │                     按钮      │
│ ├── 其他 ─────────────┐         │
│ │   [固定文案]                 │
│ │   "均不符合"上述分类"的进     │
│ │    入本分支"                 │
│ │                              │
│ ┌──────────────────────────┐   │
│ │  + 添加分支 (虚线边框)   │   │
│ └──────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

### 2.2 面板尺寸

```css
.properties-panel {
  position: absolute;
  right: 1rem;                     /* right-4 */
  top: 1rem;                       /* top-4 */
  bottom: 1rem;                    /* bottom-4 */
  width: 288px;                    /* w-72 */
  z-index: 10;

  /* 容器样式 */
  background-color: white;
  border-radius: 0.75rem;          /* rounded-xl */
  border: 1px solid #E5E7EB;       /* border-gray-200 */
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
}
```

### 2.3 动画效果

```tsx
// 属性面板进入/退出动画
<motion.div
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: 20 }}
  transition={{ duration: 0.15 }}
/>
```

---

## 三、头部设计

### 3.1 结构

```
┌─────────────────────────────────┐
│ ● 判断节点名称            ×    │
└─────────────────────────────────┘
```

### 3.2 样式规范

```css
.panel-header {
  padding: 0.75rem 1rem;           /* px-4 py-3 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 无底部边框 */
}

/* 节点类型指示圆点 */
.node-type-indicator {
  width: 0.625rem;                 /* w-2.5 */
  height: 0.625rem;                /* h-2.5 */
  border-radius: 0.25rem;          /* rounded */
  background-color: #FF9500;       /* 判断节点橙色 */
}

/* 节点名称 */
.node-title {
  font-size: 0.875rem;             /* text-sm */
  font-weight: 500;                /* font-medium */
  color: #1F2937;                  /* text-gray-800 */
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 关闭按钮 */
.close-button {
  padding: 0.25rem;                /* p-1 */
  color: #9CA3AF;                  /* text-gray-400 */
  hover: {
    background-color: #F3F4F6;     /* hover:bg-gray-100 */
    color: #4B5563;                /* hover:text-gray-600 */
  }
}
```

---

## 四、内容区域设计

### 4.1 字段通用样式

所有字段采用统一的视觉风格：

```css
.field-section {
  margin-bottom: 0.75rem;          /* space-y-3 */
}

.field-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;                   /* gap-1.5 */
  margin-bottom: 0.25rem;          /* mb-1 */

  font-size: 0.75rem;              /* text-xs */
  font-weight: 500;                /* font-medium */
  color: #374151;                  /* text-gray-700 */
}

/* Logo 容器 */
.logo-container {
  width: 1.25rem;                  /* w-5 */
  height: 1.25rem;                 /* h-5 */
  border-radius: 0.5rem;           /* rounded-lg */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
```

### 4.2 各字段详细设计

#### 4.2.1 名称字段

| 属性 | 值 |
|------|-----|
| Logo 背景 | `bg-blue-50` |
| Logo 图标 | `Tag` (标签图标) |
| Logo 颜色 | `text-blue-500` |
| 输入框 | 单行文本输入 |

```tsx
<label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
  <div className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center">
    <Tag size={11} className="text-blue-500" />
  </div>
  名称
</label>
<input
  type="text"
  value={selectedNode.data.label}
  onChange={(e) => handleUpdate('label', e.target.value)}
  className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg"
/>
```

#### 4.2.2 描述字段

| 属性 | 值 |
|------|-----|
| Logo 背景 | `bg-purple-50` |
| Logo 图标 | `AlignLeft` (文本图标) |
| Logo 颜色 | `text-purple-500` |
| 输入框 | 多行文本域 (2 行) |

```tsx
<label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
  <div className="w-5 h-5 rounded-lg bg-purple-50 flex items-center justify-center">
    <AlignLeft size={11} className="text-purple-500" />
  </div>
  描述
</label>
<textarea
  value={selectedNode.data.description || ''}
  onChange={(e) => handleUpdate('description', e.target.value)}
  placeholder="添加描述..."
  rows={2}
  className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg"
/>
```

#### 4.2.3 判断内容字段

| 属性 | 值 |
|------|-----|
| Logo 背景 | `bg-orange-50` |
| Logo 图标 | `HelpCircle` (问号图标) |
| Logo 颜色 | `text-orange-500` |
| 输入框 | 多行文本域 (2 行) |
| 字段文字颜色 | `text-gray-700` (与其他一致) |

```tsx
<label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
  <div className="w-5 h-5 rounded-lg bg-orange-50 flex items-center justify-center">
    <HelpCircle size={11} className="text-orange-500" />
  </div>
  判断内容
</label>
<textarea
  value={selectedNode.data.condition || ''}
  onChange={(e) => handleUpdate('condition', e.target.value)}
  placeholder="描述判断的主体和条件，如：检查用户是否已登录"
  rows={2}
  className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg"
/>
```

#### 4.2.4 分支配置字段

| 属性 | 值 |
|------|-----|
| Logo 背景 | `bg-blue-50` |
| Logo 图标 | `GitBranch` (分支图标) |
| Logo 颜色 | `text-blue-500` |
| 字段文字颜色 | `text-gray-700` |

```tsx
<label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
  <div className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center">
    <GitBranch size={11} className="text-blue-500" />
  </div>
  分支配置
</label>
```

---

## 五、分支列表设计

### 5.1 分支项结构

```
┌─────────────────────────────────┐
│  1   分支名称 1        [删除]   │
│  ┌───────────────────────────┐ │
│  │ [输入框：分支 1]           │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  2   分支名称 2        [删除]   │
│  ┌───────────────────────────┐ │
│  │ [输入框：分支 2]           │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  3   其他                       │
│  ┌───────────────────────────┐ │
│  │ 均不符合"上述分类"的进入   │ │
│  │ 本分支 (灰色，不可编辑)   │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
```

### 5.2 分支项样式

```css
.branch-item {
  background-color: #F9FAFB;       /* bg-gray-50 */
  border-radius: 0.75rem;          /* rounded-xl */
  padding: 0.625rem;               /* p-2.5 */
  margin-bottom: 0.5rem;           /* space-y-2 */
}

/* 分支头部 */
.branch-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;                     /* gap-2 */
  margin-bottom: 0.375rem;         /* mb-1.5 */
}

/* 序号 */
.branch-index {
  width: 1.25rem;                  /* w-5 */
  height: 1.25rem;                 /* h-5 */
  border-radius: 9999px;           /* rounded-full */
  background-color: #E5E7EB;       /* bg-gray-200 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;              /* text-xs */
  color: #9CA3AF;                  /* text-gray-400 */
  flex-shrink: 0;
}

/* 分支名称 */
.branch-name {
  font-size: 0.875rem;             /* text-sm */
  font-weight: 500;                /* font-medium */
  color: #4B5563;                  /* text-gray-700 */
}

/* 删除按钮 */
.delete-button {
  margin-left: auto;               /* flex-1 后 */
  padding: 0.25rem;                /* p-1 */
  color: #9CA3AF;                  /* text-gray-400 */
  hover: {
    background-color: #FEF2F2;     /* hover:bg-red-50 */
    color: #EF4444;                /* hover:text-red-500 */
  }
}

/* 输入框 */
.branch-input {
  width: 100%;
  padding: 0.25rem 0.5rem;         /* px-2 py-1 */
  font-size: 0.75rem;              /* text-xs */
  background-color: white;
  border: 1px solid #E5E7EB;       /* border-gray-200 */
  border-radius: 0.5rem;           /* rounded-lg */
}

/* "其他"分支输入框 */
.other-branch-input {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #F3F4F6;       /* bg-gray-100 */
  read-only;
}
```

### 5.3 "其他"分支特殊处理

| 属性 | 值 |
|------|-----|
| 名称 | 固定为"其他" |
| 输入框文案 | `均不符合"上述分类"的进入本分支` |
| 可编辑性 | 不可编辑 (`disabled`, `readOnly`) |
| 删除按钮 | 不显示 |
| 位置 | 始终在列表最底部 |

```tsx
{branches.map((branch, index) => {
  const isOtherBranch = branch.name === '其他'

  return (
    <div key={branch.id} className="bg-gray-50 rounded-xl p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs text-gray-400 bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center">
          {index + 1}
        </span>
        <span className="text-xs font-medium text-gray-700">
          {isOtherBranch ? '其他' : branch.name || `分支${index + 1}`}
        </span>
        <div className="flex-1" />
        {!isOtherBranch && (
          <button onClick={() => handleDeleteBranch(branch.id)}>
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <input
        type="text"
        value={isOtherBranch
          ? '均不符合"上述分类"的进入本分支'
          : branch.name}
        disabled={isOtherBranch}
        readOnly={isOtherBranch}
        className={`text-xs border rounded-lg ${
          isOtherBranch
            ? 'opacity-50 cursor-not-allowed bg-gray-100'
            : ''
        }`}
      />
    </div>
  )
})}
```

### 5.4 添加分支按钮

```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐ │
│  │      + 添加分支           │ │
│  │  (虚线边框，灰色文字)     │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
```

```css
.add-branch-button {
  width: 100%;                       /* w-full */
  padding: 0.625rem;                 /* py-2.5 */
  border: 2px dashed #D1D5DB;        /* border-2 border-dashed border-gray-300 */
  border-radius: 0.5rem;             /* rounded-lg */
  color: #6B7280;                    /* text-gray-500 */
  font-size: 0.875rem;               /* text-sm */
  font-weight: 500;                  /* font-medium */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;                     /* gap-1.5 */

  /* 悬停状态 */
  &:hover {
    border-color: #FB923C;           /* hover:border-orange-400 */
    color: #F97316;                  /* hover:text-orange-500 */
  }
}
```

---

## 六、分支添加逻辑

### 6.1 添加规则

```typescript
const handleAddBranch = () => {
  pushHistory()
  const currentBranches = selectedNode.data.branches || []
  const now = Date.now().toString()

  // 第一次添加：创建两个分支（用户分支 + "其他"）
  if (currentBranches.length === 0) {
    const otherBranch: Branch = {
      id: now + '-other',
      name: '其他',
      description: '均不符合"上述分类"的进入本分支',
    }
    const newBranch: Branch = {
      id: now,
      name: '分支 1',
    }
    updateNode(selectedNode.id, {
      branches: [newBranch, otherBranch]
    })
  } else {
    // 计算普通分支数量（排除"其他"）
    const normalBranches = currentBranches.filter(b => b.name !== '其他')
    const newBranch: Branch = {
      id: now,
      name: `分支${normalBranches.length + 1}`,
    }

    // 查找"其他"分支位置，插入到其前面
    const otherIndex = currentBranches.findIndex(b => b.name === '其他')
    if (otherIndex !== -1) {
      // 有"其他"分支，插入到前面
      const newBranches = [
        ...currentBranches.slice(0, otherIndex),
        newBranch,
        ...currentBranches.slice(otherIndex)
      ]
      updateNode(selectedNode.id, { branches: newBranches })
    } else {
      // 没有"其他"分支，直接追加
      updateNode(selectedNode.id, {
        branches: [...currentBranches, newBranch]
      })
    }
  }
}
```

### 6.2 分支顺序保证

**核心原则**："其他"分支始终在列表最底部

```
初始状态 (无分支)
  ↓ 点击"添加分支"
[分支 1] [其他]
  ↓ 点击"添加分支"
[分支 1] [分支 2] [其他]
  ↓ 点击"添加分支"
[分支 1] [分支 2] [分支 3] [其他]
```

---

## 七、间距规范

### 7.1 字段间距

所有字段之间使用统一的间距：

```css
.content-area {
  /* 容器内边距 */
  padding: 0.75rem;                  /* p-3 */

  /* 字段间距 */
  .field-section + .field-section {
    margin-top: 0.75rem;             /* space-y-3 */
  }
}
```

### 7.2 无分割线设计

- 头部与内容区域之间：**无分割线**
- 字段与字段之间：**无分割线**（仅通过 `space-y-3` 控制间距）
- 底部无 X/Y 坐标显示
- 底部无类型显示

---

## 八、图标规范

### 8.1 图标列表

| 字段 | 图标 | 尺寸 | 颜色 |
|------|------|------|------|
| 名称 | `Tag` | 11px | `text-blue-500` |
| 描述 | `AlignLeft` | 11px | `text-purple-500` |
| 判断内容 | `HelpCircle` | 11px | `text-orange-500` |
| 分支配置 | `GitBranch` | 11px | `text-blue-500` |
| 添加分支 | `Plus` | 12px | `text-orange-500` (hover) |
| 删除分支 | `Trash2` | 12px | `text-gray-400` |

### 8.2 图标导入

```tsx
import {
  X,           // 关闭按钮
  FileText,    // 核心任务（其他节点使用）
  GitBranch,   // 分支配置
  Plus,        // 添加分支
  Trash2,      // 删除分支
  Tag,         // 名称
  AlignLeft,   // 描述
  HelpCircle,  // 判断内容
} from 'lucide-react'
```

---

## 九、交互状态

### 9.1 输入框状态

| 状态 | 样式 |
|------|------|
| 默认 | `border-gray-200` |
| 聚焦 | `border-gray-400` + `focus:outline-none` |
| 禁用 | `opacity-50` + `cursor-not-allowed` + `bg-gray-100` |

### 9.2 按钮状态

| 按钮 | 默认 | 悬停 |
|------|------|------|
| 添加分支 | `text-gray-500` / `border-gray-300` | `text-orange-500` / `border-orange-400` |
| 删除分支 | `text-gray-400` | `text-red-500` + `bg-red-50` |
| 关闭按钮 | `text-gray-400` | `text-gray-600` + `bg-gray-100` |

---

## 十、响应式设计

### 10.1 面板宽度

```css
.properties-panel {
  width: 288px;                    /* w-72 - 固定宽度 */
}
```

### 10.2 内容滚动

```css
.content-area {
  flex: 1;
  overflow-y: auto;                /* 内容过多时滚动 */
}
```

---

## 十一、数据结构

### 11.1 Branch 接口

```typescript
export interface Branch {
  id: string                       // 分支唯一标识
  name: string                     // 分支名称
  description?: string             // 分支描述（可选）
}
```

### 11.2 判断节点数据

```typescript
interface ReactFlowNode {
  type: 'decision'
  data: {
    label: string                  // 节点名称
    description?: string           // 节点描述
    condition?: string             // 判断内容
    branches?: Branch[]            // 分支配置数组
  }
}
```

---

## 十二、文件位置

```
src/components/flow/
├── PropertiesPanel.tsx            # 属性面板主组件
└── nodes/
    └── DecisionNode.tsx           # 判断节点组件（画布上显示）
```

---

## 十三、设计检查清单

开发或修改判断节点属性面板时，请检查以下项目：

### 视觉设计
- [ ] 所有字段标题颜色是否统一为 `text-gray-700`
- [ ] Logo 是否使用正确的背景色和图标颜色
- [ ] 头部与内容区域之间是否无分割线
- [ ] 字段之间是否无分割线，间距是否一致
- [ ] 底部是否无 X/Y 坐标和类型显示

### 分支配置
- [ ] "其他"分支是否始终在列表最底部
- [ ] "其他"分支是否不可编辑、不可删除
- [ ] "其他"分支输入框是否显示固定文案
- [ ] 添加分支按钮是否在底部，是否为虚线边框样式
- [ ] 普通分支是否显示删除按钮

### 交互体验
- [ ] 添加分支时是否正确插入到"其他"之前
- [ ] 删除分支后序号是否重新排列
- [ ] 输入框聚焦时边框颜色是否变化
- [ ] 按钮悬停时是否有正确反馈

### 动画效果
- [ ] 面板进入/退出是否有平滑动画
- [ ] 动画时长是否为 0.15s

---

## 十四、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2025-02-17 | 初始版本，基于判断节点属性面板优化经验总结 |

### 1.0 版本包含的优化内容

1. **连线标签优化**：连线上不再显示分支名称标签
2. **"其他"分支固定化**：
   - 名称固定为"其他"
   - 文案固定为`均不符合"上述分类"的进入本分支`
   - 分支始终在列表最底部
3. **判断节点展示优化**：
   - 分支块采用圆角灰色背景 (`rounded-xl`)
   - 序号使用圆形灰色背景
   - 分支名称和文案分行显示
   - Handle 连接点位于每个分支块右侧中间
4. **属性面板样式优化**：
   - 所有字段添加带 Logo 的标题
   - 名称（蓝色）、描述（紫色）、判断内容（橙色）、分支配置（蓝色）
   - 移除头部分割线、字段分割线
   - 移除底部 X/Y 坐标和类型显示
   - "添加分支"按钮移至底部，采用虚线边框样式
5. **交互优化**：
   - 新分支插入到"其他"之前，保证"其他"始终在底部

---

*本文档持续更新中，如有新的设计规范请及时补充。*

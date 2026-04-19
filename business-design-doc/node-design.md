# 节点模块前端设计规范

> 本文档总结了节点管理模块的前端UI设计、交互效果和视觉规范，供其他模块复用参考。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：所有组件保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、颜色体系

### 2.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF

左侧菜单选中背景：#E5E7EB
```

### 2.2 状态颜色

```
成功/确认：
- 背景色：bg-green-50
- 文字色：text-green-700
- 边框色：border-green-200

警告/提示：
- 背景色：bg-yellow-50
- 文字色：text-yellow-700
- 图标色：text-yellow-500

错误/危险：
- 背景色：bg-red-50
- 文字色：text-red-700
- 边框色：border-red-200

**注意：禁止在常规状态下使用蓝色作为主题色**
```

### 2.3 节点类型颜色（仅用于节点图标标识）

| 类型 | 主色 | 背景色 |
|------|------|--------|
| 处理节点 | #007AFF | #E3F2FD |
| 业务节点 | #5856D6 | #EDE7F6 |

---

## 三、输入框设计

### 3.1 基础样式

```css
/* 输入框基础样式 */
.input-base {
  width: 100%;
  padding: 0.625rem 0.75rem;     /* py-2.5 px-3 */
  font-size: 0.875rem;           /* text-sm */
  background-color: white;
  border: 1px solid #E5E7EB;    /* border-gray-200 */
  border-radius: 0.5rem;         /* rounded-lg */
  placeholder-color: #9CA3AF;    /* text-macos-text-tertiary */
  outline: none;
}
```

### 3.2 交互状态

```css
/* 默认状态 */
border-color: #E5E7EB;           /* border-gray-200 */

/* 鼠标悬浮 */
border-color: #D1D5DB;           /* hover:border-gray-300 */

/* 聚焦状态 */
border-color: #9CA3AF;           /* focus:border-gray-400 */
box-shadow: 0 4px 12px rgba(0,0,0,0.08);  /* 聚焦阴影效果 */

/* 过渡动画 */
transition: border-color 0.2s, box-shadow 0.2s;
/* 注意：使用 transition-[border-color,box-shadow] 而非 transition-all，避免抖动 */
```

### 3.3 验证失败状态

```css
/* 验证失败 */
border-color: #9CA3AF;           /* border-gray-400 - 深灰色突出显示 */

/* 错误提示样式 */
.error-text {
  font-size: 0.75rem;           /* text-xs */
  color: #EF4444;               /* text-macos-error */
  margin-top: 0.25rem;
}
```

### 3.4 禁用状态

```css
background-color: #F3F4F6;       /* bg-gray-100 */
color: #6B7280;                  /* text-macos-text-secondary */
cursor: not-allowed;
```

### 3.5 完整示例代码

```tsx
// Input 组件 (src/components/ui/Input.tsx)
<input
  className={`
    w-full px-3 py-2.5 text-sm bg-white border rounded-lg
    placeholder:text-macos-text-tertiary
    focus:outline-none
    transition-[border-color,box-shadow] duration-200
    border-gray-200
    hover:border-gray-300
    focus:border-gray-400
    focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
  `}
/>
```

---

## 四、按钮设计

### 4.1 主要按钮样式

```css
/* 创建按钮（灰色主题） */
.btn-create {
  background-color: #E5E7EB;     /* bg-[#E5E7EB] */
  border: 1px solid #D1D5DB;     /* border-gray-300 */
  color: #374151;                /* text-gray-700 */
  border-radius: 0.5rem;         /* rounded-lg */
  padding: 0.5rem 0.75rem;       /* px-3 py-2 */
  font-size: 0.875rem;           /* text-sm */
}

/* 悬浮状态 */
.btn-create:hover {
  background-color: #E5E7EB;     /* hover:bg-gray-200 */
  border-color: #9CA3AF;         /* hover:border-gray-400 */
}

/* 按下动画 */
.btn-create:active {
  transform: scale(0.97);
}
```

### 4.2 按钮类型

| 类型 | 样式 | 使用场景 |
|------|------|----------|
| 主要操作 | `bg-[#E5E7EB] border-gray-300` | 新建、创建等主要操作 |
| 次要操作 | `bg-white border-gray-300` | 取消、关闭等次要操作 |
| 幽灵按钮 | `bg-transparent hover:bg-gray-100` | 弹窗内的取消按钮 |
| 危险操作 | `bg-red-50 text-red-600 hover:bg-red-100` | 删除等危险操作 |

### 4.3 禁止使用的效果

```css
/* 禁止使用蓝色聚焦环 */
❌ focus:ring-2 focus:ring-blue-500
❌ focus:ring-offset-2

/* 正确做法 */
✅ focus:outline-none
```

### 4.4 完整示例代码

```tsx
// 按钮基础样式 (src/components/ui/Button.tsx)
const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'

const variants = {
  primary: 'bg-macos-accent text-white hover:bg-blue-600',
  secondary: 'bg-macos-card text-macos-text border border-macos-border hover:bg-gray-50',
  ghost: 'text-macos-text hover:bg-gray-100',
  danger: 'bg-macos-error text-white hover:bg-red-600',
}

// 创建按钮使用示例
<button
  className="bg-[#E5E7EB] border border-gray-300 text-gray-700
             hover:bg-gray-200 hover:border-gray-400
             rounded-lg px-3 py-2 text-sm
             focus:outline-none"
>
  <Plus size={16} className="mr-1.5" />
  新建节点
</button>
```

---

## 五、卡片设计

### 5.1 卡片基础样式

```css
.card-base {
  background-color: white;
  border: 1px solid #E5E7EB;     /* border-macos-border */
  border-radius: 0.75rem;        /* rounded-xl */
}
```

### 5.2 卡片悬浮效果

```css
/* 悬浮动效 */
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

/* 过渡 */
.card-base {
  transition: transform 0.2s, box-shadow 0.2s;
}
```

### 5.3 完整示例代码

```tsx
// Card 组件 (src/components/ui/Card.tsx)
<motion.div
  whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
  transition={{ duration: 0.2 }}
  className="bg-white rounded-xl border border-macos-border"
>
  {children}
</motion.div>
```

---

## 六、弹窗设计

### 6.1 弹窗结构

```
┌─────────────────────────────────┐
│  标题                    × 关闭 │  <- 头部区域
├─────────────────────────────────┤
│                                 │
│         内容区域                │  <- 中间区域
│                                 │
├─────────────────────────────────┤
│                    取消  确定   │  <- 底部按钮区域
└─────────────────────────────────┘
```

### 6.2 弹窗样式

```css
/* 遮罩层 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  z-index: 50;
}

/* 弹窗容器 */
.modal-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}

/* 弹窗内容 */
.modal-content {
  width: 100%;
  max-width: 42rem;             /* max-w-2xl */
  background-color: white;
  border-radius: 1rem;          /* rounded-2xl */
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
```

### 6.3 分隔线处理

```css
/* 推荐做法：不使用分隔线，保持简洁 */
.modal-header {
  padding: 1rem 1.5rem;          /* px-6 py-4 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* ❌ 不使用 border-bottom */
}

.modal-footer {
  padding: 1rem 1.5rem;
  /* ❌ 不使用 border-top */
}
```

### 6.4 按钮排列

```tsx
// 底部按钮区域
<div className="flex justify-end gap-3">
  <Button variant="ghost" onClick={onClose}>取消</Button>
  <Button variant="outline" onClick={onConfirm}>确定</Button>
</div>
```

---

## 七、确认弹窗设计

### 7.1 样式规范

```css
/* 确认弹窗 */
.confirm-modal {
  max-width: 20rem;              /* max-w-xs - 小巧紧凑 */
  background-color: white;
  border-radius: 0.75rem;        /* rounded-xl */
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* 内容区域 */
.confirm-content {
  padding: 1.25rem;              /* p-5 */
  text-align: center;
}

/* 图标容器 */
.confirm-icon {
  width: 2.5rem;
  height: 2.5rem;
  margin: 0 auto 0.75rem;
  border-radius: 50%;
  background-color: #FEF3C7;     /* bg-yellow-50 */
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 按钮区域 */
.confirm-buttons {
  display: flex;
  border-top: 1px solid #F3F4F6;
}

.confirm-buttons button {
  flex: 1;
  padding: 0.625rem 0;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.confirm-buttons button:first-child {
  border-right: 1px solid #F3F4F6;
  color: #6B7280;                /* text-macos-text-secondary */
}

.confirm-buttons button:last-child {
  color: #374151;                /* text-gray-700 */
  font-weight: 500;
}
```

### 7.2 完整示例代码

```tsx
// ConfirmModal 组件 (src/components/ui/ConfirmModal.tsx)
<div className="w-full max-w-xs bg-white rounded-xl shadow-xl">
  {/* 内容 */}
  <div className="p-5 text-center">
    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-yellow-50 flex items-center justify-center">
      <AlertTriangle size={20} className="text-yellow-500" />
    </div>
    <h3 className="text-base font-medium text-macos-text mb-1">{title}</h3>
    <p className="text-sm text-macos-text-secondary">{message}</p>
  </div>

  {/* 按钮 */}
  <div className="flex border-t border-gray-100">
    <button
      onClick={onCancel}
      className="flex-1 py-2.5 text-sm text-macos-text-secondary hover:bg-gray-50 transition-colors border-r border-gray-100"
    >
      {cancelText}
    </button>
    <button
      onClick={onConfirm}
      className="flex-1 py-2.5 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
    >
      {confirmText}
    </button>
  </div>
</div>
```

---

## 八、Toast 提示设计

### 8.1 样式规范

```css
/* Toast 容器 - 屏幕正中间 */
.toast-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;          /* 不阻挡下层交互 */
}

/* Toast 内容 */
.toast-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;                   /* gap-2 */
  padding: 0.75rem 1.25rem;      /* px-5 py-3 */
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* 成功状态 */
.toast-success {
  background-color: #F0FDF4;     /* bg-green-50 */
  color: #15803D;                /* text-green-700 */
  border: 1px solid #BBF7D0;     /* border-green-200 */
}

/* 警告状态 */
.toast-warning {
  background-color: #FEF3C7;     /* bg-yellow-50 */
  color: #A16207;                /* text-yellow-700 */
  border: 1px solid #FDE68A;     /* border-yellow-200 */
}

/* 错误状态 */
.toast-error {
  background-color: #FEF2F2;     /* bg-red-50 */
  color: #B91C1C;                /* text-red-700 */
  border: 1px solid #FECACA;     /* border-red-200 */
}
```

### 8.2 使用规范

- 位置：屏幕正中央
- 持续时间：3秒后自动消失
- 不需要关闭按钮，简洁明了
- 图标和文字居中对齐

### 8.3 完整示例代码

```tsx
// Toast 组件 (src/components/ui/Toast.tsx)
<div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.9 }}
    className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg border shadow-lg bg-yellow-50 text-yellow-700 border-yellow-200"
  >
    <Icon size={18} />
    <p className="text-sm font-medium">{message}</p>
  </motion.div>
</div>
```

---

## 九、页面布局设计

### 9.1 页面容器

```css
/* 页面外层容器 */
.page-wrapper {
  height: 100%;
  padding: 1rem;                 /* p-4 */
}

/* 白色卡片容器 */
.page-card {
  height: 100%;
  background-color: white;
  border-radius: 1rem;           /* rounded-2xl */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### 9.2 头部区域

```css
.page-header {
  height: 4rem;                  /* h-16 */
  padding: 0 1.5rem;             /* px-6 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* ❌ 不使用 border-bottom，保持简洁 */
}
```

### 9.3 内容区域

```css
.page-content {
  flex: 1;
  padding: 1.5rem;               /* p-6 */
  overflow-y: auto;
  /* ❌ 不使用 background-color，保持白色 */
}
```

### 9.4 分隔线处理原则

```
❌ 避免使用分隔线：
   - 头部与内容之间
   - 内容与底部之间
   - 弹窗各区域之间

✅ 通过留白和布局区分区域：
   - 使用 padding 分隔
   - 使用背景色差异（仅在必要时）
   - 保持整体视觉连贯性
```

---

## 十、表单验证设计

### 10.1 验证时机

- 点击提交按钮时进行验证
- 实时验证可选择性实现

### 10.2 验证反馈方式

```tsx
// 1. Toast 提示（推荐）
addToast('请输入节点名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
// 用户开始输入时自动恢复
// 或 3 秒后自动恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

### 10.3 验证失败输入框样式

```css
/* 验证失败 */
.input-invalid {
  border-color: #9CA3AF;         /* border-gray-400 - 深灰色 */
}

/* 与聚焦状态保持一致的边框颜色深度 */
/* 但不显示阴影效果，区分两种状态 */
```

### 10.4 必填标识

```tsx
// 使用 * 号标识必填项
<label>
  <Target size={16} />
  核心任务 *
</label>
```

---

## 十一、交互状态总结

### 11.1 输入框状态流转

```
默认状态 (border-gray-200)
    ↓ hover
悬浮状态 (border-gray-300)
    ↓ focus
聚焦状态 (border-gray-400 + shadow)
    ↓ blur
回到默认状态
```

### 11.2 按钮状态流转

```
默认状态 (bg-[#E5E7EB])
    ↓ hover
悬浮状态 (bg-gray-200)
    ↓ active
按下状态 (scale: 0.97)
    ↓ release
回到悬浮/默认状态
```

### 11.3 卡片状态流转

```
默认状态 (无阴影)
    ↓ hover
悬浮状态 (y: -2px + shadow)
    ↓ leave
回到默认状态
```

---

## 十二、动画规范

### 12.1 过渡时间

```css
/* 标准过渡时间 */
transition-duration: 200ms;      /* duration-200 */

/* 快速过渡 */
transition-duration: 150ms;      /* duration-150 */
```

### 12.2 过渡属性选择

```css
/* 推荐：只过渡需要的属性 */
transition: border-color 0.2s, box-shadow 0.2s;

/* 避免：过渡所有属性可能导致抖动 */
❌ transition: all 0.2s;
```

### 12.3 动画库使用

```tsx
// 使用 framer-motion 实现动画
import { motion, AnimatePresence } from 'framer-motion'

// 进入/退出动画
<motion.div
  initial={{ opacity: 0, scale: 0.95, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.95, y: 10 }}
  transition={{ duration: 0.15 }}
>
```

---

## 十三、组件复用清单

### 13.1 可复用组件列表

| 组件 | 路径 | 用途 |
|------|------|------|
| Button | `src/components/ui/Button.tsx` | 按钮组件 |
| Input | `src/components/ui/Input.tsx` | 输入框组件 |
| Textarea | `src/components/ui/Input.tsx` | 文本域组件 |
| Modal | `src/components/ui/Modal.tsx` | 弹窗组件 |
| ConfirmModal | `src/components/ui/ConfirmModal.tsx` | 确认弹窗 |
| Toast | `src/components/ui/Toast.tsx` | 提示组件 |
| Card | `src/components/ui/Card.tsx` | 卡片组件 |

### 13.2 复用示例

```tsx
// 引入组件
import { Button, Input, Textarea, Modal, ConfirmModal, Toast } from '../components/ui'

// 使用示例
<Button variant="outline" className="bg-[#E5E7EB] border-gray-300">
  新建
</Button>

<Input
  placeholder="请输入..."
  invalid={hasError}
  onChange={handleChange}
/>

<Textarea
  placeholder="请输入..."
  rows={3}
  invalid={hasError}
/>

<ConfirmModal
  isOpen={showConfirm}
  title="确认操作"
  message="确定要执行此操作吗？"
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

---

## 十四、常见问题与解决方案

### 14.1 输入框聚焦抖动

**问题**：使用 `transition-all` 导致抖动

**解决方案**：
```css
/* 错误 */
transition: all 0.2s;

/* 正确 */
transition: border-color 0.2s, box-shadow 0.2s;
```

### 14.2 按钮蓝色聚焦环

**问题**：点击按钮出现蓝色圆环

**解决方案**：
```css
/* 移除 focus ring */
.btn {
  focus:outline-none;
  /* 不要使用 focus:ring-2 */
}
```

### 14.3 主题色不统一

**问题**：各处颜色不一致

**解决方案**：统一使用灰色系
```css
/* 推荐配色 */
背景：white / #F3F4F6
边框：#E5E7EB / #D1D5DB / #9CA3AF
文字：#1F2937 / #6B7280 / #9CA3AF
```

### 14.4 弹窗分隔线过多

**问题**：弹窗内分隔线太多显得杂乱

**解决方案**：
```css
/* 不使用分隔线 */
.modal-header {
  /* ❌ border-bottom: 1px solid #E5E7EB; */
}

.modal-footer {
  /* ❌ border-top: 1px solid #E5E7EB; */
}
```

---

## 十五、设计检查清单

在开发新模块时，请检查以下项目：

- [ ] 输入框默认边框是否为 `border-gray-200`
- [ ] 输入框悬浮边框是否为 `border-gray-300`
- [ ] 输入框聚焦边框是否为 `border-gray-400`
- [ ] 输入框聚焦是否有阴影效果
- [ ] 按钮是否使用灰色主题
- [ ] 按钮是否移除了蓝色聚焦环
- [ ] 弹窗是否移除了分隔线
- [ ] Toast 是否居中显示
- [ ] 卡片悬浮是否有上浮+阴影效果
- [ ] 过渡是否只应用于必要属性
- [ ] 页面头部和内容是否无分隔线

---

## 十六、NodeCard 卡片设计 - 2025-02-25 重新设计

### 16.1 整体布局

```
┌─────────────────────────────────────┐
│  [📚] 节点名称               [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 核心任务预览...           │   │  <- 内容预览区 (bg-gray-50)
│  │ 这是一个处理节点...         │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### 16.2 设计规范

```tsx
<Card className="group relative p-0 cursor-pointer h-full flex flex-col">
  {/* 头部区域 */}
  <div className="px-4 pb-0 pt-4">
    <div className="flex items-start justify-between mb-2">
      {/* 左侧：Layers 图标 + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
          <Layers size={18} className="text-gray-600" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-[17px] text-gray-900">
          {node.name}
        </h3>
      </div>

      {/* 右侧：操作按钮（悬浮显示） */}
      <div className="flex items-center gap-1">
        <button className="opacity-0 group-hover:opacity-100">
          <Edit3 size={14} />
        </button>
        <button className="opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>

  {/* 内容预览区 - 浅灰色背景 */}
  <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
      {contentPreview}
    </p>
  </div>
</Card>
```

### 16.3 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| Layers 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |
| 间距关系 | 内容区紧贴头部 `mt-0` | 灰色区域顶部接近图标底部，留小间距 |

### 16.4 内容预览处理

```typescript
// 提取核心任务的前 100 个字符，移除 Markdown 符号
const contentPreview = node.task?.replace(/[#*`]/g, '').slice(0, 100) || ''
```

### 16.5 配色方案

| 元素 | 背景色 | 文字色 | 边框色 |
|------|--------|--------|--------|
| 卡片背景 | `#FFFFFF` | - | `#E5E5E5` |
| Layers 图标容器 | `#F3F4F6` (gray-100) | - | - |
| Layers 图标 | - | `#4B5563` (gray-600) | - |
| 名称文字 | - | `#111827` (gray-900) | - |
| 内容预览区 | `#F9FAFB` (gray-50) | `#6B7280` (gray-500) | - |
| 操作按钮 | hover: `#F3F4F6` | `#6B7280` | - |
| 删除按钮 | hover: `#FEF2F2` | hover: `#FF3B30` | - |

### 16.6 交互状态

| 状态 | 效果 |
|------|------|
| 默认 | 卡片无边框阴影，操作按钮隐藏 |
| 悬浮 | 卡片上浮 2px + 阴影，操作按钮显示 |
| 点击 | 触发 `onClick`，打开详情弹窗 |

### 16.7 与旧版设计的差异

| 特性 | 旧版设计 | 新版设计 |
|------|----------|----------|
| 图标 | 根据节点类型显示不同彩色图标 | 统一灰色 Layers 图标 |
| 类型标签 | 显示"开始/结束/处理/判断/业务" | 移除类型标签 |
| 图标尺寸 | 48x48 (w-12 h-12) | 32x32 (w-8 h-8) |
| 名称字体 | 14px semibold | 17px bold |
| 内容预览 | 显示描述 | 显示核心任务 |
| 业务节点配置 | 显示 defaultConfig 预览 | 移除配置预览 |
| 整体色调 | 彩色 | 灰白色调 |

---

## 十七、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 2.0 | 2026-03-08 | **重大简化**：节点模块与资源文件、命令模块保持一致，只保留4个基本字段（名称、类型、描述、内容） |
| 1.5 | 2025-02-28 | 编辑弹窗布局优化：所有字段单独一行（与详情页面一致），图标颜色与详情页面统一 |
| 1.4 | 2025-02-28 | 修复节点MD文件解析bug：代码块内容被错误识别为自定义属性，优化生成/解析逻辑支持代码块格式 |
| 1.3 | 2025-02-28 | 字段名称优化："强制必须做的事" → "强制同时必须要做的事"、"禁止做的事" → "禁止同时严禁不能做的事" |
| 1.2 | 2025-02-25 | 重新设计 NodeCard 卡片布局：采用与 AgentCard 一致的简约灰白色调，移除彩色元素和类型标签，改为 Layers 图标 + 核心任务预览区设计 |
| 1.1 | 2025-02-14 | 新增节点详情弹窗设计规范 |
| 1.0 | 2024-01 | 初始版本，基于节点模块设计规范 |

---

## 十八、数据持久化设计（v2.0 简化版）

### 18.1 文件格式

节点文件以 Markdown 格式存储，包含 frontmatter 元数据：

```markdown
---
name: 文档解析节点
type: process
description: 解析文档内容并获取相关信息
---

# 节点内容

这里是节点的详细内容，支持 Markdown 格式...

## 功能说明
- 解析文档
- 获取文档内容
- 处理文档引用
```

### 18.2 数据结构

```typescript
// 节点文件类型
export type NodeFileType = 'process' | 'business'

// 节点文件定义（与其他业务模块保持一致）
export interface NodeDefinition {
  id: string
  name: string        // 从 frontmatter 的 name 字段读取
  type: NodeFileType  // 从 frontmatter 的 type 字段读取
  description: string // 从 frontmatter 的 description 字段读取
  content: string     // frontmatter 后的内容
  createdAt: string
  updatedAt: string   // 从文件系统获取
}
```

### 18.3 存储目录

```
项目根目录/
└── .claude/
    └── nodes/           # 节点文件目录
        ├── 节点名1.md
        └── 节点名2.md
```

### 18.4 与其他模块的对比

| 模块 | 字段结构 | 存储目录 |
|------|----------|----------|
| 智能体 | name, type, description, model, color, content | `.claude/agents/` |
| 命令 | name, type, description, content | `.claude/commands/` |
| 能力 | name, type, description, content | `.claude/abilities/` |
| 知识 | name, type, description, tags, content | `.claude/knowledges/` |
| 资源文件 | name, type, description, content | `.claude/resources/` |
| **节点** | **name, type, description, content** | `.claude/nodes/` |

---

## 十九、编辑弹窗设计（v2.0 简化版）

### 19.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  创建新节点 / 编辑节点            × 关闭 │  <- 头部区域
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  [节点名称 *]                           │
│  [节点类型选择：处理节点/业务节点]       │
│  [节点描述]                             │
│  [节点内容 *] （支持编辑/预览切换）      │
│                                         │
├─────────────────────────────────────────┤
│                         取消      创建   │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 19.2 表单字段

| 字段 | 必填 | 说明 |
|------|------|------|
| 节点名称 | 是 | 节点的唯一标识，编辑时不可修改 |
| 节点类型 | 是 | 处理节点 或 业务节点 |
| 节点描述 | 否 | 简要描述节点的用途 |
| 节点内容 | 是 | 节点的详细内容，支持 Markdown 格式 |

### 19.3 与命令模块的一致性

节点模块的编辑弹窗与命令模块保持一致：
- 相同的字段结构：名称、类型、描述、内容
- 相同的编辑/预览切换功能
- 相同的 MarkdownEditor 组件
- 相同的表单验证逻辑

---

## 二十、详情弹窗设计（v2.0 简化版）

### 20.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  [图标] 节点名称          [类型标签]     │  <- 头部固定区域
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  [节点描述]                             │
│  [节点内容 - Markdown 渲染]             │
│                                         │
├─────────────────────────────────────────┤
│  关闭                       [编辑]      │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 20.2 信息展示

| 展示项 | 位置 | 说明 |
|--------|------|------|
| 图标 + 名称 + 类型标签 | 头部固定区域 | 始终可见 |
| 节点描述 | 内容区域 | 可选字段 |
| 节点内容 | 内容区域 | Markdown 渲染 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*
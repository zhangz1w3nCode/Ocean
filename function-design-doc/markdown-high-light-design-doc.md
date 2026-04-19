# Markdown 编辑器语法高亮设计文档

> 本文档定义了项目中 MarkdownEditor 组件的设计规范，集成 CodeMirror 编辑器实现 Markdown 语法高亮和@引用功能。

---

## 一、组件概述

### 1.1 功能定位

`MarkdownEditor` 组件是一个功能完整的 Markdown 编辑器，主要提供：

1. **Markdown 语法高亮** - 实时高亮标题、加粗、斜体、代码块等语法元素
2. **@引用功能** - 输入@符号触发引用选择弹窗，支持引用其他业务内容
3. **引用块高亮** - 高亮显示 `` `agents/xxx.md` `` 格式的引用路径
4. **表单集成** - 支持表单验证、禁用状态等标准表单属性

### 1.2 技术选型

| 技术 | 版本 | 用途 |
|------|------|------|
| `@uiw/react-codemirror` | ^4.25.4 | CodeMirror React 封装 |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown 语言支持 |
| `@uiw/codemirror-themes-all` | ^4.25.5 | 主题包（使用 materialLight） |
| `@codemirror/state` | ^6.5.4 | 状态管理 |
| `@codemirror/commands` | ^6.10.2 | 命令支持 |
| `@codemirror/view` | ^6.39.14 | 视图扩展 |
| `@codemirror/language` | ^6.12.1 | 语言高亮 |

---

## 二、文件结构

```
src/components/ui/MarkdownEditor/
├── index.ts                    # 组件导出
├── MarkdownEditor.tsx          # 主组件
└── referenceHighlight.ts       # 引用块高亮扩展
```

---

## 三、组件接口设计

### 3.1 Props 定义

```tsx
interface MarkdownEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  label?: string              // 标签文字
  error?: string              // 错误提示
  invalid?: boolean           // 验证失败状态
  excludeCategory?: ReferenceCategory  // 排除的引用分类
  value?: string              // 编辑器内容
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void  // 内容变化回调
}
```

### 3.2 使用示例

```tsx
import { MarkdownEditor } from '../ui'

<MarkdownEditor
  placeholder="在此输入智能体的角色指令内容，支持 Markdown 格式..."
  value={content}
  onChange={(e) => setContent(e.target.value)}
  rows={12}
  invalid={invalidFields.has('content')}
  excludeCategory="agents"
/>
```

---

## 四、核心功能实现

### 4.1 CodeMirror 扩展配置

```tsx
const extensions = useMemo(() => [
  // 主题 - 提供 Markdown 语法高亮颜色
  materialLight,

  // 基础功能
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  EditorView.editable.of(!disabled),
  indentOnInput(),
  bracketMatching(),

  // 键盘快捷键
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    indentWithTab,
  ]),

  // Markdown 语言支持
  markdown({ base: markdownLanguage }),

  // 引用块高亮（自定义扩展）
  referenceHighlightExtension,

  // 自定义样式覆盖
  EditorView.theme({ /* ... */ }),
], [invalid, disabled, rows])
```

### 4.2 主题选择

参考 `markdown-render-design.md` 中的主题设计：

| 应用主题 | CodeMirror 主题 |
|---------|----------------|
| 亮色模式 | `materialLight` |
| 暗色模式 | `dark` |

当前实现使用 `materialLight` 主题，后续可根据应用主题切换。

---

## 五、引用块高亮扩展

### 5.1 功能说明

引用块高亮扩展用于高亮显示 Markdown 中的引用路径，格式为反引号包裹的 .md 文件路径：

```
`agents/工具名.md`
`nodes/节点名.md`
`workflows/工作流名.md`
```

### 5.2 实现代码

```ts
// referenceHighlight.ts
import { StateField, RangeSetBuilder, type EditorState, type Transaction } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

// 引用块正则：`xxx/xxx.md`
const REFERENCE_PATTERN = /`([^`\n]+\.md)`/g

// 引用块高亮样式
const referenceMark = Decoration.mark({
  class: 'cm-reference-mark',
  attributes: {
    style: 'background-color: #DBEAFE; color: #1D4ED8; border-radius: 4px; padding: 1px 2px;'
  }
})

// 反引号样式
const backtickMark = Decoration.mark({
  class: 'cm-backtick',
  attributes: {
    style: 'color: #1D4ED8;'
  }
})

// 构建装饰器
function buildDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>()
  const text = state.doc.toString()

  REFERENCE_PATTERN.lastIndex = 0
  let match

  while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length

    builder.add(start, start + 1, backtickMark)      // 开始反引号
    builder.add(start + 1, end - 1, referenceMark)   // 路径部分
    builder.add(end - 1, end, backtickMark)          // 结束反引号
  }

  return builder.finish()
}

// StateField 扩展
export const referenceHighlightExtension = StateField.define<ReturnType<typeof buildDecorations>>({
  create(state: EditorState) {
    return buildDecorations(state)
  },
  update(value, tr: Transaction) {
    if (tr.docChanged) {
      return buildDecorations(tr.state)
    }
    return value.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})
```

### 5.3 视觉效果

```
编辑器显示效果：

`agents/doc-agent.md` 是一个文档助手

渲染后：
[蓝色反引号][蓝色背景路径][蓝色反引号] 是一个文档助手
```

---

## 六、@引用功能

### 6.1 触发机制

用户输入 `@` 符号时，自动弹出引用选择弹窗：

```tsx
const handleEditorChange = useCallback((value: string) => {
  // 检测 @ 输入
  if (atPosition === null) {
    const lastAtIndex = value.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1)
      if (afterAt === '' || afterAt.match(/^\s/)) {
        setAtPosition(lastAtIndex)
        setIsModalOpen(true)
      }
    }
  }
  // ...
}, [onChange, atPosition])
```

### 6.2 引用项数据来源

使用 `useReferenceItems` Hook 获取引用数据：

```tsx
const referenceItems = useReferenceItems({ excludeCategory })

// excludeCategory 用于排除当前模块
// 例如：编辑智能体时排除 agents 分类
```

### 6.3 引用插入格式

选择引用项后，以反引号包裹的路径格式插入：

```
用户输入：这是一个助手 @
选择后：这是一个助手 `agents/doc-agent.md`
```

---

## 七、样式设计

### 7.1 编辑器容器样式

```tsx
EditorView.theme({
  '&': {
    fontSize: '14px',
    border: invalid ? '1.5px solid #9CA3AF' : '1px solid #E5E7EB',
    borderRadius: '8px',
    backgroundColor: disabled ? '#F3F4F6' : 'white',
  },
  '&:hover': {
    borderColor: invalid ? '#9CA3AF' : '#D1D5DB',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: '#9CA3AF',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  '.cm-content': {
    padding: '10px 12px',
    minHeight: '288px', // rows * 24px
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  '.cm-placeholder': {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
})
```

### 7.2 输入框状态流转

```
默认状态 (border: #E5E7EB)
    ↓ hover
悬浮状态 (border: #D1D5DB)
    ↓ focus
聚焦状态 (border: #9CA3AF + shadow)
    ↓ blur
回到默认状态
```

### 7.3 验证失败状态

```tsx
// 验证失败时
border: 1.5px solid #9CA3AF
// 无 box-shadow
```

---

## 八、代码高亮效果

### 8.1 Markdown 语法高亮

使用 `materialLight` 主题提供的语法高亮：

| 语法元素 | 高亮效果 |
|---------|---------|
| 标题（#）| 蓝色、加粗 |
| 加粗（**text**）| 加粗显示 |
| 斜体（*text*）| 斜体显示 |
| 代码块（```）| 背景色区分 |
| 内联代码（`code`）| 背景色区分 |
| 链接（[text](url)）| 蓝色链接样式 |
| 列表（- item）| 列表标记高亮 |

### 8.2 引用块高亮颜色

```css
/* 引用路径背景色 */
background-color: #DBEAFE;  /* Tailwind blue-100 */

/* 引用路径文字色 */
color: #1D4ED8;  /* Tailwind blue-700 */
```

---

## 九、文件修改清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `package.json` | 修改 | 添加 CodeMirror 相关依赖 |
| `src/components/ui/MarkdownEditor/index.ts` | 新建 | 组件导出 |
| `src/components/ui/MarkdownEditor/MarkdownEditor.tsx` | 新建 | 主组件 |
| `src/components/ui/MarkdownEditor/referenceHighlight.ts` | 新建 | 引用块高亮扩展 |
| `src/components/ui/index.ts` | 修改 | 添加 MarkdownEditor 导出 |
| `src/components/agent/AgentModal.tsx` | 修改 | 替换 ReferenceTextarea |
| `src/types/index.ts` | 修改 | 修复 AgentFileType 类型 |

---

## 十、与 ReferenceTextarea 的对比

| 特性 | ReferenceTextarea | MarkdownEditor |
|------|------------------|----------------|
| Markdown 语法高亮 | 无 | 有（materialLight 主题） |
| @引用功能 | 有 | 有 |
| 引用块高亮 | 有（双层渲染）| 有（CodeMirror 装饰器）|
| 编辑体验 | 普通文本框 | 专业代码编辑器 |
| 代码依赖 | 无外部依赖 | CodeMirror 系列包 |

---

## 十一、扩展建议

### 11.1 主题切换

后续可根据应用主题动态切换编辑器主题：

```tsx
import { materialLight } from '@uiw/codemirror-themes-all'
import { dracula } from '@uiw/codemirror-themes-all'

const theme = appTheme === 'light' ? materialLight : dracula
```

### 11.2 代码块语法高亮

可添加代码块内的编程语言语法高亮：

```tsx
import { languages } from '@codemirror/language-data'

markdown({
  base: markdownLanguage,
  codeLanguages: languages
})
```

### 11.3 更多编辑功能

- 自动补全
- 快捷键插入（Ctrl+B 加粗、Ctrl+I 斜体）
- 实时预览分栏

---

## 十二、参考文档

- [markdown-render-design.md](./markdown-render-design.md) - Cherry Studio Markdown 渲染机制
- [@uiw/react-codemirror 文档](https://uiwjs.github.io/react-codemirror/)
- [CodeMirror 6 文档](https://codemirror.net/docs/)

---

## 十三、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2025-02-25 | 初始版本，实现 Markdown 语法高亮和@引用功能 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*
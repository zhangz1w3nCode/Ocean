# 智能体卡片样式调研报告

> 调研时间: 2025-02-25
> 调研项目: Cherry Studio
> 调研文件: `src/renderer/src/pages/agents/components/AgentCard.tsx`

---

## 一、智能体名称样式 (`AgentCardHeaderInfoTitle`)

位置: `src/renderer/src/pages/agents/components/AgentCard.tsx:311-320`

| 属性 | 值 |
|------|-----|
| **字体大小** | `16px` |
| **字重** | `600` (半粗体/Semi-Bold) |
| **行高** | `1.2` |
| **字体类型** | 继承默认字体 `--font-family` = Ubuntu, -apple-system, BlinkMacSystemFont 等 |
| **颜色** | 未指定，继承自父元素 |
| **暗色模式颜色** | `rgba(255, 255, 245, 0.9)` ≈ 90% 白色 |
| **亮色模式颜色** | `rgba(0, 0, 0, 1)` = 纯黑色 |

### 样式代码

```css
const AgentCardHeaderInfoTitle = styled.div`
  font-size: 16px;
  line-height: 1.2;
  font-weight: 600;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  word-break: break-all;
`
```

---

## 二、卡片容器样式 (`AgentCardContainer`)

位置: `src/renderer/src/pages/agents/components/AgentCard.tsx:231-262`

| 属性 | 值 |
|------|-----|
| **圆角** | `var(--list-item-border-radius)` = `10px` |
| **边框** | `0.5px solid var(--color-border)` |
| **内边距** | `16px` |
| **背景色** | **未设置！** 这就是你感觉透明的原因 |
| **阴影** | `0 5px 7px -3px var(--color-border-soft), 0 2px 3px -4px var(--color-border-soft)` |
| **悬停效果** | `transform: translateY(-2px)` 向上移动2px，阴影增大 |

### 样式代码

```css
const AgentCardContainer = styled.div`
  border-radius: var(--list-item-border-radius);
  cursor: pointer;
  border: 0.5px solid var(--color-border);
  padding: 16px;
  overflow: hidden;
  transition:
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;

  --shadow-color: rgba(0, 0, 0, 0.05);
  box-shadow:
    0 5px 7px -3px var(--color-border-soft),
    0 2px 3px -4px var(--color-border-soft);

  &:hover {
    box-shadow:
      0 10px 15px -3px var(--color-border-soft),
      0 4px 6px -4px var(--color-border-soft);
    transform: translateY(-2px);
  }

  body[theme-mode='dark'] & {
    --shadow-color: rgba(255, 255, 255, 0.02);
  }
`
```

---

## 三、边框和阴影颜色 (透明效果来源)

位置: `src/renderer/src/assets/styles/color.css:32-34, 104-106`

### 暗色模式 (默认)

```css
--color-border: #ffffff19;      /* = rgba(255,255,255,0.098) 约10%白色透明 */
--color-border-soft: #ffffff10; /* = rgba(255,255,255,0.063) 约6%白色透明 */
```

### 亮色模式

```css
--color-border: #00000019;      /* = rgba(0,0,0,0.098) 约10%黑色透明 */
--color-border-soft: #00000010; /* = rgba(0,0,0,0.063) 约6%黑色透明 */
```

---

## 四、关键问题总结

卡片确实有"透明感"，原因如下：

| 问题 | 说明 |
|------|------|
| **卡片容器无背景色** | `AgentCardContainer` 没有设置 `background-color` |
| **边框半透明** | 使用 `0.5px solid` + `10%透明度颜色` |
| **阴影半透明** | 使用 `6%透明度颜色` |
| **背景模糊emoji** | `opacity: 0.1` + `blur(20px)` 效果 |

### 背景模糊Emoji样式

```css
const AgentCardBackground = styled.div`
  height: 100%;
  position: absolute;
  top: 0;
  right: -50px;
  font-size: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0.1;
  filter: blur(20px);
  border-radius: 99px;
  overflow: hidden;
`
```

---

## 五、描述文字样式 (`AgentPrompt`)

位置: `AgentCard.tsx:339-347`

| 属性 | 值 |
|------|-----|
| **字体大小** | `12px` |
| **行高** | `1.4` |
| **颜色** | `var(--color-text-2)` |
| **暗色模式** | `rgba(235, 235, 245, 0.6)` ≈ 60% 白色 |
| **亮色模式** | `rgba(0, 0, 0, 0.6)` ≈ 60% 黑色 |

### 样式代码

```css
const AgentPrompt = styled.div`
  font-size: 12px;
  display: -webkit-box;
  line-height: 1.4;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--color-text-2);
`
```

---

## 六、卡片底部信息区域 (`CardInfo`)

位置: `AgentCard.tsx:329-337`

### 样式代码

```css
const CardInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  background-color: var(--color-background-soft);
  padding: 8px;
  border-radius: 10px;
`
```

### 颜色值

| 模式 | 颜色值 |
|------|--------|
| **暗色模式** | `var(--color-background-soft)` = `#222222` (深灰) |
| **亮色模式** | `var(--color-background-soft)` = `rgba(0, 0, 0, 0.04)` (4%黑色透明) |

---

## 七、Emoji 显示区域 (`HeaderInfoEmoji`)

位置: `AgentCard.tsx:210-223`

### 样式代码

```css
const HeaderInfoEmoji = styled.div`
  width: 45px;
  height: 45px;
  border-radius: var(--list-item-border-radius);
  font-size: 26px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 1;
  transition: opacity 0.2s ease;
  background-color: var(--color-background-soft);
  display: flex;
  align-items: center;
  justify-content: center;
`
```

| 属性 | 值 |
|------|-----|
| **尺寸** | `45px x 45px` |
| **圆角** | `10px` |
| **字体大小** | `26px` |
| **背景色** | `var(--color-background-soft)` |

---

## 八、悬停交互效果

当鼠标悬停在卡片上时:

1. 卡片向上移动 `2px`
2. 阴影增大，产生"浮起"效果
3. Emoji区域淡出，菜单按钮淡入

```css
&:hover {
  box-shadow:
    0 10px 15px -3px var(--color-border-soft),
    0 4px 6px -4px var(--color-border-soft);
  transform: translateY(-2px);

  ${AgentCardHeaderInfoAction} ${HeaderInfoEmoji} {
    opacity: 0;
  }
  ${AgentCardHeaderInfoAction} ${MenuButton} {
    opacity: 1;
  }
}
```

---

## 九、优化建议

如果需要让卡片更有"实体感"，可以在 `AgentCardContainer` 中添加背景色:

### 方案一: 使用 mute 背景

```css
background-color: var(--color-background-mute);
/* 暗色模式: #333333 */
/* 亮色模式: #eee */
```

### 方案二: 使用 soft 背景

```css
background-color: var(--color-background-soft);
/* 暗色模式: #222222 */
/* 亮色模式: rgba(0, 0, 0, 0.04) */
```

### 方案三: 自定义独立背景

```css
/* 暗色模式 */
body[theme-mode='dark'] & {
  background-color: rgba(40, 40, 40, 0.8);
}

/* 亮色模式 */
background-color: rgba(255, 255, 255, 0.9);
```

---

## 十、相关文件清单

| 文件 | 说明 |
|------|------|
| `src/renderer/src/pages/agents/components/AgentCard.tsx` | 卡片组件主要样式 |
| `src/renderer/src/pages/agents/AgentsPage.tsx` | 智能体页面布局 |
| `src/renderer/src/assets/styles/color.css` | 全局颜色变量定义 |
| `src/renderer/src/assets/styles/font.css` | 全局字体变量定义 |

---

## 十一、全局颜色变量参考

### 暗色模式 (默认)

```css
:root {
  --color-text-1: rgba(255, 255, 245, 0.9);
  --color-text-2: rgba(235, 235, 245, 0.6);
  --color-text-3: rgba(235, 235, 245, 0.38);

  --color-background: #181818;
  --color-background-soft: #222222;
  --color-background-mute: #333333;

  --color-border: #ffffff19;
  --color-border-soft: #ffffff10;

  --list-item-border-radius: 10px;
}
```

### 亮色模式

```css
[theme-mode='light'] {
  --color-text-1: rgba(0, 0, 0, 1);
  --color-text-2: rgba(0, 0, 0, 0.6);
  --color-text-3: rgba(0, 0, 0, 0.38);

  --color-background: #ffffff;
  --color-background-soft: rgba(0, 0, 0, 0.04);
  --color-background-mute: #eee;

  --color-border: #00000019;
  --color-border-soft: #00000010;
}
```

---

*报告结束*
# 主题系统重构文档

## 目录
1. [重构前的架构](#1-重构前的架构)
2. [存在的问题](#2-存在的问题)
3. [重构方案设计](#3-重构方案设计)
4. [重构后的架构](#4-重构后的架构)
5. [如何新增主题](#5-如何新增主题)
6. [关键教训](#6-关键教训)

---

## 1. 重构前的架构

### 1.1 文件结构
```
src/
├── styles/globals.css          ← 所有主题逻辑 549 行
├── types/index.ts              ← AppSettings 含 theme 字段
├── stores/settingsStore.ts     ← Zustand 状态管理
├── App.tsx                     ← data-theme 初始化
├── components/settings/
│   └── SettingsPanel.tsx       ← 主题选择 UI
└── components/**/*.tsx         ← 20+ 组件使用 Tailwind 类
```

### 1.2 原始设计（深色主题为 VS Code Dark+）
```css
/* :root 定义亮色变量（~30个） */
:root { --color-bg-base: #f9fafb; ... }

/* 深色主题变量 */
[data-theme="dark"] { --color-bg-base: #1e1e1e; ... }

/* 深色 Tailwind 类覆盖（~200行硬编码值） */
[data-theme="dark"] .text-gray-700 { color: #c9d1d9; }
[data-theme="dark"] .bg-gray-100 { background-color: #1c2128; }
/* ...共约 65 条规则，全是写死的 hex 值 */

/* 护眼主题 Tailwind 类覆盖（~40行，严重不完整） */
[data-theme="eyecare"] .text-gray-900 { color: #3e4a3b; }
[data-theme="eyecare"] .bg-gray-50 { background-color: #d9f0db; }
/* 缺少 bg-white、text-primary、accent 等关键覆盖 */
```

### 1.3 覆盖规则放在 `@layer base` 中（已在早期修复）
```css
/* ❌ 错误：在 @layer base 中定义覆盖 */
@layer base {
  [data-theme="dark"] .text-gray-700 { color: #c9d1d9; }
}
/* Tailwind 的 .text-gray-700 在 @layer utilities 中，
   后声明的 layer 无条件覆盖前声明的 layer */
```

**修复：** 将覆盖规则移到 `@layer` 之外（无 layer 样式有最高优先级）。

---

## 2. 存在的问题

### 2.1 深色和护眼覆盖量严重不对等

| 覆盖类别 | 深色主题 | 护眼主题 |
|---------|:---:|:---:|
| tailwind 灰阶文字 | ✓ 7条 | ✓ 7条 |
| tailwind 灰阶背景 | ✓ 8条 | ✓ 4条 |
| bg-white | ✓ | ✗ **缺失** |
| 透明度变体 (bg-gray-50/50 等) | ✓ 7条 | ✗ **全部缺失** |
| primary 调色板 | ✓ 8条 | ✗ **全部缺失** |
| accent 文字色 | ✓ 18条 | ✗ **全部缺失** |
| accent 背景/边框/悬停 | ✓ 25条 | ✗ **全部缺失** |
| 渐变工具类 | ✓ 3条 | ✗ **全部缺失** |
| **总计** | **~65条** | **~11条** |

结果：护眼模式下，`bg-white` 的侧栏面板显示为纯白，`text-primary-700` 的选中文本显示为亮蓝，与豆沙绿背景完全不协调。

### 2.2 硬编码值无法复用
深色和护眼各有独立的选择器块，值全部写死。如果要新增一个主题（如 Solarized Dark），需要：
1. 复制深色主题的整个 Tailwind 覆盖块（~65 条规则）
2. 逐个修改每个 hex 值
3. 容易遗漏某些规则（如护眼主题的情况）

### 2.3 覆盖列表手动维护
当新增一个使用 `text-gray-500` 的组件时，必须确认该颜色在深色和护眼主题中都有覆盖。没有编译时检查，完全依赖人工。

---

## 3. 重构方案设计

### 3.1 核心思路：变量驱动 + 统一覆盖块

```
┌─────────────────────────────────────────────────────┐
│                    globals.css                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  :root   │  │ [dark]   │  │[eyecare] │  ← 3组   │
│  │ ~50变量  │  │ ~50变量  │  │ ~50变量  │    变量块  │
│  └──────────┘  └──────────┘  └──────────┘            │
│        │             │             │                  │
│        └─────────────┼─────────────┘                  │
│                      ▼                                │
│  ┌──────────────────────────────────────┐            │
│  │  统一覆盖块（~80条，写一次）          │            │
│  │  [dark] .text-gray-700,              │            │
│  │  [eyecare] .text-gray-700 {          │            │
│  │    color: var(--tw-text-primary);  │ ← 引用变量   │
│  │  }                                    │            │
│  └──────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

新增主题只需添加一组 ~50 个变量 + 在覆盖块选择器末尾加一个 `[data-theme]`。

### 3.2 两层变量体系

**语义层**（`--color-*`）：给组件 inline style 和 `@layer components` 使用。
```css
--color-bg-base       /* 页面/内容区背景 */
--color-bg-surface    /* 面板/侧栏背景 */
--color-bg-hover      /* 悬停高亮 */
--color-text-primary  /* 主文字色 */
/* ... 共 ~30 个 */
```

**Tailwind 映射层**（`--tw-*`）：给统一覆盖块引用，精确映射 Tailwind 工具类。
```css
--tw-text-primary     /* text-gray-900/800/700 */
--tw-text-secondary   /* text-gray-600/500 */
--tw-bg-subtle        /* bg-gray-50 */
--tw-bg-raised        /* bg-gray-100 */
--tw-bg-overlay       /* bg-gray-200 */
--tw-accent-amber     /* text-amber-* */
--tw-primary-bg       /* bg-primary-50 */
/* ... 共 ~25 个 */
```

### 3.3 CSS 层叠优先级

```
最高优先级:  无 layer    → 统一覆盖块
中优先级:    utilities  → Tailwind 生成的工具类
低优先级:    components → 自定义组件类 (.markdown-body 等)
最低优先级:  base       → body, scrollbar 等基础样式
```

统一覆盖块不加 `@layer`，天然拥有最高优先级，确保覆盖所有 Tailwind 工具类。

### 3.4 关键实现细节

**透明度变体使用 `color-mix()`**：
```css
/* bg-gray-50/50 = 50% 透明度的 bg-gray-50 */
[data-theme] .bg-gray-50\/50 {
  background-color: color-mix(in srgb, var(--tw-bg-subtle) 50%, transparent);
}
```
`color-mix()` 是 CSS 原生函数（Chrome 111+），Tauri WebView2 完全支持。

**Tailwind 转义字符**：`bg-gray-50/50` 中的 `/` 在 CSS 中需转义为 `\/`。

---

## 4. 重构后的架构

### 4.1 `globals.css` 结构（~530 行）

```
  1-260:   三组变量块 (:root / dark / eyecare)，每组 ~50 个变量
  262-280:  @layer base — body, scrollbar
  282-430:  统一覆盖块 — 所有非 light 主题共享，引用 var(--tw-*)
  432-500:  @layer components — 自定义组件类
  502-530:  @layer utilities — 动画
```

### 4.2 编译输出验证
```
dark 规则:     83 条  ← 完全相等
eyecare 规则:  83 条  ← 完全相等
var(--tw-*) 引用: 231 处
```

### 4.3 覆盖范围（所有非 light 主题均生效）

| 类别 | 覆盖的 Tailwind 类 | 数量 |
|------|-------------------|:---:|
| 灰阶文字 | text-gray-300~900 + hover/group-hover/placeholder 变体 | 15 |
| 灰阶背景 | bg-gray-50~300 + bg-white + hover/group-hover + 透明度变体 | 20 |
| 灰阶边框 | border-gray-100~400 + divide/ring | 7 |
| 渐变工具 | from-gray-100, via-gray-100, to-transparent | 3 |
| Primary 调色板 | text-primary 600~900 + bg/border/hover 变体 | 10 |
| 语义色文字 | 琥珀/紫/绿/红/蓝/黄 各 700~900 | 18 |
| 语义色背景 | accent 50/100 + 透明度变体 + hover | 22 |
| 语义色边框 | accent 200/300 | 12 |

---

## 5. 如何新增主题

以新增 "Solarized Dark" 主题为例：

### Step 1: 定义变量块（复制护眼主题块，修改颜色值）
```css
[data-theme="solarized"] {
  --color-bg-base: #002b36;
  --color-bg-surface: #073642;
  --color-bg-hover: #094652;
  --color-text-primary: #839496;
  /* ... 继续填完所有 ~50 个变量 */
  --tw-border-strong: #586e75;
}
```

### Step 2: 在统一覆盖块选择器末尾追加
```css
/* 原来 */
[data-theme="dark"] .text-gray-700,
[data-theme="eyecare"] .text-gray-700 { ... }

/* 新增后 */
[data-theme="dark"] .text-gray-700,
[data-theme="eyecare"] .text-gray-700,
[data-theme="solarized"] .text-gray-700 { ... }
```

**推荐做法：** 使用全局查找替换，将所有 `[data-theme="eyecare"]` 替换为 `[data-theme="eyecare"],\n[data-theme="solarized"]`。

### Step 3: 扩展类型定义
```typescript
// src/types/index.ts
export type ThemeMode = 'light' | 'dark' | 'eyecare' | 'system' | 'solarized';
```

### Step 4: 在 SettingsPanel 中添加选项
```tsx
{ value: 'solarized', label: 'Solarized', icon: Palette, preview: 'bg-[#002b36]' }
```

---

## 6. 关键教训

### 6.1 `@layer` 优先级陷阱
CSS `@layer` 的优先级由声明顺序决定，**不是**由选择器特异性决定。在 `base` 层写覆盖规则会被 `utilities` 层的 Tailwind 类无条件覆盖。解决方案：覆盖规则不放在任何 layer 中。

### 6.2 CSS 嵌套兼容性
`postcss-nesting` 插件对裸选择器嵌套（无 `&` 前缀）支持不一致。在 PostCSS config 中显式添加 `'tailwindcss/nesting'` 插件，并使用**扁平化 CSS** 避免依赖原生 CSS 嵌套。

### 6.3 构建缓存
Tailwind CSS 的 `--no-autoprefixer` 输出到 `/dev/null` 时可能使用缓存。调试时应输出到具体文件（如 `/tmp/tailwind-out.css`）并检查内容。

### 6.4 主题覆盖完整性检查
新增主题后需要验证的清单：
- [ ] 所有 `bg-white` 元素不显示为纯白
- [ ] 侧栏/面板与内容区有视觉区分
- [ ] 文字在所有区域清晰可读（对比度 ≥ 4.5:1）
- [ ] 选中/悬停状态与普通状态有明显区别
- [ ] 语义色（红/绿/琥珀）在深色背景上清晰
- [ ] 编译输出中规则数量与现有主题一致

---

## 附录

### A. 相关文件清单
| 文件 | 作用 |
|------|------|
| `src/styles/globals.css` | 主题变量 + 统一覆盖块 + 组件样式 |
| `src/types/index.ts` | `ThemeMode` 类型定义 |
| `src/stores/settingsStore.ts` | 主题状态管理 |
| `src/App.tsx` | `data-theme` 初始化 + 系统主题监听 |
| `src/components/settings/SettingsPanel.tsx` | 主题选择 UI |
| `postcss.config.js` | PostCSS 插件配置 |
| `tailwind.config.js` | Tailwind 配置 |

### B. 参考来源
- GitHub Dark 主题：Primer Design System 暗色 tokens
- VS Code `dark_vs.json`：编辑器配色
- VS Code `theme.ts`：工作台配色

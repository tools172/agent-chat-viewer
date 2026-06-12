# 多标签页设计方案

## 一、概述

在现有单会话查看基础上，增加多标签页（Multi-Tab）功能，允许用户同时打开多个聊天会话，通过标签栏快速切换，大幅提升多会话对比查看效率。

---

## 二、核心架构变更

### 2.1 现有架构

```
MainLayout
├── SessionNavigator (左侧会话列表)
└── 右侧内容区
    ├── 标题栏 (sessionTitle + Export按钮)
    ├── FilterBar
    └── ConversationView + TurnNavigator
```

状态：单一 `currentSession`（Zustand `sessionStore`），只能查看一个会话。

### 2.2 新架构

```
MainLayout
├── SessionNavigator (左侧会话列表)
└── 右侧内容区
    ├── TabBar (新增：标签栏)          ← NEW
    ├── 标题栏 (当前标签页的 sessionTitle + Export)
    ├── FilterBar (每标签页独立状态)
    └── ConversationView + TurnNavigator (渲染 activeTab 内容)
```

新增核心概念：**Tab** — 每个 Tab 代表一个已打开的会话查看实例。

### 2.3 数据模型

```typescript
// types/index.ts 新增

/** 单个标签页的完整状态快照 */
export interface TabState {
  /** 唯一标识，生成规则：`tab_${sessionPath}_${Date.now()}` */
  id: string;
  /** 会话文件路径 */
  sessionPath: string;
  /** Provider 名称 */
  providerName: string;
  /** 会话详情（events 等），加载完成后填充 */
  sessionDetail: SessionDetail | null;
  /** 是否正在加载会话内容 */
  isLoading: boolean;
  /** 加载错误信息 */
  error: string | null;
  /** 该标签页独立的过滤器配置 */
  filter: FilterConfig;
  /** 该标签页独立的查找栏状态 */
  showFindBar: boolean;
  /** 该标签页当前的查找关键词 */
  findQuery: string;
  /** 该标签页的搜索高亮词（来自左侧列表搜索） */
  searchHighlight: string | undefined;
  /** 该标签页的滚动位置（scrollTop），切换回来时恢复 */
  scrollTop: number;
  /** 该标签页展开的 thinking block UUID 集合 */
  expandedThinking: string[];
  /** 该标签页展开的 tool call block UUID 集合 */
  expandedToolCalls: string[];
  /** 该标签页展开的 tool result block UUID 集合 */
  expandedToolResults: string[];
  /** 标签页标题（从会话首条 user 消息提取） */
  title: string;
  /** 标签页是否被"钉住"（pinned），钉住的标签页不会被自动关闭 */
  pinned: boolean;
}

/** 标签页的轻量摘要（用于持久化恢复） */
export interface TabSnapshot {
  sessionPath: string;
  providerName: string;
  pinned: boolean;
}
```

---

## 三、TabStore 设计（新增 Zustand Store）

```typescript
// stores/tabStore.ts

interface TabStoreState {
  // === 数据 ===
  /** 所有打开的标签页 */
  tabs: TabState[];
  /** 当前激活的标签页 ID */
  activeTabId: string | null;
  /** 已关闭标签页的历史栈（用于"恢复关闭的标签页"） */
  closedTabs: TabSnapshot[];
  /** 最大可恢复的关闭标签数 */
  maxClosedHistory: number;  // 默认 20

  // === 计算属性（通过 getter / selector） ===
  // activeTab: TabState | null
  // activeTabEvents: ChatEvent[]  (filtered)

  // === 操作 ===
  /** 打开一个标签页（如果已存在则激活它） */
  openTab: (sessionPath: string, providerName: string) => Promise<string>;
  /** 关闭标签页 */
  closeTab: (tabId: string) => void;
  /** 激活标签页 */
  activateTab: (tabId: string) => void;
  /** 切换到下一个/上一个标签页 */
  nextTab: () => void;
  /** 切换到上一个标签页 */
  prevTab: () => void;
  /** 关闭其他标签页 */
  closeOtherTabs: (tabId: string) => void;
  /** 关闭右侧所有标签页 */
  closeTabsToRight: (tabId: string) => void;
  /** 关闭所有标签页 */
  closeAllTabs: () => void;
  /** 恢复最近关闭的标签页 */
  reopenClosedTab: () => void;
  /** 切换标签页钉住状态 */
  togglePinTab: (tabId: string) => void;
  /** 移动标签页位置（拖拽排序） */
  moveTab: (fromIndex: number, toIndex: number) => void;
  /** 更新标签页的过滤器 */
  updateTabFilter: (tabId: string, filter: Partial<FilterConfig>) => void;
  /** 更新标签页的查找栏状态 */
  updateTabFindBar: (tabId: string, show: boolean) => void;
  /** 更新标签页的滚动位置 */
  updateTabScrollTop: (tabId: string, scrollTop: number) => void;
  /** 更新标签页的展开状态 */
  updateTabExpanded: (
    tabId: string,
    type: 'thinking' | 'toolCall' | 'toolResult',
    uuids: string[]
  ) => void;
  /** 更新标签页的搜索高亮 */
  updateTabSearchHighlight: (tabId: string, highlight: string | undefined) => void;
}

// 内部工具函数
function buildTabTitle(sessionDetail: SessionDetail): string { ... }
function buildDefaultFilter(settings: AppSettings): FilterConfig { ... }
```

### 标签页打开流程

```
openTab(sessionPath, providerName)
  │
  ├─ 检查 tabs[] 中是否已存在相同 sessionPath 的标签页
  │   └─ 是 → activateTab(existingTab.id) → return
  │
  ├─ 创建新 TabState（status: 'loading'）
  ├─ tabs.push(newTab)，activeTabId = newTab.id
  │
  └─ 异步加载会话内容
      ├─ tauri.getConversation(sessionPath, FULL_FILTER, providerName)
      ├─ 更新 tab.sessionDetail
      ├─ 更新 tab.title = buildTabTitle(detail)
      └─ 如果加载失败 → tab.error = errorMessage
```

### 标签页关闭流程

```
closeTab(tabId)
  │
  ├─ 将 tab 的快照存入 closedTabs[]（用于恢复）
  ├─ 从 tabs[] 移除该 tab
  │
  ├─ 如果关闭的是 activeTab：
  │   ├─ 优先激活右侧相邻 tab
  │   ├─ 其次激活左侧相邻 tab
  │   └─ 如果 tabs 为空 → activeTabId = null
  │
  └─ 如果被关闭的 tab 是 pinned → 也正常关闭（pin 只影响"关闭其他"行为）
```

---

## 四、组件设计

### 4.1 TabBar 组件

```
┌──────────────────────────────────────────────────────────────┐
│ [+ New Tab] │ 🧷 Tab1 × │ 🧷 Tab2 × │ 📄 Tab3 × │  ▼ more  │
└──────────────────────────────────────────────────────────────┘
```

**功能清单：**

| 功能 | 触发方式 | 说明 |
|------|---------|------|
| 打开标签页 | 左侧列表双击 / 中键点击 / Ctrl+Click / 右键菜单"在新标签页中打开" | 新增标签并激活 |
| 关闭标签页 | 点击 × 按钮 / 中键点击标签 / Ctrl+W | 关闭当前标签 |
| 切换标签页 | 点击标签 / Ctrl+Tab / Ctrl+Shift+Tab | 循环切换 |
| 恢复关闭 | Ctrl+Shift+T | 恢复最近关闭的标签 |
| 关闭其他 | 右键菜单 | 保留当前，关闭其余 |
| 关闭右侧 | 右键菜单 | 保留当前及左侧 |
| 全部关闭 | 右键菜单 | 关闭所有 |
| 钉住标签 | 右键菜单 / 双击标签 | 钉住后显示在图钉区域，不受"关闭其他"影响 |
| 拖拽排序 | 鼠标拖拽 | 调整标签顺序 |
| 复制路径 | 右键菜单 | 复制会话文件路径 |
| 刷新 | 右键菜单 / 双击标签 | 重新加载当前会话 |
| 溢出处理 | 自动 | 标签过多时出现水平滚动和"更多"下拉 |

**视觉设计：**
- 标签高度 36px，最小宽度 120px，最大宽度 240px
- 标签内显示：Provider 图标 + 标题（截断） + 加载中动画 / 钉住图标 + 关闭按钮
- 激活标签：白色背景，底部蓝色指示条
- 非激活标签：灰色背景，悬停时变浅
- 加载中标签：标题旁显示旋转动画
- 标签栏背景：浅灰色（`bg-gray-100`），与下方内容区分

### 4.2 TabContent 组件（重构 ConversationView 外层）

将现有 ConversationView 的"外壳"部分（标题栏、FilterBar、滚动容器）抽象为每个标签页独立的渲染层。

```typescript
// components/tabs/TabContent.tsx
interface TabContentProps {
  tab: TabState;
  isActive: boolean;
  // 回调
  onStatsChange: (stats: ...) => void;
  onScrollTopChange: (scrollTop: number) => void;
  onExpandedChange: (...) => void;
  // ...
}
```

**渲染策略（性能优化）：**
- 仅渲染 `activeTab` 的完整 DOM
- 非激活标签页：仅保留 DOM 占位（或用 `display: none` 隐藏），保留滚动位置
- Keep-alive 池：最近访问的 3 个标签页保持 DOM 不销毁，其余用 `display: none`

### 4.3 SessionItem 右键菜单扩展

在现有会话列表项右键菜单中增加：
- **"在新标签页中打开"** — 不改变当前激活标签，在新标签中打开
- 现有"单击打开"行为改为：在当前标签页中打开（如果没有标签则创建）

### 4.4 TabContextMenu 组件

标签页右键菜单：

```
┌─────────────────────────┐
│ 🔄 刷新                  │
│ 📌 钉住 / 取消钉住       │
├─────────────────────────┤
│ ❌ 关闭                  │
│ ❌ 关闭其他              │
│ ❌ 关闭右侧              │
│ ❌ 全部关闭              │
├─────────────────────────┤
│ 📋 复制文件路径          │
│ 🔢 复制会话 ID          │
│ 📁 打开所在文件夹        │
│ 📂 打开工作目录          │
├─────────────────────────┤
│ 📤 导出会话...           │
└─────────────────────────┘
```

---

## 五、与现有组件集成（MainLayout 变更）

### 5.1 MainLayout 重构要点

当前 `MainLayout` 职责过重，引入标签系统后需拆分：

```
MainLayout
├── SessionNavigator (不变)
└── TabbedConversationContainer (NEW — 替代原有右侧内容区)
    ├── TabBar
    └── TabPanel[]
        ├── 标题栏 (sessionTitle)
        ├── FilterBar (per-tab filter)
        ├── ConversationView (per-tab events)
        └── TurnNavigator (per-tab)
```

**关键状态迁移：**
- `activeFilter` → 从 `useState` 迁移到 `tabStore` 中每个 tab 的 `filter` 字段
- `showFindBar` → 迁移到 `tab.filter` `tab.showFindBar`
- `convStats` → 仍可保留在 MainLayout 层级（仅影响 FilterBar 统计显示）
- `activeSearchHighlight` → 迁移到每个 tab

### 5.2 会话选择交互变更

| 操作 | 当前行为 | 新行为 |
|------|---------|--------|
| 单击会话 | 在当前视图打开 | 在激活标签页中打开（无标签则新建） |
| Ctrl+单击 | 无 | 在新标签页中打开，不切换 |
| 中键单击 | 无 | 在新标签页中打开，不切换 |
| 双击会话 | 无 | 在新标签页中打开并激活 |
| 右键 → "在新标签页中打开" | 无 | 新增标签页打开 |
| 导出按钮 | 导出当前会话 | 导出激活标签页的会话 |

### 5.3 键盘快捷键

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Ctrl+T` | 新建空白标签 | 显示"从列表选择会话"状态 |
| `Ctrl+W` | 关闭当前标签 | 最后一个标签关闭后显示 EmptyState |
| `Ctrl+Tab` | 下一个标签 | 循环 |
| `Ctrl+Shift+Tab` | 上一个标签 | 反向循环 |
| `Ctrl+Shift+T` | 恢复关闭的标签 | 从 closedTabs 栈弹出 |
| `Ctrl+1~9` | 切换到第 N 个标签 | 1-based |
| `Ctrl+Shift+P` | 钉住/取消钉住当前标签 | toggle |

---

## 六、标签页持久化

### 6.1 会话间持久化

用户关闭并重新打开应用时，可选择恢复之前的标签页。

**实现方案：**
- 应用退出时，将 `tabs` 中每个标签页的 `{ sessionPath, providerName, pinned }` 保存到 `localStorage`
- 应用启动时，检查 `localStorage` 中的持久化数据，自动恢复标签页
- 设置面板中增加开关：`"启动时恢复上次打开的标签页"`（默认开启）
- 持久化的标签页首次激活时才加载内容（懒加载）

### 6.2 localStorage key 设计

```typescript
const TAB_PERSISTENCE_KEY = 'agent_chat_viewer:tabs';
// 存储结构：TabSnapshot[]
```

---

## 七、边界情况处理

### 7.1 会话文件被删除
- 标签页内容区显示错误提示："会话文件不存在或已被删除"
- 标签标题显示为红色/删除线样式
- 提供"关闭标签"按钮

### 7.2 同一会话重复打开
- `openTab` 检测 `sessionPath` 是否已存在
- 如果存在 → 直接激活已有标签（不创建重复标签）
- 标题栏闪烁动画提示用户该标签已打开

### 7.3 标签过多
- 标签栏水平可滚动（`overflow-x: auto`）
- 最右侧显示 `▼ 更多 (N)` 下拉按钮，列出溢出标签
- 标签最小宽度 100px（含关闭按钮），保证可操作性

### 7.4 所有标签关闭
- `tabs.length === 0` 时，右侧显示 `EmptyState`：
  - 图标：`Layout` / `MessageSquare`
  - 标题："打开一个会话开始查看"
  - 描述："从左侧面板选择会话，或使用搜索找到您想查看的聊天记录。"
  - 操作按钮："恢复最近关闭的标签"（如果 closedTabs 非空）

### 7.5 内存管理
- 标签页 DOM 保持在内存中（使用 `display: none`），最多保留 10 个标签页的完整 DOM
- 超过 10 个标签时，非活跃标签销毁 DOM，切换回来时重新渲染（但 `sessionDetail` 数据保留在 store 中，无需重新请求后端）
- 用户可在设置中配置最大保活标签数：5 / 10 / 15 / 不限制

---

## 八、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types/index.ts` | 修改 | 新增 `TabState`、`TabSnapshot` 类型 |
| `src/stores/tabStore.ts` | **新增** | 标签页状态管理 |
| `src/components/tabs/TabBar.tsx` | **新增** | 标签栏组件 |
| `src/components/tabs/TabItem.tsx` | **新增** | 单个标签组件 |
| `src/components/tabs/TabContextMenu.tsx` | **新增** | 标签右键菜单 |
| `src/components/tabs/TabContent.tsx` | **新增** | 标签内容容器（重构自 MainLayout） |
| `src/components/tabs/TabOverflowMenu.tsx` | **新增** | 标签溢出下拉菜单 |
| `src/hooks/useTabShortcuts.ts` | **新增** | 标签快捷键 hook |
| `src/hooks/useTabPersistence.ts` | **新增** | 标签持久化 hook |
| `src/components/layout/MainLayout.tsx` | **修改** | 集成标签系统，重构右侧内容区 |
| `src/components/sessions/SessionItem.tsx` | **修改** | 右键菜单增加"在新标签页中打开"，支持 Ctrl+Click / 中键打开 |
| `src/components/settings/SettingsPanel.tsx` | **修改** | 增加标签页相关设置项 |
| `src/stores/settingsStore.ts` | **修改** | 增加 `restoreTabsOnStartup` 和 `maxKeepAliveTabs` 设置项 |
| `src/types/index.ts` | **修改** | `AppSettings` 增加标签页相关配置字段 |

---

## 九、实现步骤（建议顺序）

1. **Phase 1：数据层**
   - 定义 `TabState` 类型
   - 实现 `tabStore`（Zustand store）
   - 单元测试

2. **Phase 2：TabBar UI**
   - 实现 `TabBar`、`TabItem`、`TabOverflowMenu` 组件
   - 实现标签打开 / 关闭 / 切换 / 排序交互
   - 实现右键菜单（`TabContextMenu`）

3. **Phase 3：TabContent 与 MainLayout 重构**
   - 实现 `TabContent` 组件
   - 将 `MainLayout` 右侧内容区重构为基于 `tabStore` 的渲染
   - filter / findBar / highlight 等 per-tab 状态迁移

4. **Phase 4：会话列表交互升级**
   - `SessionItem` 支持 Ctrl+Click / 中键打开
   - 右键菜单增加"在新标签页中打开"
   - 双击支持

5. **Phase 5：键盘快捷键**
   - 实现 `useTabShortcuts` hook
   - Ctrl+Tab、Ctrl+W、Ctrl+Shift+T、Ctrl+1~9 等

6. **Phase 6：持久化与设置**
   - 实现 `useTabPersistence` hook
   - 设置面板增加标签页配置项
   - 启动恢复逻辑

7. **Phase 7：性能优化与边界处理**
   - keep-alive 池实现
   - 标签过多溢出处理
   - 异常情况处理（文件删除、加载失败等）

---

## 十、可选增强功能（未来迭代）

以下是标签页功能更进一步的增强方向（不包含在本次设计中，但预留扩展接口）：

- 🔍 **标签页分组**：按项目/Provider 自动分组，每组可折叠
- 📑 **分屏查看**：左右/上下分屏同时查看两个标签页
- 🔗 **标签页关联**：同一工作目录的标签页自动关联显示
- 🎨 **标签页颜色标记**：手动为标签页设置颜色
- 📌 **置顶标签页独立区域**：钉住的标签页显示在独立区域
- 🔖 **书签功能**：收藏特定会话，跨启动保留
- 📊 **标签页统计**：在 TabBar 底部显示标签页总数 / 总消息数

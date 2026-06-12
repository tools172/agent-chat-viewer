# Agent Chat Viewer

一个基于 Tauri v2 开发的桌面应用，用于浏览、查看和导出 Claude Code 等 Agent 的聊天记录。

## ✨ 功能

### ⚡ 极速加载
- 🦴 **骨架扫描** — 启动时仅读取文件系统元数据（大小、修改时间、路径），完全不触碰文件内容，百级会话瞬间列出
- 🌊 **渐进抛光 (Progressive Polish)** — 列表立即可见后，后台逐批读取文件内容，清洗标题、统计消息数、检测客户端环境，数据渐进到位，全程无等待感

### 会话浏览
- 🧹 **智能标题** — 自动剥离元数据前缀，只显示真正的对话内容
  - **OpenClaw**：去除 `Sender (untrusted metadata):` 块、时间戳行、`[Subagent Task]:` 等元数据
  - **Claude Code VSCode**：跳过 `<ide_selection>` 代码选区标记块，取用户实际提问
  - **兜底回退**：非预期格式时保持原文，不清空
- 🏷️ **客户端环境标签** — 侧边栏一眼区分会话来源
  - `VSCode` — Claude Code 插件对话
  - `UI` — OpenClaw 图形客户端（qclaw、workbuddy、Web UI 等）
  - `Sub` — OpenClaw 子 Agent 会话
  - CLI（命令行）为默认情况，不显示标签
- 📁 **文件夹浏览** — 按工作目录/文件夹浏览所有聊天记录
- 📅 **时间线视图** — 按时间分组查看会话
- 🔍 **全文搜索** — 跨所有会话搜索关键词，支持高亮
- 📊 **多重排序** — 支持按创建时间、修改时间、路径、名称、消息数、Agent、文件大小排序，最多两级组合
- 🔄 **合并连发** — 折叠同角色的连续消息，只显示最后一条

### 对话查看
- 💬 **Markdown 渲染** — 完整渲染对话，支持代码高亮、表格、引用
- 🧠 **思考过程** — 可折叠的思考块（默认折叠）
- 🔧 **工具调用/结果** — 可折叠展示，支持隐藏空结果
- 🔇 **前端过滤** — 实时切换显示/隐藏思考、工具调用、工具结果
- 🔎 **会话内查找** — 橙色高亮定位关键词
- 🧭 **轮次导航** — 右侧面板按用户输入轮次快速跳转
- 📋 **右键菜单** — 复制事件文本/JSON、打开文件所在目录

### 导出
- 📥 **导出 Markdown** — 选择包含/排除思考、工具内容
- 📤 **导出 JSON** — 完整结构化数据导出

### 设置
- 🎨 **搜索高亮配色** — 自定义搜索和查找高亮颜色
- 📏 **面板宽度** — 侧边栏 (200-600px) 和轮次导航 (160-400px) 可调
- 📂 **自定义监控目录** — 递归扫描（深度 4 层），自动识别会话格式，支持任意目录结构
- 🔌 **多 Agent 支持** — Claude Code / OpenClaw 可切换启用
- 📁 **打开设置文件** — 一键在资源管理器中打开 settings.json

## 📖 核心概念

在开始使用之前，了解这几个术语会很有帮助：

| 术语 | 是什么 | 例子 |
|---|---|---|
| **工作目录** | 用户执行 Agent 命令时的**当前目录**，即 Agent 实际工作所在的目录。应用左侧栏的文件夹项按此目录分组展示。 | `D:\my-project` |
| **会话 (Session)** | 一次完整的 Agent 对话。聊天记录以 `.jsonl` 文件保存在用户目录的监控目录下（如 `.claude\projects\`），由应用自动发现和解析。 | `C:\Users\xxx\.claude\projects\D--my-project\abc123.jsonl` |
| **提供者 (Provider)** | 解析不同 Agent 聊天格式的**适配器**。不同 Agent（Claude Code、OpenClaw 等）写入的文件格式不同，Provider 负责统一解析。 | `claude_code`、`openclaw` |
| **骨架扫描 (Skeleton)** | 启动时的**第一遍扫描**，仅读取文件系统元数据（大小、路径、修改时间），完全不打开文件内容。列表极速呈现，随后由渐进抛光补齐详细信息。 | 自动执行，无需操作 |
| **渐进抛光 (Progressive Polish)** | 骨架列表出现后的**后台异步过程**。逐批（每批 20 个）读取会话文件内容，清洗标题、统计消息数、检测客户端环境，结果渐进更新到列表。 | 列表中标题和标签自动刷新 |
| **客户端环境 (Client Type)** | 会话的**来源环境**标识：VSCode 插件、OpenClaw 图形客户端、子 Agent 或命令行。展示为侧边栏的小标签，CLI 为默认不显示。 | `VSCode` `UI` `Sub` |
| **刷新 🔄** | 重新从磁盘扫描所有数据源：骨架扫描重建列表 → 渐进抛光补齐信息。如果当前在搜索视图且有活跃关键词，还会重新执行搜索。 | 点击侧边栏顶部的刷新按钮 |

> 💡 **简单说**：「工作目录」就是 Agent 干活的地方，「会话」就是对话记录文件，「骨架 + 渐进抛光」让列表秒开然后信息自动到位，「刷新」就是重新来一遍。

## 🛠 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | React 18 + TypeScript |
| 构建 | Vite |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand |
| 包管理 | pnpm |
| Markdown | react-markdown + remark-gfm |

## 📋 前置要求

- [Rust](https://www.rust-lang.org/) (stable)
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- Windows: Microsoft Visual Studio C++ Build Tools
- macOS: Xcode Command Line Tools
- Linux: `libwebkit2gtk-4.1-dev` 等依赖

## 🚀 快速开始

```bash
# 克隆项目
git clone <repo-url>
cd agent_chat_viewer

# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 运行测试
pnpm test          # 前端测试
cd src-tauri && cargo test  # Rust 测试

# 构建生产版本
pnpm tauri build
```

> 💡 **重命名项目文件夹或移动项目路径后**，需要清理 Rust 构建缓存，否则会因旧路径残留导致构建失败。以下三种方式任选其一：
> 
> **方法一：PowerShell**
> ```powershell
> Remove-Item -Recurse -Force src-tauri\target
> ```
> 
> **方法二：CMD**
> ```cmd
> rmdir /s /q src-tauri\target
> ```
> 
> **方法三：手动删除**
> 
> 手动删除 `.\src-tauri\target` 文件夹。

## 📁 项目结构

```
├── src/                    # React 前端代码
│   ├── components/         # UI 组件
│   │   ├── layout/         # 布局组件 (SessionNavigator, MainLayout)
│   │   ├── projects/       # 工作目录列表
│   │   ├── sessions/       # 会话列表、时间线
│   │   ├── conversation/   # 对话视图、消息渲染
│   │   ├── filter/         # 过滤器
│   │   ├── search/         # 搜索面板
│   │   ├── export/         # 导出对话框
│   │   ├── settings/       # 设置面板
│   │   └── common/         # 通用组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态管理
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数 (Tauri API 封装)
│   └── __tests__/          # 前端测试
├── src-tauri/              # Rust 后端代码
│   ├── src/
│   │   ├── commands/       # Tauri 命令
│   │   ├── providers/      # Agent 提供者 (策略模式)
│   │   ├── models/         # 数据模型
│   │   ├── services/       # 业务逻辑
│   │   └── utils/          # 工具函数
│   └── tests/              # Rust 集成测试
│       └── fixtures/       # 测试数据
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 🧩 扩展支持新 Agent

要添加新的 Agent（如 OpenClaw），只需：

1. 在 `src-tauri/src/providers/` 下实现 `ChatProvider` trait
2. 在 `ProviderRegistry` 中注册
3. 前端无需修改 — 所有渲染由 `ChatEvent` 类型驱动

```rust
// 示例：添加新 Provider
impl ChatProvider for MyNewProvider {
    fn name(&self) -> &'static str { "my_agent" }
    fn default_base_dir(&self) -> PathBuf { /* ... */ }
    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> { /* ... */ }
    fn detect_format(&self, path: &Path) -> bool { /* ... */ }
    fn detect_by_content(&self, first_lines: &str) -> bool { /* 内容指纹检测 */ }
    fn metadata_path(&self) -> Option<PathBuf> { /* ... */ }
}
```

`detect_by_content` 通过读取 `.jsonl` 文件第一行内容来识别格式，使自定义监控目录不再依赖路径结构猜测 provider，支持任意目录布局。

## 🧪 测试

项目包含 **304 个测试**（208 前端 + 96 Rust），覆盖组件渲染、工具函数、数据过滤、解析器、骨架扫描、渐进抛光、内容清洗、客户端检测、向后兼容、递归扫描等场景。

```bash
pnpm test                          # 前端测试 (Vitest)
cd src-tauri && cargo test         # Rust 测试
```

```
src/__tests__/
├── components/   # 组件测试（FilterBar, SettingsPanel, TurnNavigator 等）
├── utils/        # 工具函数 + 集成测试（filter, collapse, search, highlight, sort）
└── stores/       # Zustand 状态管理测试
```

详见 [测试指南](docs/testing-guide.md)。

## 📖 文档

- [CI/CD 实现文档](docs/ci-cd.md) — 持续集成/交付方案设计
- [开发指南](docs/development-guide.md) — 环境搭建、日常操作与发布流程
- [Provider 检测策略](docs/provider-detection.md) — 会话文件 Agent 识别机制详解
- [功能路线图](docs/feature-roadmap.md) — 后续功能迭代方向
- [贡献指南](CONTRIBUTING.md) — 如何参与项目贡献
- [行为准则](CODE_OF_CONDUCT.md) — 社区行为规范

## 📄 License

MIT

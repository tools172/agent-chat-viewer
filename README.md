# Agent Chat Viewer

一个基于 Tauri v2 开发的桌面应用，用于浏览、查看和导出 Claude Code 等 Agent 的聊天记录。

## ✨ 功能

- 📁 **文件夹浏览** - 按项目/文件夹浏览所有聊天记录
- 📅 **时间线视图** - 按时间分组查看会话
- 🔍 **全文搜索** - 跨所有会话搜索关键词
- 💬 **对话查看** - 完整渲染对话，支持 Markdown
- 🧠 **思考过程** - 可折叠的思考块（默认折叠）
- 🔧 **工具调用** - 可折叠的工具调用/结果展示
- 🔇 **智能过滤** - 隐藏空工具结果、系统消息等无用内容
- 📥 **导出 Markdown** - 将会话导出为格式良好的 Markdown
- 📤 **导出 JSON** - 导出完整 JSON 数据
- ⚙️ **自定义路径** - 支持添加自定义监控目录
- 🔌 **可扩展** - 策略模式设计，轻松支持其他 Agent

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
- [pnpm](https://pnpm.io/) >= 8
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

## 📁 项目结构

```
├── src/                    # React 前端代码
│   ├── components/         # UI 组件
│   │   ├── layout/         # 布局组件 (Sidebar, MainLayout)
│   │   ├── projects/       # 项目列表
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
    fn metadata_path(&self) -> Option<PathBuf> { /* ... */ }
}
```

## 📄 License

MIT

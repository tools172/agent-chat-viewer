# Agent Chat Viewer

一个基于 Tauri v2 开发的桌面应用，用于浏览、查看和导出 Claude Code 等 Agent 的聊天记录。

## ✨ 功能

### 会话浏览
- 📁 **文件夹浏览** — 按项目/文件夹浏览所有聊天记录
- 📅 **时间线视图** — 按时间分组查看会话
- 🔍 **全文搜索** — 跨所有会话搜索关键词，支持高亮
- 📊 **多重排序** — 支持按时间、路径、名称、消息数、Agent、文件大小排序
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
- 📂 **自定义监控目录** — 支持添加、删除、浏览
- 🔌 **多 Agent 支持** — Claude Code / OpenClaw 可切换启用
- 📁 **打开设置文件** — 一键在资源管理器中打开 settings.json

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

## 🧪 测试

项目包含 **205 个测试**（146 前端 + 59 Rust），覆盖组件渲染、工具函数、数据过滤、解析器、向后兼容等场景。

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
- [功能路线图](docs/feature-roadmap.md) — 后续功能迭代方向
- [贡献指南](CONTRIBUTING.md) — 如何参与项目贡献
- [行为准则](CODE_OF_CONDUCT.md) — 社区行为规范

## 📄 License

MIT

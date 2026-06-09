# Contributing to Agent Chat Viewer

感谢你对 Agent Chat Viewer 的关注！本指南将帮助你了解如何参与贡献。

## 📋 开发环境

- **Rust** (stable) — 后端 / Tauri
- **Node.js** >= 18 — 前端
- **pnpm** >= 9 — 包管理
- **编辑器**: 推荐 VS Code（项目已包含推荐配置）

### 安装依赖

```bash
# 克隆仓库
git clone <repo-url>
cd agent-chat-viewer

# 安装前端依赖
pnpm install

# 开发模式启动
pnpm tauri dev
```

## 🏗 项目结构

```
├── src/                    # React 前端 (TypeScript)
│   ├── components/         # UI 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   └── __tests__/          # 前端测试
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── commands/       # Tauri 命令
│   │   ├── providers/      # Agent Provider（策略模式）
│   │   ├── models/         # 数据模型
│   │   ├── services/       # 业务逻辑
│   │   └── utils/          # 工具
│   └── tests/              # Rust 集成测试
├── .github/workflows/      # CI/CD
└── package.json
```

## 🔍 提交前检查

在提交 PR 之前，请确保以下检查通过（CI 也会执行这些检查）：

### 前端

```bash
# TypeScript 类型检查
pnpm lint

# 运行测试
pnpm test

# 代码格式化
pnpm format
```

### Rust 后端

```bash
cd src-tauri

# 格式化
cargo fmt --all

# Clippy（零警告）
cargo clippy --all-targets --all-features -- -D warnings

# 测试
cargo test --all-features
```

### 完整构建验证

```bash
pnpm tauri build
```

## 📐 代码风格

### TypeScript / React

- 使用 **strict mode** TypeScript，不允许 `any`
- React 组件使用 **函数组件 + Hooks**，避免 class 组件
- 使用 **Zustand** 进行状态管理
- 使用 **Tailwind CSS** 进行样式编写，避免内联样式
- 组件文件使用 PascalCase，工具文件使用 camelCase

### Rust

- 遵循标准 Rust 命名规范（snake_case）
- 使用 `thiserror` 进行错误处理
- 使用 trait 实现扩展性（参见 Provider 模式）
- 通过 `cargo fmt` 自动格式化

## 🧩 添加新 Agent Provider

要支持新的 Agent 聊天记录格式，实现 `ChatProvider` trait：

```rust
impl ChatProvider for MyNewProvider {
    fn name(&self) -> &'static str { "my_agent" }
    fn default_base_dir(&self) -> PathBuf { /* ... */ }
    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> { /* ... */ }
    fn detect_format(&self, path: &Path) -> bool { /* ... */ }
    fn metadata_path(&self) -> Option<PathBuf> { /* ... */ }
}
```

然后在 `ProviderRegistry` 中注册，前端无需任何修改。

## 🔀 Pull Request 流程

1. **Fork** 本仓库并创建功能分支
2. 确保本地所有检查通过
3. 如果添加了新功能，请补充测试用例
4. 提交 PR 到 `main` 分支
5. CI 将自动运行所有检查
6. 等待 Code Review

### Commit 消息规范

推荐使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加会话搜索功能
fix: 修复导出文件编码问题
refactor: 重构 Provider 注册逻辑
test: 补充 Markdown 渲染测试
docs: 更新 README 安装说明
chore: 更新依赖版本
```

## 🐛 Bug 报告

请使用 GitHub Issues，包含以下信息：

- **操作系统**: Windows / macOS / Linux
- **重现步骤**: 详细描述如何触发 Bug
- **期望行为**: 你期望发生什么
- **实际行为**: 实际发生了什么
- **日志**: 如有可能，附上错误日志

## 📄 License

贡献即表示你同意将代码以 MIT License 发布。

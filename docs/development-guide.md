# 开发指南

> Agent Chat Viewer 开发环境搭建、日常操作与发布流程

## 目录

- [1. 环境准备](#1-环境准备)
- [2. 项目结构](#2-项目结构)
- [3. 日常开发](#3-日常开发)
- [4. 提交前检查清单](#4-提交前检查清单)
- [5. Git 工作流](#5-git-工作流)
- [6. 构建与发布](#6-构建与发布)
- [7. 调试技巧](#7-调试技巧)
- [8. 问题排查](#8-问题排查)

---

## 1. 环境准备

### 1.1 必需工具

| 工具 | 最低版本 | 安装方式 | 验证命令 |
|------|---------|---------|---------|
| Rust | stable (1.75+) | [rustup.rs](https://rustup.rs) | `rustc --version` |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) 或 nvm | `node --version` |
| pnpm | 9+ | `npm i -g pnpm@9` | `pnpm --version` |
| Git | 2.40+ | [git-scm.com](https://git-scm.com) | `git --version` |

### 1.2 平台特定依赖

#### Windows

```powershell
# 安装 Microsoft Visual Studio C++ Build Tools
# 下载: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 安装时勾选 "Desktop development with C++"
```

#### macOS

```bash
xcode-select --install
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev
```

### 1.3 克隆并安装

```bash
git clone <repo-url>
cd agent_chat_viewer
pnpm install
```

### 1.4 验证环境

```bash
# 前端类型检查
pnpm lint

# 前端测试
pnpm test

# Rust 编译检查
cd src-tauri && cargo check && cd ..

# Rust 测试
cd src-tauri && cargo test && cd ..
```

以上全部通过，说明环境配置正确。

---

## 2. 项目结构

```
agent_chat_viewer/
├── src/                          # React 前端 (TypeScript)
│   ├── components/
│   │   ├── common/               # 通用组件 (EmptyState, ErrorBoundary, ...)
│   │   ├── conversation/         # 对话渲染 (EventCard, MarkdownRenderer, ...)
│   │   ├── export/               # 导出对话框
│   │   ├── filter/               # 过滤器组件
│   │   ├── layout/               # 布局 (SessionNavigator, MainLayout)
│   │   ├── projects/             # 工作目录列表视图
│   │   ├── search/               # 搜索面板
│   │   ├── sessions/             # 会话列表 / 时间线视图
│   │   └── settings/             # 设置面板
│   ├── hooks/                    # 自定义 React Hooks
│   ├── stores/                   # Zustand 状态管理
│   ├── types/                    # TypeScript 类型定义
│   ├── utils/                    # 工具函数 (Tauri API 封装)
│   └── __tests__/                # 前端测试 (Vitest)
│
├── src-tauri/                    # Rust 后端 (Tauri v2)
│   ├── src/
│   │   ├── commands/             # Tauri 命令（前端调用的 API）
│   │   │   ├── browser.rs        # 浏览/搜索命令
│   │   │   ├── export.rs         # 导出 + 文件操作命令
│   │   │   └── settings.rs       # 设置命令
│   │   ├── models/               # 数据模型 (Event, Session, Filter)
│   │   ├── providers/            # Agent Provider（策略模式）
│   │   │   ├── base.rs           # ChatProvider trait 定义
│   │   │   ├── claude_code.rs    # Claude Code 格式解析
│   │   │   ├── codex.rs          # Codex (OpenAI) 格式解析
│   │   │   ├── mod.rs            # ProviderRegistry 注册中心
│   │   │   └── openclaw.rs       # OpenClaw 格式解析
│   │   ├── services/             # 业务逻辑
│   │   │   ├── filter.rs         # 事件过滤
│   │   │   ├── exporter.rs       # Markdown 导出
│   │   │   ├── parser.rs         # 会话解析
│   │   │   └── settings.rs       # 设置持久化
│   │   ├── utils/                # 工具函数
│   │   ├── lib.rs                # Tauri 应用入口
│   │   └── main.rs               # Rust 主函数
│   ├── tests/                    # Rust 集成测试
│   │   ├── fixtures/             # 测试数据 (.jsonl)
│   │   └── integration_test.rs
│   ├── Cargo.toml                # Rust 依赖配置
│   └── tauri.conf.json           # Tauri 应用配置
│
├── .github/                      # GitHub 配置
│   ├── workflows/ci.yml          # CI 流水线
│   ├── ISSUE_TEMPLATE/           # Issue 模板
│   └── PULL_REQUEST_TEMPLATE.md  # PR 模板
│
├── docs/                         # 项目文档
│   ├── ci-cd.md                  # CI/CD 实现文档
│   ├── development-guide.md      # 本文件
│   ├── feature-roadmap.md        # 功能路线图
│   ├── multi-tab-design.md       # 多标签设计
│   ├── provider-detection.md     # Provider 检测策略
│   ├── testing-guide.md          # 测试指南
│   └── theme-system-refactoring.md # 主题系统重构
│
├── package.json                  # 前端依赖 + 脚本
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置
├── tailwind.config.js            # Tailwind CSS 配置
├── CONTRIBUTING.md               # 贡献指南
├── CODE_OF_CONDUCT.md            # 行为准则
└── README.md                     # 项目概览
```

---

## 3. 日常开发

### 3.1 启动开发模式

```bash
# 启动 Tauri 开发模式（热重载）
pnpm tauri dev
```

这会同时启动：
- Vite dev server（`localhost:1420`）— 前端热重载
- Rust 后端编译 — 修改 Rust 代码后自动重新编译

### 3.2 仅开发前端

```bash
# 仅启动 Vite（不启动 Tauri 窗口）
pnpm dev
```

在浏览器中打开 `http://localhost:1420` 即可看到 UI（但 Tauri API 不可用）。

### 3.3 前端开发常用操作

```bash
# TypeScript 类型检查
pnpm lint

# 运行所有测试
pnpm test

# 运行单个测试文件
pnpm test -- --run src/__tests__/components/SessionItem.test.tsx

# Watch 模式（文件变更自动重跑）
pnpm test:watch

# 查看测试覆盖率
pnpm test:coverage

# 代码格式化
pnpm format
```

### 3.4 Rust 开发常用操作

```bash
cd src-tauri

# 编译检查（不运行）
cargo check

# 快速编译检查（跳过类型检查）
cargo check --lib

# 运行所有测试
cargo test

# 运行单个测试
cargo test test_parse_minimal_session

# 显示测试输出
cargo test -- --nocapture

# 代码格式化
cargo fmt --all

# 检查格式（不改写）
cargo fmt --all --check

# Clippy 检查
cargo clippy --all-targets --all-features

# Clippy 严格模式（警告视为错误）
cargo clippy --all-targets --all-features -- -D warnings

# 完整的 Tauri 构建
cd .. && pnpm tauri build
```

---

## 4. 提交前检查清单

每次提交前，请依次执行以下命令。**任何一步失败都应先修复再提交。**

```bash
# === 前端 ===
pnpm lint              # 1. TypeScript 类型检查 (tsc --noEmit)
pnpm test              # 2. 运行前端测试
pnpm format            # 3. 格式化 TypeScript/CSS

# === Rust 后端 ===
cd src-tauri
cargo fmt --all        # 4. 格式化 Rust 代码
cargo clippy --all-targets --all-features -- -D warnings   # 5. Clippy 零警告
cargo test --all-features    # 6. Rust 测试

# === 构建验证（可选，耗时较长） ===
cd ..
pnpm tauri build        # 7. 完整构建验证
```

> **提示：** 你可以将步骤 1-6 组合为一个脚本：
> ```bash
> #!/bin/bash
> set -e
> echo "=== Frontend ==="
> pnpm lint && pnpm test && pnpm format
> echo "=== Rust ==="
> cd src-tauri
> cargo fmt --all --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test --all-features
> echo "=== All checks passed ==="
> ```

---

## 5. Git 工作流

### 5.1 分支策略

```
main          ← 稳定分支，随时可发布
├── feat/xxx  ← 功能分支
├── fix/xxx   ← 修复分支
├── refactor/ ← 重构分支
└── docs/     ← 文档分支
```

### 5.2 开发流程

```bash
# 1. 从 main 创建分支
git checkout main
git pull origin main
git checkout -b feat/my-feature

# 2. 开发 + 提交
git add .
git commit -m "feat: add my feature"

# 3. 推送前确保通过所有检查
pnpm lint && pnpm test
cd src-tauri && cargo fmt --all --check && cargo clippy && cargo test && cd ..

# 4. 推送并创建 PR
git push origin feat/my-feature
# 然后在 GitHub 上创建 Pull Request
```

### 5.3 Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <description>

feat:     新功能
fix:      Bug 修复
refactor: 代码重构（不改变功能）
test:     测试相关
docs:     文档更新
chore:    构建/工具/依赖变更
style:    代码格式（不影响逻辑）
perf:     性能优化
```

示例：

```bash
git commit -m "feat: add right-click context menu to session items"
git commit -m "fix: export dialog not saving files on Windows"
git commit -m "refactor: extract filter logic into separate module"
git commit -m "test: add unit tests for MarkdownRenderer"
git commit -m "docs: add CI/CD implementation docs"
```

### 5.4 PR 流程

1. 推送分支后，GitHub 自动运行 CI
2. CI 全部通过（绿色 ✅）后才能合并
3. 至少一人 Code Review（可通过 Settings 强制要求）
4. 合并方式：推荐 **Squash and Merge**（保持 main 历史整洁）

---

## 6. 构建与发布

### 6.1 本地构建

```bash
# 生产构建（当前平台）
pnpm tauri build
```

构建产物位置：

| 平台 | 路径 |
|------|------|
| Windows | `src-tauri/target/release/bundle/msi/` |
| macOS | `src-tauri/target/release/bundle/dmg/` |
| Linux | `src-tauri/target/release/bundle/deb/` |

### 6.2 CI 构建

CI 会自动在 Ubuntu 上构建。构建产物可在 GitHub Actions 的 Artifacts 中下载。

### 6.3 版本发布流程（手动）

```bash
# 1. 确保在 main 分支且所有检查通过
git checkout main
git pull origin main

# 2. 更新版本号
# 编辑 package.json 中的 version 字段
# 编辑 src-tauri/tauri.conf.json 中的 version 字段

# 3. 提交版本变更
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to v0.2.0"

# 4. 打标签
git tag v0.2.0

# 5. 推送
git push origin main
git push origin v0.2.0

# 6. 在 GitHub 上创建 Release
# 上传各平台的构建产物
```

---

## 7. 调试技巧

### 7.1 Rust 后端调试

```bash
# 打印调试信息
cargo test -- --nocapture

# 使用 dbg! 宏（保留在代码中）
let result = dbg!(some_function());

# 使用 println! 查看中间值
println!("DEBUG: value = {:?}", value);
```

### 7.2 前端调试

- 在 Tauri 窗口中按 `F12` 打开 DevTools
- 或运行 `pnpm dev` 在浏览器中调试（Tauri API 不可用）

### 7.3 查看 Tauri 日志

```bash
# 启用 Rust 日志
RUST_LOG=debug pnpm tauri dev

# 或在 Rust 代码中使用
log::info!("Processing session: {}", path);
```

### 7.4 测试特定组件

```bash
# 前端：运行匹配模式的测试
pnpm test -- --run -t "SessionItem"

# Rust：运行匹配模式的测试
cargo test parse_session
```

---

## 8. 问题排查

### 8.1 `pnpm tauri dev` 启动失败

**症状：** `error: linking with cc failed`

**解决：** 确保安装了平台特定的构建工具（见 [1.2 平台特定依赖](#12-平台特定依赖)）。

---

### 8.2 TypeScript 类型错误

**症状：** `pnpm lint` 报错

**解决步骤：**
1. 查看错误信息中的文件名和行号
2. 确保类型定义在 `src/types/index.ts` 中
3. 新组件确保 `Props` 接口完整

---

### 8.3 Rust Borrow Checker 错误

**症状：** 编译错误关于 ownership/borrowing

**解决：** 常见模式：
- 使用 `.clone()` 复制数据
- 使用 `&` 引用而不是 move
- 使用 `Arc<dyn ChatProvider>` 共享所有权

---

### 8.4 测试失败

**症状：** `cargo test` 或 `pnpm test` 失败

**解决步骤：**
1. 检查测试文件是否有对应的 fixture 数据
2. 确认 fixture 文件存在且格式正确
3. 查看 CI 日志中的详细错误信息

---

### 8.5 CI 失败但本地通过

**常见原因：**

1. **未格式化的代码** → 运行 `pnpm format` 和 `cargo fmt --all`
2. **未提交的文件** → `git status` 检查是否有遗漏
3. **系统差异** → Linux CI 与 Windows/macOS 本地的路径分隔符不同
4. **pnpm 版本差异** → 确保本地 pnpm 版本与 CI 一致

---

## 参考链接

- [Tauri v2 文档](https://v2.tauri.app/)
- [React 文档](https://react.dev/)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Vitest 文档](https://vitest.dev/)
- [Conventional Commits](https://www.conventionalcommits.org/)

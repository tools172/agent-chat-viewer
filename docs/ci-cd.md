# CI/CD 实现文档

> Agent Chat Viewer 的持续集成与持续交付方案

## 一、架构概览

```
GitHub Actions
├── Push / PR to main
│   ├── Job 1: Frontend (TS) ──── tsc + vitest + prettier
│   ├── Job 2: Rust (Backend) ─── fmt + clippy + cargo test
│   └── Job 3: Build (Linux) ──── pnpm tauri build  [needs: frontend, rust]
└── All green → merge allowed
```

## 二、流水线设计

### 触发条件

| 事件 | 分支 | 行为 |
|------|------|------|
| `push` | `main` | 全部 3 个 Job |
| `pull_request` | → `main` | 全部 3 个 Job |

### 并发控制

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

同一分支/PR 上多次推送时，自动取消正在运行的旧流水线，确保 CI 资源始终用于最新提交。

---

## 三、各 Job 详解

### 3.1 Frontend (TypeScript) — 15 分钟超时

| 步骤 | 命令 | 作用 |
|------|------|------|
| Checkout | `actions/checkout@v4` | 拉取代码 |
| Setup pnpm | `pnpm/action-setup@v4` | 安装 pnpm 9 |
| Setup Node.js | `actions/setup-node@v4` | Node.js 20 + pnpm 缓存 |
| Install | `pnpm install` | 安装依赖 |
| Type check | `pnpm lint` | `tsc --noEmit` 严格模式检查 |
| Unit tests | `pnpm test -- --coverage` | Vitest + 覆盖率报告 |
| Format check | `prettier --check "src/**/*.{ts,tsx,css}"` | 代码风格校验 |

**失败常见原因：**

- TypeScript 类型错误（`strict: true`，不允许 `any`）
- 测试用例失败
- 代码格式不符合 Prettier 规范 → 本地运行 `pnpm format` 修复

### 3.2 Rust (Backend) — 20 分钟超时

| 步骤 | 命令 | 作用 |
|------|------|------|
| Checkout | `actions/checkout@v4` | 拉取代码 |
| Setup Rust | `dtolnay/rust-toolchain@stable` | 安装 Rust stable + clippy + rustfmt |
| Cache | `Swatinem/rust-cache@v2` | 缓存 `target/` 目录 |
| System deps | `apt-get install libwebkit2gtk-4.1-dev ...` | Tauri v2 Linux 依赖 |
| Format check | `cargo fmt --all --check` | 代码格式校验 |
| Clippy | `cargo clippy --all-targets --all-features -- -D warnings` | Lint（零警告策略） |
| Test | `cargo test --all-features` | 单元测试 + 集成测试 |

**系统依赖说明：**

Tauri v2 在 Linux 上依赖 WebKitGTK。`libsoup-3.0-dev` 是 Tauri v2 特有的依赖（v1 使用 `libsoup2.4`）。

### 3.3 Build (Linux) — 30 分钟超时

```yaml
build:
  needs: [frontend, rust]  # 只有前两个通过才运行
```

完整的 `pnpm tauri build`，验证项目可以成功构建为可执行文件。此 Job 作为最终门禁——即使类型检查和测试都通过，如果 Tauri 构建失败，合并仍会被阻止。

---

## 四、缓存策略

### Rust 编译缓存

```yaml
- uses: Swatinem/rust-cache@v2
  with:
    workspaces: 'src-tauri -> target'
```

- 缓存 `target/` 目录，避免每次重新编译所有依赖
- 基于 `Cargo.lock` 的哈希自动失效
- 首次运行 ~10-15 分钟，缓存命中后 ~1-3 分钟

### pnpm 缓存

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'pnpm'
```

- 自动缓存 `~/.pnpm-store`，跳过重复下载
- 基于 `pnpm-lock.yaml` 的哈希自动失效

---

## 五、工具选型

| 工具 | 选择 | 理由 |
|------|------|------|
| CI 平台 | GitHub Actions | 与 GitHub 深度集成，免费额度充足 |
| Rust 安装 | `dtolnay/rust-toolchain` | 社区标准，比官方 action 更快 |
| Rust 缓存 | `Swatinem/rust-cache` | 专门为 Rust 设计，智能失效 |
| pnpm 安装 | `pnpm/action-setup` | 官方维护，支持 version 参数 |
| Runner | `ubuntu-latest` | Linux 免费额度最多，Tauri 依赖齐全 |

## 六、环境变量

```yaml
env:
  CARGO_TERM_COLOR: always    # Rust 编译输出彩色
  RUST_BACKTRACE: 1           # 测试失败时打印完整堆栈
  PNPM_VERSION: '9'           # 锁定 pnpm 主版本
```

---

## 七、扩展计划

### 7.1 多平台构建（未来）

当前只有 Linux 构建验证。完整的多平台构建矩阵：

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
```

需要为每个平台配置对应的系统依赖和签名证书。建议在 `release.yml` 中单独实现，仅 tag 推送时触发。

### 7.2 自动发布（未来）

```yaml
on:
  push:
    tags: ['v*']

jobs:
  release:
    # 1. 多平台构建
    # 2. 生成 Changelog
    # 3. 创建 GitHub Release
    # 4. 上传构建产物 (.deb, .msi, .dmg)
```

### 7.3 PR 预览（未来）

使用 Tauri 的 dev 模式或 Storybook 在 PR 中提供可视化预览。

---

## 八、常见问题

### Q: Rust 缓存为什么有时失效？

A: `rust-cache` 基于 `Cargo.lock` 哈希。任何依赖版本变更都会导致缓存重建。这是正确行为，确保不会使用过时的编译产物。

### Q: Build Job 太慢怎么办？

A: 
1. 确保 Rust 缓存命中
2. 前端 `dist/` 也可缓存（基于 `src/` 和 `node_modules/` 的哈希）
3. 考虑将 Build Job 从 PR 中移除，仅在 `main` 分支上运行

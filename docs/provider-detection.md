# Provider 检测策略

本文档说明 Agent Chat Viewer 如何判断一个 `.jsonl` 会话文件属于哪个 Agent（Claude Code、OpenClaw 或未来的其他工具），以及如何从任意目录结构中自动发现和组织会话记录。

---

## 目录

- [1. 核心原则](#1-核心原则)
- [2. 两种检测方式](#2-两种检测方式)
  - [2.1 路径检测 `detect_format`](#21-路径检测-detect_format)
  - [2.2 内容检测 `detect_by_content`](#22-内容检测-detect_by_content)
- [3. 扫描流程](#3-扫描流程)
  - [3.1 默认路径（快速路径）](#31-默认路径快速路径)
  - [3.2 自定义监控目录（完整流程）](#32-自定义监控目录完整流程)
- [4. 递归发现算法](#4-递归发现算法)
- [5. 内容指纹注册表](#5-内容指纹注册表)
- [6. 扩展新 Agent](#6-扩展新-agent)
- [7. 检测优先级与兜底](#7-检测优先级与兜底)

---

## 1. 核心原则

- **内容优先**：文件属于哪个 Agent，由文件内容决定，不由存放路径决定
- **路径仅做分组**：目录名只决定在侧边栏中归属哪个"项目"展示，不参与格式判断
- **每个 Provider 自描述**：新增 Agent 只需注册自己的检测逻辑，不修改全局扫描代码

---

## 2. 两种检测方式

项目同时保留了 `detect_format`（路径检测）和 `detect_by_content`（内容检测），用于不同场景。

### 2.1 路径检测 `detect_format`

**用途**：判断一个目录是否在某个 Agent 的默认存储路径下。

**场景**：仅用于默认 provider 路径的快速判断（如 `~/.openclaw/agents/`、`~/.claude/projects/`）。路径匹配时直接确定 provider，无需读文件。

**实现**：

```rust
// OpenClaw — 检测路径是否在 ~/.openclaw 下
fn detect_format(&self, path: &Path) -> bool {
    path.starts_with(home_dir().join(".openclaw"))
}

// Claude Code — 检测路径是否在 ~/.claude/projects 下
fn detect_format(&self, path: &Path) -> bool {
    path.starts_with(home_dir().join(".claude").join("projects"))
}
```

**局限性**：只适用于标准默认路径。自定义监控目录（如 `F:\sessions`、`D:\backup\chats`）不在此范围内，无法通过路径判断。

### 2.2 内容检测 `detect_by_content`

**用途**：读取 `.jsonl` 文件的第一行，根据 JSON 结构判断属于哪个 Agent。

**场景**：自定义监控目录中所有文件的 provider 识别。这是格式判断的主要方式，不依赖路径。

**实现**：每个 provider 检查第一行 JSON 中特有的字段组合（"指纹"）：

```rust
// OpenClaw — 会话元数据行：{"type":"session","version":3,...}
fn detect_by_content(&self, first_lines: &str) -> bool {
    if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
            if let Some(event_type) = value["type"].as_str() {
                return event_type == "session" && value["version"].as_u64().is_some();
            }
        }
    }
    false
}

// Claude Code — 用户/助手/系统事件：{"type":"user","message":{...}}
fn detect_by_content(&self, first_lines: &str) -> bool {
    if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
            if let Some(event_type) = value["type"].as_str() {
                return matches!(event_type, "user" | "assistant" | "system");
            }
        }
    }
    false
}
```

**为什么这样设计**：

| 考量 | 说明 |
|------|------|
| 只读第一行 | 不需要加载整个文件（文件可能很大），只读前 4KB 即可覆盖第一行 JSON |
| 字段组合而非单一字段 | `"type":"session"` + `"version"` 同时存在才是 OpenClaw，避免误匹配 |
| 互斥检查 | 每个 provider 的指纹应与其他 provider 互斥，避免一个文件被多个 provider 认领 |
| 版本无关 | 不校验 version 的具体值，只检查字段存在，未来版本号变化不受影响 |

---

## 3. 扫描流程

整体流程分两步：① 收集扫描根路径 → ② 遍历发现会话文件并分组。

### 3.1 默认路径（快速路径）

已启用的 provider 的默认目录（如 `~/.claude/projects/`），provider 已知，跳过内容检测：

```
设置中 openclaw: enabled
    → default_base_dir() = ~/.openclaw/agents/
    → 目录存在 → 加入扫描
    → 使用 openclaw provider 枚举 sessions/ 下的文件
    → 每个子目录作为一个"项目"
```

### 3.2 自定义监控目录（完整流程）

用户在设置中添加的路径，provider 未知：

```
用户添加 F:\all_chats 作为监控目录
    → 规范化路径
    → 始终加入扫描（不受 provider_enabled 控制）
    → 递归遍历（深度 ≤ 4）
    → 发现 .jsonl 文件后，读第一行做内容检测
    → 匹配到的 provider 用于解析该目录下的所有文件
    → 目录名作为"项目"名展示
```

---

## 4. 递归发现算法

`discover_session_files(dir, depth)` 是核心发现函数。

### 遍历规则

```
walk(dir, depth):
    如果 depth > 4 或 dir 不是目录 → 返回

    1. 检查 dir/sessions/ 是否存在
        → 存在：扫描 dir/sessions/*.jsonl → 以 dir 为项目
        → 这是 OpenClaw 标准结构 <agent>/sessions/*.jsonl

    2. 检查 dir/*.jsonl 直接文件
        → 存在：加入 dir 项目
        → 这是平铺结构或 Claude Code 结构

    3. 对 dir 的每个子目录（跳过 "sessions"）
        → walk(subdir, depth + 1)
```

### 深度限制

最大深度 4 层，覆盖以下常见结构 + 一层余量：

| 深度 | 路径示例 | 说明 |
|------|---------|------|
| 0 | `<root>/` | 监控目录本身 |
| 1 | `<root>/agent-a/` | Agent 目录 |
| 2 | `<root>/agent-a/sessions/` | OpenClaw sessions 子目录 |
| 3 | `<root>/agent-a/sessions/*.jsonl` | 会话文件 |

深度 4 给用户可能在监控目录下再加一层分组目录留了余量（如 `<root>/project-group/agent/sessions/`）。

### 分组策略

文件按所在目录分组为"项目"，规则：

| 文件位置 | 项目目录 | 项目名 |
|---------|---------|--------|
| `<root>/foo/sessions/*.jsonl` | `<root>/foo` | `foo` |
| `<root>/foo/*.jsonl` | `<root>/foo` | `foo` |
| `<root>/*.jsonl` | `<root>` | root 目录名 |

项目名仅用于侧边栏展示，不影响解析逻辑。

---

## 5. 内容指纹注册表

`ProviderRegistry` 统一管理所有已注册 provider 的内容检测：

```rust
impl ProviderRegistry {
    /// 遍历所有已注册 provider，返回第一个内容匹配的
    pub fn detect_by_content(&self, first_lines: &str) -> Option<&Arc<dyn ChatProvider>> {
        self.providers.values().find(|p| p.detect_by_content(first_lines))
    }
}
```

**检测顺序**：按注册顺序依次尝试，第一个返回 `true` 的 provider 胜出。当前注册顺序为 Claude Code → OpenClaw，但指纹设计保证了互斥性，顺序不影响结果。

### 当前指纹对照表

| Provider | 第一行特征字段 | 互斥保证 |
|----------|---------------|---------|
| OpenClaw | `type: "session"` + `version` 字段 | Claude Code 不会有 `type: "session"` |
| Claude Code | `type: "user"` / `"assistant"` / `"system"` | OpenClaw 的第一行永远是 `type: "session"` |

---

## 6. 扩展新 Agent

新增一个 Agent（如 Cursor、Codex）只需以下步骤：

### 6.1 实现 ChatProvider trait

```rust
// src-tauri/src/providers/cursor.rs

impl ChatProvider for CursorProvider {
    fn name(&self) -> &'static str { "cursor" }
    fn display_name(&self) -> &'static str { "Cursor" }

    // 默认存储路径（可选）
    fn default_base_dir(&self) -> PathBuf {
        home_dir().join(".cursor").join("sessions")
    }

    // 路径检测：标准的 ~/.cursor 路径
    fn detect_format(&self, path: &Path) -> bool {
        path.starts_with(home_dir().join(".cursor"))
    }

    // ★ 内容检测：定义 Cursor 文件的指纹
    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                // Cursor 假设的格式：{"type":"conversation","model":...}
                return v["type"].as_str() == Some("conversation")
                    && v["model"].as_str().is_some();
            }
        }
        false
    }

    // 解析逻辑
    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        // Cursor 特有的 JSONL 解析逻辑
    }
}
```

### 6.2 注册到 ProviderRegistry

```rust
// src-tauri/src/providers/mod.rs — ProviderRegistry::new()
registry.register(Arc::new(cursor::CursorProvider::new()));
```

### 6.3 不需要改的

- 扫描/发现逻辑（`browser.rs`）
- 前端 UI 组件
- 设置面板（自动识别新 provider）

整个过程对现有代码零侵入。

---

## 7. 检测优先级与兜底

### 决策流程

```
对于某个 .jsonl 文件的 provider 判定：

1. 如果在默认 provider 路径下（如 ~/.claude/projects/）
    → 使用该 provider（跳过内容检测）
    → 这是"快速路径"，避免不必要的文件读取

2. 如果在自定义监控目录下
    → 读文件第一行
    → 逐个尝试所有注册的 provider.detect_by_content()
    → 第一个匹配的胜出

3. 如果所有 provider 都不匹配
    → 回退为 "claude_code" provider
    → 尝试解析，解析失败的行会被跳过（已有容错机制）
```

### 容错设计

- **内容检测失败** → 回退为 `claude_code`
- **解析失败的行** → `eprintln!` 警告后跳过该行，不中断整体解析
- **空文件 / 全无效行** → 生成摘要但标记为 `"(Empty session)"`
- **非 `.jsonl` 文件** → 在扫描阶段即被过滤（`is_session_file` 检查扩展名）

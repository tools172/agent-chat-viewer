# Provider 检测策略

本文档说明 Agent Chat Viewer 如何判断一个会话文件属于哪个 Agent（Claude Code、Cursor、Codex、OpenClaw、DeepSeek Harness 或未来的其他工具），以及如何从任意目录结构中自动发现和组织会话记录。

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

**检测顺序**：`ProviderRegistry` 用 `HashMap` 存储，迭代顺序不保证等于注册顺序，因此各 provider 的指纹必须**互斥**——每个文件只可能被一个 provider 认领，顺序不影响结果。

### 当前指纹对照表

| Provider | 第一行特征字段 | 互斥保证 |
|----------|---------------|---------|
| Claude Code | `type: "user"` / `"assistant"` / `"system"` | 其他 provider 不会有这些 type 值 |
| Cursor | `type: "session_meta"` + `composerId` 字段 | `session_meta` 与 Codex 同名但由 `composerId` 字段区分 |
| Codex (OpenAI) | `type: "session_meta"` / `"response_item"` / `"event_msg"` | Codex 的 `session_meta` 无 `composerId`，由 `payload.id` 区分 |
| OpenClaw | `type: "session"` + `version` + `timestamp` 字段 | DeepSeek Harness 的 header 也用 `type:"session"` + `version`，但没有 `timestamp`（用 `createdAt`），据此区分 |
| DeepSeek Harness | `type: "session"` + `version` + `delegationDepth` 字段 | `delegationDepth` 是 dsh header 的必填字段，OpenClaw 没有 |

---

## 6. 扩展新 Agent

新增一个 Agent 只需以下步骤：

### 6.1 实现 ChatProvider trait

```rust
// src-tauri/src/providers/my_agent.rs

impl ChatProvider for MyAgentProvider {
    // === 必须实现 ===
    fn name(&self) -> &'static str { "my_agent" }
    fn display_name(&self) -> &'static str { "My Agent" }

    // 默认存储路径
    fn default_base_dir(&self) -> PathBuf {
        home_dir().join(".my_agent").join("sessions")
    }

    // 路径检测
    fn detect_format(&self, path: &Path) -> bool {
        path.starts_with(home_dir().join(".my_agent"))
    }

    // ★ 内容检测：定义 MyAgent 文件的指纹
    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                return v["type"].as_str() == Some("conversation")
                    && v["model"].as_str().is_some();
            }
        }
        false
    }

    // 解析逻辑
    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        // Agent 特有的 JSONL 解析逻辑
    }

    // 元数据文件路径（没有则返回 None）
    fn metadata_path(&self) -> Option<PathBuf> {
        Some(home_dir().join(".my_agent").join("history.jsonl"))
    }

    // === 推荐覆盖（有合理默认实现） ===
    // 文件枚举（默认平铺扫描，嵌套结构需要覆盖）
    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> { /* ... */ }

    // 标题清洗：剥离元数据标签，提取用户实际输入
    fn clean_display_text(&self, text: &str) -> String { /* ... */ }

    // 客户端检测：从首条消息识别来源（cli / vscode / ui / desktop / subagent）
    fn detect_client_from_text(&self, text: &str) -> &'static str { /* ... */ }

    // CWD 提取：从 JSON 行中获取工作目录
    fn extract_cwd(&self, value: &serde_json::Value) -> Option<String> { /* ... */ }
}
```

> **设计要点**：`clean_display_text`、`detect_client_from_text`、`extract_cwd` 是 trait 方法而非自由函数。旧架构在 `parser.rs` 中通过 `match provider_name` 字符串分发，新增 agent 需修改核心 parser 代码。重构后各 Provider 自行实现，真正做到了对现有代码零侵入。

### 6.2 注册到 ProviderRegistry

```rust
// src-tauri/src/providers/mod.rs — ProviderRegistry::new()
registry.register(Arc::new(cursor::CursorProvider::new()));
```

### 6.3 不需要改的

- 扫描/发现逻辑（`browser.rs`）
- 标题清洗和客户端检测（`parser.rs` — 已通过 trait 方法多态分发）
- 前端 UI 组件
- 设置面板（自动识别新 provider）

整个过程对现有代码零侵入。

---

### Cursor 特殊架构

Cursor 是唯一一个**非文件型** Provider：

- **数据源**：SQLite 数据库（`state.vscdb`），不是 JSONL 文件
- **桥接方式**：首次扫描时从 SQLite 读取 composer/bubble 数据，生成 JSONL 缓存文件到 `~/.agent-chat-viewer/cursor_sessions/`
- **缓存策略**：通过 `CACHE_VERSION` 和数据库 mtime 比较决定是否刷新；SQLite 被 Cursor IDE 锁定时降级使用已有缓存
- **分组方式**：使用 `use_cwd_grouping()`（与 Codex 相同），按工作目录分组展示会话
- **路径检测**：检测路径是否在缓存目录下
- **内容检测**：首行 `type: "session_meta"` + `composerId` 字段存在

> Cursor 证明：`ChatProvider` trait 不仅支持文件型 Agent，也支持 DB 型 Agent。只需桥接到 JSONL 缓存即可复用全部解析/渲染管线。

---

### DeepSeek Harness 特殊架构

DeepSeek Harness（`dsh`）是文件型 Provider，但和其余 provider 有两点显著差异：

- **默认存储是 Zstandard 压缩**：正文在 `~/.dsh/sessions/--<cwd>--/<session-id>/session.v4.jsonl.zstd`，是多个独立 zstd frame 拼接而成（须按 magic `28 B5 2F FD` 切帧分别解压）。`ruzstd::StreamingDecoder` 只解单帧，故 `utils::path::read_session_text` 做了透明切帧解压，`parser.rs`/`browser.rs` 里所有 `read_to_string` 都已换成它。
- **两套存储目录**：`~/.dsh/storages/session_projcache/session-*.json` 只是项目级缓存（标题 + turn 大纲 + token 统计），不是正文，**不解析**；真正的会话在 `~/.dsh/sessions/` 下。

**JSONL 结构**（解压后）：首行是不可变 header `{"type":"session","version":4,"id","createdAt","cwd","delegationDepth",...}`，其后是 `{"type","seq","time","data"}` 事件行：

| dsh 事件 | 映射 |
|----------|------|
| `user/message` | `data.source.kind == "user"` → User（真实输入）；其他 kind（`runtime-context` / `skill-catalog` / `model-selection` / `user-approval` / `agent-instructions`）是系统注入 → System（默认隐藏） |
| `assistant/message` | Assistant，`data.message.content` 里 `reasoning`→Thinking、`text`→Text、`tool-call`→ToolUse（`arguments` 是原始 JSON 字符串，解析回对象） |
| `tool/result` | ToolResult（`data.message.{toolCallId, content, isError}`） |
| `system/message` | System |
| `turn/*`、`step/*`、`request/*`、`session/title`、独立 `tool/call` 等 | 跳过（`ParseError::Skipped`，不刷警告；`tool/call` 已内嵌在 `assistant/message` 里） |

该版本的 dsh **没有** packed chunk 行（`text-chunks` 等），最终文本/思考/工具调用已完整落在 `assistant/message.message.content`，因此解析无需做 chunk 展开。

**分组方式**：使用 `use_cwd_grouping()`，从 header 读权威 `cwd` 分组（`--<cwd>--` 目录名是有损/截断的，只作路径定位）。`enumerate_session_files` 递归两到三层找 `session*.jsonl(.zstd)`，`extract_session_id` 取父目录名（文件名固定是 `session.*`，不能取 file stem）。

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

- **内容检测失败** → 回退为 `claude_code` 尝试解析
- **解析失败的行** → `eprintln!` 警告后跳过该行，不中断整体解析
- **空文件 / 全无效行** → 生成摘要但标记为 `"(Empty session)"`
- **所有 User 事件均为元数据** → 最终兜底使用第一条原文（而非在每个 User 事件后过早回退）
- **非 `.jsonl` 文件** → 在扫描阶段即被过滤（`is_session_file` 检查扩展名）

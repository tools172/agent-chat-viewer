# 测试指南

## 概述

本项目包含前端（TypeScript）和后端（Rust）两套测试体系。

| 层级 | 框架 | 测试文件 | 测试数 |
|---|---|---|---|
| 前端单元测试 | Vitest + @testing-library/react | 17 | 146 |
| 前端集成测试 | Vitest | 3 | 27 |
| Rust 单元测试 | cargo test | 11 | 48 |
| Rust 集成测试 | cargo test | 1 | 28 |

## 快速命令

```bash
# 前端测试
pnpm test                    # 运行全部
pnpm test:watch              # 监听模式
pnpm test:coverage           # 覆盖率报告

# TypeScript 类型检查
pnpm lint                    # tsc --noEmit

# Rust 测试
cd src-tauri && cargo test   # 全部（含单元+集成）
cargo test --lib             # 仅单元测试
cargo test --test integration_test  # 仅集成测试
```

## 前端测试结构

```
src/__tests__/
├── components/                  # 组件测试（8 个文件）
│   ├── FilterBar.test.tsx       # 过滤栏按钮渲染与交互
│   ├── SettingsPanel.test.tsx   # 设置面板功能
│   ├── TurnNavigator.test.tsx   # 轮次导航、滚动定位
│   ├── EventCard.test.tsx       # 事件卡片、高亮渲染
│   ├── SessionItem.test.tsx     # 会话列表项
│   ├── ProjectList.test.tsx     # 工作目录列表与排序
│   ├── MarkdownRenderer.test.tsx # Markdown 渲染
│   └── EmptyState.test.tsx      # 空状态组件
│
├── utils/                       # 工具函数测试（8 个文件）
│   ├── filterEvents.test.ts     # 前端内容块过滤
│   ├── collapseConsecutiveEvents.test.ts  # 合并连发（16 个用例）
│   ├── filterAndCollapse.integration.test.ts  # 过滤+折叠集成（10 个用例）
│   ├── searchEvents.test.ts     # 事件搜索
│   ├── searchEvents.integration.test.ts  # 搜索集成测试
│   ├── highlight.test.ts        # 文本高亮
│   ├── highlight.integration.test.ts  # 高亮集成测试
│   └── sort.test.ts             # 多级排序
│
└── stores/                      # 状态管理测试（3 个文件）
    ├── settingsStore.test.ts    # 设置存储
    ├── sessionStore.test.ts     # 会话存储
    └── sessionListStore.test.ts # 会话列表存储
```

### 测试类型说明

**单元测试** — 测试单个函数/组件：
- 使用 `vitest` 的 `describe` / `it` / `expect`
- 组件测试使用 `@testing-library/react` 的 `render` / `screen` / `fireEvent`
- 不依赖 Tauri 后端（使用 `vi.mock` 模拟）

**集成测试** — 测试多个模块的协作：
- 文件名含 `.integration.test.`
- 测试完整的流水线（如 filter → collapse）
- 使用真实数据结构的 mock 数据

**组件测试** — 测试 React 组件的渲染和交互：
- 验证按钮渲染、样式状态、点击回调
- 不测试视觉效果（颜色、像素级布局）

### 编写新测试

```typescript
// 工具函数测试示例
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../utils/myModule';

describe('myFunction', () => {
  it('正常情况', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it('边界情况：空输入', () => {
    const result = myFunction([]);
    expect(result).toEqual([]);
  });
});
```

```tsx
// 组件测试示例
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

describe('MyComponent', () => {
  it('渲染后点击触发回调', () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    fireEvent.click(screen.getByText('按钮'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

## Rust 测试结构

```
src-tauri/
├── src/
│   ├── services/
│   │   ├── filter.rs            # FilterConfig 测试（8 个单元测试）
│   │   ├── settings.rs          # 设置加载/保存测试
│   │   ├── parser.rs            # 会话解析测试
│   │   └── exporter.rs          # 导出测试
│   ├── providers/
│   │   ├── claude_code.rs       # Claude Code 解析 + 内容检测测试
│   │   └── openclaw.rs          # OpenClaw 解析 + 内容检测测试
│   ├── commands/
│   │   └── browser.rs           # 递归扫描 + 内容检测测试（8 个）
│   └── utils/
│       └── path.rs              # 路径工具测试
│
└── tests/
    └── integration_test.rs      # 综合集成测试（28 个）
        └── fixtures/            # 测试数据（JSONL 文件）
            ├── claude_code/
            │   ├── minimal.jsonl
            │   ├── with_tools.jsonl
            │   ├── malformed.jsonl
            │   └── filter_test.jsonl
            └── openclaw/
                ├── minimal.jsonl
                └── with_tools.jsonl
```

### Rust 测试类型

**单元测试** — 写在源文件内的 `#[cfg(test)] mod tests`：
- 测试单个函数或模块的行为
- 例如：`test_filter_hides_thinking_by_default`

**集成测试** — 写在 `tests/` 目录下：
- 使用真实的 JSONL 测试数据
- 测试完整的解析 → 过滤 → 导出流程
- 包含向后兼容性测试（旧版配置反序列化）

### 编写新 Rust 测试

```rust
// 单元测试（写在源文件底部）
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function(input);
        assert_eq!(result, expected);
    }
}
```

## 测试覆盖策略

| 场景 | 要求 |
|---|---|
| 新功能 | 必须有单元测试 + 可选集成测试 |
| Bug 修复 | 先写复现测试，再修复 |
| 数据模型变更 | 必须有向后兼容测试（反序列化旧格式） |
| UI 按钮 | 渲染 + 状态样式 + 点击回调 |
| 边界条件 | 空输入、单条、大量数据、非法输入 |

## CI 集成

参见 [CI/CD 文档](ci-cd.md)，在 push 时自动运行：

```yaml
# 前端
pnpm lint && pnpm test

# Rust
cd src-tauri && cargo test
```

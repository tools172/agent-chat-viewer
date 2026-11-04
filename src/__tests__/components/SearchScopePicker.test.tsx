import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchScopePicker } from "../../components/search/SearchScopePicker";
import type { Project, SearchScope } from "../../types";

const projects: Project[] = [
  {
    name: "project-a",
    path: "/data/project-a",
    sessionCount: 3,
    lastActivity: "2026-06-10T00:00:00Z",
    providerName: "claude_code",
  },
  {
    name: "project-b",
    path: "/data/project-b",
    sessionCount: 1,
    lastActivity: "2026-06-09T00:00:00Z",
    providerName: "codex",
  },
];

const anchorRect = { left: 20, top: 20, bottom: 50 };

describe("SearchScopePicker", () => {
  const onClose = vi.fn();
  const onModeChange = vi.fn();
  const onToggleScope = vi.fn();
  const onSetScopes = vi.fn();

  const renderPicker = (params?: {
    mode?: "all" | "selected";
    scopes?: SearchScope[];
  }) =>
    render(
      <SearchScopePicker
        anchorRect={anchorRect}
        mode={params?.mode ?? "all"}
        scopes={params?.scopes ?? []}
        projects={projects}
        onClose={onClose}
        onModeChange={onModeChange}
        onToggleScope={onToggleScope}
        onSetScopes={onSetScopes}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染所有工作目录及 provider 标签", () => {
    renderPicker();

    expect(screen.getByText("project-a")).toBeInTheDocument();
    expect(screen.getByText("project-b")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("指定模式下已选项目显示为勾选", () => {
    renderPicker({
      mode: "selected",
      scopes: [{ projectPath: "/data/project-a", providerName: "claude_code" }],
    });

    const checkboxA = screen.getByRole("checkbox", { name: /project-a/ });
    const checkboxB = screen.getByRole("checkbox", { name: /project-b/ });
    expect(checkboxA).toBeChecked();
    expect(checkboxB).not.toBeChecked();
  });

  it("勾选项目时回调对应 scope", () => {
    renderPicker({ mode: "selected" });

    fireEvent.click(screen.getByRole("checkbox", { name: /project-a/ }));

    expect(onToggleScope).toHaveBeenCalledWith({
      projectPath: "/data/project-a",
      providerName: "claude_code",
    });
  });

  it("全选把当前筛选出的项目加入范围", () => {
    renderPicker({
      mode: "selected",
      scopes: [{ projectPath: "/data/project-a", providerName: "claude_code" }],
    });

    fireEvent.click(screen.getByText("全选"));

    expect(onSetScopes).toHaveBeenCalledWith([
      { projectPath: "/data/project-a", providerName: "claude_code" },
      { projectPath: "/data/project-b", providerName: "codex" },
    ]);
  });

  it("清空把范围置为空数组", () => {
    renderPicker({
      mode: "selected",
      scopes: [{ projectPath: "/data/project-a", providerName: "claude_code" }],
    });

    fireEvent.click(screen.getByText("清空"));

    expect(onSetScopes).toHaveBeenCalledWith([]);
  });

  it("筛选框按名称过滤列表", () => {
    renderPicker();

    fireEvent.change(screen.getByPlaceholderText("筛选工作目录..."), {
      target: { value: "project-b" },
    });

    expect(screen.queryByText("project-a")).not.toBeInTheDocument();
    expect(screen.getByText("project-b")).toBeInTheDocument();
  });

  it("已不存在的范围项显示为不可用并可移除", () => {
    const stale: SearchScope = {
      projectPath: "/data/removed",
      providerName: "claude_code",
    };
    renderPicker({ mode: "selected", scopes: [stale] });

    expect(screen.getAllByText("不可用").length).toBeGreaterThan(0);
    const pathText = screen.getByText("/data/removed");
    expect(pathText).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("从搜索范围中移除"));
    expect(onToggleScope).toHaveBeenCalledWith(stale);
  });

  it("点击全部工作目录触发模式切换", () => {
    renderPicker({ mode: "selected" });

    fireEvent.click(screen.getByLabelText("全部工作目录"));
    expect(onModeChange).toHaveBeenCalledWith("all");
  });

  it("点击外部关闭浮层", () => {
    renderPicker();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

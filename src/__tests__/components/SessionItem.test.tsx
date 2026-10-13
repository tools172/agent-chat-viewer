import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionItem } from "../../components/sessions/SessionItem";

// Mock settingsStore 提供默认配色
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      settings: {
        searchColors: { search: "#fef08a", find: "#fed7aa" },
        watchDirectories: [],
        defaultFilter: {},
        providerEnabled: {},
      },
    };
    return selector ? selector(state) : state;
  }),
}));

// Mock tauri utils
const mockedOpenContainingFolder = vi.fn();
const mockedOpenProjectFolder = vi.fn();

vi.mock("../../utils/tauri", () => ({
  openContainingFolder: (...args: unknown[]) =>
    mockedOpenContainingFolder(...args),
  openProjectFolder: (...args: unknown[]) => mockedOpenProjectFolder(...args),
}));

// Mock toastStore
const mockShowToast = vi.fn();
vi.mock("../../stores/toastStore", () => ({
  useToastStore: {
    getState: () => ({ showToast: mockShowToast }),
  },
}));

describe("SessionItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    id: "test-session",
    projectName: "test-project",
    projectPath: "/test/project",
    display: "Hello, this is a test message",
    timestamp: "2026-06-09T10:00:00Z",
    messageCount: 15,
    fileSize: 1024,
    cwd: "/test",
    filePath: "/test/session.jsonl",
    providerName: "claude_code",
    fileMtime: "2026-06-09T10:00:00Z",
    clientType: "cli",
    storagePath: "/test/project",
  };

  it("渲染会话标题", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByText("Hello, this is a test message"),
    ).toBeInTheDocument();
  });

  it("渲染消息数量", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/15 条消息/)).toBeInTheDocument();
  });

  it("showProject=true 时显示工作目录名", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        showProject={true}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/test-project/)).toBeInTheDocument();
  });

  it("显示 Agent 标签", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        showProvider={true}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("高亮搜索词", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        highlight="test"
        onClick={() => {}}
      />,
    );
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });

  // ============================================================
  // 显示密度 — density prop
  // ============================================================

  it("density 未传时默认使用紧凑样式", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("pl-1.5");
    expect(btn.className).toContain("py-1");
  });

  it("density=loose 时使用宽松样式", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        density="loose"
        onClick={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-3");
    expect(btn.className).toContain("py-2.5");
    expect(btn.className).not.toContain("pl-1.5");
  });

  // ============================================================
  // 右键菜单 — 打开工作目录 (cwd 优先)
  // ============================================================

  it("右键菜单：打开工作目录 使用 cwd", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    const menuItem = screen.getByText("打开工作目录");
    fireEvent.click(menuItem);

    // cwd 存在时优先使用
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith("/test");
  });

  it("右键菜单：打开工作目录 在 cwd 为空时回退到 projectPath", () => {
    const sessionNoCwd = { ...mockSession, cwd: "" };

    render(
      <SessionItem
        session={sessionNoCwd}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    const menuItem = screen.getByText("打开工作目录");
    fireEvent.click(menuItem);

    // 回退到 projectPath
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith("/test/project");
  });

  it("右键菜单：打开工作目录 目录不存在时提示完整路径且不打开其他目录", async () => {
    mockedOpenProjectFolder.mockRejectedValue("文件夹不存在: /test");

    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    fireEvent.click(screen.getByText("打开工作目录"));

    // 只尝试打开 cwd，失败后提示完整路径，不再尝试其他目录
    await vi.waitFor(() => {
      expect(mockedOpenProjectFolder).toHaveBeenCalledTimes(1);
      expect(mockedOpenProjectFolder).toHaveBeenCalledWith("/test");
      expect(mockShowToast).toHaveBeenCalledWith(
        "打开工作目录失败：文件夹不存在: /test",
        { variant: "error", copyable: true },
      );
    });
  });

  it("右键菜单：打开工作目录 成功时无提示", async () => {
    mockedOpenProjectFolder.mockResolvedValue(undefined);

    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    fireEvent.click(screen.getByText("打开工作目录"));

    await vi.waitFor(() => {
      expect(mockedOpenProjectFolder).toHaveBeenCalledWith("/test");
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("右键菜单：打开存储目录 打开包含文件的文件夹", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    const menuItem = screen.getByText("打开存储目录");
    fireEvent.click(menuItem);

    expect(mockedOpenContainingFolder).toHaveBeenCalledWith(
      "/test/session.jsonl",
    );
  });

  it("右键菜单：包含所有菜单项", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));

    expect(screen.getByText("打开存储目录")).toBeInTheDocument();
    expect(screen.getByText("打开工作目录")).toBeInTheDocument();
    expect(screen.getByText("复制文件路径")).toBeInTheDocument();
    expect(screen.getByText("复制会话 ID")).toBeInTheDocument();
  });

  it("右键菜单：点击外部关闭菜单", () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button"));
    expect(screen.getByText("打开工作目录")).toBeInTheDocument();

    // 点击外部 → 菜单关闭
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("打开工作目录")).not.toBeInTheDocument();
  });
});

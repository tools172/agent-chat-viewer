import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPanel } from "../../components/settings/SettingsPanel";

const mockStore = {
  settings: {
    watchDirectories: [{ path: "/test/dir", enabled: true }],
    defaultFilter: {
      showThinking: false,
      showToolCalls: true,
      showToolResults: true,
      hideEmptyToolResults: true,
      showSystemMessages: false,
      showFileSnapshots: false,
    },
    providerEnabled: { claude_code: true, openclaw: false },
    searchColors: { search: "#fef08a", find: "#fed7aa" },
    settingsPanelOffset: 1, // 比例 1 = 停靠右侧
    settingsPanelOpacity: 0.8, // 默认 20% 透明
    settingsPanelGlass: true, // 毛玻璃默认勾选
  },
  updateFilter: vi.fn(),
  updateSearchColors: vi.fn(),
  resetSearchColors: vi.fn(),
  resetFilter: vi.fn(),
  addWatchDirectory: vi.fn(),
  removeWatchDirectory: vi.fn(),
  toggleProvider: vi.fn(),
  setSetting: vi.fn(),
  updateSettingsPanelOffset: vi.fn(),
  updateSettingsPanelOpacity: vi.fn(),
  updateSettingsPanelGlass: vi.fn(),
  save: vi.fn(),
};

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: vi.fn(() => mockStore),
}));

const updateMockStore = {
  latest: null as { version: string } | null,
  isChecking: false,
  phase: "idle" as "idle" | "downloading" | "ready",
  didCheck: false,
  error: null as string | null,
  check: vi.fn(),
  startDownload: vi.fn(),
  dismissCurrent: vi.fn(),
};

vi.mock("../../stores/updateStore", () => ({
  useUpdateStore: vi.fn(() => updateMockStore),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.2.1"),
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMockStore.latest = null;
    updateMockStore.error = null;
    updateMockStore.isChecking = false;
    updateMockStore.phase = "idle";
  });

  it("渲染设置面板标题和所有设置区域", () => {
    render(<SettingsPanel onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /设置/ })).toBeInTheDocument();
    expect(screen.getByText(/监控目录/)).toBeInTheDocument();
    expect(screen.getByText(/搜索高亮配色/)).toBeInTheDocument();
    expect(screen.getByText(/默认过滤器/)).toBeInTheDocument();
    expect(screen.getByText(/Agent 支持/)).toBeInTheDocument();
  });

  it("渲染操作按钮", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText("恢复默认配色")).toBeInTheDocument();
    expect(screen.getByText("刷新应用")).toBeInTheDocument();
  });

  it("点击关闭按钮触发 onClose", () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("显示添加文件夹按钮", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText("添加")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("粘贴路径或点击浏览..."),
    ).toBeInTheDocument();
  });

  it("显示已添加的监控目录", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByTitle("/test/dir")).toBeInTheDocument();
  });

  it("恢复默认配色", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("恢复默认配色"));
    expect(mockStore.resetSearchColors).toHaveBeenCalledTimes(1);
  });

  it("刷新应用", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("刷新应用"));
    expect(mockStore.save).toHaveBeenCalledTimes(1);
  });

  it("渲染会话列表样式设置项", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText("会话列表样式")).toBeInTheDocument();
    expect(screen.getByText("紧凑")).toBeInTheDocument();
    expect(screen.getByText("宽松")).toBeInTheDocument();
  });

  it("点击紧凑/宽松切换会话列表样式", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("紧凑"));
    expect(mockStore.setSetting).toHaveBeenCalledWith({
      sessionListStyle: "compact",
    });
    fireEvent.click(screen.getByText("宽松"));
    expect(mockStore.setSetting).toHaveBeenCalledWith({
      sessionListStyle: "loose",
    });
  });

  it("渲染标题栏透明度滑块（带当前值与 aria-label）", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "面板透明度" });
    expect(slider).toBeInTheDocument();
    // 默认 0.8 不透明度 → 20% 透明，当前值文本可见
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("调整面板透明度滑块调用 store（50% 透明度 → 不透明度 0.5）", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "面板透明度" });
    fireEvent.change(slider, { target: { value: "50" } });
    expect(mockStore.updateSettingsPanelOpacity).toHaveBeenCalledWith(0.5);
  });

  it("透明度上限 95% 对应不透明度下限 0.05（保底不全透明）", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "面板透明度" });
    fireEvent.change(slider, { target: { value: "95" } });
    expect(mockStore.updateSettingsPanelOpacity).toHaveBeenCalledWith(0.05);
  });

  it("渲染毛玻璃开关复选框，默认勾选，取消勾选时调用 store", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: "毛玻璃效果" });
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByText("毛玻璃")).toBeInTheDocument();
    // 默认勾选（毛玻璃开启）
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(mockStore.updateSettingsPanelGlass).toHaveBeenCalledWith(false);
  });

  it("渲染软件更新区块（当前版本 + 检测升级按钮）", async () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText("软件更新")).toBeInTheDocument();
    expect(screen.getByText("检测升级")).toBeInTheDocument();
    expect(await screen.findByText(/v0\.2\.1/)).toBeInTheDocument();
  });

  it("点击「检测升级」触发更新检测", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("检测升级"));
    expect(updateMockStore.check).toHaveBeenCalledTimes(1);
  });

  it("检测到新版本时直接显示下载并安装交互", () => {
    updateMockStore.latest = { version: "0.2.2" };
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText(/发现新版本/)).toBeInTheDocument();
    expect(screen.getByText("下载并安装")).toBeInTheDocument();
    expect(screen.getByText("忽略此版本")).toBeInTheDocument();
  });
});

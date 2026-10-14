import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpdateDialog } from "../../components/update/UpdateDialog";
import type { UpdateInfo } from "../../types";

const mockStore = {
  latest: null as UpdateInfo | null,
  dialogOpen: false,
  startDownload: vi.fn(),
  closeDialog: vi.fn(),
  dismissCurrent: vi.fn(),
};

vi.mock("../../stores/updateStore", () => ({
  useUpdateStore: vi.fn(() => mockStore),
}));

function makeInfo(): UpdateInfo {
  return {
    version: "0.2.2",
    currentVersion: "0.2.1",
    notes: "更新内容",
    assetUrl: "https://example.com/setup.exe",
    assetName: "setup.exe",
  };
}

describe("UpdateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.latest = null;
    mockStore.dialogOpen = false;
  });

  it("latest 为 null 时不渲染", () => {
    render(<UpdateDialog />);
    expect(screen.queryByText("发现新版本")).not.toBeInTheDocument();
  });

  it("dialogOpen 为 false 时不渲染（即使 latest 已设置）", () => {
    mockStore.latest = makeInfo();
    mockStore.dialogOpen = false;
    render(<UpdateDialog />);
    expect(screen.queryByText("发现新版本")).not.toBeInTheDocument();
  });

  it("渲染新版本信息与三个按钮", () => {
    mockStore.latest = makeInfo();
    mockStore.dialogOpen = true;
    render(<UpdateDialog />);
    expect(screen.getByText("发现新版本")).toBeInTheDocument();
    expect(screen.getByText("v0.2.2")).toBeInTheDocument();
    expect(screen.getByText("下载并安装")).toBeInTheDocument();
    expect(screen.getByText("下次再说")).toBeInTheDocument();
    expect(screen.getByText("忽略此版本")).toBeInTheDocument();
  });

  it("点击「下次再说」仅关闭弹窗，不持久化", () => {
    mockStore.latest = makeInfo();
    mockStore.dialogOpen = true;
    render(<UpdateDialog />);
    fireEvent.click(screen.getByText("下次再说"));
    expect(mockStore.closeDialog).toHaveBeenCalled();
    expect(mockStore.dismissCurrent).not.toHaveBeenCalled();
  });

  it("点击「忽略此版本」持久化忽略", () => {
    mockStore.latest = makeInfo();
    mockStore.dialogOpen = true;
    render(<UpdateDialog />);
    fireEvent.click(screen.getByText("忽略此版本"));
    expect(mockStore.dismissCurrent).toHaveBeenCalled();
  });

  it("点击「下载并安装」开始下载", () => {
    mockStore.latest = makeInfo();
    mockStore.dialogOpen = true;
    render(<UpdateDialog />);
    fireEvent.click(screen.getByText("下载并安装"));
    expect(mockStore.startDownload).toHaveBeenCalled();
  });
});

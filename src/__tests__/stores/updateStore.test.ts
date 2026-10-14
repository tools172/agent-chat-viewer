import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUpdateStore } from "../../stores/updateStore";
import type { UpdateInfo } from "../../types";

const mockCheckForUpdate = vi.fn();
const mockDownloadUpdate = vi.fn();
const mockInstallUpdate = vi.fn();
const mockSetSetting = vi.fn();
const mockSave = vi.fn();
const mockShowToast = vi.fn();
let skippedVersion: string | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((msg: unknown) => void) | undefined;
  },
  invoke: vi.fn(),
}));

vi.mock("../../utils/tauri", () => ({
  checkForUpdate: (...a: unknown[]) => mockCheckForUpdate(...a),
  downloadUpdate: (...a: unknown[]) => mockDownloadUpdate(...a),
  installUpdate: (...a: unknown[]) => mockInstallUpdate(...a),
  openExternal: vi.fn(),
}));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { skippedUpdateVersion: skippedVersion },
      setSetting: mockSetSetting,
      save: mockSave,
    }),
  },
}));

vi.mock("../../stores/toastStore", () => ({
  useToastStore: {
    getState: () => ({ showToast: mockShowToast }),
  },
}));

function makeInfo(version = "0.2.2"): UpdateInfo {
  return {
    version,
    currentVersion: "0.2.1",
    notes: "更新内容",
    assetUrl: "https://example.com/setup.exe",
    assetName: "setup.exe",
  };
}

describe("updateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skippedVersion = null;
    mockSave.mockResolvedValue(undefined);
    useUpdateStore.setState({
      latest: null,
      dialogOpen: false,
      didCheck: false,
      isChecking: false,
      phase: "idle",
      progress: { received: 0, total: 0 },
      downloadedPath: null,
      widgetMinimized: false,
      error: null,
    });
  });

  it("check() 无新版本时 latest 为 null、didCheck 为 true", async () => {
    mockCheckForUpdate.mockResolvedValue(null);
    const info = await useUpdateStore.getState().check();
    expect(info).toBeNull();
    expect(useUpdateStore.getState().latest).toBeNull();
    expect(useUpdateStore.getState().didCheck).toBe(true);
  });

  it("check() 检测到新版本时写入 latest", async () => {
    const info = makeInfo();
    mockCheckForUpdate.mockResolvedValue(info);
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState().latest).toEqual(info);
  });

  it("checkAndMaybeShow() 未被忽略时打开弹窗", async () => {
    mockCheckForUpdate.mockResolvedValue(makeInfo());
    await useUpdateStore.getState().checkAndMaybeShow();
    expect(useUpdateStore.getState().dialogOpen).toBe(true);
  });

  it("checkAndMaybeShow() 已忽略该版本时不弹窗", async () => {
    skippedVersion = "0.2.2";
    mockCheckForUpdate.mockResolvedValue(makeInfo("0.2.2"));
    await useUpdateStore.getState().checkAndMaybeShow();
    expect(useUpdateStore.getState().dialogOpen).toBe(false);
  });

  it("dismissCurrent() 写入 skippedUpdateVersion 并保存", async () => {
    useUpdateStore.setState({ latest: makeInfo("0.2.2"), dialogOpen: true });
    await useUpdateStore.getState().dismissCurrent();
    expect(mockSetSetting).toHaveBeenCalledWith({
      skippedUpdateVersion: "0.2.2",
    });
    expect(mockSave).toHaveBeenCalled();
    expect(useUpdateStore.getState().latest).toBeNull();
    expect(useUpdateStore.getState().dialogOpen).toBe(false);
  });

  it("startDownload() 下载成功后进入 ready 阶段", async () => {
    useUpdateStore.setState({ latest: makeInfo() });
    mockDownloadUpdate.mockResolvedValue("/tmp/setup.exe");
    await useUpdateStore.getState().startDownload();
    expect(useUpdateStore.getState().phase).toBe("ready");
    expect(useUpdateStore.getState().downloadedPath).toBe("/tmp/setup.exe");
  });

  it("startDownload() 下载失败后回到 idle 并提示", async () => {
    useUpdateStore.setState({ latest: makeInfo() });
    mockDownloadUpdate.mockRejectedValue("network error");
    await useUpdateStore.getState().startDownload();
    expect(useUpdateStore.getState().phase).toBe("idle");
    expect(mockShowToast).toHaveBeenCalled();
  });

  it("installAndExit() 无下载路径时直接返回", async () => {
    await useUpdateStore.getState().installAndExit();
    expect(mockInstallUpdate).not.toHaveBeenCalled();
  });

  it("installAndExit() 有下载路径时调用安装", async () => {
    useUpdateStore.setState({ downloadedPath: "/tmp/setup.exe" });
    mockInstallUpdate.mockResolvedValue(undefined);
    await useUpdateStore.getState().installAndExit();
    expect(mockInstallUpdate).toHaveBeenCalledWith("/tmp/setup.exe");
  });
});

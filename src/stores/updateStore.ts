import { create } from "zustand";
import { Channel } from "@tauri-apps/api/core";
import type { UpdateInfo, DownloadProgress } from "../types";
import * as tauri from "../utils/tauri";
import { useSettingsStore } from "./settingsStore";
import { useToastStore } from "./toastStore";

type UpdatePhase = "idle" | "downloading" | "ready";

interface UpdateState {
  /** 检测到的新版本信息（null = 无更新） */
  latest: UpdateInfo | null;
  /** 启动弹窗是否打开 */
  dialogOpen: boolean;
  /** 是否已执行过一次检测（用于设置页区分「已是最新」与「未检测」） */
  didCheck: boolean;
  isChecking: boolean;
  /** 下载/升级阶段：idle | downloading | ready */
  phase: UpdatePhase;
  progress: DownloadProgress;
  /** 下载完成的安装包路径 */
  downloadedPath: string | null;
  /** 右下角下载组件是否折叠 */
  widgetMinimized: boolean;
  error: string | null;

  check: () => Promise<UpdateInfo | null>;
  /** 启动时：检测 + 若未被忽略则弹窗 */
  checkAndMaybeShow: () => Promise<void>;
  closeDialog: () => void;
  /** 开始下载（关闭弹窗，弹出右下角进度组件） */
  startDownload: () => Promise<void>;
  /** 启动安装器并退出应用 */
  installAndExit: () => Promise<void>;
  minimizeWidget: () => void;
  expandWidget: () => void;
  /** 忽略当前版本：写入 skippedUpdateVersion 并持久化 */
  dismissCurrent: () => Promise<void>;
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  latest: null,
  dialogOpen: false,
  didCheck: false,
  isChecking: false,
  phase: "idle",
  progress: { received: 0, total: 0 },
  downloadedPath: null,
  widgetMinimized: false,
  error: null,

  check: async () => {
    set({ isChecking: true, error: null });
    try {
      const info = await tauri.checkForUpdate();
      set({ latest: info, isChecking: false, didCheck: true });
      return info;
    } catch (err) {
      set({ isChecking: false, didCheck: true, error: String(err) });
      return null;
    }
  },

  checkAndMaybeShow: async () => {
    const info = await get().check();
    if (!info) return;
    const skipped = useSettingsStore.getState().settings.skippedUpdateVersion;
    if (info.version !== skipped) {
      set({ dialogOpen: true });
    }
  },

  closeDialog: () => set({ dialogOpen: false }),

  startDownload: async () => {
    const { latest, downloadedPath } = get();
    if (!latest) return;
    if (downloadedPath) {
      set({ phase: "ready", dialogOpen: false, widgetMinimized: false });
      return;
    }

    set({
      phase: "downloading",
      progress: { received: 0, total: 0 },
      downloadedPath: null,
      widgetMinimized: false,
      dialogOpen: false,
      error: null,
    });

    const channel = new Channel<DownloadProgress>();
    channel.onmessage = (p) => set({ progress: p });

    try {
      const path = await tauri.downloadUpdate(
        latest.assetUrl,
        latest.assetName,
        channel,
      );
      set({ phase: "ready", downloadedPath: path, widgetMinimized: false });
    } catch (err) {
      set({ phase: "idle", error: String(err) });
      useToastStore.getState().showToast(`下载更新失败：${String(err)}`, {
        variant: "error",
        copyable: true,
      });
    }
  },

  installAndExit: async () => {
    const { downloadedPath } = get();
    if (!downloadedPath) return;
    try {
      await tauri.installUpdate(downloadedPath);
    } catch (err) {
      set({ error: String(err) });
      useToastStore.getState().showToast(`启动安装器失败：${String(err)}`, {
        variant: "error",
        copyable: true,
      });
    }
  },

  minimizeWidget: () => set({ widgetMinimized: true }),
  expandWidget: () => set({ widgetMinimized: false }),

  dismissCurrent: async () => {
    const { latest } = get();
    if (!latest) return;
    const settingsStore = useSettingsStore.getState();
    settingsStore.setSetting({ skippedUpdateVersion: latest.version });
    await settingsStore.save();
    set({ latest: null, dialogOpen: false });
  },

  reset: () =>
    set({
      latest: null,
      dialogOpen: false,
      didCheck: false,
      isChecking: false,
      phase: "idle",
      progress: { received: 0, total: 0 },
      downloadedPath: null,
      widgetMinimized: false,
      error: null,
    }),
}));

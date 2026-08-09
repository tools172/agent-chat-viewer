import * as tauri from './tauri';
import { useToastStore } from '../stores/toastStore';

/**
 * 执行可能失败的“打开文件夹”动作。
 *
 * 无论失败原因（目录不存在、explorer 启动失败等），都通过 Toast 展示
 * 完整错误信息（目录不存在时含完整路径），Toast 可点击复制、悬停暂停、
 * 点击外部立即隐藏。绝不静默失败、也不擅自回退到其他目录。
 *
 * @param label 操作名（作为错误提示前缀），如 '打开工作目录'、'打开存储目录'
 * @param action 实际的打开操作
 */
export async function runOpenFolderAction(
  label: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (err) {
    const msg = typeof err === 'string' ? err : String(err);
    console.error(`${label}失败:`, err);
    useToastStore.getState().showToast(`${label}失败：${msg}`, {
      variant: 'error',
      copyable: true,
    });
  }
}

/** 打开工作目录（primaryDir 为空目录时会失败，并弹出醒目错误提示） */
export function openProjectFolderWithFeedback(
  primaryDir: string,
): Promise<void> {
  return runOpenFolderAction('打开工作目录', () =>
    tauri.openProjectFolder(primaryDir),
  );
}

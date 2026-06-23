import React, { useEffect, useCallback, useRef } from 'react';
import { useSettings } from './hooks/useSettings';
import { useSettingsStore } from './stores/settingsStore';
import { useTabStore } from './stores/tabStore';
import { MainLayout } from './components/layout/MainLayout';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ToastContainer } from './stores/toastStore';
import { MessageSquare, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  const { isLoaded, isLoading, error, load } = useSettings();
  const settings = useSettingsStore((s) => s.settings);

  // 主题初始化：根据设置设置 data-theme 属性
  const applyTheme = useCallback((mode: string) => {
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
  }, []);

  useEffect(() => {
    const theme = settings.theme ?? 'system';
    applyTheme(theme);

    // 如果是跟随系统，监听系统主题变化
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [settings.theme, applyTheme]);

  const hasRestored = useRef(false);

  // 启动时恢复标签页
  useEffect(() => {
    if (isLoaded && !hasRestored.current) {
      hasRestored.current = true;
      const { restoreTabsOnStartup, tabSnapshots } =
        useSettingsStore.getState().settings;
      if (restoreTabsOnStartup && tabSnapshots && tabSnapshots.length > 0) {
        useTabStore.getState().restoreTabs();
      }
    }
  }, [isLoaded]);

  // 启动加载中（设置未就绪）
  if (!isLoaded && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
        <MessageSquare className="h-16 w-16 text-primary-300 animate-pulse" />
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Agent Chat Viewer</h1>
        <LoadingSpinner size="md" message="正在加载设置..." />
      </div>
    );
  }

  // 加载出错
  if (error && !isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
        <MessageSquare className="h-16 w-16 text-red-300" />
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Agent Chat Viewer</h1>
        <p className="text-sm text-red-600">设置加载失败</p>
        <p className="text-xs max-w-md text-center" style={{ color: 'var(--color-text-tertiary)' }}>{error}</p>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          重试
        </button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <LoadingSpinner size="lg" message="正在启动..." />
      </div>
    );
  }

  return (
    <>
      <MainLayout />
      <ToastContainer />
    </>
  );
};

export default App;

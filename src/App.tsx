import React from 'react';
import { useSettings } from './hooks/useSettings';
import { MainLayout } from './components/layout/MainLayout';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { MessageSquare, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  const { isLoaded, isLoading, error, load } = useSettings();

  // 启动加载中（设置未就绪）
  if (!isLoaded && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-4">
        <MessageSquare className="h-16 w-16 text-primary-300 animate-pulse" />
        <h1 className="text-xl font-semibold text-gray-700">Agent Chat Viewer</h1>
        <LoadingSpinner size="md" message="正在加载设置..." />
      </div>
    );
  }

  // 加载出错
  if (error && !isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-4">
        <MessageSquare className="h-16 w-16 text-red-300" />
        <h1 className="text-xl font-semibold text-gray-700">Agent Chat Viewer</h1>
        <p className="text-sm text-red-600">设置加载失败</p>
        <p className="text-xs text-gray-500 max-w-md text-center">{error}</p>
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
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <LoadingSpinner size="lg" message="正在启动..." />
      </div>
    );
  }

  return <MainLayout />;
};

export default App;

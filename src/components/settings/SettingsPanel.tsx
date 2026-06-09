import React, { useState } from 'react';
import {
  X,
  FolderPlus,
  Trash2,
  Brain,
  Wrench,
  FileOutput,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';

interface SettingsPanelProps {
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const store = useSettingsStore();
  const { settings } = store;
  const [newDir, setNewDir] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // 防御：确保 searchColors 存在
  const searchColors = settings.searchColors || { search: '#fef08a', find: '#fed7aa' };

  const handleAddDirectory = () => {
    const trimmed = newDir.trim();
    if (trimmed && !settings.watchDirectories.includes(trimmed)) {
      store.addWatchDirectory(trimmed);
      setNewDir('');
    }
  };

  const handleRemoveDirectory = (path: string) => {
    store.removeWatchDirectory(path);
  };

  const handleSave = async () => {
    await store.save();
    setSaveMessage('设置已保存');
    setTimeout(() => setSaveMessage(''), 2000);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">⚙️ 设置</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Watch directories */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <FolderPlus className="h-4 w-4" />
              监控目录
            </h3>
            <div className="space-y-1.5 mb-2">
              {settings.watchDirectories.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border rounded-lg"
                >
                  <span className="flex-1 text-xs text-gray-600 truncate">
                    {dir}
                  </span>
                  <button
                    onClick={() => handleRemoveDirectory(dir)}
                    className="p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDirectory()}
                placeholder="输入目录路径..."
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleAddDirectory}
                disabled={!newDir.trim()}
                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                添加
              </button>
            </div>
          </section>

          {/* 搜索高亮配色 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              🎨 搜索高亮配色
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">
                  搜索标签高亮
                  <span
                    className="ml-2 inline-block w-4 h-4 rounded border"
                    style={{
                      backgroundColor: searchColors.search,
                    }}
                  />
                </label>
                <input
                  type="color"
                  value={searchColors.search}
                  onChange={(e) =>
                    store.updateSearchColors({ search: e.target.value })
                  }
                  className="w-10 h-7 rounded border cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">
                  会话查找高亮
                  <span
                    className="ml-2 inline-block w-4 h-4 rounded border"
                    style={{
                      backgroundColor: searchColors.find,
                    }}
                  />
                </label>
                <input
                  type="color"
                  value={searchColors.find}
                  onChange={(e) =>
                    store.updateSearchColors({ find: e.target.value })
                  }
                  className="w-10 h-7 rounded border cursor-pointer"
                />
              </div>

              <button
                onClick={store.resetSearchColors}
                className="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                恢复默认配色
              </button>
            </div>
          </section>

          {/* 默认过滤器 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              📋 默认过滤器
            </h3>
            <div className="space-y-2">
              {[
                {
                  key: 'showThinking',
                  label: '显示思考过程',
                  icon: <Brain className="h-3.5 w-3.5" />,
                },
                {
                  key: 'showToolCalls',
                  label: '显示工具调用',
                  icon: <Wrench className="h-3.5 w-3.5" />,
                },
                {
                  key: 'showToolResults',
                  label: '显示工具结果',
                  icon: <FileOutput className="h-3.5 w-3.5" />,
                },
                {
                  key: 'hideEmptyToolResults',
                  label: '隐藏空工具结果',
                },
              ].map(({ key, label, icon }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={
                      settings.defaultFilter[
                        key as keyof typeof settings.defaultFilter
                      ] as boolean
                    }
                    onChange={(e) =>
                      store.updateFilter({ [key]: e.target.checked })
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {icon}
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Provider settings */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              🔌 Agent 支持
            </h3>
            <div className="space-y-2">
              {Object.entries(settings.providerEnabled).map(([name, enabled]) => (
                <label
                  key={name}
                  className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      store.toggleProvider(name, e.target.checked)
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="capitalize">{name.replace('_', ' ')}</span>
                  <span
                    className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                      enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {enabled ? '已启用' : '未启用'}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={store.resetFilter}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置过滤器
            </button>
          </div>
          {saveMessage ? (
            <span className="text-xs text-green-600">{saveMessage}</span>
          ) : (
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1"
            >
              <Save className="h-3.5 w-3.5" />
              保存设置
            </button>
          )}
        </div>
      </div>
    </>
  );
};

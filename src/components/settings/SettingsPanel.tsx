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
  FolderOpen,
  Copy,
  Check,
  Plus,
  PanelLeft,
  ExternalLink,
  Filter,
  Sun,
  Moon,
  Leaf,
  Monitor,
  SwatchBook,
  Highlighter,
  Keyboard,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemeMode } from '../../types';
import * as tauri from '../../utils/tauri';
import { getProviderEnabledColor } from '../../utils/providers';

interface SettingsPanelProps {
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onSettingsSaved }) => {
  const store = useSettingsStore();
  const { settings } = store;
  const [saveMessage, setSaveMessage] = useState('');
  const [newDir, setNewDir] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // 防御：确保 searchColors 存在
  const searchColors = settings.searchColors || { search: '#fef08a', find: '#fed7aa' };

  const handlePickDirectory = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setNewDir(selected);
      }
    } catch (err) {
      console.error('打开文件夹选择器失败:', err);
    }
  };

  const handleAddDirectory = () => {
    const trimmed = newDir.trim();
    if (trimmed && !settings.watchDirectories.some((d) => d.path === trimmed)) {
      store.addWatchDirectory(trimmed);
      setNewDir('');
    }
  };

  const handleRemoveDirectory = (path: string) => {
    store.removeWatchDirectory(path);
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('复制路径失败:', err);
    }
  };

  const handleSave = async () => {
    await store.save();
    setSaveMessage('设置已保存');
    setTimeout(() => setSaveMessage(''), 2000);
    // 通知父组件设置已保存，以便刷新数据
    onSettingsSaved?.();
  };

  const handleOpenSettingsFile = async () => {
    try {
      const path = await tauri.getSettingsPath();
      await tauri.openContainingFolder(path);
    } catch (err) {
      console.error('打开设置文件失败:', err);
    }
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
          {/* Agent 支持 */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-2">
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
                        ? getProviderEnabledColor(name)
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {enabled ? '已启用' : '未启用'}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Watch directories */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <FolderPlus className="h-4 w-4" />
              监控目录
            </h3>
            <div className="space-y-1.5 mb-3">
              {settings.watchDirectories.length === 0 && (
                <p className="text-xs text-gray-400 py-2">
                  暂无自定义监控目录
                </p>
              )}
              {settings.watchDirectories.map((dir) => (
                <div
                  key={dir.path}
                  className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border rounded-lg group"
                  title={dir.path}
                >
                  {/* 启用/禁用开关 */}
                  <button
                    onClick={() => store.toggleWatchDirectory(dir.path)}
                    className={`flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors ${
                      dir.enabled
                        ? 'bg-green-500 border-green-500'
                        : 'bg-gray-300 border-gray-300'
                    }`}
                    title={dir.enabled ? '已启用，点击禁用' : '已禁用，点击启用'}
                  />
                  <span
                    className={`flex-1 text-xs truncate ${
                      dir.enabled ? 'text-gray-600' : 'text-gray-400 line-through'
                    }`}
                  >
                    {dir.path}
                  </span>
                  <button
                    onClick={() => handleCopyPath(dir.path)}
                    className="p-0.5 hover:bg-blue-100 rounded text-gray-400 hover:text-blue-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="复制路径"
                  >
                    {copiedPath === dir.path ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveDirectory(dir.path)}
                    className="p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 flex-shrink-0"
                    title="移除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* 输入行：文本输入 + 浏览按钮 + 添加按钮 */}
            <div className="flex gap-1.5">
              <div className="flex-1 flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary-500 bg-white">
                <input
                  type="text"
                  value={newDir}
                  onChange={(e) => setNewDir(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDirectory()}
                  placeholder="粘贴路径或点击浏览..."
                  className="flex-1 border-none outline-none bg-transparent text-xs min-w-0"
                />
                <button
                  onClick={handlePickDirectory}
                  className="p-0.5 hover:bg-gray-100 rounded flex-shrink-0 text-gray-400 hover:text-gray-600"
                  title="浏览文件夹"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={handleAddDirectory}
                disabled={!newDir.trim()}
                className="px-2.5 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-1 flex-shrink-0"
                title="添加文件夹"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
          </section>

          {/* 搜索高亮配色 */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Highlighter className="h-4 w-4" />
              搜索高亮配色
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
            <h3 className="text-base font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Filter className="h-4 w-4" />
              默认过滤器
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
                {
                  key: 'collapseConsecutive',
                  label: '合并连发',
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

          {/* 布局设置 */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <PanelLeft className="h-4 w-4" />
              布局
            </h3>
            <div className="space-y-4">
              {([
                {
                  label: '左侧边栏（会话记录导航）',
                  min: 200,
                  max: 600,
                  value: settings.sidebarWidth ?? 320,
                  onChange: (v: number) => store.updateSidebarWidth(v),
                },
                {
                  label: '右侧边栏（轮次导航）',
                  min: 160,
                  max: 400,
                  value: settings.navigatorWidth ?? 256,
                  onChange: (v: number) => store.updateNavigatorWidth(v),
                },
              ]).map(({ label, min, max, value, onChange }) => {
                const pct = ((value - min) / (max - min)) * 100;
                return (
                  <div
                    key={label}
                    className="grid items-end"
                    style={{ gridTemplateColumns: '176px 1fr' }}
                  >
                    <label className="text-sm text-gray-600 pb-0.5">
                      {label}
                    </label>
                    <div className="flex flex-col">
                      <div className="relative h-4">
                        <span className="absolute left-0 text-[10px] text-gray-400 tabular-nums leading-none">
                          {min}
                        </span>
                        <span
                          className="absolute text-[10px] text-gray-500 tabular-nums leading-none"
                          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                        >
                          {value}
                        </span>
                        <span className="absolute right-0 text-[10px] text-gray-400 tabular-nums leading-none">
                          {max}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={10}
                        value={value}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-full h-1.5 accent-primary-600 cursor-pointer m-0 p-0"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 自动保存拖拽宽度 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  记住面板宽度
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  拖拽侧边栏和轮次导航后自动保存宽度
                </p>
              </div>
              <button
                onClick={() =>
                  store.updateAutoSavePanelWidths(
                    !(settings.autoSavePanelWidths ?? true)
                  )
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  (settings.autoSavePanelWidths ?? true)
                    ? 'bg-primary-600'
                    : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                    (settings.autoSavePanelWidths ?? true)
                      ? 'translate-x-[18px]'
                      : 'translate-x-[3px]'
                  }`}
                  style={{ backgroundColor: '#fff' }}
                />
              </button>
            </div>

            {/* 启动恢复标签页 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  标签页
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  启动时恢复上次打开的标签页
                </p>
              </div>
              <button
                onClick={() =>
                  store.updateRestoreTabsOnStartup(
                    !(settings.restoreTabsOnStartup ?? true)
                  )
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  (settings.restoreTabsOnStartup ?? true)
                    ? 'bg-primary-600'
                    : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                    (settings.restoreTabsOnStartup ?? true)
                      ? 'translate-x-[18px]'
                      : 'translate-x-[3px]'
                  }`}
                  style={{ backgroundColor: '#fff' }}
                />
              </button>
            </div>

            {/* 最大钉住标签数 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  最大钉住标签数
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  可同时钉住的标签页上限
                </p>
              </div>
              <select
                value={settings.maxPinnedTabs ?? 4}
                onChange={(e) =>
                  store.updateMaxPinnedTabs(Number(e.target.value))
                }
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* 批次刷新量 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  批次刷新量
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  每批加载文件数，性能好的电脑可调大
                </p>
              </div>
              <select
                value={settings.polishBatchSize ?? 5}
                onChange={(e) =>
                  store.updatePolishBatchSize(Number(e.target.value))
                }
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {[5, 10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>{n} 个/批</option>
                ))}
              </select>
            </div>
            {/* 会话标题 */}
            <div className="flex items-center justify-between">
              <div className="mr-4">
                <span className="text-sm font-medium text-gray-700">会话标题</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  控制会话列表标题的显示来源
                </p>
              </div>
              <div className="flex rounded-full bg-gray-100 p-0.5 flex-shrink-0">
                <button
                  onClick={() => store.setSetting({ displayFirstUserMessage: true })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                    (settings.displayFirstUserMessage !== false)
                      ? 'bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow shadow-primary-900/25'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  第一条
                </button>
                <button
                  onClick={() => store.setSetting({ displayFirstUserMessage: false })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                    (settings.displayFirstUserMessage === false)
                      ? 'bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow shadow-primary-900/25'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  最后一条
                </button>
              </div>
            </div>
          </section>

          {/* 快捷键 */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Keyboard className="h-4 w-4" />
              快捷键
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-white border border-gray-300 rounded shadow-sm">
                  Ctrl + F
                </kbd>
                <span>在会话中查找</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-white border border-gray-300 rounded shadow-sm">
                  Ctrl + G
                </kbd>
                <span>窗口全局查找</span>
              </div>
              <p className="text-xs text-gray-400">
                打开会话后，使用以上快捷键快速定位内容
              </p>
            </div>
          </section>

          {/* 主题选择 */}
          <section>
            <h3 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <SwatchBook className="h-4 w-4" />
              主题
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: 'light' as ThemeMode, label: '浅色', icon: Sun, preview: 'bg-white' },
                { value: 'dark' as ThemeMode, label: '深色', icon: Moon, preview: 'bg-gray-800' },
                { value: 'eyecare' as ThemeMode, label: '护眼', icon: Leaf, preview: 'bg-[#c7edcc]' },
                { value: 'system' as ThemeMode, label: '系统', icon: Monitor, preview: 'bg-gradient-to-br from-white to-gray-800' },
              ]).map(({ value, label, icon: Icon, preview }) => {
                const isSelected = (settings.theme ?? 'system') === value;
                return (
                  <button
                    key={value}
                    onClick={() => store.updateTheme(value)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-md border border-gray-300 shadow-sm overflow-hidden ${preview}`}>
                      <Icon className="h-5 w-5 m-1.5 text-gray-500 mix-blend-difference invert" />
                    </div>
                    <span className={`text-xs font-medium ${
                      isSelected ? 'text-primary-700' : 'text-gray-600'
                    }`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="pl-4 pr-[13px] py-4 border-t bg-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={handleOpenSettingsFile}
                className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
                title="在资源管理器中打开 settings.json"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                打开设置存储目录
              </button>
            </div>
            {saveMessage ? (
              <span className="text-xs text-green-600">{saveMessage}</span>
            ) : (
              <button
                onClick={handleSave}
                className="px-4 py-[7px] text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                刷新应用
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 text-right">
            设置保存在 AppData 目录，可手动编辑 JSON 文件
          </p>
        </div>
      </div>
    </>
  );
};

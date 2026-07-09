import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import type { SortConfig, SortLevel, SortField, SortDirection } from '../../types';
import { SORT_FIELDS, getFieldLabel, getDirectionLabel } from '../../utils/sort';

interface SortBarProps {
  config: SortConfig;
  onChange: (config: SortConfig) => void;
}

const MAX_LEVELS = 2;

/** 方向切换按钮 */
const DirBtn: React.FC<{ dir: SortDirection; title: string; onClick: () => void }> = ({ dir, title, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
  >
    {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
  </button>
);

const SortBar: React.FC<SortBarProps> = ({ config, onChange }) => {
  const [openMenu, setOpenMenu] = useState<number | null>(null); // null=关闭, 0/1=第几级的下拉打开
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭下拉
  useEffect(() => {
    if (openMenu === null) return;
    const clickHandler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openMenu]);

  // 修改某一级
  const updateLevel = (idx: number, patch: Partial<SortLevel>) => {
    const next = config.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  };

  // 删除某一级
  const removeLevel = (idx: number) => {
    onChange(config.filter((_, i) => i !== idx));
  };

  // 添加新级别
  const addLevel = (field: SortField) => {
    if (config.length >= MAX_LEVELS) return;
    onChange([...config, { field, direction: 'desc' }]);
    setOpenMenu(null);
  };

  return (
    <div className="px-3 py-0.5 text-xs">
      {/* 标签行 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-gray-500 mr-0.5">排序</span>

        {config.map((level, idx) => (
          <span key={idx} className="inline-flex items-center gap-0.5 bg-white border rounded-md shadow-sm">
            {/* 字段下拉 */}
            <button
              onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
              className="pl-1.5 pr-0.5 py-0.5 hover:bg-gray-100 rounded-l-md text-gray-700 outline-none"
            >
              {getFieldLabel(level.field)}
            </button>
            {/* 方向切换 */}
            <DirBtn
              dir={level.direction}
              title={getDirectionLabel(level.field, level.direction)}
              onClick={() =>
                updateLevel(idx, { direction: level.direction === 'asc' ? 'desc' : 'asc' })
              }
            />
            {/* 删除（二级可删） */}
            {config.length > 1 && (
              <button
                onClick={() => removeLevel(idx)}
                className="pr-0.5 hover:bg-red-100 rounded-r-md text-gray-400 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {/* 添加按钮 */}
        {config.length < MAX_LEVELS && (
          <button
            onClick={() => setOpenMenu(openMenu === -1 ? null : -1)}
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 outline-none"
            title="添加排序条件"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 下拉字段选择菜单 */}
      {openMenu !== null && (
        <div ref={dropdownRef} className="mt-1 py-1 bg-white border rounded-md shadow-lg z-10">
          {SORT_FIELDS.map((field) => {
            const alreadyUsed = config.some((l) => l.field === field);
            const action = openMenu === -1 ? 'addLevel' : 'updateLevel';
            return (
              <button
                key={field}
                onClick={() => {
                  if (action === 'addLevel') addLevel(field);
                  else if (openMenu >= 0) {
                    updateLevel(openMenu, { field });
                    setOpenMenu(null);
                  }
                }}
                className={`w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center justify-between ${
                  alreadyUsed ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                }`}
                disabled={alreadyUsed}
              >
                <span>{getFieldLabel(field)}</span>
                {alreadyUsed && <span className="text-[10px] text-gray-400">已使用</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SortBar;

import React from 'react';

interface LoadingBarProps {
  visible: boolean;
}

/** 顶部细加载条，用于非侵入式的重载提示 */
export const LoadingBar: React.FC<LoadingBarProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="h-0.5 w-full bg-gray-100 overflow-hidden flex-shrink-0">
      <div
        className="h-full w-2/5 rounded-full animate-shimmer-slide"
        style={{
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #6366f1)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
};

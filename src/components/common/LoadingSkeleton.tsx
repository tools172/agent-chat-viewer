import React from 'react';

interface LoadingSkeletonProps {
  /** 骨架屏行数 */
  rows?: number;
  /** 类型：list=列表, card=卡片, text=文本 */
  variant?: 'list' | 'card' | 'text';
}

/** 闪烁脉冲动画的占位块 */
function Pulse({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  rows = 5,
  variant = 'list',
}) => {
  if (variant === 'card') {
    return (
      <div className="p-4 space-y-3">
        <Pulse className="h-6 w-3/4" />
        <Pulse className="h-4 w-1/2" />
        <Pulse className="h-4 w-full" />
        <Pulse className="h-4 w-full" />
        <Pulse className="h-4 w-2/3" />
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Pulse
            key={i}
            className="h-4"
          />
        ))}
      </div>
    );
  }

  // list variant
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
          <Pulse className="h-4 w-4 mt-0.5 flex-shrink-0 rounded" />
          <div className="flex-1 space-y-1.5">
            <Pulse className="h-4 w-3/4" />
            <Pulse className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};

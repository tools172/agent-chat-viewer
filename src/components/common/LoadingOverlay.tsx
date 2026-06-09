import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';

interface LoadingOverlayProps {
  /** 自定义消息，不传则使用默认轮播 */
  message?: string;
}

const DEFAULT_MESSAGES = [
  '正在加载聊天记录...',
  '正在扫描会话文件...',
  '正在解析内容...',
  '即将完成...',
];

/** 小圆点跳动 */
function BouncingDots() {
  return (
    <div className="flex items-center gap-1 mt-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  );
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (message) return; // 有自定义消息时不轮播
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % DEFAULT_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [message]);

  const displayMessage = message || DEFAULT_MESSAGES[msgIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* 小卡片区域 */}
      <div className="pointer-events-auto bg-white/90 rounded-2xl shadow-lg border border-gray-100 px-10 py-8 flex flex-col items-center">
        {/* 图标区 */}
        <div className="relative mb-5">
          <div className="absolute rounded-full bg-primary-200 animate-ping opacity-40"
            style={{ width: 64, height: 64, left: -12, top: -12 }} />
          <div className="relative h-12 w-12 rounded-xl bg-primary-600 flex items-center justify-center animate-pulse-scale shadow-md shadow-primary-200/50">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* 文字 */}
        <p className="text-sm text-gray-600 font-medium mb-5 min-h-[1.25rem] transition-opacity duration-300 whitespace-nowrap">
          {displayMessage}
        </p>

        {/* 进度条 */}
        <div className="w-40 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full w-1/2 rounded-full animate-shimmer-slide"
            style={{
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
            }}
          />
        </div>

        {/* 跳动小圆点 */}
        <BouncingDots />
      </div>
    </div>
  );
};

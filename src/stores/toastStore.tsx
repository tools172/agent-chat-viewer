import { create } from 'zustand';
import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, duration?: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message: string, duration = 2500) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
}));

/** 全局 Toast 容器组件 — 放在应用根节点即可 */
export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} message={toast.message} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ message: string }> = ({ message }) => {
  const [visible, setVisible] = React.useState(false);

  useEffect(() => {
    // 触发入场动画
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`bg-white/95 backdrop-blur border border-gray-200 text-gray-800 text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
      {message}
    </div>
  );
};

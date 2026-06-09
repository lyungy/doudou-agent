/**
 * 全局 Toast 通知组件
 * 支持 4 种类型：success / error / warning / info
 * 自动消失（默认 3s），支持手动关闭
 */
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../../store";

const ICONS: Record<string, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

const COLORS: Record<string, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: { id: string; type: string; message: string; duration: number };
  onRemove: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onRemove, 300); // 等退出动画结束
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onRemove]);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(onRemove, 300);
  }, [onRemove]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 ${
        COLORS[toast.type] || COLORS.info
      } ${exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}`}
      style={{ minWidth: 280, maxWidth: 420 }}
    >
      <span className="text-base shrink-0">{ICONS[toast.type] || ICONS.info}</span>
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        onClick={handleClose}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  );
}

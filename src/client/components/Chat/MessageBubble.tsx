/**
 * 消息气泡组件（大气风格）
 * 支持：复制 + 重新生成 + 时间戳 + 右键/长按菜单 + 用户消息编辑
 */
import { useState, useCallback, useRef, useEffect, memo } from "react";
import type { ChatMessage } from "../../types";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatFullTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** 图片放大模态框 */
function ImageWithModal({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt="图片"
        className="max-w-[240px] max-h-[240px] rounded-xl border border-neutral-200 cursor-pointer hover:opacity-80 transition-opacity object-cover"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setOpen(false)}>
          <img src={src} alt="图片" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setOpen(false)} className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center text-xl transition-colors">×</button>
        </div>
      )}
    </>
  );
}

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming, canRegenerate, onRegenerate, onEdit }: Props) {
  const isUser = message.type === "user";
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [editing]);

  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    try { await navigator.clipboard.writeText(message.content); } catch {
      const ta = document.createElement("textarea");
      ta.value = message.content; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true); setShowMenu(false); setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!message.content) return;
    try { await navigator.clipboard.writeText(message.content); } catch {}
    setShowMenu(false);
  }, [message.content]);

  const handleStartEdit = useCallback(() => {
    setEditValue(message.content); setEditing(true); setShowMenu(false);
  }, [message.content]);

  const handleConfirmEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content && onEdit) onEdit(trimmed);
    setEditing(false);
  }, [editValue, message.content, onEdit]);

  const handleCancelEdit = useCallback(() => { setEditing(false); setEditValue(""); }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleConfirmEdit(); }
    else if (e.key === "Escape") handleCancelEdit();
  }, [handleConfirmEdit, handleCancelEdit]);

  const handleTouchStart = useCallback(() => { longPressTimer.current = setTimeout(() => setShowMenu(true), 500); }, []);
  const handleTouchEnd = useCallback(() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }, []);
  const handleContextMenu = useCallback((e: React.MouseEvent) => { e.preventDefault(); setShowMenu(true); }, []);

  return (
    <div
      className={`group flex gap-4 mb-5 ${isUser ? "justify-end" : "justify-start"}`}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
    >
      {/* AI 头像 */}
      {!isUser && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5 shadow-sm shadow-blue-500/15">
          🐕
        </div>
      )}

      {/* 消息内容 */}
      <div className={`max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col relative`}>
        <div
          className={`w-full px-5 py-4 ${
            isUser
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-sm shadow-blue-500/15"
              : "bg-neutral-50/80 text-neutral-800 rounded-2xl rounded-bl-md"
          }`}
        >
          {/* Thinking */}
          {message.thinking && (
            <ThinkingBlock content={message.thinking} isUser={isUser} isStreaming={isStreaming} />
          )}

          {/* 工具调用 */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-3 space-y-2">
              {message.toolCalls.map((tc) => <ToolCallCard key={tc.id} toolCall={tc} />)}
            </div>
          )}

          {/* 消息正文 */}
          {editing ? (
            <div className="mt-1">
              <textarea
                ref={editRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full resize-none bg-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/50 outline-none border border-white/30 focus:border-white/60"
                rows={Math.min(editValue.split("\n").length + 1, 8)}
              />
              <div className="flex items-center gap-2 mt-2.5">
                <button onClick={handleConfirmEdit} className="px-4 py-1.5 text-xs bg-white/20 hover:bg-white/30 rounded-lg transition-colors">重新发送</button>
                <button onClick={handleCancelEdit} className="px-4 py-1.5 text-xs text-white/60 hover:text-white/80 transition-colors">取消</button>
                <span className="text-[10px] text-white/40 ml-auto">Enter 发送 · Esc 取消</span>
              </div>
            </div>
          ) : message.content ? (
            <div className="break-words text-[15px] leading-7">
              {isUser ? (
                <span className="whitespace-pre-wrap">{message.content}</span>
              ) : (
                <MarkdownRenderer content={message.content} />
              )}
              {isStreaming && (
                <span className="inline-block w-[3px] h-5 bg-gradient-to-b from-blue-400 to-indigo-400 rounded-full ml-0.5 align-text-bottom animate-pulse" />
              )}
            </div>
          ) : null}

          {/* 图片 */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2.5 mt-3">
              {message.images.map((img, idx) => {
                const src = `data:${img.mimeType};base64,${img.data}`;
                return <ImageWithModal key={idx} src={src} />;
              })}
            </div>
          )}

          {/* 空消息加载动画（思考中 → 紫色，响应中 → 蓝色） */}
          {!message.content && !message.thinking && !message.toolCalls && isStreaming && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
            </div>
          )}

          {/* thinking 阶段：紫色光标 + 文字提示 */}
          {isStreaming && message.thinking && !message.content && !isUser && (
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-block w-[3px] h-5 bg-gradient-to-b from-purple-400 to-violet-400 rounded-full animate-pulse" />
              <span className="text-purple-400 text-xs">思考中...</span>
            </div>
          )}
        </div>

        {/* 时间戳 + 操作栏 */}
        {!isStreaming && !editing && (
          <div className={`flex items-center gap-2 mt-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
            <span className="text-[11px] text-neutral-300 select-none" title={formatFullTime(message.timestamp)}>
              {formatTime(message.timestamp)}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <ActionButton icon={copied ? "✓" : "📋"} label={copied ? "已复制" : "复制"} onClick={handleCopy} active={copied} />
              {isUser && onEdit && <ActionButton icon="✏️" label="编辑" onClick={handleStartEdit} />}
              {canRegenerate && onRegenerate && <ActionButton icon="🔄" label="重新生成" onClick={onRegenerate} />}
            </div>
          </div>
        )}

        {/* 上下文菜单 */}
        {showMenu && (
          <div ref={menuRef} className={`absolute z-50 ${isUser ? "right-0" : "left-0"} top-full mt-1.5 bg-white rounded-xl shadow-xl border border-neutral-200/80 py-1.5 min-w-[170px]`}>
            <MenuButton icon="📋" label="复制" onClick={handleCopy} />
            <MenuButton icon="📝" label="复制为 Markdown" onClick={handleCopyMarkdown} />
            {isUser && onEdit && <MenuButton icon="✏️" label="编辑并重新发送" onClick={handleStartEdit} />}
            {canRegenerate && onRegenerate && <MenuButton icon="🔄" label="重新生成" onClick={() => { setShowMenu(false); onRegenerate(); }} />}
          </div>
        )}
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5 shadow-sm shadow-emerald-500/15">
          👤
        </div>
      )}
    </div>
  );
});

function ActionButton({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all ${
        active ? "text-green-600 bg-green-50" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      }`}
      title={label}
    >
      <span className="text-[11px]">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MenuButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

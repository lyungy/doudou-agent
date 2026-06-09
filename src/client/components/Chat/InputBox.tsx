/**
 * 输入框组件（增强版）
 * 支持：多模态图片上传 + 拖拽视觉反馈 + 输入历史 + /命令 + token 预估
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "../../hooks/useChat";
import type { PendingImage } from "../../types";
import { useAppStore } from "../../store";

/** 图片压缩：将大图压缩到指定大小内 */
async function compressImage(file: File, maxSizeKB = 1024): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (file.size <= maxSizeKB * 1024) {
          const base64 = (e.target?.result as string).split(",")[1];
          resolve({ base64, mimeType: file.type });
          return;
        }
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, Math.sqrt((maxSizeKB * 1024) / file.size));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 从文件创建 PendingImage */
async function createPendingImage(file: File): Promise<PendingImage> {
  const { base64, mimeType } = await compressImage(file);
  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    base64,
    mimeType,
  };
}

const MAX_IMAGES = 4;
const HISTORY_KEY = "doudou_input_history";
const MAX_HISTORY = 30;

/** / 命令定义 */
interface SlashCommand {
  name: string;
  icon: string;
  description: string;
  action: () => void;
}

/** 粗估 token 数（中文 ≈ 2 token/字，英文 ≈ 1.3 token/词） */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars * 0.4);
}

/** 输入历史管理 */
function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(text: string) {
  if (!text.trim()) return;
  const history = loadHistory().filter((h) => h !== text);
  history.unshift(text);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function InputBox() {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = 未选择历史
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const dragCounterRef = useRef(0);
  const { send, abort, regenerate, isStreaming } = useChat();
  const currentModelId = useAppStore((s) => s.currentModelId);
  const models = useAppStore((s) => s.models);
  const pendingTemplateContent = useAppStore((s) => s.pendingTemplateContent);
  const clearPendingTemplate = useAppStore((s) => s.clearPendingTemplate);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  const currentModel = models.find((m) => m.id === currentModelId);
  const supportsImages = currentModel?.input?.includes("image") ?? false;

  // / 命令列表
  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        name: "model",
        icon: "🤖",
        description: "切换模型",
        action: () => {
          // 聚焦模型选择器（在顶栏）
          const el = document.querySelector("[data-model-selector]") as HTMLElement;
          el?.click();
          setShowSlashMenu(false);
          setInput("");
        },
      },
      {
        name: "clear",
        icon: "🗑️",
        description: "清空当前对话",
        action: () => {
          // 需要从 store 获取清空方法，这里简单提示
          setShowSlashMenu(false);
          setInput("");
        },
      },
      {
        name: "export",
        icon: "📤",
        description: "导出当前对话",
        action: () => {
          setShowSlashMenu(false);
          setInput("");
        },
      },
      {
        name: "sessions",
        icon: "💬",
        description: "打开会话管理",
        action: () => {
          setCurrentView("session");
          setShowSlashMenu(false);
          setInput("");
        },
      },
      {
        name: "config",
        icon: "⚙️",
        description: "打开配置页",
        action: () => {
          setCurrentView("config");
          setShowSlashMenu(false);
          setInput("");
        },
      },
      {
        name: "logs",
        icon: "📋",
        description: "查看日志",
        action: () => {
          setCurrentView("logs");
          setShowSlashMenu(false);
          setInput("");
        },
      },
    ],
    [setCurrentView]
  );

  // 过滤 / 命令
  const filteredCommands = useMemo(() => {
    if (!slashFilter) return slashCommands;
    return slashCommands.filter(
      (c) => c.name.includes(slashFilter) || c.description.includes(slashFilter)
    );
  }, [slashCommands, slashFilter]);

  // 模板内容填入输入框
  useEffect(() => {
    if (pendingTemplateContent) {
      setInput(pendingTemplateContent);
      clearPendingTemplate();
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [pendingTemplateContent, clearPendingTemplate]);

  // 自动调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  // 清理 blob URL
  useEffect(() => {
    return () => {
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  // 检测 / 命令触发
  useEffect(() => {
    if (input === "/") {
      setShowSlashMenu(true);
      setSlashFilter("");
    } else if (input.startsWith("/") && !input.includes(" ")) {
      setShowSlashMenu(true);
      setSlashFilter(input.slice(1));
    } else {
      setShowSlashMenu(false);
    }
    // 重置历史选择
    setHistoryIndex(-1);
  }, [input]);

  const addImages = useCallback(
    async (files: FileList | File[]) => {
      const remaining = MAX_IMAGES - pendingImages.length;
      if (remaining <= 0) return;
      const imageFiles = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, remaining);
      if (imageFiles.length === 0) return;
      const newImages = await Promise.all(imageFiles.map(createPendingImage));
      setPendingImages((prev) => [...prev, ...newImages]);
    },
    [pendingImages.length]
  );

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  // 粘贴图片
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageFiles = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages]
  );

  // 拖拽进入/离开（用计数器处理子元素冒泡）
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      if (e.dataTransfer.files.length > 0) {
        addImages(e.dataTransfer.files);
      }
    },
    [addImages]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 文件选择
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addImages(e.target.files);
        e.target.value = "";
      }
    },
    [addImages]
  );

  const handleSubmit = useCallback(() => {
    if ((!input.trim() && pendingImages.length === 0) || isStreaming) return;

    // 保存到输入历史
    if (input.trim()) {
      saveToHistory(input.trim());
    }

    const images = pendingImages.map((img) => ({
      data: img.base64,
      mimeType: img.mimeType,
    }));

    send(input, images.length > 0 ? images : undefined);

    pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setPendingImages([]);
    setInput("");
    setHistoryIndex(-1);
  }, [input, pendingImages, isStreaming, send]);

  // 输入法组合状态
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setTimeout(() => {
      isComposingRef.current = false;
    }, 20);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // / 命令菜单激活时的键盘导航
      if (showSlashMenu && filteredCommands.length > 0) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          filteredCommands[0]?.action();
          return;
        }
        if (e.key === "Escape") {
          setShowSlashMenu(false);
          setInput("");
          return;
        }
      }

      // Enter 发送
      if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // ↑ 键：输入历史回溯（仅在输入为空或正在浏览历史时）
      if (e.key === "ArrowUp" && !isComposingRef.current) {
        const history = loadHistory();
        if (history.length === 0) return;
        if (input === "" || historyIndex >= 0) {
          e.preventDefault();
          const newIndex = historyIndex < 0 ? 0 : Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
        return;
      }

      // ↓ 键：输入历史前进
      if (e.key === "ArrowDown" && !isComposingRef.current) {
        if (historyIndex >= 0) {
          e.preventDefault();
          const history = loadHistory();
          const newIndex = historyIndex - 1;
          if (newIndex < 0) {
            setHistoryIndex(-1);
            setInput("");
          } else {
            setHistoryIndex(newIndex);
            setInput(history[newIndex]);
          }
        }
        return;
      }
    },
    [showSlashMenu, filteredCommands, handleSubmit, input, historyIndex]
  );

  const canSend = (input.trim() || pendingImages.length > 0) && !isStreaming;
  const tokenEstimate = useMemo(() => estimateTokens(input), [input]);

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-4xl mx-auto relative">
        {/* / 命令浮层 */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 max-h-64 overflow-y-auto z-50">
            <div className="px-3 py-1.5 text-[10px] text-neutral-400 uppercase tracking-wider font-medium">
              快捷命令
            </div>
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={cmd.action}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-neutral-50 transition-colors"
              >
                <span className="text-base">{cmd.icon}</span>
                <span className="font-medium text-neutral-700">/{cmd.name}</span>
                <span className="text-neutral-400 text-xs">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* 拖拽遮罩 */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-2xl flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-4xl mb-2">📎</div>
              <p className="text-blue-600 font-medium text-sm">拖拽图片到这里</p>
            </div>
          </div>
        )}

        <div
          className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden transition-shadow hover:shadow-xl focus-within:shadow-xl focus-within:border-blue-300"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          {/* 图片预览区 */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative group shrink-0">
                  <img
                    src={img.previewUrl}
                    alt="预览"
                    className="w-16 h-16 object-cover rounded-lg border border-neutral-200"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
              {pendingImages.length < MAX_IMAGES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed border-neutral-200 rounded-lg flex items-center justify-center text-neutral-300 hover:border-blue-300 hover:text-blue-400 transition-colors shrink-0"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={
              pendingImages.length > 0
                ? "添加描述... (可选)"
                : "输入消息... (/ 打开命令，↑ 历史)"
            }
            className="w-full resize-none px-4 py-3.5 text-[14px] text-neutral-800 placeholder-neutral-400 focus:outline-none bg-transparent leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />

          {/* 底栏 */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-2">
              {/* 图片上传按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!supportsImages || isStreaming}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                  supportsImages
                    ? "text-neutral-400 hover:text-blue-500 hover:bg-blue-50"
                    : "text-neutral-200 cursor-not-allowed"
                }`}
                title={supportsImages ? "添加图片" : "当前模型不支持图片"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* token 预估 */}
              {input.trim() ? (
                <span className="text-[10px] text-neutral-300 select-none" title="预估 token 数">
                  ~{tokenEstimate} tokens
                </span>
              ) : (
                <span className="text-[11px] text-neutral-300 select-none">
                  Enter 发送
                </span>
              )}
            </div>

            {isStreaming ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={abort}
                  className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all active:scale-90"
                  title="停止"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
                  </svg>
                </button>
                <button
                  onClick={() => { abort(); setTimeout(regenerate, 100); }}
                  className="w-8 h-8 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-all active:scale-90"
                  title="停止并重新生成"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-200 text-white disabled:text-neutral-400 rounded-full transition-all active:scale-90 disabled:cursor-not-allowed"
                title="发送"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 输入框组件（支持多模态图片上传）
 */
import { useState, useRef, useEffect, useCallback } from "react";
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
        // 如果图片不大，直接返回
        if (file.size <= maxSizeKB * 1024) {
          const base64 = (e.target?.result as string).split(",")[1];
          resolve({ base64, mimeType: file.type });
          return;
        }

        // 计算压缩比例
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, Math.sqrt((maxSizeKB * 1024) / file.size));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 优先用 jpeg 压缩
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

export function InputBox() {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { send, abort, isStreaming } = useChat();
  const currentModelId = useAppStore((s) => s.currentModelId);
  const models = useAppStore((s) => s.models);

  // 检测当前模型是否支持图片
  const currentModel = models.find((m) => m.id === currentModelId);
  const supportsImages = currentModel?.input?.includes("image") ?? false;

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

  const addImages = useCallback(async (files: FileList | File[]) => {
    const remaining = MAX_IMAGES - pendingImages.length;
    if (remaining <= 0) return;

    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);

    if (imageFiles.length === 0) return;

    const newImages = await Promise.all(imageFiles.map(createPendingImage));
    setPendingImages((prev) => [...prev, ...newImages]);
  }, [pendingImages.length]);

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  // 粘贴图片
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }, [addImages]);

  // 拖拽
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      addImages(e.dataTransfer.files);
    }
  }, [addImages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 文件选择
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files);
      e.target.value = "";
    }
  }, [addImages]);

  const handleSubmit = () => {
    if ((!input.trim() && pendingImages.length === 0) || isStreaming) return;

    const images = pendingImages.map((img) => ({
      data: img.base64,
      mimeType: img.mimeType,
    }));

    send(input, images.length > 0 ? images : undefined);

    // 清理
    pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setPendingImages([]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = (input.trim() || pendingImages.length > 0) && !isStreaming;

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-4xl mx-auto">
        <div
          className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden transition-shadow hover:shadow-xl focus-within:shadow-xl focus-within:border-blue-300"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
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
            placeholder={pendingImages.length > 0 ? "添加描述... (可选)" : "输入消息... (Enter 发送，Shift+Enter 换行)"}
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

              <span className="text-[11px] text-neutral-300 select-none">
                Enter 发送
              </span>
            </div>

            {isStreaming ? (
              <button
                onClick={abort}
                className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all active:scale-90"
                title="停止"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
                </svg>
              </button>
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

/**
 * Markdown 渲染组件
 * 支持 GFM（表格、删除线、任务列表）、代码高亮、代码块复制
 */
import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface Props {
  content: string;
}

/** 代码块：带语言标签 + 复制按钮 */
function CodeBlock({ className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const isInline = !className;
  const language = className?.replace("language-", "") || "";

  const handleCopy = useCallback(async () => {
    const text = typeof children === "string" ? children : String(children);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  // 行内代码
  if (isInline) {
    return (
      <code
        className="bg-neutral-100 text-red-600 px-1.5 py-0.5 rounded text-[13px] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // 代码块
  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-neutral-200">
      {/* 顶部栏：语言 + 复制 */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-800 text-neutral-400 text-xs">
        <span className="font-mono">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-neutral-700 transition-colors"
        >
          {copied ? (
            <>
              <span>✓</span>
              <span>已复制</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="!m-0 !rounded-t-none bg-neutral-900">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/** Markdown 渲染器 */
export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code: CodeBlock,
        // 表格样式
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-neutral-50 border-b border-neutral-200">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2.5 text-left font-semibold text-neutral-700">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 border-b border-neutral-100">{children}</td>
        ),
        // 链接样式
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            {children}
          </a>
        ),
        // 标题样式
        h1: ({ children }) => (
          <h1 className="text-xl font-bold mt-4 mb-2 text-neutral-800">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold mt-3 mb-2 text-neutral-800">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold mt-3 mb-1 text-neutral-800">{children}</h3>
        ),
        // 引用块
        blockquote: ({ children }) => (
          <blockquote className="border-l-[3px] border-blue-400 pl-4 py-2 my-3 bg-blue-50/50 text-neutral-600 text-sm rounded-r-lg">
            {children}
          </blockquote>
        ),
        // 列表
        ul: ({ children }) => <ul className="list-disc pl-6 my-3 space-y-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 my-3 space-y-1.5">{children}</ol>,
        // 分割线
        hr: () => <hr className="my-4 border-neutral-200" />,
        // 段落
        p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

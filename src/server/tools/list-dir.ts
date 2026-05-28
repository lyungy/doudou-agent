/**
 * 列出目录内容工具
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const ListDirParams = Type.Object({
  path: Type.String({ description: "要列出的目录路径" }),
  show_hidden: Type.Optional(Type.Boolean({ description: "是否显示隐藏文件（以 . 开头），默认 false" })),
});

export const listDirectoryTool: AgentTool<typeof ListDirParams> = {
  name: "list_directory",
  label: "列出目录",
  description: "列出指定目录下的文件和子目录。用于浏览项目结构、查找文件等。",
  parameters: ListDirParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    let entries = readdirSync(params.path, { withFileTypes: true });

    // 过滤隐藏文件
    if (!params.show_hidden) {
      entries = entries.filter((e) => !e.name.startsWith("."));
    }

    // 排序：目录在前，文件在后
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const lines = entries.map((entry) => {
      const prefix = entry.isDirectory() ? "📁" : "📄";
      const fullPath = join(params.path, entry.name);

      try {
        const stat = statSync(fullPath);
        const size = entry.isDirectory() ? "" : ` (${formatSize(stat.size)})`;
        return `${prefix} ${entry.name}${size}`;
      } catch {
        return `${prefix} ${entry.name}`;
      }
    });

    return {
      content: [{ type: "text", text: lines.join("\n") || "(空目录)" }],
      details: { path: params.path, count: entries.length },
    };
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

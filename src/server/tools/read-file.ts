/**
 * 读取文件工具
 */
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFileSync, existsSync } from "fs";

const ReadFileParams = Type.Object({
  path: Type.String({ description: "要读取的文件路径（绝对路径或相对路径）" }),
  encoding: Type.Optional(Type.String({ description: "文件编码，默认 utf-8" })),
});

export const readFileTool: AgentTool<typeof ReadFileParams> = {
  name: "read_file",
  label: "读取文件",
  description: "读取指定文件的文本内容。用于查看文件内容、检查代码、阅读配置等场景。",
  parameters: ReadFileParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    if (!existsSync(params.path)) {
      throw new Error(`文件不存在: ${params.path}`);
    }

    const content = readFileSync(params.path, (params.encoding as BufferEncoding) || "utf-8");

    // 截断过长内容
    const maxLen = 50000;
    const truncated = content.length > maxLen;
    const text = truncated ? content.slice(0, maxLen) + "\n\n... [内容过长，已截断]" : content;

    return {
      content: [{ type: "text", text }],
      details: { path: params.path, size: content.length, truncated },
    };
  },
};

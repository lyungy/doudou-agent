/**
 * 写入文件工具
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const WriteFileParams = Type.Object({
  path: Type.String({ description: "要写入的文件路径" }),
  content: Type.String({ description: "要写入的文件内容" }),
});

export const writeFileTool: AgentTool<typeof WriteFileParams> = {
  name: "write_file",
  label: "写入文件",
  description: "将内容写入指定文件。如果文件不存在会自动创建目录。覆盖写入。",
  parameters: WriteFileParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    // 确保目录存在
    const dir = dirname(params.path);
    mkdirSync(dir, { recursive: true });

    writeFileSync(params.path, params.content, "utf-8");

    return {
      content: [{ type: "text", text: `已写入文件: ${params.path} (${params.content.length} 字符)` }],
      details: { path: params.path, bytes: Buffer.byteLength(params.content, "utf-8") },
    };
  },
};

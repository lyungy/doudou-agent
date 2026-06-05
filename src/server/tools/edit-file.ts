/**
 * 编辑文件工具（异步，精确替换）
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile, writeFile, access } from "fs/promises";

const EditFileParams = Type.Object({
  path: Type.String({ description: "要编辑的文件路径" }),
  old_text: Type.String({ description: "要替换的原始文本（必须精确匹配）" }),
  new_text: Type.String({ description: "替换后的新文本" }),
});

export const editFileTool: AgentTool<typeof EditFileParams> = {
  name: "edit_file",
  label: "编辑文件",
  description: "精确替换文件中的文本片段。old_text 必须与文件中的内容完全匹配（包括空格和换行）。",
  parameters: EditFileParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    try {
      await access(params.path);
    } catch {
      throw new Error(`文件不存在: ${params.path}`);
    }

    const content = await readFile(params.path, "utf-8");

    if (!content.includes(params.old_text)) {
      throw new Error(`在文件 ${params.path} 中未找到要替换的文本`);
    }

    // 检查是否有多处匹配
    const count = content.split(params.old_text).length - 1;
    if (count > 1) {
      throw new Error(`在文件 ${params.path} 中找到 ${count} 处匹配，请提供更精确的文本`);
    }

    const newContent = content.replace(params.old_text, params.new_text);
    await writeFile(params.path, newContent, "utf-8");

    return {
      content: [{ type: "text", text: `已编辑文件: ${params.path}` }],
      details: { path: params.path, replaced: true },
    };
  },
};

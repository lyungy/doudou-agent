/**
 * 文本搜索工具（类 grep）
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const GrepParams = Type.Object({
  pattern: Type.String({ description: "搜索的正则表达式模式" }),
  path: Type.String({ description: "要搜索的目录或文件路径" }),
  include: Type.Optional(Type.String({ description: "文件名匹配模式（如 *.ts）" })),
  ignore_case: Type.Optional(Type.Boolean({ description: "是否忽略大小写，默认 false" })),
  max_results: Type.Optional(Type.Number({ description: "最大返回结果数，默认 50" })),
});

export const grepTool: AgentTool<typeof GrepParams> = {
  name: "grep",
  label: "搜索文本",
  description: "在文件中搜索匹配正则表达式的文本。用于查找代码中的特定内容、函数定义、变量引用等。",
  parameters: GrepParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    const maxResults = params.max_results || 50;
    const ignoreCase = params.ignore_case || false;
    const results: string[] = [];

    const regex = new RegExp(params.pattern, ignoreCase ? "i" : "");

    function searchFile(filePath: string) {
      if (results.length >= maxResults) return;

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          if (results.length >= maxResults) return;
          if (regex.test(line)) {
            results.push(`${relative(process.cwd(), filePath)}:${idx + 1}: ${line.trim()}`);
          }
        });
      } catch {
        // 跳过无法读取的文件
      }
    }

    function searchDir(dirPath: string) {
      if (results.length >= maxResults) return;

      try {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) return;

          const fullPath = join(dirPath, entry.name);

          // 跳过常见的不需要搜索的目录
          if (entry.isDirectory()) {
            if (["node_modules", ".git", "dist", ".doudou"].includes(entry.name)) continue;
            searchDir(fullPath);
          } else {
            // 文件名匹配
            if (params.include) {
              const pattern = params.include.replace(/\*/g, ".*");
              if (!new RegExp(`^${pattern}$`).test(entry.name)) continue;
            }
            searchFile(fullPath);
          }
        }
      } catch {
        // 跳过无法访问的目录
      }
    }

    // 检查路径是文件还是目录
    const stat = statSync(params.path);
    if (stat.isFile()) {
      searchFile(params.path);
    } else {
      searchDir(params.path);
    }

    const output = results.length >= maxResults
      ? results.join("\n") + `\n\n... (已达到最大结果数 ${maxResults}，可能有更多匹配)`
      : results.join("\n");

    return {
      content: [{ type: "text", text: output || `(未找到匹配 "${params.pattern}" 的内容)` }],
      details: { pattern: params.pattern, matchCount: results.length, truncated: results.length >= maxResults },
    };
  },
};

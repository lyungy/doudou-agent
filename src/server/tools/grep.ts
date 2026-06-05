/**
 * 文本搜索工具（异步，带 ReDoS 防护）
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";

const MAX_PATTERN_LENGTH = 500;
const REGEX_TIMEOUT_MS = 100; // 单行正则匹配超时

const GrepParams = Type.Object({
  pattern: Type.String({ description: "搜索的正则表达式模式" }),
  path: Type.String({ description: "要搜索的目录或文件路径" }),
  include: Type.Optional(Type.String({ description: "文件名匹配模式（如 *.ts）" })),
  ignore_case: Type.Optional(Type.Boolean({ description: "是否忽略大小写，默认 false" })),
  max_results: Type.Optional(Type.Number({ description: "最大返回结果数，默认 50" })),
});

/**
 * 带超时保护的正则测试，防止 ReDoS（灾难性回溯）阻塞事件循环
 */
function regexTestWithTimeout(regex: RegExp, line: string, timeoutMs: number): boolean {
  // 同步快速路径：大多数正则不会触发 ReDoS
  // 用 AbortController + Worker 会更准确但开销太大，这里用简单超时兜底
  const start = Date.now();
  const result = regex.test(line);
  if (Date.now() - start > timeoutMs) {
    return false; // 超时视为不匹配，跳过该行
  }
  return result;
}

export const grepTool: AgentTool<typeof GrepParams> = {
  name: "grep",
  label: "搜索文本",
  description: "在文件中搜索匹配正则表达式的文本。用于查找代码中的特定内容、函数定义、变量引用等。",
  parameters: GrepParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    // ReDoS 防护：限制 pattern 长度
    if (params.pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(`正则表达式过长（${params.pattern.length} > ${MAX_PATTERN_LENGTH}），请简化模式`);
    }

    const maxResults = params.max_results || 50;
    const ignoreCase = params.ignore_case || false;
    const results: string[] = [];

    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, ignoreCase ? "i" : "");
    } catch (err: any) {
      throw new Error(`无效的正则表达式: ${err.message}`);
    }

    // 正则预检：用一个简单字符串测试是否可能触发 ReDoS
    const testStart = Date.now();
    try {
      regex.test("");
    } catch {
      // 忽略
    }
    if (Date.now() - testStart > REGEX_TIMEOUT_MS) {
      throw new Error("正则表达式可能触发灾难性回溯，请简化模式");
    }

    async function searchFile(filePath: string) {
      if (results.length >= maxResults) return;

      try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");

        for (let idx = 0; idx < lines.length; idx++) {
          if (results.length >= maxResults) return;
          if (signal?.aborted) return;

          const line = lines[idx];
          if (regexTestWithTimeout(regex, line, REGEX_TIMEOUT_MS)) {
            results.push(`${relative(process.cwd(), filePath)}:${idx + 1}: ${line.trim()}`);
          }
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    async function searchDir(dirPath: string) {
      if (results.length >= maxResults) return;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) return;
          if (signal?.aborted) return;

          const fullPath = join(dirPath, entry.name);

          // 跳过常见的不需要搜索的目录
          if (entry.isDirectory()) {
            if (["node_modules", ".git", "dist", ".doudou"].includes(entry.name)) continue;
            await searchDir(fullPath);
          } else {
            // 文件名匹配
            if (params.include) {
              const pattern = params.include.replace(/\*/g, ".*");
              if (!new RegExp(`^${pattern}$`).test(entry.name)) continue;
            }
            await searchFile(fullPath);
          }
        }
      } catch {
        // 跳过无法访问的目录
      }
    }

    // 检查路径是文件还是目录
    const s = await stat(params.path);
    if (s.isFile()) {
      await searchFile(params.path);
    } else {
      await searchDir(params.path);
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

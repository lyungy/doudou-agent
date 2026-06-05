/**
 * Bash 命令执行工具（异步）
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { exec } from "child_process";

const BashParams = Type.Object({
  command: Type.String({ description: "要执行的 shell 命令" }),
  cwd: Type.Optional(Type.String({ description: "工作目录，默认当前目录" })),
  timeout: Type.Optional(Type.Number({ description: "超时时间（秒），默认 60" })),
});

export const bashTool: AgentTool<typeof BashParams> = {
  name: "bash",
  label: "执行命令",
  description: "执行 shell 命令并返回输出。可以运行脚本、查看进程、管理文件等。注意：破坏性命令请谨慎使用。",
  parameters: BashParams,

  execute: async (toolCallId, params, signal, onUpdate) => {
    const timeout = (params.timeout || 60) * 1000;

    // signal 已 abort 时立即终止，不启动进程
    if (signal?.aborted) {
      return {
        content: [{ type: "text", text: "命令已取消" }],
        details: { command: params.command, exitCode: -1, aborted: true },
      };
    }

    return new Promise((resolve) => {
      const child = exec(
        params.command,
        {
          cwd: params.cwd || process.cwd(),
          timeout,
          maxBuffer: 1024 * 1024 * 10, // 10MB
          encoding: "utf-8",
        },
        (err, stdout, stderr) => {
          const output = (stdout || "") + (stderr || "");
          const maxLen = 50000;
          const truncated = output.length > maxLen;
          const text = truncated ? output.slice(0, maxLen) + "\n\n... [输出过长，已截断]" : output;

          if (err) {
            resolve({
              content: [{ type: "text", text: text || `命令执行失败: ${err.message}` }],
              details: { command: params.command, exitCode: (err as any).status || 1, error: true, truncated },
            });
          } else {
            resolve({
              content: [{ type: "text", text: text || "(命令执行成功，无输出)" }],
              details: { command: params.command, exitCode: 0, truncated },
            });
          }
        }
      );

      // 支持 abort signal
      signal?.addEventListener("abort", () => {
        child.kill("SIGTERM");
      }, { once: true });
    });
  },
};

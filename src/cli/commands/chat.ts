/**
 * chat 命令 — 终端直连 LLM 对话
 */
import { initCLI } from "../lib/init.js";
import { runChat, type ChatOptions } from "../lib/chat-runner.js";

/**
 * 执行 chat 命令
 */
export async function runChatCommand(options: ChatOptions): Promise<void> {
  const config = initCLI();
  await runChat(options, config);
}

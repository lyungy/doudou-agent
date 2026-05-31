/**
 * session 命令 — Session 管理（直调 session service）
 */
import { initCLI } from "../lib/init.js";
import { bold, success, error, dim, formatTime, printTable } from "../lib/format.js";

/**
 * 列出所有 session
 */
export async function sessionList(): Promise<void> {
  initCLI();
  const { listSessions } = await import("../../server/services/session.js");
  const sessions = listSessions();

  if (sessions.length === 0) {
    console.log(dim("暂无 Session"));
    return;
  }

  console.log(bold(`\n💬 Sessions（${sessions.length} 个）\n`));

  const headers = ["ID", "标题", "模型", "消息数", "创建时间", "更新时间"];
  const rows = sessions.map((s) => [
    s.id.slice(0, 8) + "...",
    s.title.slice(0, 20),
    s.modelId || "-",
    String(s.messageCount),
    formatTime(s.createdAt),
    formatTime(s.updatedAt),
  ]);

  printTable(headers, rows);
}

/**
 * 创建新 session
 */
export async function sessionCreate(title?: string): Promise<void> {
  initCLI();
  const { createSession } = await import("../../server/services/session.js");
  const meta = await createSession(title);

  console.log(success(`✓ Session 已创建`));
  console.log(dim(`  ID: ${meta.id}`));
  console.log(dim(`  标题: ${meta.title}`));
}

/**
 * 删除 session
 */
export async function sessionDelete(id: string): Promise<void> {
  initCLI();
  const { deleteSession } = await import("../../server/services/session.js");

  // 支持模糊匹配：如果 id 是短标识（8 位），查找完整 ID
  const { listSessions } = await import("../../server/services/session.js");
  const sessions = listSessions();
  const matched = sessions.find(
    (s) => s.id === id || s.id.startsWith(id)
  );

  if (!matched) {
    console.log(error(`Session 不存在: ${id}`));
    process.exit(1);
  }

  const ok = await deleteSession(matched.id);
  if (ok) {
    console.log(success(`✓ Session 已删除: ${matched.id.slice(0, 8)}...`));
  } else {
    console.log(error("删除失败"));
    process.exit(1);
  }
}

/**
 * 导出 session 消息为 JSON
 */
export async function sessionExport(id: string, outFile?: string): Promise<void> {
  initCLI();
  const { openSession, listSessions } = await import("../../server/services/session.js");
  const { readFileSync, existsSync, writeFileSync } = await import("fs");

  // 模糊匹配
  const sessions = listSessions();
  const matched = sessions.find(
    (s) => s.id === id || s.id.startsWith(id)
  );

  if (!matched) {
    console.log(error(`Session 不存在: ${id}`));
    process.exit(1);
  }

  const session = await openSession(matched.id);
  if (!session) {
    console.log(error("无法打开 Session"));
    process.exit(1);
  }

  const metadata = await session.getMetadata() as any;
  const jsonlPath = metadata.path;

  if (!existsSync(jsonlPath)) {
    console.log(error("JSONL 文件不存在"));
    process.exit(1);
  }

  // 读取 JSONL 并转换为 JSON 数组
  const content = readFileSync(jsonlPath, "utf-8");
  const lines = content.trim().split("\n");
  const messages: any[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "message" && entry.message) {
        messages.push(entry.message);
      }
    } catch {
      // 跳过
    }
  }

  const outPath = outFile || `${matched.id.slice(0, 8)}-messages.json`;
  writeFileSync(outPath, JSON.stringify(messages, null, 2), "utf-8");

  console.log(success(`✓ 已导出 ${messages.length} 条消息到 ${outPath}`));
}

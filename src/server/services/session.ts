/**
 * Session 服务：管理会话的创建、查询、删除
 * 双层存储：JSONL（消息，pi-agent-core 原生）+ SQLite（元数据索引）
 */
import { mkdirSync, existsSync } from "fs";
import { resolve, isAbsolute } from "path";
import { open, stat } from "fs/promises";
import Database from "better-sqlite3";
import { JsonlSessionRepo } from "@earendil-works/pi-agent-core";
import type { Session } from "@earendil-works/pi-agent-core";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
import { NodeFileSystem } from "./node-fs.js";

/** Session 元数据（SQLite 存储） */
export interface SessionMeta {
  id: string;
  title: string;
  modelId: string;
  cwd: string;
  jsonlPath: string;
  messageCount: number;
  pinned: number;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

/** 数据目录（从配置读取，运行时解析） */
let DATA_DIR = "";
let SESSIONS_DIR = "";
let DB_PATH = "";

function resolveDataDir(): string {
  const config = getConfig();
  const raw = config.storage.data_dir;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

/** SQLite 数据库 */
let db: Database.Database | null = null;

/** JSONL Session 仓库 */
let jsonlRepo: JsonlSessionRepo | null = null;

/**
 * 初始化存储系统
 */
export function initStorage(): void {
  // 解析数据目录
  DATA_DIR = resolveDataDir();
  SESSIONS_DIR = resolve(DATA_DIR, "sessions");
  DB_PATH = resolve(DATA_DIR, "doudou.db");
  getLogger().info("system", `数据目录: ${DATA_DIR}`);

  // 确保目录存在
  mkdirSync(SESSIONS_DIR, { recursive: true });

  // 初始化 SQLite
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // 创建 sessions 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      model_id TEXT NOT NULL DEFAULT '',
      cwd TEXT NOT NULL,
      jsonl_path TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 兼容升级：旧表没有 model_id 列时自动添加
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN model_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    // 列已存在，忽略
  }

  // 兼容升级：旧表没有 pinned 列时自动添加
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // 列已存在，忽略
  }

  // 初始化 JSONL 仓库
  const fs = new NodeFileSystem(process.cwd());
  jsonlRepo = new JsonlSessionRepo({
    fs: fs as any,
    sessionsRoot: SESSIONS_DIR,
  });
}

/**
 * 获取 JSONL 仓库实例
 */
function getRepo(): JsonlSessionRepo {
  if (!jsonlRepo) {
    throw new Error("存储系统未初始化，请先调用 initStorage()");
  }
  return jsonlRepo;
}

/**
 * 获取数据库实例
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error("存储系统未初始化，请先调用 initStorage()");
  }
  return db;
}

/**
 * 创建新 session
 */
export async function createSession(title?: string, modelId?: string): Promise<SessionMeta> {
  const repo = getRepo();
  const database = getDb();

  const cwd = process.cwd();
  const session = await repo.create({ cwd });

  const metadata = await session.getMetadata();
  const now = new Date().toISOString();

  // 自动生成短标识作为默认标题（取 UUID 末 6 位，随机性更高）
  const shortId = metadata.id.replace(/-/g, "").slice(-6);

  const meta: SessionMeta = {
    id: metadata.id,
    title: title || `对话-${shortId}`,
    modelId: modelId || "",
    cwd: metadata.cwd,
    jsonlPath: metadata.path,
    messageCount: 0,
    pinned: 0,
    createdAt: metadata.createdAt,
    updatedAt: now,
  };

  // 写入 SQLite
  database
    .prepare(
      `INSERT INTO sessions (id, title, model_id, cwd, jsonl_path, message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(meta.id, meta.title, meta.modelId, meta.cwd, meta.jsonlPath, meta.messageCount, meta.createdAt, meta.updatedAt);

  return meta;
}

/**
 * 从 JSONL 文件尾部读取最后一条消息摘要（最多读最后 4KB）
 * 性能优化：不读整个文件，只从末尾 seek 读取
 */
async function readLastMessage(jsonPath: string): Promise<string> {
  try {
    const st = await stat(jsonPath);
    if (st.size === 0) return "";

    // 读最后 4KB
    const readSize = Math.min(st.size, 4096);
    const buffer = Buffer.alloc(readSize);
    const fh = await open(jsonPath, "r");
    try {
      await fh.read(buffer, 0, readSize, st.size - readSize);
    } finally {
      await fh.close();
    }

    // 找最后一个完整行（最后一个换行符之后的内容可能是不完整的）
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return "";

    // 从最后一行往前找，解析出消息文本
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        // 提取消息文本
        const msg = entry.message || entry;
        if (msg?.role === "user" || msg?.role === "assistant") {
          let text = "";
          if (typeof msg.content === "string") {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("");
          }
          if (text) return text.slice(0, 80);
        }
      } catch {
        // 非 JSON 行，跳过
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * 获取 session 列表（按置顶 + 更新时间排序，附带 lastMessage）
 */
export async function listSessions(): Promise<SessionMeta[]> {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM sessions ORDER BY pinned DESC, updated_at DESC")
    .all() as any[];

  // 并发读取每个 session 的最后一条消息
  const lastMessages = await Promise.all(
    rows.map((row) => readLastMessage(row.jsonl_path))
  );

  return rows.map((row, i) => ({
    id: row.id,
    title: row.title,
    modelId: row.model_id || "",
    cwd: row.cwd,
    jsonlPath: row.jsonl_path,
    messageCount: row.message_count,
    pinned: row.pinned || 0,
    lastMessage: lastMessages[i] || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * 获取单个 session
 */
export function getSession(id: string): SessionMeta | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id || "",
    cwd: row.cwd,
    jsonlPath: row.jsonl_path,
    messageCount: row.message_count,
    pinned: row.pinned || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 更新 session 元数据
 */
export function updateSession(
  id: string,
  updates: Partial<Pick<SessionMeta, "title" | "messageCount" | "modelId" | "pinned">>
): void {
  const database = getDb();
  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?"];
  const values: any[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    values.push(updates.title);
  }
  if (updates.modelId !== undefined) {
    sets.push("model_id = ?");
    values.push(updates.modelId);
  }
  if (updates.messageCount !== undefined) {
    sets.push("message_count = ?");
    values.push(updates.messageCount);
  }
  if (updates.pinned !== undefined) {
    sets.push("pinned = ?");
    values.push(updates.pinned);
  }

  values.push(id);
  database.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/**
 * 删除 session
 */
export async function deleteSession(id: string): Promise<boolean> {
  const database = getDb();
  const meta = getSession(id);
  if (!meta) return false;

  // 删除 JSONL 文件（容错：文件不存在也不影响）
  try {
    const repo = getRepo();
    await repo.delete({ id, createdAt: meta.createdAt, cwd: meta.cwd, path: meta.jsonlPath });
  } catch {
    // JSONL 文件可能不存在，忽略
  }

  // 删除 SQLite 记录
  database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return true;
}

/**
 * 打开 session（用于 Agent）
 */
export async function openSession(id: string): Promise<Session | null> {
  const meta = getSession(id);
  if (!meta) return null;

  const repo = getRepo();
  return repo.open({
    id: meta.id,
    createdAt: meta.createdAt,
    cwd: meta.cwd,
    path: meta.jsonlPath,
  });
}

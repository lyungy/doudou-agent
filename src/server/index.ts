/**
 * Doudou Agent — Express 入口
 */
import express from "express";
import { resolve } from "path";
import { loadConfig } from "./services/config.js";
import { initStorage } from "./services/session.js";
import configRouter from "./routes/config.js";
import sessionRouter from "./routes/session.js";
import chatRouter from "./routes/chat.js";

// 加载配置
const config = loadConfig(resolve(process.cwd(), "config.yaml"));
console.log(`[Config] LLM: ${config.llm.models[0]?.id || '(无模型)'} @ ${config.llm.base_url}`);

// 初始化存储
initStorage();
console.log("[Storage] JSONL + SQLite 已初始化");

// 创建 Express 应用
const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS（开发环境）
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// 注册路由
app.use("/api/config", configRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/chat", chatRouter);

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// 启动服务器
const port = config.server.port;
app.listen(port, () => {
  console.log(`[Server] Doudou Agent 运行在 http://localhost:${port}`);
  console.log(`[Server] API: http://localhost:${port}/api`);
});

/**
 * Doudou Agent — Express 入口
 * 集成结构化日志 + LLM 追踪
 */
import express from "express";
import { resolve, isAbsolute } from "path";
import { loadConfig } from "./services/config.js";
import { initStorage } from "./services/session.js";
import { initLogger, getLogger } from "./services/logger.js";
import { initLLMTracker } from "./services/llm-tracker.js";
import { requestLogger } from "./middleware/request-logger.js";
import configRouter from "./routes/config.js";
import sessionRouter from "./routes/session.js";
import chatRouter from "./routes/chat.js";
import logsRouter from "./routes/logs.js";

// 加载配置
const config = loadConfig(resolve(process.cwd(), "config.yaml"));

// 初始化日志系统
const logDir = isAbsolute(config.logging.dir)
  ? config.logging.dir
  : resolve(process.cwd(), config.logging.dir);

initLogger({
  level: config.logging.level,
  dir: logDir,
  maxDays: config.logging.max_days,
});

// 初始化 LLM 追踪器（持久化到日志目录）
initLLMTracker(resolve(logDir, "llm-requests.jsonl"));

// 初始化存储
initStorage();

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

// HTTP 请求日志中间件
app.use(requestLogger);

// 注册路由
app.use("/api/config", configRouter);
app.use("/api/sessions", sessionRouter);
app.use("/api/chat", chatRouter);
app.use("/api/logs", logsRouter);

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// 启动服务器
const port = config.server.port;
app.listen(port, () => {
  const logger = getLogger();
  logger.info("system", `Doudou Agent 运行在 http://localhost:${port}`, { port });
  logger.info("system", `LLM: ${config.llm.models[0]?.id || "(无模型)"} @ ${config.llm.base_url}`);
  logger.info("system", `日志目录: ${logDir}`);
});

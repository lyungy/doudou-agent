/**
 * Doudou Agent — Express 入口
 * 集成结构化日志 + LLM 追踪
 *
 * 导出 createApp / startServer 供 CLI serve 命令复用
 */
import express from "express";
import { resolve, isAbsolute } from "path";
import type { AppConfig } from "./services/config.js";
import { loadConfig, listModels } from "./services/config.js";
import { initStorage } from "./services/session.js";
import { initLogger, getLogger } from "./services/logger.js";
import { initLLMTracker } from "./services/llm-tracker.js";
import { initTaskScheduler } from "./services/task-scheduler.js";
import { requestLogger } from "./middleware/request-logger.js";
import configRouter from "./routes/config.js";
import sessionRouter from "./routes/session.js";
import chatRouter from "./routes/chat.js";
import logsRouter from "./routes/logs.js";
import tasksRouter from "./routes/tasks.js";
import statsRouter from "./routes/stats.js";
import templateRouter from "./routes/template.js";
import { initTemplates } from "./services/template.js";

/**
 * 解析日志目录（绝对路径直接用，相对路径基于 cwd）
 */
function resolveLogDir(logging: AppConfig["logging"]): string {
  return isAbsolute(logging.dir)
    ? logging.dir
    : resolve(process.cwd(), logging.dir);
}

/**
 * 创建并配置 Express 应用
 * 初始化所有服务（日志、存储、LLM 追踪、任务调度），注册路由
 */
export function createApp(config: AppConfig): express.Express {
  const logDir = resolveLogDir(config.logging);

  // 初始化日志系统
  initLogger({
    level: config.logging.level,
    dir: logDir,
    maxDays: config.logging.max_days,
  });

  // 初始化 LLM 追踪器
  initLLMTracker(resolve(logDir, "llm-requests.jsonl"));

  // 初始化定时任务调度器
  initTaskScheduler(resolve(process.cwd(), "data"));

  // 初始化存储（SQLite + JSONL）
  initStorage();

  // 初始化提示词模板（建表在 initStorage 中完成）
  initTemplates();

  // 创建 Express 应用
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // CORS
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
  app.use("/api/tasks", tasksRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/templates", templateRouter);

  // 健康检查
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  return app;
}

/**
 * 启动 HTTP 服务器（含优雅关停）
 */
export function startServer(config: AppConfig): void {
  const app = createApp(config);
  const port = config.server.port;

  const server = app.listen(port, () => {
    const logger = getLogger();
    logger.info("system", `Doudou Agent 运行在 http://localhost:${port}`, { port });
    const allModels = listModels();
    logger.info("system", `LLM: ${allModels.length} 个模型，${config.llm.providers.length} 个 provider`);
    logger.info("system", `日志目录: ${resolveLogDir(config.logging)}`);
  });

  // 优雅关停：清理资源
  const shutdown = (signal: string) => {
    const logger = getLogger();
    logger.info("system", `收到 ${signal} 信号，正在优雅关停...`);

    // 停止接受新连接
    server.close(() => {
      logger.info("system", "HTTP 服务器已关闭");

      // 关闭 SQLite 连接
      try {
        const { getDb } = require("./services/session.js");
        getDb().close();
        logger.info("system", "SQLite 连接已关闭");
      } catch {
        // 未初始化则忽略
      }

      logger.info("system", "Doudou Agent 已停止");
      process.exit(0);
    });

    // 超时强制退出
    setTimeout(() => {
      logger.warn("system", "关停超时，强制退出");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// 直接运行时启动（兼容 npm run dev:server / tsx src/server/index.ts）
startServer(loadConfig(resolve(process.cwd(), "config.yaml")));

/**
 * HTTP 请求日志中间件
 * 记录每个请求的 method / path / statusCode / 耗时
 */
import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../services/logger.js";

/**
 * Express 中间件：记录 HTTP 请求日志
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const logger = getLogger();

  // 响应结束时记录
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // 跳过健康检查和日志接口自身的查询（避免噪音）
    if (req.path === "/api/health" || req.path.startsWith("/api/logs")) {
      return;
    }

    const meta = {
      method: req.method,
      path: req.path,
      status: statusCode,
      duration,
    };

    if (statusCode >= 500) {
      logger.error("http", `${req.method} ${req.path} → ${statusCode} | ${duration}ms`, meta);
    } else if (statusCode >= 400) {
      logger.warn("http", `${req.method} ${req.path} → ${statusCode} | ${duration}ms`, meta);
    } else {
      logger.info("http", `${req.method} ${req.path} → ${statusCode} | ${duration}ms`, meta);
    }
  });

  next();
}

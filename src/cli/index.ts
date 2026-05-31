#!/usr/bin/env node
/**
 * Doudou Agent — CLI 入口
 *
 * 命令结构：
 *   doudou serve [--port N]         启动 Express 服务
 *   doudou install [--port N]       安装为 macOS 系统服务
 *   doudou uninstall                卸载系统服务
 *   doudou status                   查看服务状态
 *   doudou logs [--lines N]         查看服务日志
 *   doudou chat [message]           终端对话
 *   doudou cron <subcommand>        定时任务管理
 *   doudou session <subcommand>     Session 管理
 *   doudou stats                    统计概览
 *   doudou config <subcommand>      配置管理
 */
import { Command } from "commander";
import { bold, dim } from "./lib/format.js";

const program = new Command();

program
  .name("doudou")
  .description("🐕 Doudou Agent — 基于 pi 框架的 AI Agent")
  .version("0.1.0");

// ===== serve =====
program
  .command("serve")
  .description("启动 Express HTTP 服务")
  .option("-p, --port <port>", "服务端口号", "3000")
  .action(async (opts) => {
    const { loadConfig } = await import("../server/services/config.js");
    const { startServer } = await import("../server/index.js");
    const config = loadConfig();
    if (opts.port) config.server.port = parseInt(opts.port, 10);
    startServer(config);
  });

// ===== install =====
program
  .command("install")
  .description("安装为 macOS 系统服务（launchd）")
  .option("-p, --port <port>", "服务端口号", "3000")
  .action(async (opts) => {
    const { installService } = await import("./commands/service.js");
    await installService(parseInt(opts.port, 10));
  });

// ===== uninstall =====
program
  .command("uninstall")
  .description("卸载 macOS 系统服务")
  .action(async () => {
    const { uninstallService } = await import("./commands/service.js");
    await uninstallService();
  });

// ===== status =====
program
  .command("status")
  .description("查看服务状态")
  .action(async () => {
    const { showStatus } = await import("./commands/service.js");
    await showStatus();
  });

// ===== logs =====
program
  .command("logs")
  .description("查看服务日志")
  .option("-n, --lines <n>", "显示行数", "50")
  .action(async (opts) => {
    const { showLogs } = await import("./commands/service.js");
    await showLogs(parseInt(opts.lines, 10));
  });

// ===== chat =====
const chatCmd = program
  .command("chat")
  .description("终端对话（直连 LLM）")
  .option("-s, --session <id>", "恢复已有 session")
  .option("-m, --model <id>", "指定模型")
  .argument("[message]", "单次对话消息（不传则进入交互模式）")
  .action(async (message: string | undefined, opts) => {
    const { runChatCommand } = await import("./commands/chat.js");
    await runChatCommand({ message, sessionId: opts.session, modelId: opts.model });
  });

// ===== cron =====
const cronCmd = program
  .command("cron")
  .description("定时任务管理");

cronCmd
  .command("list")
  .description("列出所有任务")
  .action(async () => {
    const { cronList } = await import("./commands/cron.js");
    await cronList();
  });

cronCmd
  .command("add")
  .description("创建任务（JSON 格式）")
  .argument("<json>", '任务 JSON，如 \'{"name":"x","prompt":"y","cron":"0 9 * * *","type":"recurring"}\'')
  .action(async (json: string) => {
    const { cronAdd } = await import("./commands/cron.js");
    await cronAdd(json);
  });

cronCmd
  .command("remove")
  .description("删除任务")
  .argument("<id>", "任务 ID")
  .action(async (id: string) => {
    const { cronRemove } = await import("./commands/cron.js");
    await cronRemove(id);
  });

cronCmd
  .command("trigger")
  .description("手动触发任务执行")
  .argument("<id>", "任务 ID")
  .action(async (id: string) => {
    const { cronTrigger } = await import("./commands/cron.js");
    await cronTrigger(id);
  });

cronCmd
  .command("enable")
  .description("启用任务")
  .argument("<id>", "任务 ID")
  .action(async (id: string) => {
    const { cronEnable } = await import("./commands/cron.js");
    await cronEnable(id);
  });

cronCmd
  .command("disable")
  .description("禁用任务")
  .argument("<id>", "任务 ID")
  .action(async (id: string) => {
    const { cronDisable } = await import("./commands/cron.js");
    await cronDisable(id);
  });

// ===== session =====
const sessionCmd = program
  .command("session")
  .description("Session 管理");

sessionCmd
  .command("list")
  .description("列出所有 session")
  .action(async () => {
    const { sessionList } = await import("./commands/session.js");
    await sessionList();
  });

sessionCmd
  .command("create")
  .description("创建新 session")
  .option("-t, --title <title>", "Session 标题")
  .action(async (opts) => {
    const { sessionCreate } = await import("./commands/session.js");
    await sessionCreate(opts.title);
  });

sessionCmd
  .command("delete")
  .description("删除 session")
  .argument("<id>", "Session ID")
  .action(async (id: string) => {
    const { sessionDelete } = await import("./commands/session.js");
    await sessionDelete(id);
  });

sessionCmd
  .command("export")
  .description("导出 session 消息为 JSON")
  .argument("<id>", "Session ID")
  .option("-o, --out <file>", "输出文件路径")
  .action(async (id: string, opts) => {
    const { sessionExport } = await import("./commands/session.js");
    await sessionExport(id, opts.out);
  });

// ===== stats =====
program
  .command("stats")
  .description("统计概览")
  .action(async () => {
    const { showStats } = await import("./commands/stats.js");
    await showStats();
  });

// ===== config =====
const configCmd = program
  .command("config")
  .description("配置管理");

configCmd
  .command("show")
  .description("显示当前配置")
  .action(async () => {
    const { configShow } = await import("./commands/config.js");
    await configShow();
  });

configCmd
  .command("set")
  .description("修改配置项")
  .argument("<key>", "配置键（如 llm.model）")
  .argument("<value>", "配置值")
  .action(async (key: string, value: string) => {
    const { configSet } = await import("./commands/config.js");
    await configSet(key, value);
  });

// 默认命令：不带子命令时等价于 serve
program
  .action(() => {
    console.log(bold("🐕 Doudou Agent v0.1.0"));
    console.log(dim("使用 --help 查看可用命令\n"));
    console.log("常用命令：");
    console.log("  doudou serve          启动 HTTP 服务");
    console.log("  doudou chat           终端对话");
    console.log("  doudou install        安装为系统服务");
    console.log("  doudou stats          统计概览");
    console.log("  doudou --help         查看所有命令");
  });

program.parse();

/**
 * 服务管理命令 — macOS launchd plist
 *
 * install   → 生成 plist → 写入 ~/Library/LaunchAgents/ → launchctl load
 * uninstall → launchctl unload → 删除 plist
 * status    → launchctl list com.doudou-agent
 * logs      → tail 日志文件
 * serve     → 启动 Express 服务（供 plist 调用）
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { success, error, warn, info, dim, bold } from "../lib/format.js";
import { createSpinner } from "../lib/spinner.js";

const LABEL = "com.doudou-agent";
const PLIST_NAME = `${LABEL}.plist`;
const LAUNCH_AGENTS_DIR = resolve(process.env.HOME || "~", "Library/LaunchAgents");
const PLIST_PATH = join(LAUNCH_AGENTS_DIR, PLIST_NAME);
const TEMPLATE_PATH = resolve(process.cwd(), "templates/com.doudou-agent.plist");

/**
 * 检测 node 可执行文件路径
 */
function detectNodePath(): string {
  try {
    return execSync("which node", { encoding: "utf-8" }).trim();
  } catch {
    // fallback 常见路径
    const fallbacks = [
      "/usr/local/bin/node",
      "/opt/homebrew/bin/node",
      process.execPath, // 当前运行的 node
    ];
    for (const p of fallbacks) {
      if (existsSync(p)) return p;
    }
    return process.execPath;
  }
}

/**
 * 生成 plist 内容（替换模板变量）
 */
function generatePlist(port: number): string {
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`plist 模板不存在: ${TEMPLATE_PATH}`);
  }

  let template = readFileSync(TEMPLATE_PATH, "utf-8");
  const nodePath = detectNodePath();
  const projectDir = process.cwd();

  template = template.replace(/\{NODE_PATH\}/g, nodePath);
  template = template.replace(/\{PROJECT_DIR\}/g, projectDir);

  return template;
}

/**
 * 检查服务是否已加载
 */
function isLoaded(): boolean {
  try {
    const output = execSync(`launchctl list ${LABEL}`, { encoding: "utf-8" });
    return output.includes(LABEL);
  } catch {
    return false;
  }
}

/**
 * 获取服务 PID（未运行返回 null）
 */
function getPid(): number | null {
  try {
    const output = execSync(`launchctl list ${LABEL}`, { encoding: "utf-8" });
    const match = output.match(/"PID"\s*=\s*(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

// ===== 命令实现 =====

/**
 * 安装为 macOS 系统服务
 */
export async function installService(port: number): Promise<void> {
  const spinner = createSpinner("正在安装服务...");

  try {
    spinner.start();

    // 1. 构建项目
    spinner.text = "正在编译项目...";
    execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });

    // 2. 确保 LaunchAgents 目录存在
    mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });

    // 3. 如果已加载，先卸载
    if (isLoaded()) {
      spinner.text = "正在卸载旧服务...";
      execSync(`launchctl unload ${PLIST_PATH}`, { stdio: "pipe" });
    }

    // 4. 生成 plist 并写入
    spinner.text = "正在生成 plist...";
    const plistContent = generatePlist(port);
    writeFileSync(PLIST_PATH, plistContent, "utf-8");

    // 5. 加载服务
    spinner.text = "正在加载服务...";
    execSync(`launchctl load ${PLIST_PATH}`, { stdio: "pipe" });

    spinner.succeed(success("服务安装成功！"));

    console.log("");
    console.log(`  ${dim("Label:")}    ${LABEL}`);
    console.log(`  ${dim("Plist:")}   ${PLIST_PATH}`);
    console.log(`  ${dim("Node:")}    ${detectNodePath()}`);
    console.log(`  ${dim("项目目录:")} ${process.cwd()}`);
    console.log("");
    console.log(`  ${dim("常用命令：")}`);
    console.log(`    doudou status     查看状态`);
    console.log(`    doudou logs       查看日志`);
    console.log(`    doudou uninstall  卸载服务`);
  } catch (err: any) {
    spinner.fail(error("服务安装失败"));
    console.error(`  ${dim(err.message)}`);
    process.exit(1);
  }
}

/**
 * 卸载系统服务
 */
export async function uninstallService(): Promise<void> {
  const spinner = createSpinner("正在卸载服务...");

  try {
    spinner.start();

    if (isLoaded()) {
      execSync(`launchctl unload ${PLIST_PATH}`, { stdio: "pipe" });
    }

    if (existsSync(PLIST_PATH)) {
      unlinkSync(PLIST_PATH);
    }

    spinner.succeed(success("服务已卸载"));
  } catch (err: any) {
    spinner.fail(error("卸载失败"));
    console.error(`  ${dim(err.message)}`);
    process.exit(1);
  }
}

/**
 * 查看服务状态
 */
export async function showStatus(): Promise<void> {
  console.log(bold("🐕 Doudou Agent 服务状态\n"));

  // plist 是否存在
  const plistExists = existsSync(PLIST_PATH);
  console.log(`  ${dim("Plist 文件:")}  ${plistExists ? success("✓ 已安装") : warn("✗ 未安装")} ${dim(PLIST_PATH)}`);

  if (!plistExists) {
    console.log(`\n  ${dim("使用 doudou install 安装服务")}`);
    return;
  }

  // 是否已加载
  const loaded = isLoaded();
  console.log(`  ${dim("服务状态:")}    ${loaded ? success("● 已加载") : warn("○ 未加载")}`);

  // PID
  const pid = getPid();
  if (pid) {
    console.log(`  ${dim("PID:")}        ${pid}`);
  }

  // 日志文件
  const stdoutLog = join(process.cwd(), "logs/launchd-stdout.log");
  const stderrLog = join(process.cwd(), "logs/launchd-stderr.log");
  console.log(`  ${dim("标准输出:")}    ${existsSync(stdoutLog) ? stdoutLog : dim("(无)")}`);
  console.log(`  ${dim("错误输出:")}    ${existsSync(stderrLog) ? stderrLog : dim("(无)")}`);
}

/**
 * 查看服务日志
 */
export async function showLogs(lines: number): Promise<void> {
  const stdoutLog = join(process.cwd(), "logs/launchd-stdout.log");
  const stderrLog = join(process.cwd(), "logs/launchd-stderr.log");

  if (!existsSync(stdoutLog) && !existsSync(stderrLog)) {
    console.log(warn("日志文件不存在，请先安装并启动服务"));
    return;
  }

  if (existsSync(stdoutLog)) {
    console.log(bold(`\n=== 标准输出（最近 ${lines} 行）===\n`));
    try {
      const output = execSync(`tail -n ${lines} "${stdoutLog}"`, { encoding: "utf-8" });
      console.log(output);
    } catch {
      console.log(dim("(读取失败)"));
    }
  }

  if (existsSync(stderrLog)) {
    const stat = execSync(`wc -l < "${stderrLog}"`, { encoding: "utf-8" }).trim();
    if (parseInt(stat, 10) > 0) {
      console.log(bold(`\n=== 错误输出（最近 ${lines} 行）===\n`));
      try {
        const output = execSync(`tail -n ${lines} "${stderrLog}"`, { encoding: "utf-8" });
        console.log(output);
      } catch {
        console.log(dim("(读取失败)"));
      }
    }
  }
}

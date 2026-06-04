/**
 * 从 config.yaml 读取 client/server 端口，输出 shell 变量赋值
 * 用法：eval "$(node scripts/resolve-ports.mjs)"
 * 或在 package.json 中：node scripts/resolve-ports.mjs && cross-env ...
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

const configPath = resolve(process.cwd(), "config.yaml");
let clientPort = 5173;
let serverPort = 3000;

if (existsSync(configPath)) {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw);
  clientPort = parsed?.client?.port || 5173;
  serverPort = parsed?.server?.port || 3000;
}

// 输出环境变量赋值（供 shell eval 使用）
console.log(`VITE_CLIENT_PORT=${clientPort}`);
console.log(`VITE_SERVER_PORT=${serverPort}`);

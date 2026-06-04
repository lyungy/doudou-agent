/**
 * 启动前端 dev server，从 config.yaml 读取 client/server 端口并注入环境变量
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const configPath = resolve(root, "config.yaml");
let clientPort = 5173;
let serverPort = 3000;

if (existsSync(configPath)) {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw);
  clientPort = parsed?.client?.port || 5173;
  serverPort = parsed?.server?.port || 3000;
}

const env = {
  ...process.env,
  VITE_CLIENT_PORT: String(clientPort),
  VITE_SERVER_PORT: String(serverPort),
};

const args = ["--config", resolve(root, "src/client/vite.config.ts")];
const child = spawn("npx", ["vite", ...args], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));

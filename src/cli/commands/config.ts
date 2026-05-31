/**
 * config 命令 — 配置查看/修改（直调 config service）
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";
import { initCLI, getInitializedConfig } from "../lib/init.js";
import { bold, success, error, dim, warn, maskApiKey, printTable } from "../lib/format.js";

/**
 * 显示当前配置（脱敏）
 */
export async function configShow(): Promise<void> {
  const config = initCLI();

  console.log(bold("\n⚙️  当前配置\n"));

  const headers = ["配置项", "值"];
  const rows = [
    ["LLM Provider", config.llm.provider],
    ["API Base URL", config.llm.base_url],
    ["API Key", maskApiKey(config.llm.api_key)],
    ["Temperature", String(config.llm.temperature ?? "默认")],
    ["Thinking Level", config.llm.thinking_level],
    ["Server Port", String(config.server.port)],
    ["数据目录", config.storage.data_dir],
    ["日志目录", config.logging.dir],
    ["日志级别", config.logging.level],
    ["日志保留天数", String(config.logging.max_days)],
  ];

  printTable(headers, rows);

  // 模型列表
  console.log(bold("\n📦 模型列表\n"));
  const modelHeaders = ["ID", "名称", "Reasoning", "Max Tokens"];
  const modelRows = config.llm.models.map((m) => [
    m.id,
    m.name,
    m.reasoning ? "✓" : "-",
    String(m.maxTokens || 4096),
  ]);
  printTable(modelHeaders, modelRows);

  console.log("");
}

/**
 * 修改配置项
 * 支持的 key 格式：llm.model, llm.api_key, server.port 等
 */
export async function configSet(key: string, value: string): Promise<void> {
  initCLI();
  const configPath = resolve(process.cwd(), "config.yaml");

  if (!existsSync(configPath)) {
    console.log(error(`配置文件不存在: ${configPath}`));
    process.exit(1);
  }

  // 读取原始 YAML
  const raw = readFileSync(configPath, "utf-8");
  const config = yaml.load(raw) as any;

  // 解析 key 路径（如 "llm.model" → config.llm.model）
  const parts = key.split(".");
  if (parts.length < 2) {
    console.log(error("配置键格式错误，应为 如 llm.model, server.port"));
    process.exit(1);
  }

  // 遍历设置值
  let target = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]]) {
      target[parts[i]] = {};
    }
    target = target[parts[i]];
  }

  const lastKey = parts[parts.length - 1];

  // 类型转换
  let typedValue: any = value;
  if (value === "true") typedValue = true;
  else if (value === "false") typedValue = false;
  else if (/^\d+$/.test(value)) typedValue = parseInt(value, 10);
  else if (/^\d+\.\d+$/.test(value)) typedValue = parseFloat(value);

  const oldValue = target[lastKey];
  target[lastKey] = typedValue;

  // 写回 YAML
  writeFileSync(configPath, yaml.dump(config, { lineWidth: 120 }), "utf-8");

  console.log(success(`✓ 配置已修改`));
  console.log(dim(`  ${key}: ${oldValue} → ${typedValue}`));
  console.log(warn(`\n⚠️  重启服务后生效: doudou restart`));
}

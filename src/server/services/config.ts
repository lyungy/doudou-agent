/**
 * 配置服务：解析 config.yaml，构造 pi-ai Model 对象
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";
import type { Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

/** 单个模型定义 */
export interface ModelDef {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

/** 思考等级类型 */
export type { ThinkingLevel };

/** LLM 共享配置（api_key、base_url 等） */
export interface LLMConfig {
  provider: string;
  api_key: string;
  base_url: string;
  temperature?: number;
  thinking_level: ThinkingLevel;
  models: ModelDef[];
}

/** 存储配置 */
export interface StorageConfig {
  data_dir: string;
}

/** 服务器配置 */
export interface ServerConfig {
  port: number;
}

/** 日志配置 */
export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  dir: string;          // 日志文件目录
  max_days: number;     // 保留天数
}

/** 完整配置 */
export interface AppConfig {
  llm: LLMConfig;
  storage: StorageConfig;
  server: ServerConfig;
  logging: LoggingConfig;
}

/** 默认配置路径 */
const DEFAULT_CONFIG_PATH = resolve(process.cwd(), "config.yaml");

/** 当前配置缓存 */
let currentConfig: AppConfig | null = null;
let configPath: string = DEFAULT_CONFIG_PATH;

/**
 * 加载配置文件
 */
export function loadConfig(path?: string): AppConfig {
  const filePath = path || DEFAULT_CONFIG_PATH;
  configPath = filePath;

  if (!existsSync(filePath)) {
    throw new Error(`配置文件不存在: ${filePath}`);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as any;

  if (!parsed.llm) {
    throw new Error("配置文件缺少 llm 配置段");
  }

  const llm = parsed.llm;

  // 兼容旧格式：单 model 字段 → 自动转为 models 列表
  let models: ModelDef[] = [];
  if (llm.models && Array.isArray(llm.models)) {
    models = llm.models;
  } else if (llm.model) {
    // 旧格式兼容
    models = [{
      id: llm.model,
      name: llm.model,
      reasoning: llm.reasoning,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: llm.max_tokens || 4096,
    }];
  }

  // 验证 thinking_level 合法性
  const validLevels: string[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const thinkingLevel = llm.thinking_level || "off";
  if (!validLevels.includes(thinkingLevel)) {
    throw new Error(`无效的 thinking_level: ${thinkingLevel}，可选值: ${validLevels.join(", ")}`);
  }

  const config: AppConfig = {
    llm: {
      provider: llm.provider || "openai",
      api_key: llm.api_key,
      base_url: llm.base_url || "https://api.openai.com/v1",
      temperature: llm.temperature,
      thinking_level: thinkingLevel as ThinkingLevel,
      models,
    },
    storage: {
      data_dir: parsed.storage?.data_dir || "./.doudou",
    },
    server: {
      port: parsed.server?.port || 3000,
    },
    logging: {
      level: parsed.logging?.level || "info",
      dir: parsed.logging?.dir || "./logs",
      max_days: parsed.logging?.max_days || 7,
    },
  };

  currentConfig = config;
  return config;
}

/**
 * 获取当前配置（如果未加载则先加载）
 */
export function getConfig(): AppConfig {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}

/**
 * 保存配置到文件
 */
export function saveConfig(config: AppConfig): void {
  const data = {
    llm: config.llm,
    server: config.server,
  };
  writeFileSync(configPath, yaml.dump(data), "utf-8");
  currentConfig = config;
}

/**
 * 根据模型定义构造 pi-ai Model 对象
 */
export function createModelFromDef(
  def: ModelDef,
  shared: { provider: string; base_url: string }
): Model<"openai-completions"> {
  return {
    id: def.id,
    name: def.name,
    api: "openai-completions",
    provider: shared.provider,
    baseUrl: shared.base_url,
    reasoning: def.reasoning || false,
    input: (def.input || ["text"]) as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: def.contextWindow || 128000,
    maxTokens: def.maxTokens || 4096,
  };
}

/**
 * 根据 modelId 获取 Model 对象，找不到则用第一个
 */
export function getModelById(modelId?: string): Model<"openai-completions"> {
  const config = getConfig();
  const def = modelId
    ? config.llm.models.find((m) => m.id === modelId)
    : config.llm.models[0];

  if (!def) {
    throw new Error(`模型 ${modelId} 不存在`);
  }

  return createModelFromDef(def, {
    provider: config.llm.provider,
    base_url: config.llm.base_url,
  });
}

/**
 * 获取所有可用模型列表
 */
export function listModels(): ModelDef[] {
  return getConfig().llm.models;
}

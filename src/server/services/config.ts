/**
 * 配置服务：解析 config.yaml（providers 多模型配置），构造 pi-ai Model 对象
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";
import type { Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

// ============ 类型定义 ============

/** 单个模型定义（携带所属 provider 信息） */
export interface ModelDef {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  // 所属 provider 的连接信息
  provider: string;       // API 协议（如 "openai"）
  apiKey: string;
  baseUrl: string;
  providerName: string;   // 显示用的 provider 名称
}

/** Provider 配置 */
export interface ProviderConfig {
  name: string;
  provider: string;
  api_key: string;
  base_url: string;
  models: Array<{
    id: string;
    name: string;
    reasoning?: boolean;
    input?: string[];
    contextWindow?: number;
    maxTokens?: number;
  }>;
}

/** 思考等级类型 */
export type { ThinkingLevel };

/** LLM 配置 */
export interface LLMConfig {
  temperature?: number;
  thinking_level: ThinkingLevel;
  providers: ProviderConfig[];
}

/** 存储配置 */
export interface StorageConfig {
  data_dir: string;
}

/** 服务器配置 */
export interface ServerConfig {
  port: number;
}

/** 客户端配置 */
export interface ClientConfig {
  port: number;
}

/** 日志配置 */
export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  dir: string;
  max_days: number;
}

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 执行超时（秒），0=禁用 */
  timeout: number;
}

/** 上下文配置 */
export interface ContextConfig {
  /** 历史消息截断的 token 预算上限 */
  max_context_tokens: number;
}

/** 完整配置 */
export interface AppConfig {
  llm: LLMConfig;
  storage: StorageConfig;
  server: ServerConfig;
  client: ClientConfig;
  logging: LoggingConfig;
  context: ContextConfig;
  agent: AgentConfig;
}

// ============ 加载逻辑 ============

const DEFAULT_CONFIG_PATH = resolve(process.cwd(), "config.yaml");
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

  if (!llm.providers || !Array.isArray(llm.providers) || llm.providers.length === 0) {
    throw new Error("配置文件缺少 llm.providers 数组，或数组为空");
  }

  // 验证每个 provider
  for (const p of llm.providers) {
    if (!p.name) throw new Error("provider 缺少 name");
    if (!p.api_key) throw new Error(`provider "${p.name}" 缺少 api_key`);
    if (!p.base_url) throw new Error(`provider "${p.name}" 缺少 base_url`);
    if (!p.models || !Array.isArray(p.models) || p.models.length === 0) {
      throw new Error(`provider "${p.name}" 缺少 models 数组，或数组为空`);
    }
    for (const m of p.models) {
      if (!m.id) throw new Error(`provider "${p.name}" 中存在缺少 id 的模型`);
    }
  }

  // 验证 thinking_level
  const validLevels: string[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const thinkingLevel = llm.thinking_level || "off";
  if (!validLevels.includes(thinkingLevel)) {
    throw new Error(`无效的 thinking_level: ${thinkingLevel}，可选值: ${validLevels.join(", ")}`);
  }

  const config: AppConfig = {
    llm: {
      temperature: llm.temperature,
      thinking_level: thinkingLevel as ThinkingLevel,
      providers: llm.providers,
    },
    storage: {
      data_dir: parsed.storage?.data_dir || "./.doudou",
    },
    server: {
      port: parsed.server?.port || 3000,
    },
    client: {
      port: parsed.client?.port || 5173,
    },
    logging: {
      level: parsed.logging?.level || "info",
      dir: parsed.logging?.dir || "./logs",
      max_days: parsed.logging?.max_days || 7,
    },
    context: {
      max_context_tokens: parsed.context?.max_context_tokens || 50000,
    },
    agent: {
      timeout: parsed.agent?.timeout ?? 300,
    },
  };

  currentConfig = config;
  return config;
}

/**
 * 获取当前配置（未加载则先加载）
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
    llm: {
      thinking_level: config.llm.thinking_level,
      temperature: config.llm.temperature,
      providers: config.llm.providers,
    },
    server: config.server,
    client: config.client,
    storage: config.storage,
    logging: config.logging,
    context: config.context,
    agent: config.agent,
  };
  writeFileSync(configPath, yaml.dump(data, { lineWidth: 120 }), "utf-8");
  currentConfig = config;
}

// ============ 模型操作 ============

/**
 * 获取所有可用模型列表（扁平化，携带 provider 信息）
 */
export function listModels(): ModelDef[] {
  const config = getConfig();
  const models: ModelDef[] = [];

  for (const p of config.llm.providers) {
    for (const m of p.models) {
      models.push({
        id: m.id,
        name: m.name,
        reasoning: m.reasoning,
        input: m.input,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        provider: p.provider || "openai",
        apiKey: p.api_key,
        baseUrl: p.base_url,
        providerName: p.name,
      });
    }
  }

  return models;
}

/**
 * 根据 modelId 获取 Model 对象
 */
export function getModelById(modelId?: string): Model<"openai-completions"> {
  const models = listModels();
  const def = modelId
    ? models.find((m) => m.id === modelId)
    : models[0];

  if (!def) {
    throw new Error(`模型 ${modelId} 不存在，请检查 config.yaml 中的 providers 配置`);
  }

  return {
    id: def.id,
    name: def.name,
    api: "openai-completions",
    provider: def.provider,
    baseUrl: def.baseUrl,
    reasoning: def.reasoning || false,
    input: (def.input || ["text"]) as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: def.contextWindow || 128000,
    maxTokens: def.maxTokens || 4096,
  };
}

/**
 * 根据 modelId 获取对应的 apiKey
 */
export function getApiKeyByModelId(modelId?: string): string {
  const models = listModels();
  const def = modelId
    ? models.find((m) => m.id === modelId)
    : models[0];

  if (!def) {
    throw new Error(`模型 ${modelId} 不存在`);
  }

  return def.apiKey;
}

// ============ 系统提示词 (AGENT.md) ============

const AGENT_MD_PATH = resolve(process.cwd(), "AGENT.md");

export function readSystemPrompt(): string {
  if (existsSync(AGENT_MD_PATH)) {
    return readFileSync(AGENT_MD_PATH, "utf-8");
  }
  return "";
}

export function writeSystemPrompt(content: string): void {
  writeFileSync(AGENT_MD_PATH, content, "utf-8");
}

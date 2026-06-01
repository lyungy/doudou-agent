/**
 * 模板服务：管理提示词模板（DB 元数据 + .md 文件内容）
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "fs";
import { resolve, isAbsolute } from "path";
import { getDb } from "./session.js";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";

/** 模板元数据 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  filePath: string;
  category: string;
  enabled: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 带内容的模板 */
export interface PromptTemplateWithContent extends PromptTemplate {
  content: string;
}

/** 数据目录下的 templates 子目录 */
function getTemplatesDir(): string {
  const config = getConfig();
  const raw = config.storage.data_dir;
  const dataDir = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  return resolve(dataDir, "templates");
}

/** 确保 templates 目录存在 */
export function ensureTemplatesDir(): void {
  const dir = getTemplatesDir();
  mkdirSync(dir, { recursive: true });
}

// ============ 内置模板定义 ============

interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  fileName: string;
  category: string;
  sortOrder: number;
  content: string;
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "builtin-coding",
    name: "写代码",
    description: "帮你实现功能代码",
    icon: "💻",
    fileName: "coding.md",
    category: "开发",
    sortOrder: 0,
    content: `# 写代码

你是一个高级软件工程师，擅长编写高质量、可维护的代码。

## 你的能力
- 精通多种编程语言（JavaScript/TypeScript、Python、Go、Java 等）
- 熟悉主流框架和最佳实践
- 注重代码规范、错误处理和性能优化

## 工作方式
1. 先理解需求，确认不清楚的细节
2. 给出实现方案（关键设计说明）
3. 编写完整可运行的代码
4. 必要时附带使用示例

## 输出要求
- 代码注释用中文
- 关键逻辑加注释说明
- 如有多种实现方式，简要说明选择理由
- 涉及外部依赖时说明安装方式

---

请描述你需要实现的功能，我来帮你写代码：
`,
  },
  {
    id: "builtin-debug",
    name: "查 Bug",
    description: "分析和修复代码问题",
    icon: "🐛",
    fileName: "debug.md",
    category: "开发",
    sortOrder: 1,
    content: `# 查 Bug

你是一个资深代码调试专家，擅长定位和修复各类代码问题。

## 你的能力
- 快速阅读和理解代码逻辑
- 定位 bug 根因（不只是表面现象）
- 给出修复方案并解释原因
- 识别潜在的同类问题

## 分析流程
1. **复现描述**：理解问题的表现和触发条件
2. **代码分析**：逐行检查相关代码，标记可疑点
3. **根因定位**：确定 bug 的根本原因
4. **修复方案**：给出具体的代码修改
5. **预防建议**：说明如何避免类似问题

## 输出要求
- 先给出结论（bug 在哪、什么原因）
- 再给出详细分析过程
- 提供修复后的代码
- 如有同类风险一并指出

---

请贴上相关代码和问题描述，我来帮你排查：
`,
  },
  {
    id: "builtin-docs",
    name: "写文档",
    description: "生成技术文档",
    icon: "📝",
    fileName: "docs.md",
    category: "文档",
    sortOrder: 2,
    content: `# 写文档

你是一个技术写作专家，擅长编写清晰、结构化的技术文档。

## 你的能力
- API 文档、README、设计文档、用户指南
- 技术方案评审文档
- 代码注释和 JSDoc 生成
- Markdown 格式排版

## 文档类型
- **API 文档**：接口路径、参数、返回值、示例
- **设计文档**：背景、方案、架构图、数据流
- **用户指南**：安装、配置、使用步骤、常见问题
- **README**：项目介绍、快速开始、目录结构

## 输出要求
- 结构清晰，有目录层级
- 关键信息用表格或列表呈现
- 代码示例用代码块包裹
- 适当使用 emoji 增加可读性
- 保持专业但不晦涩的表达

---

请告诉我需要写什么类型的文档，以及相关信息：
`,
  },
  {
    id: "builtin-explain",
    name: "解释代码",
    description: "理解代码逻辑和原理",
    icon: "🔍",
    fileName: "explain.md",
    category: "开发",
    sortOrder: 3,
    content: `# 解释代码

你是一个编程导师，擅长用通俗易懂的方式解释代码逻辑。

## 你的能力
- 逐行解读代码执行流程
- 解释设计模式和架构思想
- 说明关键算法的原理
- 标注容易踩坑的地方

## 解释方式
1. **整体概述**：这段代码做了什么（一句话总结）
2. **执行流程**：按调用链逐步解释
3. **关键细节**：重点说明核心逻辑和巧妙之处
4. **相关概念**：涉及的设计模式、算法、API 等
5. **改进建议**：如有可优化的地方一并指出

## 输出要求
- 先给全局视角，再深入细节
- 用类比帮助理解抽象概念
- 关键变量和函数名加标注
- 如有流程图或数据流描述更佳

---

请贴上需要解释的代码：
`,
  },
  {
    id: "builtin-optimize",
    name: "优化建议",
    description: "代码重构和性能优化",
    icon: "🎨",
    fileName: "optimize.md",
    category: "开发",
    sortOrder: 4,
    content: `# 优化建议

你是一个代码质量专家，擅长代码重构和性能优化。

## 你的能力
- 识别代码坏味道（Code Smell）
- 提出重构方案（保持行为不变）
- 性能瓶颈分析和优化
- 安全漏洞识别

## 分析维度
1. **可读性**：命名、结构、注释、复杂度
2. **可维护性**：耦合度、重复代码、职责划分
3. **性能**：时间/空间复杂度、N+1 查询、内存泄漏
4. **安全性**：注入、XSS、敏感信息泄露
5. **健壮性**：错误处理、边界条件、并发安全

## 输出要求
- 按优先级排列问题（P0 最严重）
- 每个问题说明：是什么 → 为什么是问题 → 怎么改
- 提供优化后的代码
- 如有性能对比数据更佳

---

请贴上需要优化的代码：
`,
  },
  {
    id: "builtin-analyze",
    name: "数据分析",
    description: "分析数据趋势和规律",
    icon: "📊",
    fileName: "analyze.md",
    category: "分析",
    sortOrder: 5,
    content: `# 数据分析

你是一个数据分析师，擅长从数据中发现规律和洞察。

## 你的能力
- 数据清洗和预处理建议
- 统计分析（描述性统计、相关性、回归等）
- 趋势分析和异常检测
- 数据可视化方案建议

## 分析流程
1. **数据概览**：数据结构、字段含义、数据量
2. **数据质量**：缺失值、异常值、重复数据
3. **探索分析**：分布、趋势、相关性
4. **关键发现**：核心洞察和结论
5. **行动建议**：基于数据的可执行建议

## 输出要求
- 用表格展示关键数据
- 用文字描述趋势和规律
- 如有图表建议说明用什么类型的图表
- 结论要有数据支撑，不做主观臆断

---

请提供需要分析的数据或描述数据情况：
`,
  },
];

// ============ 初始化 ============

/**
 * 初始化内置模板（首次启动时：创建 .md 文件 + 写入数据库）
 * 已有数据时跳过
 */
export function initTemplates(): void {
  const db = getDb();
  const templatesDir = getTemplatesDir();

  // 确保目录存在
  mkdirSync(templatesDir, { recursive: true });

  // 检查数据库是否已有模板
  const count = (db.prepare("SELECT COUNT(*) as c FROM prompt_templates").get() as any).c;
  if (count > 0) {
    // 已有数据，检查缺失的 .md 文件并补建
    const rows = db.prepare("SELECT * FROM prompt_templates").all() as any[];
    for (const row of rows) {
      if (row.file_path) {
        const fullPath = resolve(templatesDir, row.file_path);
        if (!existsSync(fullPath)) {
          // 文件缺失，创建空文件（用户可后续编辑）
          writeFileSync(fullPath, `# ${row.name}\n\n请在这里编写提示词内容。\n`, "utf-8");
          getLogger().info("system", `补建缺失的模板文件: ${row.file_path}`);
        }
      }
    }
    return;
  }

  // 首次初始化：创建 .md 文件 + 写入数据库
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO prompt_templates (id, name, description, icon, file_path, category, enabled, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  for (const tpl of BUILTIN_TEMPLATES) {
    // 写 .md 文件
    const fullPath = resolve(templatesDir, tpl.fileName);
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, tpl.content, "utf-8");
    }

    // 写数据库
    insert.run(tpl.id, tpl.name, tpl.description, tpl.icon, tpl.fileName, tpl.category, tpl.sortOrder, now, now);
  }

  getLogger().info("system", `已初始化 ${BUILTIN_TEMPLATES.length} 个内置模板`);
}

// ============ CRUD ============

/** 获取所有模板 */
export function listTemplates(enabledOnly = false): PromptTemplate[] {
  const db = getDb();
  const sql = enabledOnly
    ? "SELECT * FROM prompt_templates WHERE enabled = 1 ORDER BY sort_order ASC"
    : "SELECT * FROM prompt_templates ORDER BY sort_order ASC";
  const rows = db.prepare(sql).all() as any[];
  return rows.map(rowToTemplate);
}

/** 获取单个模板（含 .md 内容） */
export function getTemplate(id: string): PromptTemplateWithContent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(id) as any;
  if (!row) return null;

  const tpl = rowToTemplate(row);
  const content = readTemplateContent(tpl.filePath);
  return { ...tpl, content };
}

/** 创建模板 */
export function createTemplate(input: {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: string;
}): PromptTemplateWithContent {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fileName = `${id}.md`;
  const templatesDir = getTemplatesDir();

  // 写 .md 文件
  const content = input.content || `# ${input.name}\n\n请在这里编写提示词内容。\n`;
  writeFileSync(resolve(templatesDir, fileName), content, "utf-8");

  // 获取当前最大 sort_order
  const maxRow = db.prepare("SELECT MAX(sort_order) as m FROM prompt_templates").get() as any;
  const sortOrder = (maxRow?.m ?? -1) + 1;

  // 写数据库
  db.prepare(`
    INSERT INTO prompt_templates (id, name, description, icon, file_path, category, enabled, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, input.name, input.description || "", input.icon || "📝", fileName, input.category || "通用", sortOrder, now, now);

  getLogger().info("system", `创建模板: ${input.name} (${id})`);

  return {
    id,
    name: input.name,
    description: input.description || "",
    icon: input.icon || "📝",
    filePath: fileName,
    category: input.category || "通用",
    enabled: 1,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    content,
  };
}

/** 更新模板 */
export function updateTemplate(id: string, input: {
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  content?: string;
  sortOrder?: number;
}): PromptTemplateWithContent | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(id) as any;
  if (!existing) return null;

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const values: any[] = [now];

  if (input.name !== undefined) { sets.push("name = ?"); values.push(input.name); }
  if (input.description !== undefined) { sets.push("description = ?"); values.push(input.description); }
  if (input.icon !== undefined) { sets.push("icon = ?"); values.push(input.icon); }
  if (input.category !== undefined) { sets.push("category = ?"); values.push(input.category); }
  if (input.sortOrder !== undefined) { sets.push("sort_order = ?"); values.push(input.sortOrder); }

  values.push(id);
  db.prepare(`UPDATE prompt_templates SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  // 更新 .md 文件内容
  if (input.content !== undefined) {
    const filePath = existing.file_path;
    if (filePath) {
      const templatesDir = getTemplatesDir();
      writeFileSync(resolve(templatesDir, filePath), input.content, "utf-8");
    }
  }

  getLogger().info("system", `更新模板: ${id}`);
  return getTemplate(id);
}

/** 删除模板 */
export function deleteTemplate(id: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(id) as any;
  if (!row) return false;

  // 删除 .md 文件
  if (row.file_path) {
    try {
      const fullPath = resolve(getTemplatesDir(), row.file_path);
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch {
      // 文件删除失败不影响主流程
    }
  }

  // 删除数据库记录
  db.prepare("DELETE FROM prompt_templates WHERE id = ?").run(id);
  getLogger().info("system", `删除模板: ${row.name} (${id})`);
  return true;
}

/** 启用/禁用模板 */
export function toggleTemplate(id: string, enabled: boolean): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE prompt_templates SET enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, now, id);
  return result.changes > 0;
}

// ============ 内部工具 ============

function rowToTemplate(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    icon: row.icon || "📝",
    filePath: row.file_path || "",
    category: row.category || "通用",
    enabled: row.enabled ?? 1,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 读取 .md 文件内容 */
function readTemplateContent(filePath: string): string {
  if (!filePath) return "";
  try {
    const templatesDir = getTemplatesDir();
    return readFileSync(resolve(templatesDir, filePath), "utf-8");
  } catch {
    return "";
  }
}

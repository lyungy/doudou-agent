# Doudou Agent 🐕

基于 [pi](https://pi.dev) 框架的 AI Agent Web 应用。支持 OpenAI 格式的任意 LLM 接入，提供流式对话、工具调用可视化、Session 管理、定时任务等能力。

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

---

## ✨ 功能特性

- 🔗 **多模型接入** — 支持 OpenAI、DeepSeek、Moonshot、Ollama 等所有 OpenAI 兼容 API
- 💬 **流式对话** — SSE 实时流式输出，逐字显示回复
- 🧠 **Thinking 可视化** — 支持模型思考过程展示（如 DeepSeek R1）
- 🛠️ **工具调用** — 内置文件读写、命令执行、文本搜索等 6 个工具，支持可视化调用过程
- 🖼️ **多模态支持** — 图片粘贴/拖拽/上传，自动压缩，模型能力检测，点击放大查看
- 📂 **Session 管理** — 多对话切换、持久化存储、历史回放
- ⏰ **定时任务** — Cron 调度 + LLM 驱动执行，支持一次性/循环任务、超时控制
- 📋 **结构化日志** — 系统日志 + LLM 请求追踪 + 任务执行日志，按天滚动
- 📝 **Markdown 渲染** — AI 回复支持完整 Markdown 渲染 + 代码块一键复制
- 🖥️ **CLI 工具** — 终端直连 LLM 对话、服务管理、Session/任务/配置管理
- 🍎 **macOS 服务化** — launchd plist 一键安装，开机自启、进程守护
- ⚡ **开箱即用** — 配置文件写好 API Key 即可运行

## 📸 界面预览

```
┌──────────────────────────────────────────────────┐
│ 左侧导航栏                │  右侧内容区           │
│                          │                      │
│  [+ 新建对话]            │  ┌──────────────────┐ │
│  ────────────────        │  │ 🐕 Doudou Agent  │ │
│                          │  │       [模型选择器] │ │
│  🏠  首页                │  ├──────────────────┤ │
│                          │  │                  │ │
│  💬  会话           ▾   │  │  消息列表         │ │
│    │ 💬 对话1           │  │  [用户消息]       │ │
│    │ 💬 对话2           │  │  [AI 回复]        │ │
│    │ 💬 对话3           │  │  [Tool 调用卡片]  │ │
│                          │  │  [Thinking 块]   │ │
│  ⏰  定时任务            │  │                  │ │
│                          │  │  [输入框]         │ │
│  📋  日志           ▾   │  └──────────────────┘ │
│    │ 📊 系统日志         │                      │
│    │ 📝 任务日志         │                      │
│                          │                      │
│  v0.1.0                  │                      │
└──────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

- Node.js >= 20
- npm >= 9

### 1. 安装依赖

```bash
git clone https://github.com/your-username/doudou-agent.git
cd doudou-agent
npm install
```

### 2. 配置 LLM

复制示例配置并填入你的 API Key：

```bash
cp config.yaml.example config.yaml
```

```yaml
llm:
  thinking_level: medium
  temperature: 0.7
  providers:
    - name: DeepSeek
      provider: openai
      api_key: sk-your-api-key-here
      base_url: https://api.deepseek.com/v1
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          reasoning: false
          input: ["text"]
          contextWindow: 64000
          maxTokens: 4096

storage:
  data_dir: ./.doudou

server:
  port: 3000

client:
  port: 5173              # 前端 dev server 端口

logging:
  level: info
  dir: ./logs
  max_days: 7
```

### 3. 启动

```bash
# 开发模式（前后端同时启动）
npm run dev

# 或分别启动
npm run dev:server   # 后端 http://localhost:3000
npm run dev:client   # 前端 http://localhost:5173
```

打开浏览器访问 `http://localhost:5173`，开始对话。

### 4. CLI 命令行

```bash
# 终端直连 LLM 对话（不经 Express，直接调用）
npx tsx src/cli/index.ts chat "你好"
npx tsx src/cli/index.ts chat              # 交互模式

# 查看统计
npx tsx src/cli/index.ts stats

# Session 管理
npx tsx src/cli/index.ts session list

# 定时任务
npx tsx src/cli/index.ts cron list

# 配置查看
npx tsx src/cli/index.ts config show
```

### 5. macOS 服务化部署

```bash
# 安装为系统服务（launchd plist，开机自启）
npx tsx src/cli/index.ts install

# 查看状态
npx tsx src/cli/index.ts status

# 查看日志
npx tsx src/cli/index.ts logs

# 卸载
npx tsx src/cli/index.ts uninstall
```

### 6. 生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

## 🔧 配置说明

### LLM 配置（providers 数组）

| 字段 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `providers[].name` | 是 | Provider 显示名称 | `DeepSeek` |
| `providers[].provider` | 是 | API 协议（固定 `openai`） | `openai` |
| `providers[].api_key` | 是 | API 密钥 | `sk-xxx` |
| `providers[].base_url` | 是 | API 端点地址 | `https://api.deepseek.com/v1` |
| `providers[].models[]` | 是 | 模型列表（id/name/reasoning/input/contextWindow/maxTokens） | 见示例 |
| `llm.thinking_level` | 否 | 默认思考等级（off/minimal/low/medium/high/xhigh） | `medium` |
| `llm.temperature` | 否 | 温度参数，默认 `0.7` | `0.7` |

### 服务器与客户端配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `server.port` | 后端 Express 端口 | `3000` |
| `client.port` | 前端 Vite dev server 端口 | `5173` |
| `storage.data_dir` | 数据存储目录 | `./.doudou` |

### 日志配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `logging.level` | 最低日志级别（debug/info/warn/error） | `info` |
| `logging.dir` | 日志文件目录 | `./logs` |
| `logging.max_days` | 保留天数，超过自动清理 | `7` |

### 常见模型配置

<details>
<summary><b>DeepSeek</b></summary>

```yaml
llm:
  provider: openai
  model: deepseek-chat
  api_key: your-deepseek-key
  base_url: https://api.deepseek.com/v1
```
</details>

<details>
<summary><b>Moonshot (Kimi)</b></summary>

```yaml
llm:
  provider: openai
  model: moonshot-v1-8k
  api_key: your-moonshot-key
  base_url: https://api.moonshot.cn/v1
```
</details>

<details>
<summary><b>本地 Ollama</b></summary>

```yaml
llm:
  provider: openai
  model: llama3
  api_key: ollama
  base_url: http://localhost:11434/v1
```
</details>

<details>
<summary><b>vLLM</b></summary>

```yaml
llm:
  provider: openai
  model: meta-llama/Llama-3-8B-Instruct
  api_key: your-key
  base_url: http://localhost:8000/v1
```
</details>

## 🛠️ 内置工具

Agent 内置以下工具，LLM 可自主调用：

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件（自动创建目录） |
| `edit_file` | 精确替换文件中的文本 |
| `bash` | 执行 shell 命令 |
| `list_directory` | 列出目录内容 |
| `grep` | 正则表达式文本搜索 |

## ⏰ 定时任务

支持通过 Cron 表达式调度 LLM 自动执行任务。

### 任务字段

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 任务名称 | 每日数据汇总 |
| `prompt` | 发送给 LLM 的提示词 | 请汇总今天的日志... |
| `cron` | Linux Cron 表达式（分 时 日 月 周） | `0 9 * * *` |
| `type` | `once`（一次性）/ `recurring`（循环） | `recurring` |
| `timeout` | 超时时间（秒），默认 300 | 300 |

### Cron 预设

| 预设 | 表达式 |
|------|--------|
| 每分钟 | `* * * * *` |
| 每小时 | `0 * * * *` |
| 每天 9:00 | `0 9 * * *` |
| 每周一 9:00 | `0 9 * * 1` |
| 每月1号 9:00 | `0 9 1 * *` |

## 📁 项目结构

```
doudou-agent/
├── config.yaml                    # LLM 配置文件（不入 git）
├── AGENT.md                       # 系统提示词（可自定义）
├── templates/
│   └── com.doudou-agent.plist     # macOS launchd plist 模板
├── scripts/                       # 构建/开发辅助脚本
│   ├── dev-client.mjs             #   前端启动脚本（自动注入端口）
│   └── resolve-ports.mjs          #   端口解析工具
├── src/
│   ├── server/                    # 后端
│   │   ├── index.ts               # Express 入口（导出 createApp/startServer）
│   │   ├── routes/                # API 路由
│   │   │   ├── chat.ts            #   对话 SSE 流
│   │   │   ├── session.ts         #   Session CRUD
│   │   │   ├── config.ts          #   配置管理
│   │   │   ├── logs.ts            #   日志查询
│   │   │   │   ├── tasks.ts           #   定时任务
│   │   │   │   ├── stats.ts           #   统计看板
│   │   │   │   └── template.ts        #   提示词模板
│   │   ├── services/              # 业务逻辑
│   │   │   ├── agent.ts           #   Agent 生命周期
│   │   │   ├── config.ts          #   配置解析
│   │   │   ├── session.ts         #   Session 存储
│   │   │   ├── logger.ts          #   结构化日志
│   │   │   ├── llm-tracker.ts     #   LLM 请求追踪
│   │   │   ├── task-scheduler.ts  #   定时任务调度器
│   │   │   ├── template.ts        #   提示词模板管理
│   │   │   └── node-fs.ts         #   文件系统工具
│   │   ├── tools/                 # 内置工具（7 个）
│   │   └── middleware/            # 中间件
│   ├── cli/                       # CLI 命令行工具
│   │   ├── index.ts               # CLI 入口（commander）
│   │   ├── commands/              # 命令实现
│   │   │   ├── service.ts         #   launchd 服务管理
│   │   │   ├── chat.ts            #   终端对话
│   │   │   ├── cron.ts            #   定时任务管理
│   │   │   ├── session.ts         #   Session 管理
│   │   │   ├── stats.ts           #   统计概览
│   │   │   └── config.ts          #   配置管理
│   │   └── lib/                   # 工具函数
│   │       ├── init.ts            #   CLI 共享初始化
│   │       ├── chat-runner.ts     #   终端对话核心逻辑
│   │       ├── format.ts          #   chalk 格式化
│   │       └── spinner.ts         #   ora 加载动画
│   └── client/                    # 前端
│       ├── App.tsx                # 主界面
│       ├── components/
│       │   ├── Navigation/        # 左侧导航栏
│       │   ├── Chat/              # 对话组件
│       │   ├── SessionManager/    # Session 管理
│       │   ├── Tasks/             # 定时任务管理
│       │   ├── Dashboard/         # 首页统计看板
│       │   ├── Logs/              # 日志面板
│       │   └── Config/            # 配置组件
│       ├── hooks/                 # 自定义 Hooks
│       ├── store/                 # Zustand 状态管理
│       └── lib/                   # API 请求封装
├── data/                          # 运行时数据（自动创建）
│   ├── tasks.json                 #   任务定义
│   └── task-runs.jsonl            #   执行日志
└── .doudou/                       # Session 数据（自动创建）
    ├── sessions/                  # Session JSONL 文件
    └── doudou.db                  # SQLite 元数据索引
```

## 📡 API 接口

### Session 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/sessions` | 获取 Session 列表 |
| `POST` | `/api/sessions` | 创建新 Session |
| `PATCH` | `/api/sessions/:id` | 更新 Session |
| `DELETE` | `/api/sessions/:id` | 删除 Session |
| `POST` | `/api/sessions/batch-delete` | 批量删除 |
| `GET` | `/api/sessions/:id/messages` | 获取消息历史 |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat/stream` | SSE 流式对话 |
| `POST` | `/api/chat/abort` | 中止对话 |

### 配置

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 获取配置 |
| `PUT` | `/api/config` | 更新配置 |
| `GET` | `/api/config/models` | 获取可用模型列表 |

### 日志

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/logs` | 查询系统日志（支持 level/module/since 过滤） |
| `GET` | `/api/logs/llm-requests` | 查询 LLM 请求记录 |

### 定时任务

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/tasks` | 获取所有任务 |
| `POST` | `/api/tasks` | 创建任务 |
| `PUT` | `/api/tasks/:id` | 更新任务 |
| `DELETE` | `/api/tasks/:id` | 删除任务 |
| `POST` | `/api/tasks/:id/toggle` | 启用/禁用任务 |
| `POST` | `/api/tasks/:id/trigger` | 手动触发执行 |
| `GET` | `/api/tasks/runs` | 查询所有执行日志 |
| `GET` | `/api/tasks/:id/runs` | 查询指定任务执行日志 |

## 💡 使用技巧

1. **Shift + Enter** 换行，**Enter** 发送消息
2. 对话中的 🛠️ 工具调用可点击展开查看参数和结果
3. 💭 思考过程可点击折叠/展开
4. 左侧「会话」点击展开子菜单，双击会话名称可重命名
5. 「定时任务」支持 Cron 调度，可设置超时时间
6. 「日志」子菜单分为系统日志和任务日志，支持按级别/模块过滤

## 🖥️ CLI 命令参考

```bash
# 服务管理（macOS launchd）
doudou install [--port N]         # 安装为系统服务
doudou uninstall                  # 卸载服务
doudou status                     # 查看状态
doudou logs [--lines N]           # 查看日志
doudou serve [--port N]           # 启动 HTTP 服务

# 终端对话（直连 LLM，不经 Express）
doudou chat                       # 交互模式
doudou chat "你好"                # 单次对话
doudou chat --session <id>        # 恢复已有 session
doudou chat --model <id>          # 指定模型

# 定时任务
doudou cron list                  # 列出任务
doudou cron add '<json>'          # 创建任务
doudou cron remove <id>           # 删除任务
doudou cron trigger <id>          # 手动触发
doudou cron enable <id>           # 启用任务
doudou cron disable <id>          # 禁用任务

# Session 管理
doudou session list               # 列出 session
doudou session create [-t 标题]   # 创建 session
doudou session delete <id>        # 删除 session
doudou session export <id>        # 导出消息为 JSON

# 统计
doudou stats                      # 终端统计概览

# 配置
doudou config show                # 查看配置（脱敏）
doudou config set <key> <value>   # 修改配置
```

## 🤝 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + Zustand |
| 后端 | Node.js 20+ + TypeScript + Express |
| Agent | pi-agent-core + pi-ai |
| CLI | commander + chalk + ora |
| 调度 | croner（Cron 表达式调度） |
| 服务化 | macOS launchd plist |
| 存储 | JSONL + SQLite |
| 流式 | Server-Sent Events (SSE) |

## 📄 License

[MIT](LICENSE)

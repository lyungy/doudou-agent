/**
 * 终端格式化工具 — chalk 封装
 */
import chalk from "chalk";

/** 成功（绿色） */
export const success = chalk.green;

/** 错误（红色） */
export const error = chalk.red;

/** 警告（黄色） */
export const warn = chalk.yellow;

/** 信息（蓝色） */
export const info = chalk.blue;

/** 灰色（Thinking 等辅助信息） */
export const dim = chalk.gray;

/** 加粗 */
export const bold = chalk.bold;

/** 青色（工具名等） */
export const cyan = chalk.cyan;

/**
 * API Key 脱敏：显示前 8 位 + ***
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return "***";
  return key.slice(0, 8) + "***";
}

/**
 * 格式化时间为本地可读
 */
export function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

/**
 * 格式化数字（加千分位逗号）
 */
export function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

/**
 * 截断文本到指定长度
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * 简易终端表格
 * @param headers 表头
 * @param rows 数据行（每行与表头一一对应）
 */
export function printTable(headers: string[], rows: string[][]): void {
  // 计算每列最大宽度
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || "").length), 0);
    return Math.max(h.length, maxData);
  });

  // 表头
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  const separatorLine = colWidths.map((w) => "─".repeat(w)).join("──");

  console.log(bold(headerLine));
  console.log(dim(separatorLine));

  // 数据行
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || "").padEnd(colWidths[i])).join("  ");
    console.log(line);
  }
}

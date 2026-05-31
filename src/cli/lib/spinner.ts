/**
 * 加载动画封装 — ora
 */
import ora from "ora";

/**
 * 创建一个 spinner
 * @param text 加载提示文字
 */
export function createSpinner(text: string) {
  return ora({
    text,
    color: "cyan",
  });
}

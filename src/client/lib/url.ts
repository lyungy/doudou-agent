/**
 * URL 工具模块
 * 管理会话 ID 与 URL 查询参数的同步
 */

/** 从 URL 查询参数中读取会话 ID */
export function getSessionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("session");
  return id && id.trim() ? id.trim() : null;
}

/** 更新 URL 中的会话 ID（replaceState，不产生历史记录） */
export function updateUrlWithSession(sessionId: string | null): void {
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set("session", sessionId);
  } else {
    url.searchParams.delete("session");
  }
  window.history.replaceState({ sessionId }, "", url.toString());
}

/** 推送新的历史记录条目（用于浏览器前进/后退） */
export function pushSessionHistory(sessionId: string | null): void {
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set("session", sessionId);
  } else {
    url.searchParams.delete("session");
  }
  window.history.pushState({ sessionId }, "", url.toString());
}

/** 生成可分享的会话 URL */
export function generateSessionUrl(sessionId: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("session", sessionId);
  return url.toString();
}

/** 验证会话 ID 是否在已知列表中 */
export function isValidSessionId(
  sessionId: string,
  knownIds: string[]
): boolean {
  return knownIds.includes(sessionId);
}

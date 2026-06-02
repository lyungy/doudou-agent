/**
 * 会话管理页
 * 搜索（标题/内容）+ 筛选 + 排序 + 卡片列表 + 批量删除
 */
import { useEffect, useState, useMemo } from "react";
import { useAppStore } from "../../store";
import { SessionItem } from "./SessionItem";
import { ConfirmModal } from "../common/ConfirmModal";

type TimeFilter = "all" | "today" | "week" | "month";
type SortKey = "updated" | "created" | "messages";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "最近活跃" },
  { key: "created", label: "创建时间" },
  { key: "messages", label: "消息数量" },
];

export function SessionList() {
  const {
    sessions,
    currentSessionId,
    loadingSessions,
    models,
    loadSessions,
    selectSession,
    deleteSession,
    deleteSessions,
    renameSession,
    togglePin,
    sessionSearch,
    setSessionSearch,
    searchContent,
    setSearchContent,
    sessionFilter,
    setSessionFilter,
  } = useAppStore();

  // 批量选择模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 排序方式
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  // 批量删除确认
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 内容搜索模式下，搜索词变化时防抖重新加载
  useEffect(() => {
    if (!searchContent || !sessionSearch.trim()) return;
    const timer = setTimeout(() => loadSessions(), 300);
    return () => clearTimeout(timer);
  }, [searchContent, sessionSearch]);

  // 筛选 + 排序逻辑
  const filteredSessions = useMemo(() => {
    let result = sessions;

    // 时间过滤
    if (sessionFilter !== "all") {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoff: Date;

      switch (sessionFilter) {
        case "today":
          cutoff = startOfDay;
          break;
        case "week":
          cutoff = new Date(startOfDay.getTime() - 7 * 86400000);
          break;
        case "month":
          cutoff = new Date(startOfDay.getTime() - 30 * 86400000);
          break;
        default:
          cutoff = new Date(0);
      }

      result = result.filter((s) => new Date(s.updatedAt) >= cutoff);
    }

    // 排序（置顶始终在前，已在后端处理；前端做次级排序）
    const sorted = [...result];
    switch (sortKey) {
      case "updated":
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case "created":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "messages":
        sorted.sort((a, b) => b.messageCount - a.messageCount);
        break;
    }

    return sorted;
  }, [sessions, sessionFilter, sortKey]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    await deleteSessions(Array.from(selectedIds));
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowBatchConfirm(false);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleSelectSession = (id: string) => {
    if (selectMode) {
      toggleSelect(id);
    } else {
      selectSession(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-50 overflow-hidden">
      {/* 顶栏 */}
      <div className="px-6 py-4 bg-white border-b border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-neutral-800">会话管理</h1>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={exitSelectMode}
                  className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {selectedIds.size === filteredSessions.length ? "取消全选" : "全选"}
                </button>
                <button
                  onClick={() => setShowBatchConfirm(true)}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  删除 ({selectedIds.size})
                </button>
              </>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                disabled={sessions.length === 0}
                className="px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                批量管理
              </button>
            )}
          </div>
        </div>

        {/* 搜索 + 内容搜索 toggle + 时间筛选 + 排序 */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* 搜索框 + 内容搜索 toggle */}
          <div className="flex-1 min-w-0 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder={searchContent ? "搜索标题和消息内容..." : "搜索会话标题..."}
              className="w-full pl-9 pr-20 py-2 text-sm bg-neutral-100 border border-neutral-200 rounded-lg outline-none focus:border-blue-400 focus:bg-white transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {sessionSearch && (
                <button
                  onClick={() => setSessionSearch("")}
                  className="text-neutral-400 hover:text-neutral-600 text-xs px-1"
                >
                  ✕
                </button>
              )}
              {/* 内容搜索 toggle */}
              <button
                onClick={() => setSearchContent(!searchContent)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
                  searchContent
                    ? "bg-blue-100 text-blue-600"
                    : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200"
                }`}
                title={searchContent ? "当前：搜索标题+内容" : "当前：仅搜索标题"}
              >
                {searchContent ? "📝" : "📄"}
              </button>
            </div>
          </div>

          {/* 时间筛选 */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5 shrink-0">
            {([
              { key: "all" as TimeFilter, label: "全部" },
              { key: "today" as TimeFilter, label: "今天" },
              { key: "week" as TimeFilter, label: "本周" },
              { key: "month" as TimeFilter, label: "本月" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSessionFilter(key)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  sessionFilter === key
                    ? "bg-white text-neutral-800 shadow-sm font-medium"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 排序下拉 */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-2 py-2 text-xs bg-neutral-100 border border-neutral-200 rounded-lg outline-none focus:border-blue-400 text-neutral-600 cursor-pointer shrink-0"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
        {loadingSessions ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-neutral-400 text-sm">加载中...</div>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-neutral-400 text-sm">
              {sessions.length === 0 ? "暂无会话，点击左侧「新建对话」开始" : "没有匹配的会话"}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 max-w-5xl mx-auto">
            {filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                selectable={selectMode}
                selected={selectedIds.has(session.id)}
                models={models}
                onSelect={() => handleSelectSession(session.id)}
                onDelete={() => deleteSession(session.id)}
                onRename={(title) => renameSession(session.id, title)}
                onTogglePin={() => togglePin(session.id, !session.pinned)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      {sessions.length > 0 && (
        <div className="px-6 py-3 bg-white border-t border-neutral-200 text-xs text-neutral-400">
          共 {sessions.length} 个会话
          {sessionSearch || sessionFilter !== "all" ? `，筛选显示 ${filteredSessions.length} 个` : ""}
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      <ConfirmModal
        open={showBatchConfirm}
        title="批量删除"
        message={`确定删除选中的 ${selectedIds.size} 个会话？删除后无法恢复。`}
        confirmText={`删除 ${selectedIds.size} 个`}
        danger
        onConfirm={handleBatchDelete}
        onCancel={() => setShowBatchConfirm(false)}
      />
    </div>
  );
}

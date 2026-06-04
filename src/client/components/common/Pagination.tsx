/**
 * 通用分页组件
 */
interface Props {
  total: number;
  page: number;        // 当前页（从 1 开始）
  pageSize: number;    // 每页条数
  onPageChange: (page: number) => void;
}

export function Pagination({ total, page, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  // 生成页码按钮（最多显示 7 个）
  const pages: number[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push(-1); // 省略号
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push(-1);
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-neutral-400">
        第 {startItem}-{endItem} 条，共 {total} 条
      </span>
      <div className="flex items-center gap-1">
        <PageBtn disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹
        </PageBtn>
        {pages.map((p, i) =>
          p === -1 ? (
            <span key={`e${i}`} className="px-1 text-neutral-400">…</span>
          ) : (
            <PageBtn key={p} active={p === page} onClick={() => onPageChange(p)}>
              {p}
            </PageBtn>
          )
        )}
        <PageBtn disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          ›
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-medium transition-colors
        ${active
          ? "bg-blue-600 text-white"
          : "text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-default"
        }`}
    >
      {children}
    </button>
  );
}

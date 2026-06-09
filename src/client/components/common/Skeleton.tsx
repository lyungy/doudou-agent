/**
 * 骨架屏组件
 * 用于列表加载、卡片加载等场景，替代 "加载中..." 文字
 */

/** 通用骨架块 */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-neutral-200/70 rounded-md animate-pulse ${className}`}
    />
  );
}

/** 会话列表骨架屏 */
export function SessionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-neutral-200 bg-white"
        >
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-4 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-12" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 统计卡片骨架屏 */
export function StatsCardSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl p-5 border border-neutral-200 space-y-3"
        >
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** 图表骨架屏 */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-neutral-200">
      <SkeletonBlock className="h-4 w-32 mb-4" />
      <div className="flex items-end gap-2" style={{ height }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            className="flex-1 rounded-t"
            // @ts-ignore
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Dashboard 整体骨架屏 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <StatsCardSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartSkeleton height={200} />
        <div className="bg-white rounded-xl p-5 border border-neutral-200">
          <SkeletonBlock className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

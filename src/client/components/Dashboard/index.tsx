/**
 * 统计看板主组件
 * 并发请求 5 个 stats 接口，组合所有子图表
 */
import { useEffect, useState } from "react";
import {
  fetchStatsOverview,
  fetchStatsDaily,
  fetchStatsModels,
  fetchStatsPerformance,
  fetchStatsErrors,
  type StatsOverview as StatsOverviewType,
  type DailyStats,
  type ModelStats,
  type PerformanceStats,
  type ErrorStats,
} from "../../lib/client";
import { StatsOverviewCard } from "./StatsOverview";
import { DailyChart } from "./DailyChart";
import { PerformanceChart } from "./PerformanceChart";
import { ModelPieChart } from "./ModelPieChart";
import { TaskStatusCard } from "./TaskStatusCard";
import { ErrorChart } from "./ErrorChart";

export function Dashboard() {
  const [overview, setOverview] = useState<StatsOverviewType | null>(null);
  const [daily, setDaily] = useState<DailyStats | null>(null);
  const [models, setModels] = useState<ModelStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [errors, setErrors] = useState<ErrorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days] = useState(7);

  useEffect(() => {
    loadAll();
  }, [days]);

  async function loadAll() {
    setLoading(true);
    try {
      const [ov, dl, md, pf, er] = await Promise.all([
        fetchStatsOverview(),
        fetchStatsDaily(days),
        fetchStatsModels(),
        fetchStatsPerformance(days),
        fetchStatsErrors(days),
      ]);
      setOverview(ov);
      setDaily(dl);
      setModels(md);
      setPerformance(pf);
      setErrors(er);
    } catch (err) {
      console.error("加载统计数据失败:", err);
    }
    setLoading(false);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-800">📊 数据看板</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              系统运行概览 · 近 {days} 天
            </p>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-4 py-2 text-sm bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            {loading ? "刷新中…" : "🔄 刷新"}
          </button>
        </div>

        {/* 第一行：概览数字 */}
        <StatsOverviewCard data={overview} loading={loading} />

        {/* 第二行：趋势图 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DailyChart data={daily} loading={loading} />
          <PerformanceChart data={performance} loading={loading} />
        </div>

        {/* 第三行：分布 + 任务状态 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ModelPieChart data={models} loading={loading} />
          <TaskStatusCard />
        </div>

        {/* 第四行：错误统计 */}
        <ErrorChart data={errors} loading={loading} />
      </div>
    </div>
  );
}

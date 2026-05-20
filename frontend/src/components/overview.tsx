import { useEffect, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { Building2, Layers, PlugZap, RefreshCw, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import { useTheme } from "@/hooks/use-theme";
import {
  fetchSessionsCount,
  fetchSyncsCount,
  fetchActiveUsersCount,
  fetchActiveProjects,
  fetchPluginUseCount,
  fetchOverviewDailyCounts,
  type OverviewDailyPoint,
} from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_CARD_HOVER, cn } from "@/lib/utils";

function useCountUp(target: number | null, duration = 800) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === null) return;
    if (target === 0) {
      setValue(0);
      return;
    }
    let startTime: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(eased * target));
      if (progress < 1) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return value;
}

interface StatCardProps {
  title: string;
  value: number | null;
  loading: boolean;
  icon: React.ReactNode;
  iconBg: string;
  description?: string;
  onClick?: () => void;
}

function StatCard({
  title,
  value,
  loading,
  icon,
  iconBg,
  description,
  onClick,
}: StatCardProps) {
  const displayed = useCountUp(loading ? null : (value ?? 0));

  return (
    <Card
      size="sm"
      onClick={onClick}
      className={cn(onClick && CLICKABLE_CARD_HOVER, onClick && "hover:bg-muted/40")}
    >
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <CardAction>
          <div
            className={cn(
              "flex items-center justify-center rounded-lg p-2",
              iconBg,
            )}
          >
            {icon}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <p className="text-3xl font-bold tracking-tight tabular-nums">
            {value === null ? "—" : displayed.toLocaleString()}
          </p>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

type ChartRow = {
  date: string;
  dateLabel: string;
  sessionsCount: number;
  syncsCount: number;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
};

type LineDotProps = {
  cx?: number;
  cy?: number;
  value?: number | string;
};

function getAdaptiveTicks(data: ChartRow[]): string[] {
  if (data.length <= 1) return data.map((row) => row.date);

  const maxTicks =
    data.length <= 7
      ? data.length
      : data.length <= 14
        ? 7
        : data.length <= 31
          ? 8
          : 10;

  const step = Math.max(1, Math.ceil((data.length - 1) / (maxTicks - 1)));
  const ticks: string[] = [];

  for (let index = 0; index < data.length; index += step) {
    ticks.push(data[index].date);
  }

  const lastDate = data[data.length - 1].date;
  if (ticks[ticks.length - 1] !== lastDate) {
    ticks.push(lastDate);
  }

  return ticks;
}

function renderLineDot(color: string) {
  return ({ cx, cy, value }: LineDotProps) => {
    if (cx === undefined || cy === undefined) return null;
    if (Number(value) <= 0) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill={color}
        stroke="hsl(var(--background))"
        strokeWidth={1.5}
      />
    );
  };
}

function renderActiveLineDot(color: string) {
  return ({ cx, cy, value }: LineDotProps) => {
    if (cx === undefined || cy === undefined) return null;
    if (Number(value) <= 0) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={color}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
    );
  };
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow;
  if (!row) return null;

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-foreground">{row.dateLabel}</p>
      <p className="text-blue-500 dark:text-blue-400">
        Sessions: {row.sessionsCount.toLocaleString()}
      </p>
      <p className="text-violet-500 dark:text-violet-400">
        Syncs: {row.syncsCount.toLocaleString()}
      </p>
    </div>
  );
}

function DailyTrendChart({
  points,
  loading,
  chartKey,
  onDateClick,
}: {
  points: OverviewDailyPoint[];
  loading: boolean;
  chartKey: string;
  onDateClick: (date: string) => void;
}) {
  const chartData: ChartRow[] = points.map((point) => ({
    ...point,
    dateLabel: format(new Date(point.date), "dd MMM yyyy"),
  }));
  const xTicks = getAdaptiveTicks(chartData);
  const { isDark } = useTheme();
  const axisStroke = isDark ? "#6b7280" : "#94a3b8";
  const gridStroke = isDark ? "#4b5563" : "#e2e8f0";
  /** Recharts SVG ticks do not resolve `hsl(var(--…))` reliably — use explicit colors */
  const tickFill = isDark ? "#e5e7eb" : "#475569";
  const sessionsGradientId = "sessions-gradient";
  const syncsGradientId = "syncs-gradient";

  function handleChartClick(state: { activeLabel?: unknown }) {
    if (typeof state?.activeLabel !== "string") return;
    onDateClick(state.activeLabel);
  }

  const chartInteractive = !loading && points.length > 0;

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        chartInteractive && CLICKABLE_CARD_HOVER,
        chartInteractive && "hover:bg-muted/15",
      )}
    >
      <CardHeader>
        <CardTitle>Sessions & Syncs Over Time</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/70 bg-muted/20 p-3">
          {loading ? (
            <Skeleton className="h-full min-h-80 w-full" />
          ) : points.length === 0 ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              No trend data in this range.
            </div>
          ) : (
            <>
              <div className="w-full min-h-80 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    key={chartKey}
                    data={chartData}
                    margin={{ top: 20, right: 16, bottom: 6, left: 4 }}
                    onClick={handleChartClick}
                    style={{ cursor: "pointer" }}
                  >
                    <defs>
                      <linearGradient
                        id={sessionsGradientId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#3b82f6"
                          stopOpacity={0.65}
                        />
                        <stop
                          offset="60%"
                          stopColor="#3b82f6"
                          stopOpacity={0.26}
                        />
                        <stop
                          offset="100%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id={syncsGradientId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.58}
                        />
                        <stop
                          offset="60%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.22}
                        />
                        <stop
                          offset="100%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical
                      horizontal
                      strokeDasharray="4 6"
                      stroke={gridStroke}
                      strokeOpacity={0.9}
                    />
                    <XAxis
                      dataKey="date"
                      ticks={xTicks}
                      interval={0}
                      axisLine={{ stroke: axisStroke, strokeWidth: 1.4 }}
                      tickLine={{ stroke: axisStroke, strokeWidth: 1.2 }}
                      tick={{
                        fill: tickFill,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                      tickMargin={10}
                      tickFormatter={(value: string) =>
                        format(new Date(value), "dd MMM")
                      }
                      minTickGap={32}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, "auto"]}
                      axisLine={{ stroke: axisStroke, strokeWidth: 1.4 }}
                      tickLine={{ stroke: axisStroke, strokeWidth: 1.2 }}
                      tick={{
                        fill: tickFill,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                      tickMargin={8}
                      width={42}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{
                        stroke: "#60a5fa",
                        strokeWidth: 2,
                        strokeOpacity: 0.9,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sessionsCount"
                      baseValue={0}
                      stroke="none"
                      fill={`url(#${sessionsGradientId})`}
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                    <Area
                      type="monotone"
                      dataKey="syncsCount"
                      baseValue={0}
                      stroke="none"
                      fill={`url(#${syncsGradientId})`}
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="sessionsCount"
                      name="Sessions"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={renderLineDot("#3b82f6")}
                      activeDot={renderActiveLineDot("#3b82f6")}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="syncsCount"
                      name="Syncs"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={renderLineDot("#8b5cf6")}
                      activeDot={renderActiveLineDot("#8b5cf6")}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 flex items-center gap-5 px-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />{" "}
                  Sessions
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />{" "}
                  Syncs
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const Overview = () => {
  const navigate = useNavigate();
  const setHeaderRight = useHeaderRight();
  const { from, to, setFrom, setTo, clearPreset } = useDateRange();
  const { refreshKey, refresh } = useAutoRefresh();

  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [activeProjectsCount, setActiveProjectsCount] = useState<number | null>(
    null,
  );
  const [pluginCount, setPluginCount] = useState<number | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [syncsLoading, setSyncsLoading] = useState(true);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeProjectsLoading, setActiveProjectsLoading] = useState(true);
  const [pluginLoading, setPluginLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPoints, setChartPoints] = useState<OverviewDailyPoint[]>([]);

  useEffect(() => {
    setHeaderRight(
      <div className="flex items-center gap-2">
        <DateRangeFilter />
        <RefreshButton onRefresh={refresh} />
      </div>,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    const fromStr = format(from, "yyyy-MM-dd");
    const toStr = format(to, "yyyy-MM-dd");

    setSessionsLoading(true);
    fetchSessionsCount(fromStr, toStr)
      .then(setSessionCount)
      .catch(() => setSessionCount(null))
      .finally(() => setSessionsLoading(false));

    setSyncsLoading(true);
    fetchSyncsCount(fromStr, toStr)
      .then(setSyncCount)
      .catch(() => setSyncCount(null))
      .finally(() => setSyncsLoading(false));

    setChartLoading(true);
    fetchOverviewDailyCounts(fromStr, toStr)
      .then(setChartPoints)
      .catch(() => setChartPoints([]))
      .finally(() => setChartLoading(false));
  }, [from, to, refreshKey]);

  useEffect(() => {
    setActiveLoading(true);
    fetchActiveUsersCount()
      .then(setActiveCount)
      .catch(() => setActiveCount(null))
      .finally(() => setActiveLoading(false));

    setActiveProjectsLoading(true);
    fetchActiveProjects()
      .then((projects) => setActiveProjectsCount(projects.length))
      .catch(() => setActiveProjectsCount(null))
      .finally(() => setActiveProjectsLoading(false));

    fetchPluginUseCount()
      .then(setPluginCount)
      .catch(() => setPluginCount(null))
      .finally(() => setPluginLoading(false));
  }, [refreshKey]);

  const fromLabel = format(from, "dd MMM yyyy");
  const toLabel = format(to, "dd MMM yyyy");
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  const chartKey = `${fromStr}-${toStr}-${chartPoints.length}`;
  const rangeLabel =
    fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;

  function handleTrendDateClick(date: string) {
    const selectedDay = startOfDay(parseISO(date));
    if (Number.isNaN(selectedDay.getTime())) return;

    setFrom(selectedDay);
    setTo(selectedDay);
    clearPreset();
    navigate("/sessions");
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col gap-6">
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Sessions"
          value={sessionCount}
          loading={sessionsLoading}
          icon={<Layers className="size-4 text-blue-500" />}
          iconBg="bg-blue-500/10"
          description={rangeLabel}
          onClick={() => navigate("/sessions")}
        />
        <StatCard
          title="Syncs"
          value={syncCount}
          loading={syncsLoading}
          icon={<RefreshCw className="size-4 text-violet-500" />}
          iconBg="bg-violet-500/10"
          description={rangeLabel}
          onClick={() => navigate("/syncs")}
        />
        <StatCard
          title="Active Projects"
          value={activeProjectsCount}
          loading={activeProjectsLoading}
          icon={<Building2 className="size-4 text-sky-500" />}
          iconBg="bg-sky-500/10"
          description="Right now"
          onClick={() => navigate("/active-projects")}
        />
        <StatCard
          title="Active Users"
          value={activeCount}
          loading={activeLoading}
          icon={<Users className="size-4 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          description="Right now"
          onClick={() => navigate("/active-users")}
        />
        <StatCard
          title="Plugin Use"
          value={pluginCount}
          loading={pluginLoading}
          icon={<PlugZap className="size-4 text-amber-600" />}
          iconBg="bg-amber-500/10"
          description={rangeLabel}
          onClick={() => navigate("/plugins")}
        />
      </div>
      <DailyTrendChart
        points={chartPoints}
        loading={chartLoading}
        chartKey={chartKey}
        onDateClick={handleTrendDateClick}
      />
    </div>
  );
};

export default Overview;

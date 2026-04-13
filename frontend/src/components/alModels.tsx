import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { useTheme } from "@/hooks/use-theme";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchModelsList,
  fetchModelSizeHistory,
  type ModelSizeHistoryPoint,
  type ModelSummaryItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_TABLE_ROW_HOVER, cn } from "@/lib/utils";

type SortKey =
  | "fileName"
  | "projectName"
  | "lastAccessedAt"
  | "lastFileSize"
  | "revitVersion"
  | "lastAccessedBy"
  | "usersCount"
  | "sessionCount";

type SortDirection = "asc" | "desc";

type ViewMode = "table" | "chart";

type ChartRow = ModelSizeHistoryPoint & {
  dateLabel: string;
};

function formatFileSizeMb(value: number | null): string {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value) || value === 0) return "-";
  return `${value.toLocaleString()} MB`;
}

/**
 * Recharts renders ticks in SVG; `fill: hsl(var(--...))` often fails in dark mode
 * and falls back to black. Use explicit colors derived from theme.
 */
function chartTickFill(isDark: boolean): string {
  return isDark ? "#a3a3a3" : "#57534e";
}

/** Distinct strokes for multi-model combined chart (cycles if many models). */
const SERIES_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0d9488",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#e11d48",
  "#7c3aed",
];

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

function ModelHistoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-foreground">{row.dateLabel}</p>
      <p className="text-blue-500 dark:text-blue-400">
        Max size: {formatFileSizeMb(row.maxFileSize)}
      </p>
    </div>
  );
}

type CombinedRow = {
  date: string;
  dateLabel: string;
  [seriesKey: string]: string | number | null | undefined;
};

function CombinedModelsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string;
    value?: number | null;
    color?: string;
    payload?: CombinedRow;
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const entries = payload.filter(
    (e) =>
      e.value != null &&
      Number.isFinite(e.value) &&
      typeof e.dataKey === "string" &&
      e.dataKey.startsWith("s"),
  );

  return (
    <div className="max-w-xs rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-semibold text-foreground">{row.dateLabel}</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {entries.map((e) => (
          <li
            key={String(e.dataKey)}
            className="flex items-baseline justify-between gap-3"
          >
            <span
              className="min-w-0 flex-1 truncate"
              style={{ color: e.color ?? "inherit" }}
            >
              {e.name ?? e.dataKey}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatFileSizeMb(e.value ?? null)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildCombinedSeries(
  models: ModelSummaryItem[],
  historiesByModelId: Record<string, ModelSizeHistoryPoint[]>,
): {
  rows: CombinedRow[];
  series: Array<{ key: string; name: string; color: string }>;
} {
  const dateSet = new Set<string>();
  const perModelMaps = models.map((model) => {
    const m = new Map<string, number>();
    for (const p of historiesByModelId[model.modelId] ?? []) {
      dateSet.add(p.date);
      m.set(p.date, p.maxFileSize);
    }
    return m;
  });

  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

  const series = models.map((model, i) => ({
    key: `s${i}`,
    name: (model.fileName || model.modelId).trim() || `Model ${i + 1}`,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  const rows: CombinedRow[] = dates.map((date) => {
    const row: CombinedRow = {
      date,
      dateLabel: format(new Date(date), "dd MMM yyyy"),
    };
    for (let i = 0; i < models.length; i++) {
      const v = perModelMaps[i].get(date);
      row[`s${i}`] = v !== undefined ? v : null;
    }
    return row;
  });

  return { rows, series };
}

function CombinedChartInteractiveLegend({
  series,
  focusedKey,
  onToggleKey,
  onShowAll,
}: {
  series: Array<{ key: string; name: string; color: string }>;
  focusedKey: string | null;
  onToggleKey: (dataKey: string) => void;
  onShowAll: () => void;
}) {
  const showingAll = focusedKey === null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs font-medium text-muted-foreground">Models</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 px-3 text-xs"
          disabled={showingAll}
          onClick={onShowAll}
        >
          Show all
        </Button>
      </div>
      <ul
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain py-1 pl-1 pr-2 text-xs [scrollbar-width:thin]"
        role="list"
      >
        {series.map((s) => {
          const selected = focusedKey === s.key;
          const muted = focusedKey !== null && !selected;
          return (
            <li key={s.key}>
              <button
                type="button"
                className={cn(
                  "inline-flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-foreground transition-colors",
                  selected && "bg-primary/15 ring-1 ring-primary/40",
                  muted && "opacity-45",
                  !muted && "hover:bg-muted/70",
                )}
                onClick={() => onToggleKey(s.key)}
                title={
                  selected
                    ? "Click again to show all models"
                    : "Show only this model"
                }
              >
                <span
                  className="mt-0.5 inline-block h-1.5 w-6 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words leading-snug",
                    selected && "font-semibold",
                  )}
                >
                  {s.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ModelSizeTrendChart({
  model,
  points,
  loading,
  onBack,
}: {
  model: ModelSummaryItem;
  points: ModelSizeHistoryPoint[];
  loading: boolean;
  /** Omit to hide “Back to table” (e.g. bulk chart view). */
  onBack?: () => void;
}) {
  const chartData: ChartRow[] = points.map((point) => ({
    ...point,
    dateLabel: format(new Date(point.date), "dd MMM yyyy"),
  }));
  const xTicks = getAdaptiveTicks(chartData);
  const { isDark } = useTheme();
  const tickFill = chartTickFill(isDark);
  const axisStroke = isDark ? "#4b5563" : "#6b7280";
  const gridStroke = isDark ? "#374151" : "#d1d5db";
  const pointRingStroke = isDark ? "#0f172a" : "#ffffff";

  return (
    <Card className="border-border/90 bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="truncate">Model Size Over Time</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {model.fileName || model.modelId}
            {model.projectName ? ` • ${model.projectName}` : ""}
          </p>
        </div>
        {onBack ? (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Back to table
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[22rem] flex-col rounded-xl border border-border/70 bg-muted/20 p-3">
          {loading ? (
            <Skeleton className="h-full min-h-80 w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              No size history found for this model in the selected range.
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 16, bottom: 6, left: 4 }}
                >
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
                    width={72}
                    tickFormatter={(value: number) => `${value.toLocaleString()} MB`}
                  />
                  <Tooltip
                    content={<ModelHistoryTooltip />}
                    cursor={{
                      stroke: "#60a5fa",
                      strokeWidth: 2,
                      strokeOpacity: 0.9,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="maxFileSize"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{
                      r: 5,
                      fill: "#3b82f6",
                      stroke: pointRingStroke,
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 8,
                      fill: "#3b82f6",
                      stroke: pointRingStroke,
                      strokeWidth: 2,
                    }}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AllModelsCombinedChartView({
  models,
  historiesByModelId,
  loading,
}: {
  models: ModelSummaryItem[];
  historiesByModelId: Record<string, ModelSizeHistoryPoint[]>;
  loading: boolean;
}) {
  const [focusedSeriesKey, setFocusedSeriesKey] = useState<string | null>(null);

  const { rows, series } = useMemo(
    () => buildCombinedSeries(models, historiesByModelId),
    [models, historiesByModelId],
  );

  const modelIdsKey = useMemo(
    () =>
      [...models.map((m) => m.modelId)].sort((a, b) => a.localeCompare(b)).join("|"),
    [models],
  );

  useEffect(() => {
    setFocusedSeriesKey(null);
  }, [modelIdsKey]);

  const visibleSeries = useMemo(() => {
    if (!focusedSeriesKey) return series;
    return series.filter((s) => s.key === focusedSeriesKey);
  }, [series, focusedSeriesKey]);

  const xTicks = useMemo(() => {
    const asChartRows: ChartRow[] = rows.map((r) => ({
      date: r.date,
      maxFileSize: 0,
      dateLabel: r.dateLabel,
    }));
    return getAdaptiveTicks(asChartRows);
  }, [rows]);

  const { isDark } = useTheme();
  const tickFill = chartTickFill(isDark);
  const axisStroke = isDark ? "#4b5563" : "#6b7280";
  const gridStroke = isDark ? "#374151" : "#d1d5db";
  const pointRingStroke = isDark ? "#0f172a" : "#ffffff";

  const hasAnyPoint = rows.length > 0;

  return (
    <Card className="border-border/90 bg-background/95 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle>Model size over time</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          One line per model. Click a name in the legend to show only that model;
          click again to show all.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[24rem] flex-col rounded-xl border border-border/70 bg-muted/20 p-3">
          {loading ? (
            <Skeleton className="h-full min-h-96 w-full" />
          ) : !hasAnyPoint ? (
            <div className="flex h-full min-h-96 items-center justify-center text-sm text-muted-foreground">
              No size history found for these models in the selected range.
            </div>
          ) : (
            <div className="grid w-full grid-cols-1 gap-4 md:min-h-[28rem] md:grid-cols-[minmax(0,1fr)_min(16rem,34vw)] md:items-stretch lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="h-[22rem] min-h-[16rem] md:h-[28rem] md:min-h-[28rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={rows}
                    margin={{ top: 12, right: 8, bottom: 8, left: 4 }}
                  >
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
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                      tickMargin={8}
                      tickFormatter={(value: string) =>
                        format(new Date(value), "dd MMM")
                      }
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, "auto"]}
                      axisLine={{ stroke: axisStroke, strokeWidth: 1.4 }}
                      tickLine={{ stroke: axisStroke, strokeWidth: 1.2 }}
                      tick={{
                        fill: tickFill,
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                      tickMargin={8}
                      width={68}
                      tickFormatter={(value: number) =>
                        `${value.toLocaleString()} MB`
                      }
                    />
                    <Tooltip
                      content={<CombinedModelsTooltip />}
                      cursor={{
                        stroke: "#94a3b8",
                        strokeWidth: 1,
                        strokeOpacity: 0.85,
                      }}
                    />
                    {visibleSeries.map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        name={s.name}
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={2}
                        dot={{
                          r: 4.5,
                          fill: s.color,
                          stroke: pointRingStroke,
                          strokeWidth: 2,
                        }}
                        activeDot={{
                          r: 7,
                          fill: s.color,
                          stroke: pointRingStroke,
                          strokeWidth: 2,
                        }}
                        connectNulls
                        isAnimationActive
                        animationDuration={600}
                        animationEasing="ease-out"
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <aside className="flex max-h-[28rem] min-h-0 flex-col rounded-lg border-2 border-muted-foreground/35 bg-muted/30 px-3 py-3 shadow-sm dark:border-muted-foreground/55 md:px-4 md:py-3">
                <CombinedChartInteractiveLegend
                  series={series}
                  focusedKey={focusedSeriesKey}
                  onToggleKey={(key) =>
                    setFocusedSeriesKey((prev) => (prev === key ? null : key))
                  }
                  onShowAll={() => setFocusedSeriesKey(null)}
                />
              </aside>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AllModels() {
  const setHeaderRight = useHeaderRight();
  const { from, to } = useDateRange();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ModelSummaryItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("lastFileSize");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<ModelSizeHistoryPoint[]>([]);
  const [bulkHistories, setBulkHistories] = useState<
    Record<string, ModelSizeHistoryPoint[]>
  >({});
  const [bulkHistoryLoading, setBulkHistoryLoading] = useState(false);

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  useEffect(() => {
    setHeaderRight(
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter />
        <RefreshButton onRefresh={refresh} />
      </div>,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoading(true);
    fetchModelsList({ from: fromStr, to: toStr })
      .then((result) => setItems(result.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [fromStr, toStr, refreshKey]);

  const subtitle = useMemo(() => {
    const fromLabel = format(from, "dd MMM yyyy");
    const toLabel = format(to, "dd MMM yyyy");
    return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
  }, [from, to]);

  function getComparableValue(item: ModelSummaryItem, key: SortKey) {
    switch (key) {
      case "fileName":
        return (item.fileName || "").toLowerCase();
      case "projectName":
        return (item.projectName || "").toLowerCase();
      case "lastAccessedAt": {
        const timestamp = item.lastAccessedAt
          ? new Date(item.lastAccessedAt).getTime()
          : 0;
        return Number.isFinite(timestamp) ? timestamp : 0;
      }
      case "lastFileSize":
        return Number.isFinite(item.lastFileSize ?? NaN)
          ? (item.lastFileSize ?? 0)
          : 0;
      case "revitVersion":
        return (item.revitVersion || "").toLowerCase();
      case "lastAccessedBy":
        return (
          item.lastAccessedByFullName?.trim() ||
          item.lastAccessedBy ||
          ""
        ).toLowerCase();
      case "usersCount":
        return Number.isFinite(item.usersCount) ? item.usersCount : 0;
      case "sessionCount":
        return Number.isFinite(item.sessionCount) ? item.sessionCount : 0;
      default:
        return "";
    }
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function getSortIndicator(columnKey: SortKey): string {
    if (sortKey !== columnKey) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  const sortedItems = useMemo(() => {
    const copied = [...items];
    copied.sort((left, right) => {
      const leftValue = getComparableValue(left, sortKey);
      const rightValue = getComparableValue(right, sortKey);

      let baseComparison = 0;
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        baseComparison = leftValue - rightValue;
      } else {
        baseComparison = String(leftValue).localeCompare(
          String(rightValue),
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          },
        );
      }

      if (baseComparison === 0) {
        return (left.fileName || "").localeCompare(
          right.fileName || "",
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          },
        );
      }

      return sortDirection === "asc" ? baseComparison : -baseComparison;
    });
    return copied;
  }, [items, sortDirection, sortKey]);

  const selectedModel = useMemo(
    () =>
      selectedModelId
        ? items.find((item) => item.modelId === selectedModelId) ?? null
        : null,
    [items, selectedModelId],
  );

  useEffect(() => {
    if (viewMode !== "chart" || items.length === 0) {
      return;
    }

    let cancelled = false;
    setBulkHistoryLoading(true);
    Promise.all(
      items.map((item) =>
        fetchModelSizeHistory({
          modelId: item.modelId,
          from: fromStr,
          to: toStr,
        })
          .then((points) => ({ modelId: item.modelId, points }))
          .catch(() => ({
            modelId: item.modelId,
            points: [] as ModelSizeHistoryPoint[],
          })),
      ),
    )
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, ModelSizeHistoryPoint[]> = {};
        for (const row of rows) {
          next[row.modelId] = row.points;
        }
        setBulkHistories(next);
      })
      .finally(() => {
        if (!cancelled) {
          setBulkHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, items, fromStr, toStr, refreshKey]);

  useEffect(() => {
    if (!selectedModelId) {
      setHistoryPoints([]);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    fetchModelSizeHistory({ modelId: selectedModelId, from: fromStr, to: toStr })
      .then((points) => {
        if (!cancelled) {
          setHistoryPoints(points);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryPoints([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fromStr, selectedModelId, toStr, refreshKey]);

  useEffect(() => {
    if (!selectedModelId) return;
    const isSelectedVisible = items.some((item) => item.modelId === selectedModelId);
    if (!isSelectedVisible) {
      setSelectedModelId(null);
      setHistoryPoints([]);
      setHistoryLoading(false);
    }
  }, [items, selectedModelId]);

  const showSingleModelChart =
    viewMode === "table" && selectedModel !== null;

  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-3">
          <div className="min-w-0 flex-1">
            <CardTitle>All Models</CardTitle>
            <p className="text-xs text-muted-foreground">
              {subtitle} • {items.length} model{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div
            className="inline-flex shrink-0 rounded-md border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Table or chart view"
          >
            <Button
              type="button"
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-sm px-3"
              onClick={() => setViewMode("table")}
            >
              Table
            </Button>
            <Button
              type="button"
              variant={viewMode === "chart" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-sm px-3"
              onClick={() => {
                setSelectedModelId(null);
                setViewMode("chart");
              }}
            >
              Chart
            </Button>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No models found for this date range.
          </CardContent>
        </Card>
      ) : viewMode === "chart" ? (
        <AllModelsCombinedChartView
          models={sortedItems}
          historiesByModelId={bulkHistories}
          loading={bulkHistoryLoading}
        />
      ) : showSingleModelChart ? (
        <ModelSizeTrendChart
          model={selectedModel!}
          points={historyPoints}
          loading={historyLoading}
          onBack={() => setSelectedModelId(null)}
        />
      ) : (
        <Card className="border-border/90 bg-background/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("fileName")}
                    >
                      File Name{getSortIndicator("fileName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("projectName")}
                    >
                      Project{getSortIndicator("projectName")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("lastAccessedAt")}
                    >
                      Last Accessed{getSortIndicator("lastAccessedAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("lastAccessedAt")}
                    >
                      Time{getSortIndicator("lastAccessedAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("revitVersion")}
                    >
                      Revit{getSortIndicator("revitVersion")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("lastFileSize")}
                    >
                      File Size{getSortIndicator("lastFileSize")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <button
                      type="button"
                      className="w-full text-left hover:text-foreground"
                      onClick={() => handleSort("lastAccessedBy")}
                    >
                      Last User{getSortIndicator("lastAccessedBy")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                    <button
                      type="button"
                      className="w-full text-right hover:text-foreground"
                      onClick={() => handleSort("usersCount")}
                    >
                      Users{getSortIndicator("usersCount")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                    <button
                      type="button"
                      className="w-full text-right hover:text-foreground"
                      onClick={() => handleSort("sessionCount")}
                    >
                      Sessions{getSortIndicator("sessionCount")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const dt = item.lastAccessedAt
                    ? new Date(item.lastAccessedAt)
                    : null;
                  const dateLabel = dt ? format(dt, "MM/dd/yy") : "-";
                  const timeLabel = dt ? format(dt, "h:mm a") : "-";
                  const userLabel = item.lastAccessedByFullName?.trim() || "-";

                  return (
                    <tr
                      key={item.modelId}
                      className={cn(
                        "border-b last:border-b-0",
                        CLICKABLE_TABLE_ROW_HOVER,
                        selectedModelId === item.modelId &&
                          "bg-blue-50 dark:bg-blue-950/30",
                      )}
                      onClick={() => setSelectedModelId(item.modelId)}
                    >
                      <td className="px-4 py-3 font-medium max-w-56 truncate">
                        {item.fileName || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-56 truncate">
                        {item.projectName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {dateLabel}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {timeLabel}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap max-w-32 truncate text-muted-foreground">
                        {item.revitVersion?.trim() || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatFileSizeMb(item.lastFileSize)}
                      </td>
                      <td className="px-4 py-3 max-w-48 truncate">
                        {userLabel}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right">
                        {item.usersCount}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right">
                        {item.sessionCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

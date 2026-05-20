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
  fetchModelSummaryHistory,
  type ModelSummaryHistoryPoint,
  type ModelSummaryItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

type ChartRow = ModelSummaryHistoryPoint & {
  dateLabel: string;
};

function formatFileSizeMb(value: number | null): string {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value) || value === 0) return "-";
  return `${value.toLocaleString()} MB`;
}

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "-";
  if (!Number.isFinite(seconds) || seconds === 0) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}min ${secs}secs`;
}

function chartTickFill(isDark: boolean): string {
  return isDark ? "#a3a3a3" : "#475569";
}

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

function ModelSummaryTooltip({
  active,
  payload,
  visibleLines,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    value?: number | null;
    color?: string;
    payload?: ChartRow;
  }>;
  visibleLines: {
    fileSize: boolean;
    openTime: boolean;
    syncTime: boolean;
    warnings: boolean;
  };
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-semibold text-foreground">{row.dateLabel}</p>
      <div className="space-y-1">
        {visibleLines.fileSize && (
          <p className="text-blue-500 dark:text-blue-400">
            File size: {formatFileSizeMb(row.maxFileSize)}
          </p>
        )}
        {visibleLines.openTime && (
          <p className="text-red-500 dark:text-red-400">
            Median open time: {formatDurationSeconds(row.maxOpeningDuration)}
          </p>
        )}
        {visibleLines.syncTime && (
          <p className="text-green-500 dark:text-green-400">
            Median sync time: {formatDurationSeconds(row.maxSyncDuration)}
          </p>
        )}
        {visibleLines.warnings && (
          <p className="text-yellow-500 dark:text-yellow-400">
            Warnings: {row.maxWarningCount ?? 0}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ModelSummary() {
  const setHeaderRight = useHeaderRight();
  const { from, to } = useDateRange();
  const { refreshKey } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ModelSummaryItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("lastAccessedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<ModelSummaryHistoryPoint[]>([]);
  const [visibleLines, setVisibleLines] = useState({
    fileSize: true,
    openTime: true,
    syncTime: true,
    warnings: true,
  });

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  useEffect(() => {
    setHeaderRight(
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter />
        <RefreshButton onRefresh={() => {}} />
      </div>,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight]);

  useEffect(() => {
    setLoading(true);
    fetchModelsList({ from: fromStr, to: toStr })
      .then((result) => {
        setItems(result.items);
        if (result.items.length > 0 && !selectedModelId) {
          setSelectedModelId(result.items[0].modelId);
        }
      })
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
    if (!selectedModelId) {
      setHistoryPoints([]);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    fetchModelSummaryHistory({ modelId: selectedModelId, from: fromStr, to: toStr })
      .then((points) => {
        console.log("Model summary history response:", { modelId: selectedModelId, from: fromStr, to: toStr, pointsCount: points.length });
        if (!cancelled) {
          setHistoryPoints(points);
        }
      })
      .catch((err) => {
        console.error("Model summary history error:", err);
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

  const chartData: ChartRow[] = historyPoints.map((point) => ({
    ...point,
    dateLabel: format(new Date(point.date), "dd MMM yyyy"),
  }));
  const xTicks = getAdaptiveTicks(chartData);
  const { isDark } = useTheme();
  const tickFill = chartTickFill(isDark);
  const axisStroke = isDark ? "#4b5563" : "#94a3b8";
  const gridStroke = isDark ? "#374151" : "#e2e8f0";
  const pointRingStroke = isDark ? "#0f172a" : "#ffffff";

  return (
    <div className="space-y-4">
      {selectedModel && (
        <Card className="border-border/90 bg-background/95 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold leading-tight text-foreground">
                {selectedModel.fileName || selectedModel.modelId}
              </p>
              {selectedModel.projectName && (
                <p className="text-sm text-muted-foreground">
                  {selectedModel.projectName}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[22rem] flex-col rounded-xl border border-border/70 bg-muted/20 p-3">
              {historyLoading ? (
                <Skeleton className="h-full min-h-80 w-full" />
              ) : chartData.length === 0 ? (
                <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
                  No data found for this model in the selected range.
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
                        yAxisId="left"
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
                      <YAxis
                        yAxisId="right"
                        orientation="right"
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
                        tickFormatter={(value: number) => {
                          const m = Math.floor(value / 60);
                          const s = Math.floor(value % 60);
                          return `${m}m ${s}s`;
                        }}
                      />
                      <YAxis
                        yAxisId="right2"
                        orientation="right"
                        allowDecimals={false}
                        domain={[0, "auto"]}
                        axisLine={{ stroke: axisStroke, strokeWidth: 1.4 }}
                        tickLine={{ stroke: axisStroke, strokeWidth: 1.2 }}
                        tick={{
                          fill: "#eab308",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                        tickMargin={8}
                        width={40}
                      />
                      <Tooltip
                        content={<ModelSummaryTooltip visibleLines={visibleLines} />}
                        cursor={{
                          stroke: "#60a5fa",
                          strokeWidth: 2,
                          strokeOpacity: 0.9,
                        }}
                      />
                      {visibleLines.fileSize && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="maxFileSize"
                          name="File Size"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          dot={{
                            r: 3,
                            fill: "#3b82f6",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          activeDot={{
                            r: 5,
                            fill: "#3b82f6",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      )}
                      {visibleLines.openTime && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="maxOpeningDuration"
                          name="Median Open Time"
                          stroke="#dc2626"
                          strokeWidth={1.5}
                          dot={{
                            r: 3,
                            fill: "#dc2626",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          activeDot={{
                            r: 5,
                            fill: "#dc2626",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      )}
                      {visibleLines.syncTime && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="maxSyncDuration"
                          name="Median Sync Time"
                          stroke="#16a34a"
                          strokeWidth={1.5}
                          dot={{
                            r: 3,
                            fill: "#16a34a",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          activeDot={{
                            r: 5,
                            fill: "#16a34a",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      )}
                      {visibleLines.warnings && (
                        <Line
                          yAxisId="right2"
                          type="monotone"
                          dataKey="maxWarningCount"
                          name="Warnings"
                          stroke="#eab308"
                          strokeWidth={1.5}
                          dot={{
                            r: 3,
                            fill: "#eab308",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          activeDot={{
                            r: 5,
                            fill: "#eab308",
                            stroke: pointRingStroke,
                            strokeWidth: 1.5,
                          }}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2 transition-opacity",
                  !visibleLines.fileSize && "opacity-40",
                )}
                onClick={() =>
                  setVisibleLines((prev) => ({ ...prev, fileSize: !prev.fileSize }))
                }
              >
                <span className="inline-block h-3 w-6 rounded-full bg-blue-500" />
                <span>File Size (MB)</span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2 transition-opacity",
                  !visibleLines.openTime && "opacity-40",
                )}
                onClick={() =>
                  setVisibleLines((prev) => ({ ...prev, openTime: !prev.openTime }))
                }
              >
                <span className="inline-block h-3 w-6 rounded-full bg-red-500" />
                <span>Median Open Time (min)</span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2 transition-opacity",
                  !visibleLines.syncTime && "opacity-40",
                )}
                onClick={() =>
                  setVisibleLines((prev) => ({ ...prev, syncTime: !prev.syncTime }))
                }
              >
                <span className="inline-block h-3 w-6 rounded-full bg-green-500" />
                <span>Median Sync Time (min)</span>
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-2 transition-opacity",
                  !visibleLines.warnings && "opacity-40",
                )}
                onClick={() =>
                  setVisibleLines((prev) => ({ ...prev, warnings: !prev.warnings }))
                }
              >
                <span className="inline-block h-3 w-6 rounded-full bg-yellow-500" />
                <span>Warnings</span>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

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
      ) : (
        <Card className="border-border/90 bg-background/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                    #
                  </th>
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
                      Unique Users{getSortIndicator("usersCount")}
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
                {sortedItems.map((item, index) => {
                  const dt = item.lastAccessedAt
                    ? new Date(item.lastAccessedAt)
                    : null;
                  const dateLabel = dt ? format(dt, "MM/dd/yy") : "-";
                  const timeLabel = dt ? format(dt, "h:mm a") : "-";
                  const userLabel = item.lastAccessedByFullName?.trim() || "-";
                  const isSelected = selectedModelId === item.modelId;

                  return (
                    <tr
                      key={item.modelId}
                      className={cn(
                        "border-b last:border-b-0",
                        CLICKABLE_TABLE_ROW_HOVER,
                        isSelected &&
                          "bg-blue-50 dark:bg-blue-950/30",
                      )}
                      onClick={() => setSelectedModelId(item.modelId)}
                    >
                      <td className="px-4 py-3 tabular-nums text-right text-muted-foreground">
                        {index + 1}
                      </td>
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

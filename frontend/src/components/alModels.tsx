import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import { fetchModelsList, type ModelSummaryItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey =
  | "fileName"
  | "projectName"
  | "lastAccessedAt"
  | "lastFileSize"
  | "lastAccessedBy"
  | "usersCount"
  | "sessionCount";

type SortDirection = "asc" | "desc";

function formatFileSizeMb(value: number | null): string {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value) || value === 0) return "-";
  return `${value.toLocaleString()} MB`;
}

export default function AllModels() {
  const setHeaderRight = useHeaderRight();
  const { from, to } = useDateRange();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ModelSummaryItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("lastFileSize");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

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

  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>All Models</CardTitle>
          <p className="text-xs text-muted-foreground">
            {subtitle} • {items.length} model{items.length !== 1 ? "s" : ""}
          </p>
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
                      className="border-b last:border-b-0 hover:bg-muted/30"
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

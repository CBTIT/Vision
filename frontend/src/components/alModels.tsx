import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { fetchModelsList, type ModelSummaryItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatFileSizeMb(value: number | null): string {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value) || value === 0) return "-";
  return `${value.toLocaleString()} MB`;
}

export default function AllModels() {
  const setHeaderRight = useHeaderRight();
  const { from, to } = useDateRange();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ModelSummaryItem[]>([]);

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  useEffect(() => {
    setHeaderRight(<DateRangeFilter />);
    return () => setHeaderRight(null);
  }, [setHeaderRight]);

  useEffect(() => {
    setLoading(true);
    fetchModelsList({ from: fromStr, to: toStr })
      .then((result) => setItems(result.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [fromStr, toStr]);

  const subtitle = useMemo(() => {
    const fromLabel = format(from, "dd MMM yyyy");
    const toLabel = format(to, "dd MMM yyyy");
    return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
  }, [from, to]);

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
                    File Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Last Accessed
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Time
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    File Size
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Last User
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                    Sessions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const dt = item.lastAccessedAt
                    ? new Date(item.lastAccessedAt)
                    : null;
                  const dateLabel = dt ? format(dt, "MM/dd/yy") : "-";
                  const timeLabel = dt ? format(dt, "h:mm a") : "-";
                  const userLabel =
                    item.lastAccessedByFullName?.trim() ||
                    item.lastAccessedBy ||
                    "-";

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

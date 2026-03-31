import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchPluginNames,
  fetchPluginUseList,
  type PaginatedListResponse,
  type PluginUseItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type PageToken = number | "left-ellipsis" | "right-ellipsis";

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PageToken[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) tokens.push("left-ellipsis");
  for (let page = start; page <= end; page += 1) tokens.push(page);
  if (end < totalPages - 1) tokens.push("right-ellipsis");

  tokens.push(totalPages);
  return tokens;
}

function toTitle(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((entry) => formatFieldValue(entry)).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function PluginCard({
  item,
  onClick,
}: {
  item: PluginUseItem;
  onClick: () => void;
}) {
  return (
    <Card
      className="w-full cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Full Name</p>
            <p className="font-medium truncate">{item.fullName || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plugin Name</p>
            <p className="font-medium truncate">{item.plugin_name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Project Name</p>
            <p className="font-medium truncate">{item.project_name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium truncate">{item.email || "-"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Plugins() {
  const setHeaderRight = useHeaderRight();
  const { from, to } = useDateRange();
  const { refreshKey, refresh } = useAutoRefresh();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pluginNames, setPluginNames] = useState<string[]>([]);
  const [selectedPluginName, setSelectedPluginName] = useState("all");
  const [selectedItem, setSelectedItem] = useState<PluginUseItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [data, setData] = useState<PaginatedListResponse<PluginUseItem>>({
    items: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

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
    fetchPluginNames()
      .then(setPluginNames)
      .catch(() => setPluginNames([]));
  }, [refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [selectedPluginName]);

  useEffect(() => {
    setLoading(true);
    fetchPluginUseList({
      page,
      limit,
      pluginName:
        selectedPluginName === "all" ? undefined : selectedPluginName,
    })
      .then(setData)
      .catch(() =>
        setData({ items: [], total: 0, page: 1, limit, totalPages: 1 }),
      )
      .finally(() => setLoading(false));
  }, [page, limit, refreshKey, selectedPluginName]);

  const pageTokens = useMemo(
    () => buildPageTokens(data.page, data.totalPages),
    [data.page, data.totalPages],
  );

  const subtitle = useMemo(() => {
    const fromLabel = format(from, "dd MMM yyyy");
    const toLabel = format(to, "dd MMM yyyy");
    const rangeLabel =
      fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
    const pluginLabel =
      selectedPluginName === "all" ? "All plugins" : selectedPluginName;
    return `${rangeLabel} • ${pluginLabel} • ${data.total} total • Page ${data.page} of ${data.totalPages}`;
  }, [from, to, data.total, data.page, data.totalPages, selectedPluginName]);

  const detailFields = useMemo(() => {
    if (!selectedItem) return [] as Array<{ label: string; value: string }>;
    return Object.entries(selectedItem).map(([key, value]) => ({
      label: toTitle(key),
      value: formatFieldValue(value),
    }));
  }, [selectedItem]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-1 py-1">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Plugin Use</CardTitle>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || data.page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>

                {pageTokens.map((token, index) =>
                  typeof token === "number" ? (
                    <Button
                      key={token}
                      variant={token === data.page ? "default" : "outline"}
                      size="sm"
                      className="h-8 min-w-8 px-2"
                      type="button"
                      onClick={() => setPage(token)}
                      disabled={loading}
                    >
                      {token}
                    </Button>
                  ) : (
                    <span
                      key={`${token}-${index}`}
                      className="px-1 text-sm text-muted-foreground"
                    >
                      ...
                    </span>
                  ),
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(data.totalPages, current + 1))
                  }
                  disabled={loading || data.page >= data.totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            {pluginNames.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Plugin
                  </p>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant={
                        selectedPluginName === "all" ? "default" : "outline"
                      }
                      onClick={() => setSelectedPluginName("all")}
                    >
                      All
                    </Button>
                    {pluginNames.map((pluginName) => (
                      <Button
                        key={pluginName}
                        type="button"
                        size="xs"
                        variant={
                          selectedPluginName === pluginName ? "default" : "outline"
                        }
                        onClick={() => setSelectedPluginName(pluginName)}
                      >
                        {pluginName}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSelectedPluginName("all");
                    setPage(1);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent
          side="right"
          className="sm:max-w-xl w-[92vw] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Plugin Use Details</SheetTitle>
          </SheetHeader>

          <div className="space-y-3 px-4 pb-4">
            {detailFields.map((field) => (
              <div key={field.label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{field.label}</p>
                <p className="mt-1 text-sm wrap-break-word">{field.value}</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        <div
          className={
            loading ? "space-y-3 opacity-70 transition-opacity" : "space-y-3"
          }
        >
          {loading && data.items.length === 0 ? (
            Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))
          ) : data.items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No plugin-use records found.
              </CardContent>
            </Card>
          ) : (
            data.items.map((item) => (
              <PluginCard
                key={item._id}
                item={item}
                onClick={() => {
                  setSelectedItem(item);
                  setDetailsOpen(true);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

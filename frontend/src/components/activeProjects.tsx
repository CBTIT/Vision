import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, FileText, Users } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import { fetchActiveProjects, type ActiveProjectSummaryItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_CARD_HOVER, cn } from "@/lib/utils";

export default function ActiveProjects() {
  const navigate = useNavigate();
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActiveProjectSummaryItem[]>([]);

  useEffect(() => {
    setHeaderRight(<RefreshButton onRefresh={refresh} />);
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoading(true);
    fetchActiveProjects()
      .then((result) => setItems(result))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  function goToActiveUsersForProject(projectName: string) {
    navigate(
      `/active-users?project=${encodeURIComponent(projectName)}`,
    );
  }


  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Active Projects</CardTitle>
          <p className="text-xs text-muted-foreground">
            Projects with live Revit sessions -- active users and distinct open
            models. <br/> Click a project to open Active Users filtered to
            that project.
          </p>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No projects with active users right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <Card
              key={item.projectName}
              role="button"
              tabIndex={0}
              className={cn(
                "h-full border-border/90 bg-background/95 shadow-sm",
                CLICKABLE_CARD_HOVER,
                "hover:bg-muted/25",
              )}
              onClick={() => goToActiveUsersForProject(item.projectName)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goToActiveUsersForProject(item.projectName);
                }
              }}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <CardTitle className="truncate text-base leading-tight">
                        {item.projectName}
                      </CardTitle>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Live
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex h-full flex-col space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-muted/20 px-2 py-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5 shrink-0" />
                      <p>Active users</p>
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {item.activeUsersCount}
                    </p>
                  </div>
                  <div
                    className="rounded-md border bg-muted/20 px-2 py-2"
                    title="Distinct open models in this project (one per Revit session id). Duplicates in the plugin payload are ignored."
                  >
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="size-3.5 shrink-0" />
                      <p>Models active</p>
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {item.activeModelsCount}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-border/80 bg-muted/15 px-2.5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Open models ({item.activeModelNames?.length ?? 0})
                  </p>
                  {(item.activeModelNames?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">—</p>
                  ) : (
                    <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto text-xs leading-snug [scrollbar-width:thin]">
                      {(item.activeModelNames ?? []).map((name, idx) => (
                        <li
                          key={`${idx}-${name}`}
                          className="wrap-break-word border-b border-border/40 pb-1 last:border-b-0 last:pb-0"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, FileText, Users, ChevronRight, Eye, LoaderCircle } from "lucide-react";
import { format } from "date-fns";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchActiveProjects,
  fetchActiveProjectUsers,
  type ActiveProjectSummaryItem,
  type ActiveProjectUserRow,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "hh:mm a, dd MMM yyyy");
}

export default function ActiveProjects() {
  const navigate = useNavigate();
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActiveProjectSummaryItem[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [projectUsers, setProjectUsers] = useState<Record<string, ActiveProjectUserRow[]>>({});
  const [projectUsersLoading, setProjectUsersLoading] = useState<Record<string, boolean>>({});

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

  const toggleProjectExpanded = async (projectName: string) => {
    const wasExpanded = !!expandedProjects[projectName];
    setExpandedProjects((prev) => ({ ...prev, [projectName]: !wasExpanded }));

    if (!wasExpanded && !projectUsers[projectName]) {
      setProjectUsersLoading((prev) => ({ ...prev, [projectName]: true }));
      try {
        const res = await fetchActiveProjectUsers(projectName);
        setProjectUsers((prev) => ({ ...prev, [projectName]: res.users }));
      } catch (err) {
        console.error("Failed to fetch project users", err);
      } finally {
        setProjectUsersLoading((prev) => ({ ...prev, [projectName]: false }));
      }
    }
  };

  function goToActiveUsersForProject(projectName: string) {
    navigate(`/active-users?project=${encodeURIComponent(projectName)}`);
  }

  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="py-2.5 px-4 flex flex-col gap-0.5">
          <CardTitle className="text-lg">Active Projects</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Projects with live Revit sessions -- active users, distinct open models, and workstation telemetry details.
          </p>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="w-full overflow-x-auto rounded-xl border bg-card/65 backdrop-blur-md px-1 py-1">
          <table className="w-full text-left text-sm border-collapse min-w-[800px]">
            <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3 text-center">Active Users</th>
                <th className="px-4 py-3 text-center">Active Models</th>
                <th className="px-4 py-3">Open Models</th>
                <th className="w-28 px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-t">
                  <td className="w-16 px-4 py-3 text-center">
                    <Skeleton className="h-4 w-4 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Skeleton className="h-4 w-12 mx-auto" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Skeleton className="h-4 w-12 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-64" />
                  </td>
                  <td className="w-28 px-4 py-3 text-center">
                    <Skeleton className="h-8 w-20 mx-auto rounded-md" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No projects with active users right now.
          </CardContent>
        </Card>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border bg-card/65 backdrop-blur-md px-1 py-1 animate-in fade-in duration-200">
          <table className="w-full text-left text-sm border-collapse min-w-[800px]">
            <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 text-center">
                  <ChevronRight className="size-4 mx-auto text-muted-foreground" />
                </th>
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3 text-center">Active Users</th>
                <th className="px-4 py-3 text-center">Active Models</th>
                <th className="px-4 py-3">Open Models</th>
                <th className="w-28 px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const isExpanded = !!expandedProjects[item.projectName];
                return (
                  <Fragment key={item.projectName}>
                    <tr
                      className={cn(
                        "border-t transition-colors cursor-pointer",
                        isExpanded ? "bg-muted/25" : "hover:bg-muted/45"
                      )}
                      onClick={() => void toggleProjectExpanded(item.projectName)}
                    >
                      <td className="w-16 px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={cn(
                              "inline-flex transition-transform duration-200",
                              isExpanded ? "rotate-90" : ""
                            )}
                          >
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground/60 tabular-nums">
                            {index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[280px]" title={item.projectName}>
                            {item.projectName}
                          </span>
                          <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                            Live
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3 text-muted-foreground/70" />
                          {item.activeUsersCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3 text-muted-foreground/70" />
                          {item.activeModelsCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.activeModelNames.length === 0 ? (
                          <span className="text-xs text-muted-foreground/60 italic">No active models</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-md">
                            {item.activeModelNames.map((name, idx) => (
                              <span
                                key={`${idx}-${name}`}
                                className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/95 break-all whitespace-normal max-w-[200px]"
                                title={name}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="w-28 px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="xs"
                          className="w-full h-7 text-[11px]"
                          onClick={() => goToActiveUsersForProject(item.projectName)}
                        >
                          <Eye className="size-3.5 mr-1" />
                          Users
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${item.projectName}-users`} className="bg-muted/5 border-t-0 border-b">
                        <td colSpan={6} className="px-4 py-2">
                          <div className="rounded-xl border border-border/80 bg-card/45 p-4 pl-5 ml-12 space-y-3 shadow-md backdrop-blur-md animate-in slide-in-from-top-1 duration-150">
                            <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                              <span className="p-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                                <Users className="size-3.5" />
                              </span>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Active Users on {item.projectName} ({projectUsers[item.projectName]?.length ?? 0})
                              </p>
                            </div>

                            {projectUsersLoading[item.projectName] ? (
                              <div className="space-y-2 py-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <LoaderCircle className="size-3 animate-spin text-primary" />
                                  <span>Loading active workstation sessions...</span>
                                </div>
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                              </div>
                            ) : !projectUsers[item.projectName] || projectUsers[item.projectName].length === 0 ? (
                              <p className="text-xs text-muted-foreground italic py-1.5">No active sessions found.</p>
                            ) : (
                              <div className="divide-y divide-border/20">
                                {projectUsers[item.projectName].map((u, idx) => {
                                  const formattedStartTime = u.sessionStartAt
                                    ? formatDateTime(u.sessionStartAt)
                                    : "Unknown";

                                  return (
                                    <div
                                      key={`${u.autodeskUserName}-${idx}`}
                                      className="py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-150 pl-3 pr-2.5 rounded-md hover:bg-muted/15"
                                    >
                                      {/* Left: User Display Name & Autodesk Username */}
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                                          {(u.fullName?.trim() || u.autodeskUserName || "?").substring(0, 2)}
                                        </div>
                                        <div className="min-w-0 space-y-0.5">
                                          <span className="text-xs font-bold text-foreground">
                                            {u.fullName?.trim() || u.autodeskUserName}
                                          </span>
                                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            <span>@{u.autodeskUserName}</span>
                                            <span>•</span>
                                            <span>Machine: {u.machine}</span>
                                            <span>•</span>
                                            <span>Revit {u.revitVersion}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Middle: Session Start Time & Active Model */}
                                      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-xs">
                                        <div className="flex flex-col space-y-0.5">
                                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Session Started</span>
                                          <span className="font-semibold text-foreground/90">{formattedStartTime}</span>
                                        </div>
                                        {u.activeModelName && (
                                          <div className="flex flex-col space-y-0.5 max-w-[200px]">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Active Model</span>
                                            <span className="truncate text-foreground/80 font-medium" title={u.activeModelName}>{u.activeModelName}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Right: Syncs Count Pill */}
                                      <div className="shrink-0 flex items-center gap-3 justify-end">
                                        <div className="flex flex-col items-end space-y-0.5 mr-2">
                                          <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Syncs Done</span>
                                          <span className={cn(
                                            "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                                            u.syncsCount > 0
                                              ? "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800/80"
                                              : "bg-muted text-muted-foreground border"
                                          )}>
                                            {u.syncsCount}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

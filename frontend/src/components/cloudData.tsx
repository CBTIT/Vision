import { useEffect, useMemo, useState } from "react";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchCloudProjectDetails,
  fetchCloudProjects,
  type CloudProjectDetails,
  type CloudProjectListItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_CARD_HOVER, cn } from "@/lib/utils";

type ProjectGroup = "bim" | "accForma";
type DetailsTab = "models" | "users" | "companies";

function projectKey(item: CloudProjectListItem): string {
  return `${item.hubId}::${item.id}`;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

export default function CloudData() {
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [bimProjects, setBimProjects] = useState<CloudProjectListItem[]>([]);
  const [accFormaProjects, setAccFormaProjects] = useState<
    CloudProjectListItem[]
  >([]);

  const [activeGroup, setActiveGroup] = useState<ProjectGroup>("bim");
  const [selectedProjectKey, setSelectedProjectKey] = useState("");

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [details, setDetails] = useState<CloudProjectDetails | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] =
    useState<DetailsTab>("models");

  useEffect(() => {
    setHeaderRight(<RefreshButton onRefresh={refresh} />);
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoadingProjects(true);
    setProjectsError("");

    fetchCloudProjects()
      .then((payload) => {
        setBimProjects(payload.bim);
        setAccFormaProjects(payload.accForma);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load cloud projects.";
        setProjectsError(message);
        setBimProjects([]);
        setAccFormaProjects([]);
      })
      .finally(() => setLoadingProjects(false));
  }, [refreshKey]);

  const currentList = useMemo(
    () => (activeGroup === "bim" ? bimProjects : accFormaProjects),
    [activeGroup, bimProjects, accFormaProjects],
  );

  const selectedProject = useMemo(
    () =>
      currentList.find((item) => projectKey(item) === selectedProjectKey) ||
      null,
    [currentList, selectedProjectKey],
  );

  useEffect(() => {
    if (currentList.length === 0) {
      setSelectedProjectKey("");
      setDetails(null);
      return;
    }

    if (
      !selectedProjectKey ||
      !currentList.some((item) => projectKey(item) === selectedProjectKey)
    ) {
      setSelectedProjectKey(projectKey(currentList[0]));
    }
  }, [currentList, selectedProjectKey]);

  useEffect(() => {
    if (!selectedProject) {
      setDetails(null);
      return;
    }

    setDetailsLoading(true);
    setDetailsError("");

    fetchCloudProjectDetails(selectedProject.hubId, selectedProject.id)
      .then((payload) => setDetails(payload))
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load project details.";
        setDetails(null);
        setDetailsError(message);
      })
      .finally(() => setDetailsLoading(false));
  }, [selectedProject]);

  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Cloud Data</CardTitle>
          <p className="text-xs text-muted-foreground">
            Autodesk cloud projects grouped as BIM and ACC/Forma.
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/90 bg-background/95 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Projects</CardTitle>
              <span className="text-xs text-muted-foreground">
                {currentList.length} in group
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={activeGroup === "bim" ? "default" : "outline"}
                onClick={() => setActiveGroup("bim")}
              >
                BIM ({bimProjects.length})
              </Button>
              <Button
                size="sm"
                variant={activeGroup === "accForma" ? "default" : "outline"}
                onClick={() => setActiveGroup("accForma")}
              >
                ACC/Forma ({accFormaProjects.length})
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            {loadingProjects ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : projectsError ? (
              <p className="text-sm text-destructive">{projectsError}</p>
            ) : currentList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects found in this group.
              </p>
            ) : (
              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {currentList.map((project) => {
                  const selected = selectedProjectKey === projectKey(project);
                  return (
                    <button
                      key={projectKey(project)}
                      type="button"
                      onClick={() => setSelectedProjectKey(projectKey(project))}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left",
                        selected
                          ? "border-blue-400/70 bg-blue-50 dark:border-blue-600/70 dark:bg-blue-950/40"
                          : cn(
                              "border-border",
                              CLICKABLE_CARD_HOVER,
                              "hover:bg-muted/35",
                            ),
                      )}
                    >
                      <p className="truncate text-sm font-semibold">
                        {project.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.hubName} • {project.status}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/90 bg-background/95 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Project Details</CardTitle>
              {details?.project && (
                <span className="text-xs text-muted-foreground">
                  {details.project.status}
                </span>
              )}
            </div>
            {selectedProject ? (
              <>
                <p className="text-sm font-medium">{selectedProject.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedProject.hubName}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a project to view details.
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant={activeDetailsTab === "models" ? "default" : "outline"}
                onClick={() => setActiveDetailsTab("models")}
              >
                Models ({details?.models.length ?? 0})
              </Button>
              <Button
                size="sm"
                variant={activeDetailsTab === "users" ? "default" : "outline"}
                onClick={() => setActiveDetailsTab("users")}
              >
                Users ({details?.users.length ?? 0})
              </Button>
              <Button
                size="sm"
                variant={
                  activeDetailsTab === "companies" ? "default" : "outline"
                }
                onClick={() => setActiveDetailsTab("companies")}
              >
                Companies ({details?.companies.length ?? 0})
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            {detailsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : detailsError ? (
              <p className="text-sm text-destructive">{detailsError}</p>
            ) : !details ? (
              <p className="text-sm text-muted-foreground">
                Project details will appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {details.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                    {details.warnings.join(" ")}
                  </div>
                )}

                {activeDetailsTab === "models" &&
                  (details.models.length === 0 ? (
                    <EmptyState message="No models found for this project." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Model
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Folder
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Type
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Last Modified
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              By
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.models.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b last:border-b-0 hover:bg-muted/30"
                            >
                              <td className="px-3 py-2 max-w-80 truncate font-medium">
                                {item.name}
                              </td>
                              <td className="px-3 py-2 max-w-48 truncate text-muted-foreground">
                                {item.folderName || "-"}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {item.fileType || "-"}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {formatDate(item.lastModifiedAt)}
                              </td>
                              <td className="px-3 py-2 max-w-44 truncate">
                                {item.lastModifiedBy || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {activeDetailsTab === "users" &&
                  (details.users.length === 0 ? (
                    <EmptyState message="No users found for this project." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Name
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Email
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Role
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.users.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b last:border-b-0 hover:bg-muted/30"
                            >
                              <td className="px-3 py-2 max-w-60 truncate font-medium">
                                {item.name}
                              </td>
                              <td className="px-3 py-2 max-w-72 truncate text-muted-foreground">
                                {item.email}
                              </td>
                              <td className="px-3 py-2 max-w-48 truncate">
                                {item.role}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {item.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {activeDetailsTab === "companies" &&
                  (details.companies.length === 0 ? (
                    <EmptyState message="No companies found for this project." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Company
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Trade
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.companies.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b last:border-b-0 hover:bg-muted/30"
                            >
                              <td className="px-3 py-2 max-w-72 truncate font-medium">
                                {item.name}
                              </td>
                              <td className="px-3 py-2 max-w-56 truncate text-muted-foreground">
                                {item.trade}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {item.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

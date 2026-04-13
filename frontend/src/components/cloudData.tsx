import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  X,
} from "lucide-react";

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
import { cn } from "@/lib/utils";

type ProjectGroup = "bim" | "accForma";
type DetailsTab = "revitModels" | "users" | "companies";

type CloudUserSortKey =
  | "name"
  | "email"
  | "company"
  | "accessLevel"
  | "status";

type CloudProjectListSortKey = "name" | "dateAdded";

type UserAccessFilter = "all" | "admin" | "nonAdmin";

/** Matches ACC-style access strings (Hub/Project/Executive + product administrator). */
function isUserAccessAdmin(accessLevel: unknown): boolean {
  if (accessLevel == null || typeof accessLevel !== "string") return false;
  const s = accessLevel.trim().toLowerCase();
  if (!s || s === "-") return false;
  if (s.includes("hub admin")) return true;
  if (s.includes("project admin")) return true;
  if (s.includes("executive")) return true;
  if (s.includes("administrator")) return true;
  return false;
}

function compareUserFieldStrings(a: unknown, b: unknown): number {
  const sa = typeof a === "string" ? a : a == null ? "" : String(a);
  const sb = typeof b === "string" ? b : b == null ? "" : String(b);
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

function projectDateSortValue(iso: unknown): number | null {
  if (iso == null) return null;
  const t =
    typeof iso === "string" ? iso.trim() : String(iso).trim();
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Missing dates sort after dated rows in both directions. */
function compareProjectListDates(
  a: unknown,
  b: unknown,
  dir: "asc" | "desc",
): number {
  const va = projectDateSortValue(a);
  const vb = projectDateSortValue(b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const diff = va - vb;
  return dir === "asc" ? diff : -diff;
}

function projectKey(item: CloudProjectListItem): string {
  return `${item.hubId}::${item.id}`;
}

/** Match project users’ company string to a partner company row (name). */
function normalizeCompanyLabel(value: unknown): string {
  if (value == null || typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}


function formatDate(value: unknown): string {
  if (value == null || value === "") return "-";
  const s = typeof value === "string" ? value : String(value);
  if (!s.trim()) return "-";
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return s;
  return parsed.toLocaleString();
}

function formatProjectDateAdded(iso: unknown): string {
  if (iso == null) return "—";
  const t =
    typeof iso === "string" ? iso.trim() : String(iso).trim();
  if (!t) return "—";
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return t;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function UserTableSortHeader({
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  columnKey: CloudUserSortKey;
  activeKey: CloudUserSortKey;
  direction: "asc" | "desc";
  onSort: (key: CloudUserSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className={cn(
          "-m-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors",
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          active && "text-foreground",
        )}
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

function ProjectListSortHeader({
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  columnKey: CloudProjectListSortKey;
  activeKey: CloudProjectListSortKey;
  direction: "asc" | "desc";
  onSort: (key: CloudProjectListSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className={cn(
          "-m-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors",
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          active && "text-foreground",
        )}
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

/** Standard 96×96 visual when no ACC photo URL or image failed to load. */
function ProjectPhotoPlaceholder() {
  return (
    <div
      className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border"
      role="img"
      aria-label="No project image"
    >
      <svg
        viewBox="0 0 96 96"
        className="size-full text-muted-foreground/45"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="96" height="96" fill="currentColor" opacity="0.12" />
        <path
          fill="currentColor"
          opacity="0.35"
          d="M28 62h40L48 44l-8 10-12-14z"
        />
        <circle cx="34" cy="34" r="5" fill="currentColor" opacity="0.35" />
        <rect
          x="22"
          y="22"
          width="52"
          height="52"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.4"
        />
      </svg>
    </div>
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
  const [totalProjectCount, setTotalProjectCount] = useState(0);

  const [activeGroup, setActiveGroup] = useState<ProjectGroup>("bim");
  const [selectedProjectKey, setSelectedProjectKey] = useState("");

  const [projectListSortKey, setProjectListSortKey] =
    useState<CloudProjectListSortKey>("name");
  const [projectListSortDir, setProjectListSortDir] = useState<"asc" | "desc">(
    "asc",
  );

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [details, setDetails] = useState<CloudProjectDetails | null>(null);
  const [projectPhotoLoadFailed, setProjectPhotoLoadFailed] = useState(false);
  const [projectImageOverlayOpen, setProjectImageOverlayOpen] = useState(false);
  const [activeDetailsTab, setActiveDetailsTab] =
    useState<DetailsTab>("revitModels");

  const [userSortKey, setUserSortKey] = useState<CloudUserSortKey>("name");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("asc");
  const [userAccessFilter, setUserAccessFilter] =
    useState<UserAccessFilter>("all");

  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(
    null,
  );

  const handleUserColumnSort = useCallback((key: CloudUserSortKey) => {
    if (key === userSortKey) {
      setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setUserSortKey(key);
      setUserSortDir("asc");
    }
  }, [userSortKey]);

  const handleProjectListColumnSort = useCallback(
    (key: CloudProjectListSortKey) => {
      if (key === projectListSortKey) {
        setProjectListSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setProjectListSortKey(key);
        setProjectListSortDir("asc");
      }
    },
    [projectListSortKey],
  );

  useEffect(() => {
    setProjectPhotoLoadFailed(false);
  }, [selectedProjectKey, details?.project.imageUrl]);

  useEffect(() => {
    setProjectImageOverlayOpen(false);
  }, [selectedProjectKey]);

  useEffect(() => {
    if (!projectImageOverlayOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectImageOverlayOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [projectImageOverlayOpen]);

  useEffect(() => {
    setExpandedCompanyId(null);
  }, [selectedProjectKey, activeDetailsTab]);

  useEffect(() => {
    setUserAccessFilter("all");
  }, [selectedProjectKey]);

  useEffect(() => {
    setHeaderRight(
      <RefreshButton onRefresh={refresh} autoRefresh={false} />,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoadingProjects(true);
    setProjectsError("");

    fetchCloudProjects()
      .then((payload) => {
        setBimProjects(payload.bim);
        setAccFormaProjects(payload.accForma);
        setTotalProjectCount(
          typeof payload.total === "number"
            ? payload.total
            : payload.bim.length + payload.accForma.length,
        );
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load cloud projects.";
        setProjectsError(message);
        setBimProjects([]);
        setAccFormaProjects([]);
        setTotalProjectCount(0);
      })
      .finally(() => setLoadingProjects(false));
  }, [refreshKey]);

  const currentList = useMemo(
    () => (activeGroup === "bim" ? bimProjects : accFormaProjects),
    [activeGroup, bimProjects, accFormaProjects],
  );

  const sortedProjectList = useMemo(() => {
    const rows = [...currentList];
    const mult = projectListSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (projectListSortKey === "dateAdded") {
        const c = compareProjectListDates(
          a.dateAdded ?? "",
          b.dateAdded ?? "",
          projectListSortDir,
        );
        if (c !== 0) return c;
        return compareUserFieldStrings(a.name, b.name);
      }
      let c = compareUserFieldStrings(a.name, b.name);
      if (c === 0) {
        c = compareProjectListDates(
          a.dateAdded ?? "",
          b.dateAdded ?? "",
          "asc",
        );
      }
      return c * mult;
    });
    return rows;
  }, [currentList, projectListSortDir, projectListSortKey]);

  const selectedProject = useMemo(
    () =>
      currentList.find((item) => projectKey(item) === selectedProjectKey) ||
      null,
    [currentList, selectedProjectKey],
  );

  const sortedCloudUsers = useMemo(() => {
    if (!details?.users?.length) return [];
    const rows = [...details.users];
    const mult = userSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let c = 0;
      switch (userSortKey) {
        case "name":
          c = compareUserFieldStrings(a.name, b.name);
          break;
        case "email":
          c = compareUserFieldStrings(a.email, b.email);
          break;
        case "company":
          c = compareUserFieldStrings(a.company, b.company);
          break;
        case "accessLevel":
          c = compareUserFieldStrings(a.accessLevel, b.accessLevel);
          break;
        case "status":
          c = compareUserFieldStrings(a.status, b.status);
          break;
        default:
          c = 0;
      }
      if (c === 0) {
        c = compareUserFieldStrings(a.name, b.name);
      }
      return c * mult;
    });
    return rows;
  }, [details, userSortDir, userSortKey]);

  const filteredCloudUsers = useMemo(() => {
    if (userAccessFilter === "all") return sortedCloudUsers;
    return sortedCloudUsers.filter((u) => {
      const admin = isUserAccessAdmin(u.accessLevel);
      if (userAccessFilter === "admin") return admin;
      return !admin;
    });
  }, [sortedCloudUsers, userAccessFilter]);

  const usersByCompanyId = useMemo(() => {
    if (!details?.companies?.length) {
      return new Map<string, CloudProjectDetails["users"]>();
    }
    const map = new Map<string, CloudProjectDetails["users"]>();
    for (const company of details.companies) {
      if (company.id == null || String(company.id).trim() === "") continue;
      const target = normalizeCompanyLabel(company.name);
      if (!target) continue;
      const list = details.users
        .filter((u) => {
          const raw =
            typeof u.company === "string" ? u.company.trim() : "";
          if (!raw || raw === "-") return false;
          return normalizeCompanyLabel(raw) === target;
        })
        .sort((a, b) => compareUserFieldStrings(a.name, b.name));
      map.set(company.id, list);
    }
    return map;
  }, [details]);

  useEffect(() => {
    if (sortedProjectList.length === 0) {
      setSelectedProjectKey("");
      setDetails(null);
      return;
    }

    if (
      !selectedProjectKey ||
      !sortedProjectList.some(
        (item) => projectKey(item) === selectedProjectKey,
      )
    ) {
      setSelectedProjectKey(projectKey(sortedProjectList[0]));
    }
  }, [sortedProjectList, selectedProjectKey]);

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

  const overlayImageSrc =
    projectImageOverlayOpen && details?.project.imageUrl
      ? details.project.imageUrl
      : null;

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <Card className="border-border/90 bg-background/95 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <CardTitle className="text-sm">Projects</CardTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{totalProjectCount} total</span>
                <span>{currentList.length} in group</span>
              </div>
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
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : projectsError ? (
              <p className="text-sm text-destructive">{projectsError}</p>
            ) : currentList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects found in this group.
              </p>
            ) : (
              <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="min-w-0 w-[58%]" />
                    <col className="w-[42%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-border bg-muted/55 backdrop-blur-sm">
                    <tr>
                      <ProjectListSortHeader
                        label="Name"
                        columnKey="name"
                        activeKey={projectListSortKey}
                        direction={projectListSortDir}
                        onSort={handleProjectListColumnSort}
                      />
                      <ProjectListSortHeader
                        label="Date added"
                        columnKey="dateAdded"
                        activeKey={projectListSortKey}
                        direction={projectListSortDir}
                        onSort={handleProjectListColumnSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjectList.map((project) => {
                      const key = projectKey(project);
                      const selected = selectedProjectKey === key;
                      return (
                        <tr
                          key={key}
                          tabIndex={0}
                          aria-selected={selected}
                          className={cn(
                            "cursor-pointer border-b border-border/70 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selected
                              ? "bg-blue-50 dark:bg-blue-950/40"
                              : "hover:bg-muted/45",
                          )}
                          onClick={() => setSelectedProjectKey(key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedProjectKey(key);
                            }
                          }}
                        >
                          <td className="min-w-0 truncate px-3 py-2.5 font-medium">
                            {project.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {formatProjectDateAdded(project.dateAdded ?? "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/90 bg-background/95 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="text-sm">Project Details</CardTitle>
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
              </div>
              {detailsLoading && selectedProject ? (
                <Skeleton
                  className="size-24 shrink-0 rounded-lg"
                  aria-hidden
                />
              ) : selectedProject && details ? (
                details.project.imageUrl && !projectPhotoLoadFailed ? (
                  <button
                    type="button"
                    className="size-24 shrink-0 cursor-pointer rounded-lg p-0 ring-1 ring-border ring-offset-2 ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="View project image full size"
                    onClick={() => setProjectImageOverlayOpen(true)}
                  >
                    <img
                      src={details.project.imageUrl}
                      alt=""
                      width={96}
                      height={96}
                      className="size-24 rounded-lg object-cover bg-muted"
                      onError={() => setProjectPhotoLoadFailed(true)}
                    />
                  </button>
                ) : (
                  <ProjectPhotoPlaceholder />
                )
              ) : null}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant={
                  activeDetailsTab === "revitModels" ? "default" : "outline"
                }
                onClick={() => setActiveDetailsTab("revitModels")}
              >
                Revit models ({details?.models.length ?? 0})
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

                {activeDetailsTab === "revitModels" &&
                  (details.models.length === 0 ? (
                    <EmptyState message="No Revit models (.rvt) found for this project in ACC." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Revit model
                            </th>
                            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Location
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
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Access level
                          </span>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              size="sm"
                              type="button"
                              variant={
                                userAccessFilter === "all"
                                  ? "default"
                                  : "outline"
                              }
                              className="h-8"
                              onClick={() => setUserAccessFilter("all")}
                            >
                              All
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant={
                                userAccessFilter === "admin"
                                  ? "default"
                                  : "outline"
                              }
                              className="h-8"
                              onClick={() => setUserAccessFilter("admin")}
                            >
                              Admin
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant={
                                userAccessFilter === "nonAdmin"
                                  ? "default"
                                  : "outline"
                              }
                              className="h-8"
                              onClick={() => setUserAccessFilter("nonAdmin")}
                            >
                              Non-admin
                            </Button>
                          </div>
                          {userAccessFilter !== "all" ? (
                            <span className="text-xs text-muted-foreground">
                              Showing {filteredCloudUsers.length} of{" "}
                              {details.users.length}
                            </span>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          disabled={userAccessFilter === "all"}
                          onClick={() => setUserAccessFilter("all")}
                        >
                          Clear filter
                        </Button>
                      </div>

                      {filteredCloudUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No users match this access filter. Use Clear filter or
                          All to see everyone.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b bg-muted/40">
                              <tr>
                                <UserTableSortHeader
                                  label="Name"
                                  columnKey="name"
                                  activeKey={userSortKey}
                                  direction={userSortDir}
                                  onSort={handleUserColumnSort}
                                />
                                <UserTableSortHeader
                                  label="Email"
                                  columnKey="email"
                                  activeKey={userSortKey}
                                  direction={userSortDir}
                                  onSort={handleUserColumnSort}
                                />
                                <UserTableSortHeader
                                  label="Company"
                                  columnKey="company"
                                  activeKey={userSortKey}
                                  direction={userSortDir}
                                  onSort={handleUserColumnSort}
                                />
                                <UserTableSortHeader
                                  label="Access level"
                                  columnKey="accessLevel"
                                  activeKey={userSortKey}
                                  direction={userSortDir}
                                  onSort={handleUserColumnSort}
                                />
                                <UserTableSortHeader
                                  label="Status"
                                  columnKey="status"
                                  activeKey={userSortKey}
                                  direction={userSortDir}
                                  onSort={handleUserColumnSort}
                                />
                              </tr>
                            </thead>
                            <tbody>
                              {filteredCloudUsers.map((item) => (
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
                                  <td className="px-3 py-2 max-w-56 truncate text-muted-foreground">
                                    {item.company}
                                  </td>
                                  <td className="px-3 py-2 max-w-48 truncate">
                                    {item.accessLevel}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {item.status}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Users
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.companies.map((item) => {
                            const companyUsers =
                              usersByCompanyId.get(item.id) ?? [];
                            const userCount = companyUsers.length;
                            const expanded = expandedCompanyId === item.id;

                            return (
                              <Fragment key={item.id}>
                                <tr
                                  className={cn(
                                    "cursor-pointer border-b border-border/70 transition-colors",
                                    "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    expanded && "bg-muted/30",
                                  )}
                                  tabIndex={0}
                                  role="button"
                                  aria-expanded={expanded}
                                  onClick={() =>
                                    setExpandedCompanyId((id) =>
                                      id === item.id ? null : item.id,
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setExpandedCompanyId((id) =>
                                        id === item.id ? null : item.id,
                                      );
                                    }
                                  }}
                                >
                                  <td className="max-w-72 px-3 py-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                      <ChevronRight
                                        className={cn(
                                          "size-4 shrink-0 text-muted-foreground transition-transform",
                                          expanded && "rotate-90",
                                        )}
                                        aria-hidden
                                      />
                                      <span className="truncate font-medium">
                                        {item.name}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {userCount}
                                  </td>
                                </tr>
                                {expanded ? (
                                  <tr className="border-b border-border/70 bg-muted/20">
                                    <td
                                      colSpan={2}
                                      className="px-3 py-3 pl-11 align-top"
                                    >
                                      {companyUsers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          No project users matched this company
                                          by name. User list company labels must
                                          match the company name.
                                        </p>
                                      ) : (
                                        <div className="max-h-64 overflow-auto rounded-md border border-border/80 bg-background/80">
                                          <table className="w-full text-left text-sm">
                                            <thead className="border-b bg-muted/50">
                                              <tr>
                                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                  Name
                                                </th>
                                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                  Email
                                                </th>
                                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                  Access level
                                                </th>
                                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                  Status
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {companyUsers.map((u) => (
                                                <tr
                                                  key={u.id}
                                                  className="border-b border-border/60 last:border-b-0"
                                                >
                                                  <td className="max-w-40 truncate px-3 py-2 font-medium">
                                                    {u.name}
                                                  </td>
                                                  <td className="max-w-48 truncate px-3 py-2 text-muted-foreground">
                                                    {u.email}
                                                  </td>
                                                  <td className="max-w-36 truncate px-3 py-2">
                                                    {u.accessLevel}
                                                  </td>
                                                  <td className="whitespace-nowrap px-3 py-2">
                                                    {u.status}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {overlayImageSrc ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Project image full size"
          onClick={() => setProjectImageOverlayOpen(false)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -right-1 -top-11 z-10 h-9 w-9 rounded-full shadow-md sm:-right-2 sm:-top-12"
              aria-label="Close image"
              onClick={() => setProjectImageOverlayOpen(false)}
            >
              <X className="size-4" aria-hidden />
            </Button>
            <img
              src={overlayImageSrc}
              alt={
                selectedProject?.name
                  ? `Project image: ${selectedProject.name}`
                  : "Project image"
              }
              className="max-h-[min(90vh,calc(100vh-2rem))] max-w-[min(96vw,calc(100vw-2rem))] object-contain rounded-md shadow-2xl ring-1 ring-white/20"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

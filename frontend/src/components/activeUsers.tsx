import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Eye, FileText, LoaderCircle, UserRound } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchActiveUsers,
  fetchSessionsList,
  type ActiveUserItem,
  type SessionListItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type SyncTimelineItem = {
  syncId: string;
  time: string;
  gapMinutesFromPrevious: number | null;
};

function isCrashSession(item: SessionListItem | null): boolean {
  if (!item) return false;
  const raw = item.crashStatus;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

const UNNAMED_ACTIVE_PROJECT = "(Unnamed project)";

function normalizeActiveProjectLabel(
  raw: string | null | undefined,
): string {
  if (typeof raw !== "string") return UNNAMED_ACTIVE_PROJECT;
  const t = raw.trim();
  return t.length > 0 ? t : UNNAMED_ACTIVE_PROJECT;
}

function toTitle(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "hh:mm a, dd MMM yyyy");
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((entry) => formatFieldValue(key, entry)).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const looksLikeDate =
      key.toLowerCase().includes("date") || key.toLowerCase().includes("time");
    if (looksLikeDate) {
      return formatDateTime(value);
    }
    return value;
  }

  return String(value);
}

function formatTimeAndDateParts(
  key: string,
  value: unknown,
): {
  time: string;
  date: string;
} {
  if (value === null || value === undefined || value === "") {
    return { time: "-", date: "" };
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return {
      time: format(parsed, "hh:mm a"),
      date: format(parsed, "dd MMM yyyy"),
    };
  }

  return {
    time: formatFieldValue(key, value),
    date: "",
  };
}

function formatFileSizeMb(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString()} MB`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    if (/(mb|mib)$/i.test(trimmed)) return trimmed;
    if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return `${parsed.toLocaleString()} MB`;
      }
    }
    return trimmed;
  }

  return String(value);
}

function formatSecondsToHms(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return formatFieldValue("sessionDuration", value);
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

function formatSecondsSuffix(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString()} s`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return `${parsed.toLocaleString()} s`;
      }
    }
    return trimmed;
  }

  return String(value);
}

function TimeWithDate({ value }: { value: { time: string; date: string } }) {
  return (
    <>
      <p className="mt-1 text-sm font-medium wrap-break-word">{value.time}</p>
      {value.date && (
        <p className="mt-0.5 text-[11px] font-normal text-muted-foreground wrap-break-word">
          {value.date}
        </p>
      )}
    </>
  );
}

function SyncTimeline({ timeline }: { timeline: SyncTimelineItem[] }) {
  if (timeline.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No associated syncs for this session.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {timeline.map((sync, index) => (
        <div key={sync.syncId} className="relative pl-7">
          <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-violet-100 dark:ring-violet-900" />
          {index < timeline.length - 1 && (
            <span className="absolute left-3.25 top-5 h-[calc(100%-0.2rem)] w-px bg-border" />
          )}

          <div className="rounded-md border bg-muted/10 px-3 py-2">
            <p className="text-sm font-semibold">Sync {index + 1}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateTime(sync.time)}
            </p>
          </div>

          {index < timeline.length - 1 && (
            <div className="ml-1 mt-1.5 mb-0.5">
              <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {timeline[index + 1].gapMinutesFromPrevious === null
                  ? "-"
                  : `${timeline[index + 1].gapMinutesFromPrevious} min gap`}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function getActiveSessionId(item: ActiveUserItem): string {
  if (typeof item.activeDocId === "string" && item.activeDocId.trim()) {
    return item.activeDocId.trim();
  }

  const fromOpenDoc = item.openDocs.find(
    (doc) =>
      typeof doc.sessionId === "string" &&
      !!doc.sessionId.trim() &&
      (doc.modelName === item.activeDocName || item.openDocs.length === 1),
  );

  if (fromOpenDoc?.sessionId) return fromOpenDoc.sessionId;
  return item.openDocs[0]?.sessionId || "";
}

export default function ActiveUsers() {
  const location = useLocation();
  const navigate = useNavigate();
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActiveUserItem[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<SessionListItem | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("project");
    if (!raw || !raw.trim()) return "all";
    return raw.trim();
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("project");
    if (!raw || !raw.trim()) {
      setProjectFilter("all");
    } else {
      setProjectFilter(raw.trim());
    }
  }, [location.search]);

  const applyProjectFilter = useCallback(
    (next: string) => {
      setProjectFilter(next);
      if (next === "all") {
        navigate("/active-users", { replace: true });
      } else {
        navigate(
          `/active-users?project=${encodeURIComponent(next)}`,
          { replace: true },
        );
      }
    },
    [navigate],
  );

  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      names.add(normalizeActiveProjectLabel(item.activeProjectName));
      for (const pk of item.projectKeysFromOpenDocs ?? []) {
        if (pk) names.add(pk);
      }
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    if (projectFilter === "all") return items;
    return items.filter((item) => {
      const keys = item.projectKeysFromOpenDocs;
      if (keys && keys.length > 0) {
        return keys.some((k) => k === projectFilter);
      }
      return (
        normalizeActiveProjectLabel(item.activeProjectName) === projectFilter
      );
    });
  }, [items, projectFilter]);

  useEffect(() => {
    if (projectFilter === "all") return;
    if (loading) return;
    if (!projectOptions.includes(projectFilter)) {
      setProjectFilter("all");
      navigate("/active-users", { replace: true });
    }
  }, [projectOptions, projectFilter, loading, navigate]);

  useEffect(() => {
    setHeaderRight(<RefreshButton onRefresh={refresh} />);
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoading(true);
    fetchActiveUsers()
      .then((result) => setItems(result))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    setShowMoreDetails(false);
  }, [detailOpen, selectedSession]);

  async function openActiveSession(item: ActiveUserItem) {
    const machineName =
      typeof item.machine === "string" ? item.machine.trim() : "";
    const activeModelId =
      typeof item.activeDocId === "string" ? item.activeDocId.trim() : "";
    if (!machineName && !activeModelId) return;

    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedSession(null);

    try {
      // Primary: latest session on this machine for the currently active doc
      if (machineName && activeModelId) {
        const byMachineAndDoc = await fetchSessionsList({
          page: 1,
          limit: 1,
          deviceName: machineName,
          modelId: activeModelId,
        });

        if (byMachineAndDoc.items[0]) {
          setSelectedSession(byMachineAndDoc.items[0]);
          return;
        }
      }

      // Fallback: latest session on this machine regardless of model
      if (machineName) {
        const byMachine = await fetchSessionsList({
          page: 1,
          limit: 1,
          deviceName: machineName,
        });

        if (byMachine.items[0]) {
          setSelectedSession(byMachine.items[0]);
          return;
        }
      }

      setSelectedSession(null);
    } catch {
      setSelectedSession(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const subtitle = `${filteredItems.length} active user${filteredItems.length !== 1 ? "s" : ""}`;

  const sessionPrimaryFields = useMemo(() => {
    if (!selectedSession) {
      return {
        projectName: "-",
        fileName: "-",
        fileSize: "-",
        revitVersion: "-",
      };
    }

    const projectName =
      (typeof selectedSession.cloudProjectName === "string" &&
        selectedSession.cloudProjectName) ||
      (typeof selectedSession.projectId === "string" &&
        selectedSession.projectId) ||
      "-";
    const fileName =
      (typeof selectedSession.fileName === "string" &&
        selectedSession.fileName) ||
      (typeof selectedSession.modelId === "string" &&
        selectedSession.modelId) ||
      "-";

    return {
      projectName,
      fileName,
      fileSize: formatFileSizeMb(selectedSession.fileSize),
      revitVersion: formatFieldValue(
        "revitVersion",
        selectedSession.revitVersion,
      ),
    };
  }, [selectedSession]);

  const sessionTimeFields = useMemo(() => {
    if (!selectedSession) {
      return {
        startTime: { time: "-", date: "" },
        endTime: { time: "-", date: "" },
        readyTime: { time: "-", date: "" },
        openingGap: "-",
        openingDuration: "-",
        totalOpeningDuration: "-",
        closing: { time: "-", date: "" },
        sessionDuration: "-",
      };
    }

    return {
      startTime: formatTimeAndDateParts(
        "openingStartTime",
        selectedSession.openingStartTime,
      ),
      endTime: formatTimeAndDateParts(
        "openingEndTime",
        selectedSession.openingEndTime,
      ),
      readyTime: formatTimeAndDateParts(
        "openingReadyTime",
        selectedSession.openingReadyTime,
      ),
      openingGap: formatSecondsSuffix(selectedSession.openingGap),
      openingDuration: formatSecondsSuffix(selectedSession.openingDuration),
      totalOpeningDuration: formatSecondsSuffix(
        selectedSession.totalOpeningDuration,
      ),
      closing: formatTimeAndDateParts(
        "closingTime",
        selectedSession.closingTime,
      ),
      sessionDuration: formatSecondsToHms(selectedSession.sessionDuration),
    };
  }, [selectedSession]);

  const sessionModelDetails = useMemo(() => {
    if (!selectedSession) {
      return {
        warningCount: "-",
        openWorksetNames: [] as string[],
        openWorksetCountLabel: "-",
      };
    }

    const warningCount = formatFieldValue(
      "warningCount",
      selectedSession.warningCount,
    );
    const openWorksetNames = Array.isArray(selectedSession.openWorksetNames)
      ? selectedSession.openWorksetNames
          .map((name) => String(name).trim())
          .filter((name) => name.length > 0)
      : [];

    const rawOpenWorksetCount = selectedSession.openWorksetCount;
    let openWorksetCountLabel = "-";
    if (typeof rawOpenWorksetCount === "string" && rawOpenWorksetCount.trim()) {
      openWorksetCountLabel = rawOpenWorksetCount.trim();
    } else if (
      typeof rawOpenWorksetCount === "number" &&
      Number.isFinite(rawOpenWorksetCount) &&
      rawOpenWorksetCount > 0
    ) {
      openWorksetCountLabel = `${openWorksetNames.length}/${Math.floor(rawOpenWorksetCount)}`;
    } else if (openWorksetNames.length > 0) {
      openWorksetCountLabel = `${openWorksetNames.length}/${openWorksetNames.length}`;
    }

    return { warningCount, openWorksetNames, openWorksetCountLabel };
  }, [selectedSession]);

  const selectedSessionTimeline = useMemo(() => {
    if (!selectedSession) return [] as SyncTimelineItem[];
    const timeline = selectedSession.syncTimeline;
    return Array.isArray(timeline) ? timeline : [];
  }, [selectedSession]);

  const sessionRemainingFields = useMemo(() => {
    if (!selectedSession) return [] as Array<{ label: string; value: string }>;

    const hidden = new Set([
      "__v",
      "syncTimeline",
      "syncDatabaseIds",
      "dateTime",
      "cloudProjectName",
      "projectId",
      "fileName",
      "modelId",
      "_id",
      "fullName",
      "autodeskUserName",
      "deviceUserName",
      "deviceName",
      "networkConnectionType",
      "localIPAddress",
      "cbtAssemblyVersion",
      "cloudPlatform",
      "filePath",
      "deviceFreeSpace",
      "crashStatus",
      "missingReferences",
      "openingStartTime",
      "openingEndTime",
      "openingReadyTime",
      "openingGap",
      "openingDuration",
      "totalOpeningDuration",
      "closingTime",
      "sessionDuration",
      "syncCount",
      "fileSize",
      "revitVersion",
      "warningCount",
      "openWorksetCount",
      "openWorksetNames",
    ]);

    return Object.entries(selectedSession)
      .filter(([key]) => !hidden.has(key))
      .map(([key, value]) => ({
        label: toTitle(key),
        value: formatFieldValue(key, value),
      }));
  }, [selectedSession]);

  const sessionShowMoreFields = useMemo(() => {
    if (!selectedSession) return [] as Array<{ label: string; value: string }>;

    const fields: Array<{ key: string; label: string; value: unknown }> = [
      { key: "_id", label: "ID", value: selectedSession._id },
      {
        key: "deviceUserName",
        label: "Device Username",
        value: selectedSession.deviceUserName,
      },
      {
        key: "deviceName",
        label: "Device Name",
        value: selectedSession.deviceName,
      },
      {
        key: "networkConnectionType",
        label: "Connection Type",
        value: selectedSession.networkConnectionType,
      },
      {
        key: "localIPAddress",
        label: "IP Address",
        value: selectedSession.localIPAddress,
      },
      {
        key: "cbtAssemblyVersion",
        label: "Assembly Version",
        value: selectedSession.cbtAssemblyVersion,
      },
      {
        key: "cloudPlatform",
        label: "Autodesk Platform",
        value: selectedSession.cloudPlatform,
      },
      { key: "filePath", label: "File Path", value: selectedSession.filePath },
      {
        key: "deviceFreeSpace",
        label: "Device Free Space",
        value: selectedSession.deviceFreeSpace,
      },
      {
        key: "crashStatus",
        label: "Crash",
        value: selectedSession.crashStatus,
      },
      {
        key: "missingReferences",
        label: "Missing References",
        value: selectedSession.missingReferences,
      },
    ];

    return fields
      .filter((field) => field.value !== undefined && field.value !== null)
      .map((field) => ({
        label: field.label,
        value: formatFieldValue(field.key, field.value),
      }));
  }, [selectedSession]);

  const selectedSessionIsCrash = useMemo(
    () => isCrashSession(selectedSession),
    [selectedSession],
  );

  return (
    <div className="space-y-4">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <CardTitle>Active Users</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a cloud project to show only users currently in that
              project.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:min-w-[14rem]">
            <label
              htmlFor="active-users-project-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Project
            </label>
            <select
              id="active-users-project-filter"
              value={projectFilter}
              onChange={(e) => applyProjectFilter(e.target.value)}
              className={cn(
                "h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <option value="all">All projects</option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active users right now.
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active users in this project. Choose another project or
            &quot;All projects&quot;.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredItems.map((item) => {
            const displayName = item.fullName?.trim() || item.autodeskUserName;
            const updatedAt = formatDateTime(item.dateTime);
            const activeSessionId = getActiveSessionId(item);
            const activeModelId =
              typeof item.activeDocId === "string"
                ? item.activeDocId.trim()
                : "";

            return (
              <Card
                key={item._id}
                className="h-full border-border/90 bg-background/95 shadow-sm"
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base leading-tight">
                        {displayName}
                      </CardTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        @{item.autodeskUserName}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                      Live
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
                      <p className="text-muted-foreground">Machine</p>
                      <p className="mt-0.5 font-semibold wrap-break-word">
                        {item.machine}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
                      <p className="text-muted-foreground">Revit</p>
                      <p className="mt-0.5 font-semibold wrap-break-word">
                        {item.revitVersion}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex h-full flex-col space-y-3 pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Open Documents ({item.openDocs.length})
                    </p>
                    {item.openDocs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No open documents.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {item.openDocs.map((doc) => {
                          const isActive =
                            !!item.activeDocName &&
                            doc.modelName === item.activeDocName;

                          return (
                            <div
                              key={`${item._id}-${doc.sessionId}-${doc.modelName}`}
                              className={`rounded-md border px-3 py-2 ${
                                isActive
                                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                                  : "bg-muted/20"
                              }`}
                            >
                              <div className="flex min-w-0 items-start gap-1.5">
                                <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <p className="min-w-0 break-all text-sm font-medium">
                                  {doc.modelName || "Untitled Model"}
                                </p>
                              </div>
                              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                                Session: {doc.sessionId || "-"}
                              </p>

                              {isActive && (
                                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-2 dark:border-blue-800 dark:bg-blue-950/50">
                                  <p className="text-[11px] uppercase tracking-wide text-blue-700 dark:text-blue-400">
                                    Active View
                                  </p>
                                  <div className="mt-1 flex min-w-0 items-start gap-1.5">
                                    <Eye className="mt-0.5 size-3.5 shrink-0 text-blue-900 dark:text-blue-200" />
                                    <p className="min-w-0 break-all text-sm font-semibold text-blue-900 dark:text-blue-200">
                                      {item.activeViewName || "-"}
                                    </p>
                                  </div>
                                  <p className="break-all text-[11px] text-blue-700/85 dark:text-blue-400/80">
                                    {item.activeProjectName || "-"}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-col gap-2 border-t pt-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Updated {updatedAt}
                    </p>
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => void openActiveSession(item)}
                      disabled={
                        (!activeSessionId && !activeModelId) || detailLoading
                      }
                    >
                      {detailLoading ? (
                        <span className="inline-flex items-center gap-1.5">
                          <LoaderCircle className="size-3.5 animate-spin" />
                          Loading
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="size-3.5" />
                          See Active Session
                        </span>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className={`sm:max-w-xl w-[92vw] overflow-y-auto ${
            selectedSessionIsCrash
              ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/60"
              : ""
          }`}
        >
          <SheetHeader>
            <SheetTitle>
              <span className="inline-flex items-center gap-2">
                <span>Session Details</span>
                {selectedSessionIsCrash && (
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                    Crash
                  </span>
                )}
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3 px-4 pb-4">
            {!selectedSession ? (
              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                Session details unavailable.
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="mt-1 text-lg font-bold leading-tight wrap-break-word">
                    {selectedSession.fullName ||
                      selectedSession.autodeskUserName ||
                      "Unknown user"}
                  </p>
                  {selectedSession.fullName &&
                    selectedSession.autodeskUserName && (
                      <p className="mt-1 text-sm font-semibold text-muted-foreground wrap-break-word">
                        @{selectedSession.autodeskUserName}
                      </p>
                    )}
                </div>

                <div className="rounded-xl border-2 border-violet-200/70 bg-violet-50/40 p-4 space-y-3 dark:border-violet-800/60 dark:bg-violet-950/30">
                  <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-400">
                    Project Details
                  </p>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Project Name
                    </p>
                    <p className="mt-1 text-sm font-medium wrap-break-word">
                      {sessionPrimaryFields.projectName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">File Name</p>
                    <p className="mt-1 text-sm font-medium wrap-break-word">
                      {sessionPrimaryFields.fileName}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">File Size</p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionPrimaryFields.fileSize}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Revit Version
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionPrimaryFields.revitVersion}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    Time Metrics
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Start Time
                      </p>
                      <TimeWithDate value={sessionTimeFields.startTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End Time</p>
                      <TimeWithDate value={sessionTimeFields.endTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ready Time
                      </p>
                      <TimeWithDate value={sessionTimeFields.readyTime} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground leading-tight">
                        <span className="block">Opening</span>
                        <span className="block">Gap</span>
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionTimeFields.openingGap}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Opening Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionTimeFields.openingDuration}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total Opening Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionTimeFields.totalOpeningDuration}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Closing Time
                      </p>
                      <TimeWithDate value={sessionTimeFields.closing} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Session Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionTimeFields.sessionDuration}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    Model Details
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Warning Count
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionModelDetails.warningCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Open Workset List (
                        {sessionModelDetails.openWorksetCountLabel})
                      </p>
                      {sessionModelDetails.openWorksetNames.length === 0 ? (
                        <p className="text-sm text-muted-foreground">-</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {sessionModelDetails.openWorksetNames.map((name) => (
                            <span
                              key={name}
                              className="inline-flex rounded-md border bg-muted/40 px-2 py-1 text-xs"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2">Syncs</p>
                  <SyncTimeline timeline={selectedSessionTimeline} />
                </div>

                <div className="rounded-lg border p-3">
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    onClick={() => setShowMoreDetails((current) => !current)}
                  >
                    {showMoreDetails ? "Show Less" : "Show More"}
                  </button>

                  {showMoreDetails && (
                    <div className="mt-3 space-y-3">
                      {sessionShowMoreFields.map((field) => (
                        <div
                          key={field.label}
                          className="rounded-md border p-3"
                        >
                          <p className="text-xs text-muted-foreground">
                            {field.label}
                          </p>
                          <p className="mt-1 text-sm wrap-break-word">
                            {field.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {sessionRemainingFields.map((field) => (
                  <div key={field.label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      {field.label}
                    </p>
                    <p className="mt-1 text-sm wrap-break-word">
                      {field.value}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

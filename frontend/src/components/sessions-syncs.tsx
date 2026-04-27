import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  CLICKABLE_CARD_HOVER,
  CLICKABLE_CARD_HOVER_ROSE,
  cn,
} from "@/lib/utils";
import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchSessionById,
  fetchSessionFilterOptions,
  fetchSessionsList,
  fetchSyncById,
  fetchSyncsList,
  type PaginatedListResponse,
  type SessionFilterOptions,
  type SessionListItem,
  type SyncListItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Mode = "sessions" | "syncs";
type PageToken = number | "left-ellipsis" | "right-ellipsis";
type SyncTimelineItem = {
  syncId: string;
  time: string;
  gapMinutesFromPrevious: number | null;
};

function formatSessionUserOptionLabel(u: {
  autodeskUserName: string;
  fullName: string;
  count: number;
}): string {
  const display = u.fullName?.trim() || u.autodeskUserName;
  const n = typeof u.count === "number" && Number.isFinite(u.count) ? u.count : 0;
  return `${display} (${n})`;
}

function formatSessionModelOptionLabel(m: {
  label: string;
  count: number;
}): string {
  const n =
    typeof m.count === "number" && Number.isFinite(m.count) ? m.count : 0;
  return `${m.label} (${n})`;
}

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

function isActiveSession(item: SessionListItem | null): boolean {
  if (!item) return false;
  const ct = item.closingTime;
  return ct === "" || ct === null || ct === undefined;
}

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

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "hh:mm a, dd MMM yyyy");
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

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((entry) => formatFieldValue(key, entry)).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
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

function SyncTimeline({
  timeline,
  compact = false,
  onSyncClick,
}: {
  timeline: SyncTimelineItem[];
  compact?: boolean;
  onSyncClick?: (syncId: string) => void;
}) {
  if (timeline.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No associated syncs for this session.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {timeline.map((sync, index) => (
        <div key={sync.syncId} className="relative pl-7">
          <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-violet-100 dark:ring-violet-900" />
          {index < timeline.length - 1 && (
            <span className="absolute left-3.25 top-5 h-[calc(100%-0.2rem)] w-px bg-border" />
          )}

          {onSyncClick ? (
            <button
              type="button"
              onClick={() => onSyncClick(sync.syncId)}
              title="Go to Sync Details"
              className="block w-full rounded-md border bg-muted/10 px-3 py-2 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
            >
              <p
                className={
                  compact ? "text-xs font-semibold" : "text-sm font-semibold"
                }
              >
                Sync {index + 1}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(sync.time)}
              </p>
            </button>
          ) : (
            <div className="rounded-md border bg-muted/10 px-3 py-2">
              <p
                className={
                  compact ? "text-xs font-semibold" : "text-sm font-semibold"
                }
              >
                Sync {index + 1}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(sync.time)}
              </p>
            </div>
          )}

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

function SessionCard({
  item,
  onClick,
  syncsExpanded,
  onToggleSyncs,
}: {
  item: SessionListItem;
  onClick: () => void;
  syncsExpanded: boolean;
  onToggleSyncs: () => void;
}) {
  const syncTimeline = item.syncTimeline ?? [];
  const syncCount = item.syncCount ?? syncTimeline.length;
  const crash = isCrashSession(item);
  const active = !crash && isActiveSession(item);

  const averageSyncGapLabel = useMemo(() => {
    if (syncCount < 2) return null;
    const gaps = syncTimeline
      .map((entry) => entry.gapMinutesFromPrevious)
      .filter((gap): gap is number => typeof gap === "number" && gap >= 0);
    if (gaps.length === 0) return null;
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    return `${average.toFixed(1)} min`;
  }, [syncCount, syncTimeline]);

  return (
    <Card
      className={cn(
        "w-full",
        crash
          ? cn(CLICKABLE_CARD_HOVER_ROSE, "border-rose-300 bg-rose-50/60 hover:bg-rose-100/60 dark:border-rose-800 dark:bg-rose-950/40 dark:hover:bg-rose-950/60")
          : active
            ? cn(CLICKABLE_CARD_HOVER, "border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/50 dark:border-emerald-700 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50")
            : cn(CLICKABLE_CARD_HOVER, "hover:bg-muted/30"),
      )}
      onClick={onClick}
    >
      <CardContent className="py-3.5 px-4">
        {/* status badge — sits above the grid, doesn't affect column alignment */}
        {(active || crash) && (
          <div className="mb-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                crash
                  ? "border border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                  : "border border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
              )}
            >
              {crash ? "Crash" : "Live"}
            </span>
          </div>
        )}

        <div className="flex items-start gap-3 min-w-0">
          {/* main grid */}
          <div className="flex-1 grid gap-x-6 gap-y-1 grid-cols-2 sm:grid-cols-4 min-w-0">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Project</p>
              <p className="text-sm font-medium truncate">
                {item.cloudProjectName || item.projectId || "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="text-sm font-medium truncate">
                {item.fileName || item.modelId || "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">User</p>
              <p className="text-sm font-medium truncate">
                {item.fullName || item.autodeskUserName || "—"}
              </p>
              {item.fullName && item.autodeskUserName && (
                <p className="text-xs text-muted-foreground truncate">
                  @{item.autodeskUserName}
                </p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="text-sm font-medium">
                {item.dateTime ? formatDateTime(item.dateTime) : "—"}
              </p>
            </div>
          </div>

          {/* syncs pill */}
          <div className="shrink-0 flex items-center mt-0.5">
            {syncCount > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSyncs();
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  syncsExpanded
                    ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-400"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-violet-300 hover:text-violet-700",
                )}
              >
                {syncCount} sync{syncCount !== 1 ? "s" : ""}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">0 syncs</span>
            )}
          </div>
        </div>

        {syncCount > 0 && syncsExpanded && (
          <div className="mt-3 rounded-lg border bg-background p-3">
            {averageSyncGapLabel && (
              <p className="mb-2 text-xs text-muted-foreground">
                Avg sync gap: {averageSyncGapLabel}
              </p>
            )}
            <SyncTimeline timeline={syncTimeline} compact />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SyncCard({
  item,
  onClick,
}: {
  item: SyncListItem;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn("w-full", CLICKABLE_CARD_HOVER, "hover:bg-muted/30")}
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Project</p>
            <p className="font-medium truncate">
              {item.cloudProjectName || item.projectId || "Unknown project"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Model</p>
            <p className="font-medium truncate">
              {item.fileName || item.modelId || "Unknown model"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">User</p>
            <p className="font-medium truncate">
              {item.fullName || item.autodeskUserName || "Unknown user"}
            </p>
            {item.fullName && item.autodeskUserName && (
              <p className="text-xs text-muted-foreground truncate">
                @{item.autodeskUserName}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium">
              {item.dateTime || item.date
                ? formatDateTime((item.dateTime ?? item.date) as string)
                : "-"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SessionsSyncsPage({ mode }: { mode: Mode }) {
  const title = mode === "sessions" ? "Sessions" : "Syncs";
  const setHeaderRight = useHeaderRight();
  const navigate = useNavigate();
  const location = useLocation();
  const { from, to } = useDateRange();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [data, setData] = useState<
    PaginatedListResponse<SessionListItem | SyncListItem>
  >({
    items: [],
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [selectedItem, setSelectedItem] = useState<
    SessionListItem | SyncListItem | null
  >(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [expandedSyncsBySessionId, setExpandedSyncsBySessionId] = useState<
    Record<string, boolean>
  >({});
  const [sessionScope, setSessionScope] = useState<"all" | "crash" | "live">("all");
  const [filterProject, setFilterProject] = useState<"all" | string>("all");
  const [filterModel, setFilterModel] = useState<"all" | string>("all");
  const [filterUser, setFilterUser] = useState<"all" | string>("all");
  const [filterOptions, setFilterOptions] = useState<SessionFilterOptions>({
    projects: [],
    models: [],
    users: [],
  });

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const handleRefresh = useCallback(() => {
    setPage(1);
    refresh();
  }, [refresh]);

  useEffect(() => {
    setHeaderRight(
      <div className="flex items-center gap-2">
        <DateRangeFilter />
        <RefreshButton onRefresh={handleRefresh} />
      </div>,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight, handleRefresh]);

  useEffect(() => {
    setPage(1);
    setDetailsOpen(false);
    setSelectedItem(null);
    setShowMoreDetails(false);
    setExpandedSyncsBySessionId({});
    setFilterProject("all");
    setFilterModel("all");
    setFilterUser("all");
    if (mode !== "sessions") {
      setSessionScope("all");
    }
  }, [mode, fromStr, toStr]);

  const clearSessionFilters = useCallback(() => {
    setFilterProject("all");
    setFilterModel("all");
    setFilterUser("all");
  }, []);

  useEffect(() => {
    if (mode !== "sessions") {
      setFilterOptions({ projects: [], models: [], users: [] });
      return;
    }
    let cancelled = false;
    fetchSessionFilterOptions({
      from: fromStr,
      to: toStr,
      cloudProjectName:
        filterProject === "all" ? undefined : filterProject,
      modelId: filterModel === "all" ? undefined : filterModel,
    })
      .then((opts) => {
        if (!cancelled) setFilterOptions(opts);
      })
      .catch(() => {
        if (!cancelled) {
          setFilterOptions({ projects: [], models: [], users: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, fromStr, toStr, refreshKey, filterProject, filterModel]);

  useEffect(() => {
    setPage(1);
  }, [sessionScope, filterProject, filterModel, filterUser]);

  useEffect(() => {
    setShowMoreDetails(false);
  }, [selectedItem, detailsOpen, mode]);

  const selectedSessionTimeline = useMemo(() => {
    if (mode !== "sessions") return [] as SyncTimelineItem[];
    if (!selectedItem) return [] as SyncTimelineItem[];
    const timeline = (selectedItem as SessionListItem).syncTimeline;
    return Array.isArray(timeline) ? timeline : [];
  }, [mode, selectedItem]);

  const sessionPrimaryFields = useMemo(() => {
    if (mode !== "sessions" || !selectedItem) {
      return {
        projectName: "-",
        fileName: "-",
        fileSize: "-",
        revitVersion: "-",
      };
    }

    const session = selectedItem as SessionListItem;
    const projectName =
      (typeof session.cloudProjectName === "string" &&
        session.cloudProjectName) ||
      (typeof session.projectId === "string" && session.projectId) ||
      "-";
    const fileName =
      (typeof session.fileName === "string" && session.fileName) ||
      (typeof session.modelId === "string" && session.modelId) ||
      "-";
    const fileSize = formatFileSizeMb(session.fileSize);
    const revitVersion = formatFieldValue("revitVersion", session.revitVersion);

    return { projectName, fileName, fileSize, revitVersion };
  }, [mode, selectedItem]);

  const sessionGroupedFields = useMemo(() => {
    if (mode !== "sessions" || !selectedItem) {
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

    const session = selectedItem as SessionListItem;
    return {
      startTime: formatTimeAndDateParts(
        "openingStartTime",
        session.openingStartTime,
      ),
      endTime: formatTimeAndDateParts("openingEndTime", session.openingEndTime),
      readyTime: formatTimeAndDateParts(
        "openingReadyTime",
        session.openingReadyTime,
      ),
      openingGap: formatSecondsSuffix(session.openingGap),
      openingDuration: formatSecondsSuffix(session.openingDuration),
      totalOpeningDuration: formatSecondsSuffix(session.totalOpeningDuration),
      closing: formatTimeAndDateParts("closingTime", session.closingTime),
      sessionDuration: formatSecondsToHms(session.sessionDuration),
    };
  }, [mode, selectedItem]);

  const sessionModelDetails = useMemo(() => {
    if (mode !== "sessions" || !selectedItem) {
      return {
        warningCount: "-",
        openWorksetNames: [] as string[],
      };
    }

    const session = selectedItem as SessionListItem;
    const warningCount = formatFieldValue("warningCount", session.warningCount);
    const openWorksetNames = Array.isArray(session.openWorksetNames)
      ? session.openWorksetNames
          .map((name) => String(name).trim())
          .filter((name) => name.length > 0)
      : [];

    const rawOpenWorksetCount = session.openWorksetCount;
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
  }, [mode, selectedItem]);

  const sessionRemainingFields = useMemo(() => {
    if (mode !== "sessions" || !selectedItem) {
      return [] as Array<{ label: string; value: string }>;
    }

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

    return Object.entries(selectedItem)
      .filter(([key]) => !hidden.has(key))
      .map(([key, value]) => ({
        label: toTitle(key),
        value: formatFieldValue(key, value),
      }));
  }, [mode, selectedItem]);

  const sessionShowMoreFields = useMemo(() => {
    if (mode !== "sessions" || !selectedItem) {
      return [] as Array<{ label: string; value: string }>;
    }

    const session = selectedItem as SessionListItem;
    const fields: Array<{ key: string; label: string; value: unknown }> = [
      { key: "_id", label: "ID", value: session._id },
      {
        key: "deviceUserName",
        label: "Device Username",
        value: session.deviceUserName,
      },
      { key: "deviceName", label: "Device Name", value: session.deviceName },
      {
        key: "networkConnectionType",
        label: "Connection Type",
        value: session.networkConnectionType,
      },
      {
        key: "localIPAddress",
        label: "IP Address",
        value: session.localIPAddress,
      },
      {
        key: "cbtAssemblyVersion",
        label: "Assembly Version",
        value: session.cbtAssemblyVersion,
      },
      {
        key: "cloudPlatform",
        label: "Autodesk Platform",
        value: session.cloudPlatform,
      },
      { key: "filePath", label: "File Path", value: session.filePath },
      {
        key: "deviceFreeSpace",
        label: "Device Free Space",
        value: session.deviceFreeSpace,
      },
      { key: "crashStatus", label: "Crash", value: session.crashStatus },
      {
        key: "missingReferences",
        label: "Missing References",
        value: session.missingReferences,
      },
    ];

    return fields
      .filter((field) => field.value !== undefined && field.value !== null)
      .map((field) => ({
        label: field.label,
        value: formatFieldValue(field.key, field.value),
      }));
  }, [mode, selectedItem]);

  const syncPrimaryFields = useMemo(() => {
    if (mode !== "syncs" || !selectedItem) {
      return {
        projectName: "-",
        fileName: "-",
      };
    }

    const sync = selectedItem as SyncListItem;
    return {
      projectName:
        (typeof sync.cloudProjectName === "string" && sync.cloudProjectName) ||
        (typeof sync.projectId === "string" && sync.projectId) ||
        "-",
      fileName:
        (typeof sync.fileName === "string" && sync.fileName) ||
        (typeof sync.modelId === "string" && sync.modelId) ||
        "-",
    };
  }, [mode, selectedItem]);

  const syncTimeFields = useMemo(() => {
    if (mode !== "syncs" || !selectedItem) {
      return {
        syncStartTime: { time: "-", date: "" },
        syncEndTime: { time: "-", date: "" },
        syncReadyTime: { time: "-", date: "" },
        gap: "-",
        duration: "-",
        totalDuration: "-",
      };
    }

    const sync = selectedItem as SyncListItem;
    return {
      syncStartTime: formatTimeAndDateParts("syncStartTime", sync.syncStartTime),
      syncEndTime: formatTimeAndDateParts("syncEndTime", sync.syncEndTime),
      syncReadyTime: formatTimeAndDateParts("syncReadyTime", sync.syncReadyTime),
      gap: formatSecondsSuffix(sync.gap),
      duration: formatSecondsSuffix(sync.duration),
      totalDuration: formatSecondsSuffix(sync.totalDuration),
    };
  }, [mode, selectedItem]);

  const syncRemainingFields = useMemo(() => {
    if (mode !== "syncs" || !selectedItem) {
      return [] as Array<{ label: string; value: string }>;
    }

    const hidden = new Set([
      "_id",
      "fullName",
      "autodeskUserName",
      "projectId",
      "cloudProjectName",
      "fileName",
      "modelId",
      "filePath",
      "dateTime",
      "date",
      "syncStartTime",
      "syncEndTime",
      "syncReadyTime",
      "gap",
      "duration",
      "totalDuration",
      "revitSessionId",
    ]);

    return Object.entries(selectedItem)
      .filter(([key]) => !hidden.has(key))
      .map(([key, value]) => ({
        label: toTitle(key),
        value: formatFieldValue(key, value),
      }));
  }, [mode, selectedItem]);

  const selectedSyncSessionId = useMemo(() => {
    if (mode !== "syncs" || !selectedItem) {
      return "";
    }

    return (selectedItem as SyncListItem).revitSessionId?.trim() ?? "";
  }, [mode, selectedItem]);

  useEffect(() => {
    setLoading(true);

    const request =
      mode === "sessions"
        ? fetchSessionsList({
            from: fromStr,
            to: toStr,
            page,
            limit,
            crashOnly: sessionScope === "crash" ? true : undefined,
            liveOnly: sessionScope === "live" ? true : undefined,
            cloudProjectName:
              filterProject === "all" ? undefined : filterProject,
            modelId: filterModel === "all" ? undefined : filterModel,
            autodeskUserName: filterUser === "all" ? undefined : filterUser,
          })
        : fetchSyncsList({ from: fromStr, to: toStr, page, limit });

    request
      .then((result) =>
        setData(
          result as PaginatedListResponse<SessionListItem | SyncListItem>,
        ),
      )
      .catch(() =>
        setData({ items: [], total: 0, page: 1, limit, totalPages: 1 }),
      )
      .finally(() => setLoading(false));
  }, [
    mode,
    fromStr,
    toStr,
    page,
    limit,
    refreshKey,
    sessionScope,
    filterProject,
    filterModel,
    filterUser,
  ]);

  useEffect(() => {
    const state = location.state as { openSessionId?: string } | null;
    const openSessionId =
      typeof state?.openSessionId === "string" ? state.openSessionId : "";

    if (mode !== "sessions" || !openSessionId) {
      return;
    }

    fetchSessionById(openSessionId)
      .then((session) => {
        setSelectedItem(session);
        setDetailsOpen(true);
      })
      .finally(() => {
        navigate(location.pathname, { replace: true, state: null });
      });
  }, [mode, location.pathname, location.state, navigate]);

  useEffect(() => {
    const state = location.state as { openSyncId?: string } | null;
    const openSyncId =
      typeof state?.openSyncId === "string" ? state.openSyncId : "";

    if (mode !== "syncs" || !openSyncId) {
      return;
    }

    fetchSyncById(openSyncId)
      .then((sync) => {
        setSelectedItem(sync);
        setDetailsOpen(true);
      })
      .finally(() => {
        navigate(location.pathname, { replace: true, state: null });
      });
  }, [mode, location.pathname, location.state, navigate]);

  const subtitle = useMemo(() => {
    const fromLabel = format(from, "dd MMM yyyy");
    const toLabel = format(to, "dd MMM yyyy");
    return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
  }, [from, to]);

  const pageTokens = useMemo(
    () => buildPageTokens(data.page, data.totalPages),
    [data.page, data.totalPages],
  );
  const selectedSessionIsCrash = useMemo(() => {
    if (mode !== "sessions") return false;
    return isCrashSession(selectedItem as SessionListItem | null);
  }, [mode, selectedItem]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-1 py-1">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle>{title}</CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {subtitle} • {data.total} total • Page {data.page} of{" "}
                  {data.totalPages}
                </p>
                {mode === "sessions" && (
                  <>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      id="sessions-crash-filter-label"
                      className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                    >
                      Crash only
                    </span>
                    <button
                      type="button"
                      id="sessions-crash-filter"
                      role="switch"
                      aria-checked={sessionScope === "crash"}
                      aria-labelledby="sessions-crash-filter-label"
                      onClick={() =>
                        setSessionScope((s) =>
                          s === "crash" ? "all" : "crash",
                        )
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                        sessionScope === "crash"
                          ? "bg-primary"
                          : "bg-input dark:bg-input/80",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                          sessionScope === "crash"
                            ? "translate-x-5"
                            : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      id="sessions-live-filter-label"
                      className="text-xs font-medium text-muted-foreground whitespace-nowrap"
                    >
                      Live only
                    </span>
                    <button
                      type="button"
                      id="sessions-live-filter"
                      role="switch"
                      aria-checked={sessionScope === "live"}
                      aria-labelledby="sessions-live-filter-label"
                      onClick={() =>
                        setSessionScope((s) =>
                          s === "live" ? "all" : "live",
                        )
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                        sessionScope === "live"
                          ? "bg-emerald-500"
                          : "bg-input dark:bg-input/80",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                          sessionScope === "live"
                            ? "translate-x-5"
                            : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                  </>
                )}
              </div>
              {mode === "sessions" && (
                <div className="space-y-3 border-t border-border/60 pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1 sm:col-span-1">
                      <label
                        htmlFor="sessions-filter-project"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Project
                      </label>
                      <select
                        id="sessions-filter-project"
                        value={filterProject}
                        onChange={(e) => {
                          setFilterProject(e.target.value);
                          setFilterModel("all");
                          setFilterUser("all");
                        }}
                        className={cn(
                          "h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        )}
                      >
                        <option value="all">All projects</option>
                        {filterOptions.projects.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor="sessions-filter-model"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Model
                      </label>
                      <select
                        id="sessions-filter-model"
                        value={filterModel}
                        onChange={(e) => {
                          setFilterModel(e.target.value);
                          setFilterUser("all");
                        }}
                        className={cn(
                          "h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        )}
                      >
                        <option value="all">All models</option>
                        {filterOptions.models.map((m) => (
                          <option key={m.modelId} value={m.modelId}>
                            {formatSessionModelOptionLabel(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor="sessions-filter-user"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        User
                      </label>
                      <select
                        id="sessions-filter-user"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className={cn(
                          "h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        )}
                      >
                        <option value="all">All users</option>
                        {filterOptions.users.map((u) => (
                          <option
                            key={u.autodeskUserName}
                            value={u.autodeskUserName}
                          >
                            {formatSessionUserOptionLabel(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex min-h-[3.25rem] min-w-0 items-end justify-start sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full shrink-0 sm:w-auto"
                        onClick={clearSessionFilters}
                      >
                        Clear filters
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
        </CardHeader>
      </Card>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent
          side="right"
          className={`sm:max-w-xl w-[92vw] overflow-y-auto ${
            mode === "sessions" && selectedSessionIsCrash
              ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/60"
              : ""
          }`}
        >
          <SheetHeader>
            <SheetTitle>
              <span className="inline-flex items-center gap-2">
                <span>
                  {mode === "sessions" ? "Session Details" : "Sync Details"}
                </span>
                {mode === "sessions" && selectedSessionIsCrash && (
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                    Crash
                  </span>
                )}
              </span>
            </SheetTitle>
            {mode === "syncs" && (
              <SheetDescription>
                {selectedItem?.fullName ||
                  selectedItem?.autodeskUserName ||
                  "User"}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="space-y-3 px-4 pb-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">User</p>
              <p className="mt-1 text-lg font-bold leading-tight wrap-break-word">
                {selectedItem?.fullName ||
                  selectedItem?.autodeskUserName ||
                  "Unknown user"}
              </p>
              {selectedItem?.fullName && selectedItem?.autodeskUserName && (
                <p className="mt-1 text-sm font-semibold text-muted-foreground wrap-break-word">
                  @{selectedItem.autodeskUserName}
                </p>
              )}
            </div>

            {mode === "sessions" ? (
              <>
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
                      <TimeWithDate value={sessionGroupedFields.startTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End Time</p>
                      <TimeWithDate value={sessionGroupedFields.endTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ready Time
                      </p>
                      <TimeWithDate value={sessionGroupedFields.readyTime} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground leading-tight">
                        <span className="block">Opening</span>
                        <span className="block">Gap</span>
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionGroupedFields.openingGap}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Opening Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionGroupedFields.openingDuration}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total Opening Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionGroupedFields.totalOpeningDuration}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Closing Time
                      </p>
                      <TimeWithDate value={sessionGroupedFields.closing} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Session Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {sessionGroupedFields.sessionDuration}
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
                  <SyncTimeline
                    timeline={selectedSessionTimeline}
                    onSyncClick={(syncId) =>
                      navigate("/syncs", {
                        state: { openSyncId: syncId },
                      })
                    }
                  />
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
            ) : (
              <>
                <div className="rounded-xl border-2 border-violet-200/70 bg-violet-50/40 p-4 space-y-3 dark:border-violet-800/60 dark:bg-violet-950/30">
                  <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-400">
                    Project Details
                  </p>
                  <div>
                    <p className="text-xs text-muted-foreground">Project Name</p>
                    <p className="mt-1 text-sm font-medium wrap-break-word">
                      {syncPrimaryFields.projectName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">File Name</p>
                    <p className="mt-1 text-sm font-medium wrap-break-word">
                      {syncPrimaryFields.fileName}
                    </p>
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
                      <TimeWithDate value={syncTimeFields.syncStartTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End Time</p>
                      <TimeWithDate value={syncTimeFields.syncEndTime} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ready Time
                      </p>
                      <TimeWithDate value={syncTimeFields.syncReadyTime} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Gap</p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {syncTimeFields.gap}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {syncTimeFields.duration}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total Duration
                      </p>
                      <p className="mt-1 text-sm font-medium wrap-break-word">
                        {syncTimeFields.totalDuration}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedSyncSessionId && (
                  <div className="rounded-lg border p-3">
                    <Button
                      type="button"
                      onClick={() =>
                        navigate("/sessions", {
                          state: {
                            openSessionId: selectedSyncSessionId,
                          },
                        })
                      }
                    >
                      Go to Session
                    </Button>
                  </div>
                )}

                {syncRemainingFields.map((field) => (
                  <div key={field.label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{field.label}</p>
                    <p className="mt-1 text-sm wrap-break-word">{field.value}</p>
                  </div>
                ))}
              </>
            )}
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
                No records found for this date range.
              </CardContent>
            </Card>
          ) : mode === "sessions" ? (
            data.items.map((item) => (
              <SessionCard
                key={(item as SessionListItem)._id}
                item={item as SessionListItem}
                onClick={() => {
                  setSelectedItem(item as SessionListItem);
                  setDetailsOpen(true);
                }}
                syncsExpanded={
                  expandedSyncsBySessionId[(item as SessionListItem)._id] ??
                  false
                }
                onToggleSyncs={() =>
                  setExpandedSyncsBySessionId((current) => ({
                    ...current,
                    [(item as SessionListItem)._id]:
                      !current[(item as SessionListItem)._id],
                  }))
                }
              />
            ))
          ) : (
            data.items.map((item) => (
              <SyncCard
                key={(item as SyncListItem)._id}
                item={item as SyncListItem}
                onClick={() => {
                  setSelectedItem(item as SyncListItem);
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

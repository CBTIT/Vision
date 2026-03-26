import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { DateRangeFilter } from "./date-range-filter";
import { useDateRange } from "./date-range-context";
import {
  fetchSessionsList,
  fetchSyncsList,
  type PaginatedListResponse,
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
}: {
  timeline: SyncTimelineItem[];
  compact?: boolean;
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
          <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-violet-400 ring-2 ring-violet-100" />
          {index < timeline.length - 1 && (
            <span className="absolute left-3.25 top-5 h-[calc(100%-0.2rem)] w-px bg-border" />
          )}

          <div className="rounded-md border bg-muted/10 px-3 py-2">
            <p
              className={
                compact ? "text-xs font-semibold" : "text-sm font-semibold"
              }
            >
              Sync {index + 1}
            </p>
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
      className={`w-full cursor-pointer transition-colors ${
        crash
          ? "border-rose-300 bg-rose-50/60 hover:bg-rose-100/60"
          : "hover:bg-muted/30"
      }`}
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
              {item.dateTime ? formatDateTime(item.dateTime) : "-"}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t pt-3">
          {averageSyncGapLabel && (
            <p className="mb-2 text-xs text-muted-foreground">
              Average Sync Gap: {averageSyncGapLabel}
            </p>
          )}

          {syncCount > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSyncs();
              }}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
            >
              Syncs: {syncCount}
              <span className="text-xs text-muted-foreground">
                ({syncsExpanded ? "Hide details" : "Show details"})
              </span>
            </button>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">
              Syncs: 0
            </p>
          )}

          {syncCount > 0 && syncsExpanded && (
            <div className="mt-3 rounded-lg border bg-background p-3">
              <SyncTimeline timeline={syncTimeline} compact />
            </div>
          )}
        </div>
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
      className="w-full cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <CardContent className="py-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Project</p>
            <p className="font-medium truncate">
              {item.projectId || "Unknown project"}
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
              {item.date ? formatDateTime(item.date) : "-"}
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
  const { from, to } = useDateRange();

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

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  useEffect(() => {
    setHeaderRight(<DateRangeFilter />);
    return () => setHeaderRight(null);
  }, [setHeaderRight]);

  useEffect(() => {
    setPage(1);
    setDetailsOpen(false);
    setSelectedItem(null);
    setShowMoreDetails(false);
    setExpandedSyncsBySessionId({});
  }, [mode, fromStr, toStr]);

  useEffect(() => {
    setShowMoreDetails(false);
  }, [selectedItem, detailsOpen, mode]);

  const selectedSessionTimeline = useMemo(() => {
    if (mode !== "sessions") return [] as SyncTimelineItem[];
    if (!selectedItem) return [] as SyncTimelineItem[];
    const timeline = (selectedItem as SessionListItem).syncTimeline;
    return Array.isArray(timeline) ? timeline : [];
  }, [mode, selectedItem]);

  const displayFields = useMemo(() => {
    if (!selectedItem) return [] as Array<{ label: string; value: string }>;
    const hidden = new Set(["__v", "syncTimeline", "syncDatabaseIds"]);
    return Object.entries(selectedItem)
      .filter(([key]) => !hidden.has(key))
      .map(([key, value]) => ({
        label: toTitle(key),
        value: formatFieldValue(key, value),
      }));
  }, [selectedItem]);

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

  useEffect(() => {
    setLoading(true);

    const request =
      mode === "sessions"
        ? fetchSessionsList({ from: fromStr, to: toStr, page, limit })
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
  }, [mode, fromStr, toStr, page, limit]);

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
            <div>
              <CardTitle>{title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {subtitle} • {data.total} total • Page {data.page} of{" "}
                {data.totalPages}
              </p>
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
              ? "border-rose-200 bg-rose-50"
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
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
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
                <div className="rounded-xl border-2 border-violet-200/70 bg-violet-50/40 p-4 space-y-3">
                  <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
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
            ) : (
              displayFields.map((field) => (
                <div key={field.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="mt-1 text-sm wrap-break-word">{field.value}</p>
                </div>
              ))
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

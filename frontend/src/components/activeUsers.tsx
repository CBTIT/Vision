import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Eye, FileText, LoaderCircle, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchActiveUsers,
  fetchSessionsList,
  fetchSessionById,
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

function compareVersionStrings(left: string, right: string): number {
  const leftParts = left.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const rightParts = right.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? "";
    const rightPart = rightParts[index] ?? "";

    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);
    const leftIsNumber = leftPart !== "" && Number.isFinite(leftNumber);
    const rightIsNumber = rightPart !== "" && Number.isFinite(rightNumber);

    if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    if (leftPart !== rightPart) {
      return leftPart.localeCompare(rightPart, undefined, { numeric: true });
    }
  }

  return left.localeCompare(right, undefined, { numeric: true });
}

type ActiveUsersSortField = "user" | "machine" | "revit" | "activeProject" | "openDocsCount" | "sessionStart";
type SortOrder = "asc" | "desc";

export default function ActiveUsers() {
  const location = useLocation();
  const navigate = useNavigate();
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActiveUserItem[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<ActiveUsersSortField>("user");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleSort = (field: ActiveUsersSortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      if (field === "user" || field === "machine") {
        setSortOrder("asc");
      } else {
        setSortOrder("desc");
      }
    }
  };

  const renderSortHeader = (
    field: ActiveUsersSortField,
    label: string,
    align: "left" | "right" | "center" = "left",
  ) => {
    const isActive = sortField === field;
    return (
      <th
        className={cn(
          "px-4 py-3 cursor-pointer select-none transition-colors hover:bg-muted/30 group",
          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        )}
        onClick={() => handleSort(field)}
      >
        <div
          className={cn(
            "flex items-center gap-1.5",
            align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start",
          )}
        >
          <span>{label}</span>
          <span className="inline-flex shrink-0">
            {isActive ? (
              sortOrder === "asc" ? (
                <ArrowUp className="size-3.5 text-primary animate-in fade-in zoom-in duration-200" />
              ) : (
                <ArrowDown className="size-3.5 text-primary animate-in fade-in zoom-in duration-200" />
              )
            ) : (
              <ArrowUpDown className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors duration-200" />
            )}
          </span>
        </div>
      </th>
    );
  };
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

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
    sorted.sort((a, b) => {
      if (sortField === "user") {
        const nameA = (a.fullName?.trim() || a.autodeskUserName || "").toLowerCase();
        const nameB = (b.fullName?.trim() || b.autodeskUserName || "").toLowerCase();
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (sortField === "machine") {
        const machA = (a.machine || "").toLowerCase();
        const machB = (b.machine || "").toLowerCase();
        return sortOrder === "asc" ? machA.localeCompare(machB) : machB.localeCompare(machA);
      }
      if (sortField === "revit") {
        const revA = a.revitVersion || "";
        const revB = b.revitVersion || "";
        return sortOrder === "asc"
          ? compareVersionStrings(revA, revB)
          : compareVersionStrings(revB, revA);
      }
      if (sortField === "activeProject") {
        const projA = (a.activeProjectName || "").toLowerCase();
        const projB = (b.activeProjectName || "").toLowerCase();
        return sortOrder === "asc" ? projA.localeCompare(projB) : projB.localeCompare(projA);
      }
      if (sortField === "openDocsCount") {
        const countA = a.openDocs?.length ?? 0;
        const countB = b.openDocs?.length ?? 0;
        return sortOrder === "asc" ? countA - countB : countB - countA;
      }

      if (sortField === "sessionStart") {
        const getEarliest = (item: ActiveUserItem) => {
          let earliest = 0;
          for (const doc of item.openDocs) {
            if (doc.sessionStartAt) {
              const t = new Date(doc.sessionStartAt).getTime();
              if (earliest === 0 || t < earliest) earliest = t;
            }
          }
          return earliest;
        };
        const startA = getEarliest(a);
        const startB = getEarliest(b);
        return sortOrder === "asc" ? startA - startB : startB - startA;
      }
      return 0;
    });
    return sorted;
  }, [filteredItems, sortField, sortOrder]);

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

  async function openSessionForDoc(
    item: ActiveUserItem,
    doc: { sessionId: string; modelName: string },
  ) {
    const machineName = typeof item.machine === "string" ? item.machine.trim() : "";
    const docSessionId = typeof doc.sessionId === "string" ? doc.sessionId.trim() : "";
    if (!machineName && !docSessionId) return;

    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedSession(null);

    try {
      const looksLikeMongoId = /^[0-9a-fA-F]{24}$/.test(docSessionId);
      if (looksLikeMongoId) {
        const byId = await fetchSessionById(docSessionId);
        if (byId) {
          setSelectedSession(byId);
          return;
        }
      }

      if (machineName && docSessionId) {
        const byMachineAndDoc = await fetchSessionsList({
          page: 1,
          limit: 1,
          deviceName: machineName,
          modelId: docSessionId,
        });

        if (byMachineAndDoc.items[0]) {
          setSelectedSession(byMachineAndDoc.items[0]);
          return;
        }
      }

      if (machineName && doc.modelName) {
        const byMachine = await fetchSessionsList({
          page: 1,
          limit: 5,
          deviceName: machineName,
        });

        const matchingDoc = byMachine.items.find(
          (s) =>
            s.fileName?.toLowerCase() === doc.modelName.toLowerCase() ||
            s.modelId === docSessionId
        );
        if (matchingDoc) {
          setSelectedSession(matchingDoc);
          return;
        }

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
        <div className="w-full overflow-x-auto rounded-xl border bg-card/65 backdrop-blur-md px-1 py-1">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 text-center font-semibold text-muted-foreground">#</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3">Revit</th>
                <th className="px-4 py-3">Active Document</th>
                <th className="px-4 py-3 text-center">Open Docs</th>
                <th className="px-4 py-3 text-center">Last Update</th>
                <th className="w-28 px-4 py-3 text-center font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, index) => (
                <tr key={index} className="border-t last:border-b-0">
                  <td className="w-16 px-4 py-3 text-center">
                    <Skeleton className="h-4 w-6 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3.5 w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Skeleton className="h-5 w-14 rounded-full mx-auto" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Skeleton className="h-4 w-28 mx-auto" />
                  </td>
                  <td className="w-28 px-4 py-3 text-center">
                    <Skeleton className="h-8 w-24 rounded-md mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="w-full overflow-x-auto rounded-xl border bg-card/65 backdrop-blur-md px-1 py-1">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 text-center">
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted/40 transition-colors"
                    onClick={() => {
                      const allExpanded = sortedItems.every((item) => expandedUsers[item._id]);
                      const nextExpanded: Record<string, boolean> = {};
                      if (!allExpanded) {
                        sortedItems.forEach((item) => {
                          nextExpanded[item._id] = true;
                        });
                      }
                      setExpandedUsers(nextExpanded);
                    }}
                    title={
                      sortedItems.every((item) => expandedUsers[item._id])
                        ? "Collapse All"
                        : "Expand All"
                    }
                  >
                    <ChevronRight
                      className={cn(
                        "size-4 text-muted-foreground transition-transform duration-200",
                        sortedItems.length > 0 && sortedItems.every((item) => expandedUsers[item._id])
                          ? "rotate-90 text-primary"
                          : ""
                      )}
                    />
                  </button>
                </th>
                {renderSortHeader("user", "User")}
                {renderSortHeader("machine", "Machine")}
                {renderSortHeader("revit", "Revit")}
                {renderSortHeader("activeProject", "Active Doc/Project")}
                {renderSortHeader("openDocsCount", "Open Docs", "center")}
                {renderSortHeader("sessionStart", "Session Start", "center")}
                <th className="w-28 px-4 py-3 text-center font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, index) => {
                const displayName = item.fullName?.trim() || item.autodeskUserName;
                const activeSessionId = getActiveSessionId(item);
                const activeModelId =
                  typeof item.activeDocId === "string"
                    ? item.activeDocId.trim()
                    : "";
                const isExpanded = !!expandedUsers[item._id];

                return (
                  <Fragment key={item._id}>
                    <tr
                      className={cn(
                        "border-t transition-colors cursor-pointer",
                        isExpanded ? "bg-muted/25" : "hover:bg-muted/45"
                      )}
                      onClick={() => toggleUserExpanded(item._id)}
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
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground leading-tight">
                            {displayName}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            @{item.autodeskUserName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {item.machine}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                          {item.revitVersion}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.activeDocName ? (
                          <div className="flex flex-col max-w-sm">
                            <span className="font-semibold text-foreground leading-tight truncate">
                              {item.activeDocName}
                            </span>
                            <span className="text-xs text-muted-foreground mt-0.5 truncate">
                              {item.activeProjectName || item.activeViewName || "-"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic">No active document</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center h-6 min-w-12 px-2 rounded-full text-xs font-semibold tabular-nums",
                            item.openDocs.length > 0
                              ? "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800/80"
                              : "bg-muted text-muted-foreground border"
                          )}
                        >
                          {item.openDocs.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground/80 tabular-nums whitespace-nowrap">
                        {(() => {
                          let earliestStart: string | null = null;
                          for (const doc of item.openDocs) {
                            if (doc.sessionStartAt) {
                              if (!earliestStart || new Date(doc.sessionStartAt) < new Date(earliestStart)) {
                                earliestStart = doc.sessionStartAt;
                              }
                            }
                          }
                          return earliestStart ? formatDateTime(earliestStart) : "-";
                        })()}
                      </td>

                      <td className="w-28 px-4 py-3 text-center">
                        <Button
                          size="xs"
                          className="w-full animate-in fade-in duration-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openActiveSession(item);
                          }}
                          disabled={
                            (!activeSessionId && !activeModelId) || detailLoading
                          }
                        >
                          {detailLoading ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <Eye className="size-3 mr-1" />
                          )}
                          Session
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${item._id}-docs`} className="bg-muted/5 border-t-0 border-b">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="rounded-xl border border-border/80 bg-card/45 p-4 pl-5 ml-12 space-y-3 shadow-md backdrop-blur-md animate-in slide-in-from-top-1 duration-150">

                            {item.openDocs.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic py-1.5">No open documents.</p>
                            ) : (
                              <div className="divide-y divide-border/20">
                                {item.openDocs.map((doc, idx) => {
                                  const isDocActive =
                                    !!item.activeDocName &&
                                    doc.modelName === item.activeDocName;

                                  return (
                                    <div
                                      key={`${item._id}-${doc.sessionId}-${doc.modelName}-${idx}`}
                                      className={cn(
                                        "py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-150 pl-3 pr-2.5 rounded-md",
                                        isDocActive
                                          ? "bg-emerald-500/5 border-l-2 border-emerald-500 shadow-sm dark:bg-emerald-950/10"
                                          : "hover:bg-muted/15"
                                      )}
                                    >
                                      {/* Left block: Icon, main view name or background model, and details underneath */}
                                      <div className="flex items-start gap-3 min-w-0 flex-1">
                                        {isDocActive ? (
                                          <Eye className="size-4.5 text-blue-500 shrink-0 mt-0.5" />
                                        ) : (
                                          <FileText className="size-4 text-muted-foreground/60 shrink-0 mt-0.5" />
                                        )}
                                        <div className="min-w-0 space-y-0.5">
                                          {/* Main Prominent Data */}
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {isDocActive ? (
                                              <>
                                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-500/10 dark:bg-emerald-400/10 px-1.5 py-0.5 rounded shrink-0">
                                                  Active Focus:
                                                </span>
                                                <span className="text-xs font-bold text-foreground break-words">
                                                  {item.activeViewName || "Unnamed View"}
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-100/40 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400">
                                                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                  </span>
                                                  Active
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <span className="text-xs font-semibold text-foreground/80 break-words">
                                                  {doc.modelName || "Untitled Model"}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/75">
                                                  Background
                                                </span>
                                              </>
                                            )}
                                          </div>

                                          {/* Minor Details: Model, Project, Started, Syncs */}
                                          <div className="flex items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/75 flex-wrap">
                                            <span className="flex items-center gap-1">
                                              <span className="font-semibold text-muted-foreground/60 uppercase text-[9px]">Model:</span>
                                              <span className="text-foreground/85 font-medium">{doc.modelName || "Untitled"}</span>
                                            </span>
                                            {item.activeProjectName && isDocActive && (
                                              <>
                                                <span className="text-muted-foreground/30">•</span>
                                                <span className="flex items-center gap-1">
                                                  <span className="font-semibold text-muted-foreground/60 uppercase text-[9px]">Project:</span>
                                                  <span className="text-foreground/85 font-medium">{item.activeProjectName}</span>
                                                </span>
                                              </>
                                            )}
                                            {doc.sessionStartAt && (
                                              <>
                                                <span className="text-muted-foreground/30">•</span>
                                                <span className="flex items-center gap-1">
                                                  <span className="font-semibold text-muted-foreground/60 uppercase text-[9px]">Started:</span>
                                                  <span className="text-foreground/85 font-medium">{formatDateTime(doc.sessionStartAt)}</span>
                                                </span>
                                              </>
                                            )}
                                            {typeof doc.syncsCount === "number" && (
                                              <>
                                                <span className="text-muted-foreground/30">•</span>
                                                <span className="flex items-center gap-1">
                                                  <span className="font-semibold text-muted-foreground/60 uppercase text-[9px]">Syncs:</span>
                                                  <span className={cn(
                                                    "inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[9px] font-semibold tabular-nums",
                                                    doc.syncsCount > 0
                                                      ? "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-400"
                                                      : "bg-muted text-muted-foreground border border-border/40"
                                                  )}>
                                                    {doc.syncsCount}
                                                  </span>
                                                </span>
                                              </>
                                            )}
                                            {!isDocActive && (
                                              <>
                                                <span className="text-muted-foreground/30">•</span>
                                                <span className="text-muted-foreground/60 italic">Background</span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Right block: Action Button */}
                                      <div className="shrink-0 flex items-center justify-end pl-7 md:pl-0">
                                        <Button
                                          size="xs"
                                          variant={isDocActive ? "default" : "outline"}
                                          className="h-6 text-[10px] font-medium px-2 py-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void openSessionForDoc(item, doc);
                                          }}
                                          disabled={detailLoading}
                                        >
                                          {detailLoading ? (
                                            <LoaderCircle className="size-2.5 animate-spin" />
                                          ) : (
                                            <>
                                              <Eye className="size-2.5 mr-1" />
                                              Inspect
                                            </>
                                          )}
                                        </Button>
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

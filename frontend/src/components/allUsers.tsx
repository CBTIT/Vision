import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

import { useHeaderRight } from "./header-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshButton } from "@/components/refresh-button";
import {
  fetchUsersSummary,
  fetchSessionsList,
  fetchSyncsList,
  type SessionListItem,
  type SyncListItem,
  type UserSummaryItem,
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

type DetailMode = "session" | "sync";
type SyncTimelineItem = {
  syncId: string;
  time: string;
  gapMinutesFromPrevious: number | null;
};

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

function toTitle(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
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
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, "dd MMM yyyy, hh:mm a");
      }
    }
    return value;
  }
  return String(value);
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

function UserSummaryCard({
  item,
  onClick,
  isSelected,
}: {
  item: UserSummaryItem;
  onClick: () => void;
  isSelected: boolean;
}) {
  const displayName = item.fullName?.trim() || item.autodeskUserName;
  const lastActiveLabel = item.lastActiveAt
    ? format(new Date(item.lastActiveAt), "dd MMM yyyy, hh:mm a")
    : "-";
  const pluginBadges =
    item.pluginVersionDetails && item.pluginVersionDetails.length > 0
      ? Array.from(
          item.pluginVersionDetails.reduce(
            (latestByRevit, detail) => {
              for (const revitVersion of detail.revitVersions) {
                const current = latestByRevit.get(revitVersion);
                if (
                  !current ||
                  compareVersionStrings(detail.pluginVersion, current) > 0
                ) {
                  latestByRevit.set(revitVersion, detail.pluginVersion);
                }
              }
              return latestByRevit;
            },
            new Map<string, string>(),
          ),
        )
          .sort(([leftRevit, leftPlugin], [rightRevit, rightPlugin]) => {
            const revitComparison = compareVersionStrings(leftRevit, rightRevit);
            if (revitComparison !== 0) {
              return revitComparison;
            }
            return compareVersionStrings(leftPlugin, rightPlugin);
          })
          .map(([revitVersion, pluginVersion]) => ({
            key: `${revitVersion}-${pluginVersion}`,
            label: `v${pluginVersion} • Revit ${revitVersion}`,
          }))
      : item.pluginVersions.map((pluginVersion) => ({
          key: pluginVersion,
          label: `v${pluginVersion}`,
        }));

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer border-border/90 bg-background/95 shadow-sm transition-colors ${
        isSelected
          ? "ring-2 ring-blue-400/70 dark:ring-blue-500/60"
          : "hover:bg-muted/30"
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="truncate text-sm font-semibold">
          {displayName}
        </CardTitle>
        <p className="truncate text-xs text-muted-foreground">
          @{item.autodeskUserName}
        </p>
        {pluginBadges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pluginBadges.map((badge) => (
              <span
                key={badge.key}
                className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sessions</span>
          <span className="font-semibold tabular-nums">
            {item.sessionsCount}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Syncs</span>
          <span className="font-semibold tabular-nums">{item.syncsCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Plugin Use</span>
          <span className="font-semibold tabular-nums">
            {item.pluginUseCount}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Last Active</span>
          <span className="truncate font-semibold tabular-nums">
            {lastActiveLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AllUsers() {
  const setHeaderRight = useHeaderRight();
  const { refreshKey, refresh } = useAutoRefresh();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UserSummaryItem[]>([]);
  const [selectedPluginVersion, setSelectedPluginVersion] = useState("all");
  const [selectedRevitVersion, setSelectedRevitVersion] = useState("all");

  const [selectedUser, setSelectedUser] = useState<UserSummaryItem | null>(
    null,
  );
  const [renderedUser, setRenderedUser] = useState<UserSummaryItem | null>(
    null,
  );
  const [activityCardOpen, setActivityCardOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [userSessions, setUserSessions] = useState<SessionListItem[]>([]);
  const [userSyncs, setUserSyncs] = useState<SyncListItem[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<DetailMode>("session");
  const [detailItem, setDetailItem] = useState<
    SessionListItem | SyncListItem | null
  >(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  useEffect(() => {
    setHeaderRight(<RefreshButton onRefresh={refresh} />);
    return () => setHeaderRight(null);
  }, [setHeaderRight, refresh]);

  useEffect(() => {
    setLoading(true);
    fetchUsersSummary()
      .then((result) => setItems(result.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function loadUserActivity(user: UserSummaryItem) {
    const isNewSelection =
      selectedUser?.autodeskUserName !== user.autodeskUserName;
    setSelectedUser(user);
    setRenderedUser(user);
    if (isNewSelection) {
      setActivityCardOpen(false);
      requestAnimationFrame(() => setActivityCardOpen(true));
    } else {
      setActivityCardOpen(true);
    }
    setActivityLoading(true);

    try {
      const [sessionsResult, syncsResult] = await Promise.all([
        fetchSessionsList({
          page: 1,
          limit: 500,
          autodeskUserName: user.autodeskUserName,
        }),
        fetchSyncsList({
          page: 1,
          limit: 500,
          autodeskUserName: user.autodeskUserName,
        }),
      ]);

      setUserSessions(sessionsResult.items);
      setUserSyncs(syncsResult.items);
    } catch {
      setUserSessions([]);
      setUserSyncs([]);
    } finally {
      setActivityLoading(false);
    }
  }

  function closeUserActivity() {
    setActivityCardOpen(false);
    window.setTimeout(() => {
      setSelectedUser(null);
      setRenderedUser(null);
    }, 180);
  }

  const availablePluginVersions = useMemo(() => {
    const seen = new Set<string>();
    const versions: string[] = [];

    for (const item of items) {
      const pluginVersions =
        item.pluginVersionDetails && item.pluginVersionDetails.length > 0
          ? item.pluginVersionDetails.map((detail) => detail.pluginVersion)
          : item.pluginVersions;

      for (const version of pluginVersions) {
        const normalizedVersion = version.trim();
        if (!normalizedVersion || seen.has(normalizedVersion)) continue;
        seen.add(normalizedVersion);
        versions.push(normalizedVersion);
      }
    }

    return versions.sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  }, [items]);

  const availableRevitVersions = useMemo(() => {
    const seen = new Set<string>();
    const versions: string[] = [];

    for (const item of items) {
      for (const detail of item.pluginVersionDetails ?? []) {
        for (const version of detail.revitVersions) {
          const normalizedVersion = version.trim();
          if (!normalizedVersion || seen.has(normalizedVersion)) continue;
          seen.add(normalizedVersion);
          versions.push(normalizedVersion);
        }
      }
    }

    return versions.sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesPluginVersion =
        selectedPluginVersion === "all" ||
        (item.pluginVersionDetails && item.pluginVersionDetails.length > 0
          ? item.pluginVersionDetails.some(
              (detail) => detail.pluginVersion === selectedPluginVersion,
            )
          : item.pluginVersions.includes(selectedPluginVersion));

      if (!matchesPluginVersion) return false;

      const matchesRevitVersion =
        selectedRevitVersion === "all" ||
        (item.pluginVersionDetails ?? []).some((detail) =>
          detail.revitVersions.includes(selectedRevitVersion),
        );

      return matchesRevitVersion;
    });
  }, [items, selectedPluginVersion, selectedRevitVersion]);

  const subtitle = useMemo(
    () => `${filteredItems.length} of ${items.length} unique Autodesk users`,
    [filteredItems.length, items.length],
  );

  useEffect(() => {
    if (
      selectedPluginVersion !== "all" &&
      !availablePluginVersions.includes(selectedPluginVersion)
    ) {
      setSelectedPluginVersion("all");
    }
  }, [availablePluginVersions, selectedPluginVersion]);

  useEffect(() => {
    if (
      selectedRevitVersion !== "all" &&
      !availableRevitVersions.includes(selectedRevitVersion)
    ) {
      setSelectedRevitVersion("all");
    }
  }, [availableRevitVersions, selectedRevitVersion]);

  useEffect(() => {
    if (!selectedUser) return;

    const isSelectedUserVisible = filteredItems.some(
      (item) => item.autodeskUserName === selectedUser.autodeskUserName,
    );

    if (!isSelectedUserVisible) {
      closeUserActivity();
    }
  }, [filteredItems, selectedUser]);

  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    const projects: string[] = [];
    for (const session of userSessions) {
      const name =
        (session.cloudProjectName as string | undefined) ??
        (session.projectId as string | undefined);
      if (name && !seen.has(name)) {
        seen.add(name);
        projects.push(name);
      }
    }
    return projects;
  }, [userSessions]);

  useEffect(() => {
    setShowMoreDetails(false);
  }, [detailMode, detailItem, detailOpen]);

  const detailFields = useMemo(() => {
    if (!detailItem) return [] as Array<{ label: string; value: string }>;
    const hidden = new Set(["__v", "syncDatabaseIds"]);
    return Object.entries(detailItem)
      .filter(([key]) => !hidden.has(key))
      .map(([key, value]) => ({
        label: toTitle(key),
        value: formatFieldValue(key, value),
      }));
  }, [detailItem]);

  const selectedSession =
    detailMode === "session" ? (detailItem as SessionListItem | null) : null;
  const selectedSessionIsCrash = useMemo(
    () => isCrashSession(selectedSession),
    [selectedSession],
  );

  const selectedSessionTimeline = useMemo(() => {
    if (!selectedSession) return [] as SyncTimelineItem[];
    const timeline = selectedSession.syncTimeline;
    return Array.isArray(timeline) ? timeline : [];
  }, [selectedSession]);

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
    const fileSize = formatFileSizeMb(selectedSession.fileSize);
    const revitVersion = formatFieldValue(
      "revitVersion",
      selectedSession.revitVersion,
    );

    return { projectName, fileName, fileSize, revitVersion };
  }, [selectedSession]);

  const sessionGroupedFields = useMemo(() => {
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

  const hasActivityCard = renderedUser !== null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-1 py-1">
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="flex flex-col gap-3 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <CardTitle>All Users</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex min-w-0 flex-1 justify-end xl:pl-4">
            <div className="flex min-w-0 flex-col items-end gap-2">
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  CBT
                </p>
                <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant={
                      selectedPluginVersion === "all" ? "default" : "outline"
                    }
                    onClick={() => setSelectedPluginVersion("all")}
                  >
                    All
                  </Button>
                  {availablePluginVersions.map((version) => (
                    <Button
                      key={version}
                      type="button"
                      size="xs"
                      variant={
                        selectedPluginVersion === version
                          ? "default"
                          : "outline"
                      }
                      onClick={() => setSelectedPluginVersion(version)}
                    >
                      v{version}
                    </Button>
                  ))}
                </div>
              </div>

              {availableRevitVersions.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Revit
                  </p>
                  <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant={
                        selectedRevitVersion === "all" ? "default" : "outline"
                      }
                      onClick={() => setSelectedRevitVersion("all")}
                    >
                      All
                    </Button>
                    {availableRevitVersions.map((version) => (
                      <Button
                        key={version}
                        type="button"
                        size="xs"
                        variant={
                          selectedRevitVersion === version
                            ? "default"
                            : "outline"
                        }
                        onClick={() => setSelectedRevitVersion(version)}
                      >
                        {version}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className={`sm:max-w-xl w-[92vw] overflow-y-auto ${
            detailMode === "session" && selectedSessionIsCrash
              ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/60"
              : ""
          }`}
        >
          <SheetHeader>
            <SheetTitle>
              <span className="inline-flex items-center gap-2">
                <span>
                  {detailMode === "session"
                    ? "Session Details"
                    : "Sync Details"}
                </span>
                {detailMode === "session" && selectedSessionIsCrash && (
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                    Crash
                  </span>
                )}
              </span>
            </SheetTitle>
            {detailMode === "sync" && (
              <SheetDescription>
                {detailItem?.fullName || detailItem?.autodeskUserName || "User"}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="space-y-3 px-4 pb-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">User</p>
              <p className="mt-1 text-lg font-bold leading-tight wrap-break-word">
                {detailItem?.fullName ||
                  detailItem?.autodeskUserName ||
                  "Unknown user"}
              </p>
              {detailItem?.fullName && detailItem?.autodeskUserName && (
                <p className="mt-1 text-sm font-semibold text-muted-foreground wrap-break-word">
                  @{detailItem.autodeskUserName}
                </p>
              )}
            </div>

            {detailMode === "session" ? (
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
              detailFields.map((field) => (
                <div key={field.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="mt-1 text-sm wrap-break-word">{field.value}</p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full overflow-y-auto px-1 pb-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 15 }).map((_, index) => (
                <Skeleton key={index} className="h-38 w-full" />
              ))}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="h-full overflow-y-auto px-1 pb-1">
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0
                  ? "No users found."
                  : "No users match the selected version filters."}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div
            className={`grid h-full min-h-0 gap-4 ${
              hasActivityCard
                ? "xl:grid-cols-[minmax(0,1fr)_460px]"
                : "grid-cols-1"
            }`}
          >
            <div className="min-h-0 overflow-y-auto px-1 pt-2 pb-1">
              <div
                className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
                  hasActivityCard
                    ? "xl:grid-cols-3"
                    : "xl:grid-cols-4 2xl:grid-cols-5"
                }`}
              >
                {filteredItems.map((item) => (
                  <UserSummaryCard
                    key={item.autodeskUserName}
                    item={item}
                    isSelected={
                      selectedUser?.autodeskUserName === item.autodeskUserName
                    }
                    onClick={() => void loadUserActivity(item)}
                  />
                ))}
              </div>
            </div>

            {renderedUser && (
              <div className="min-h-0 pt-2 pb-1 xl:pr-1">
                <Card
                  className={`flex h-full min-h-0 flex-col border-border/90 bg-background/95 shadow-sm transition-all duration-200 ease-out ${
                    activityCardOpen
                      ? "translate-x-0 scale-100 opacity-100"
                      : "translate-x-2 scale-[0.99] opacity-0"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">
                          {renderedUser.fullName?.trim() ||
                            renderedUser.autodeskUserName}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          @{renderedUser.autodeskUserName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={closeUserActivity}
                        aria-label="Close user activity"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-5">
                    {activityLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-26 w-full" />
                        <Skeleton className="h-26 w-full" />
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Projects Accessed ({uniqueProjects.length})
                          </p>
                          {uniqueProjects.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No projects found.
                            </p>
                          ) : (
                            <div className="max-h-36 overflow-auto rounded-md border">
                              {uniqueProjects.map((project) => (
                                <div
                                  key={project}
                                  className="border-b px-3 py-1.5 last:border-b-0 text-sm truncate"
                                >
                                  {project}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Sessions ({userSessions.length})
                          </p>
                          {userSessions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No sessions found.
                            </p>
                          ) : (
                            <div className="max-h-64 overflow-auto rounded-md border">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Time</th>
                                    <th className="px-3 py-2">File Name</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {userSessions.map((session) => (
                                    <tr
                                      key={session._id}
                                      className="cursor-pointer border-t hover:bg-muted/30"
                                      onClick={() => {
                                        setDetailMode("session");
                                        setDetailItem(session);
                                        setDetailOpen(true);
                                      }}
                                    >
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {session.dateTime
                                          ? format(
                                              new Date(session.dateTime),
                                              "MM/dd/yy",
                                            )
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {session.dateTime
                                          ? format(
                                              new Date(session.dateTime),
                                              "h:mm a",
                                            )
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2 truncate max-w-44">
                                        {session.fileName ||
                                          session.modelId ||
                                          "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Syncs ({userSyncs.length})
                          </p>
                          {userSyncs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No syncs found.
                            </p>
                          ) : (
                            <div className="max-h-64 overflow-auto rounded-md border">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Time</th>
                                    <th className="px-3 py-2">File Name</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {userSyncs.map((sync) => (
                                    <tr
                                      key={sync._id}
                                      className="cursor-pointer border-t hover:bg-muted/30"
                                      onClick={() => {
                                        setDetailMode("sync");
                                        setDetailItem(sync);
                                        setDetailOpen(true);
                                      }}
                                    >
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {sync.date
                                          ? format(
                                              new Date(sync.date),
                                              "MM/dd/yy",
                                            )
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {sync.date
                                          ? format(
                                              new Date(sync.date),
                                              "h:mm a",
                                            )
                                          : "-"}
                                      </td>
                                      <td className="px-3 py-2 truncate max-w-44">
                                        {sync.fileName || sync.modelId || "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

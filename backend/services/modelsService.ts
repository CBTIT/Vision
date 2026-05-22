import type { PipelineStage } from "mongoose";
import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";

export type ModelSummary = {
  modelId: string;
  fileName: string;
  projectName: string;
  lastFileSize: number | null;
  lastAccessedAt: string;
  lastAccessedBy: string;
  lastAccessedByFullName?: string;
  revitVersion: string;
  usersCount: number;
  sessionCount: number;
};

export type ModelSizeHistoryPoint = {
  date: string;
  maxFileSize: number;
};

export type ModelSummaryHistoryPoint = {
  date: string;
  maxFileSize: number;
  maxOpeningDuration: number;
  maxSyncDuration: number;
  maxWarningCount: number;
  maxElementCount: number | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeModelId(value: string): string {
  return value.trim().replace(/^\{+|\}+$/g, "");
}

export const getModelsSummary = async (
  from?: string,
  to?: string,
): Promise<ModelSummary[]> => {
  const matchStage: Record<string, unknown> = {
    $or: [
      { modelId: { $exists: true, $ne: "" } },
      { fileName: { $exists: true, $ne: "" } },
    ],
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter["$gte"] = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter["$lte"] = toDate;
    }
    matchStage["dateTime"] = dateFilter;
  }

  type RawModel = {
    _id: string;
    fileName: string;
    projectName: string;
    lastFileSize: number | null;
    lastAccessedAt: Date;
    lastAccessedBy: string;
    revitVersion?: string;
    sessionCount: number;
    uniqueUsers: string[];
    // full name joined from last session (may not exist)
    lastAccessedByFullName?: string;
  };

  const [results, userMappings] = await Promise.all([
    RevitSession.aggregate<RawModel>([
      { $match: matchStage },
      { $sort: { dateTime: 1 } },
      {
        $group: {
          _id: {
            $cond: [
              {
                $and: [
                  { $ifNull: ["$modelId", false] },
                  { $ne: ["$modelId", ""] },
                ],
              },
              "$modelId",
              "$fileName",
            ],
          },
          fileName: { $last: "$fileName" },
          projectName: {
            $last: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$cloudProjectName", false] },
                    { $ne: ["$cloudProjectName", ""] },
                  ],
                },
                "$cloudProjectName",
                "$projectId",
              ],
            },
          },
          lastFileSize: { $last: "$fileSize" },
          lastAccessedAt: { $max: "$dateTime" },
          lastAccessedBy: { $last: "$autodeskUserName" },
          lastAccessedByFullName: { $last: "$fullName" },
          revitVersion: { $last: "$revitVersion" },
          uniqueUsers: { $addToSet: "$autodeskUserName" },
          sessionCount: { $sum: 1 },
        },
      },
      { $sort: { lastAccessedAt: -1 } },
    ]),
    UserMappings.find({ autodeskUserName: { $exists: true, $ne: "" } })
      .select({ autodeskUserName: 1, fullName: 1 })
      .lean(),
  ]);

  const fullNameMap = new Map<string, string>();
  for (const row of userMappings) {
    if (typeof row.fullName !== "string") continue;
    const normalized = row.fullName.trim();
    if (!normalized) continue;
    fullNameMap.set(row.autodeskUserName, normalized);
  }

  return results.map((r) => {
    const fallbackName =
      typeof r.lastAccessedByFullName === "string"
        ? r.lastAccessedByFullName.trim()
        : "";
    const mappedName = fullNameMap.get(r.lastAccessedBy || "") || "";

    const revitVersionRaw =
      typeof r.revitVersion === "string" ? r.revitVersion.trim() : "";

    return {
      modelId: r._id,
      fileName: r.fileName || r._id,
      projectName: r.projectName || "-",
      lastFileSize: r.lastFileSize ?? null,
      lastAccessedAt: r.lastAccessedAt ? r.lastAccessedAt.toISOString() : "",
      lastAccessedBy: r.lastAccessedBy || "-",
      lastAccessedByFullName: mappedName || fallbackName,
      revitVersion: revitVersionRaw,
      usersCount: Array.isArray(r.uniqueUsers)
        ? r.uniqueUsers
            .filter((name): name is string => typeof name === "string")
            .map((name) => name.trim())
            .filter((name) => name.length > 0).length
        : 0,
      sessionCount: r.sessionCount,
    };
  });
};

export const getModelSizeHistory = async (
  modelId: string,
  from?: string,
  to?: string,
): Promise<ModelSizeHistoryPoint[]> => {
  const selectedIdentifier = modelId.trim();
  const normalizedModelId = normalizeModelId(modelId);
  if (!selectedIdentifier || !normalizedModelId) {
    return [];
  }

  const matchStage: Record<string, unknown> = {
    $or: [
      {
        modelId: {
          $regex: `^\\{?${escapeRegex(normalizedModelId)}\\}?$`,
          $options: "i",
        },
      },
      {
        fileName: {
          $regex: `^${escapeRegex(selectedIdentifier)}$`,
          $options: "i",
        },
      },
    ],
    fileSize: { $type: "number", $gt: 0 },
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) {
      dateFilter["$gte"] = new Date(from);
    }
    if (to) {
      const endExclusive = new Date(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter["$lt"] = endExclusive;
    }
    matchStage["dateTime"] = dateFilter;
  }

  const rows = await RevitSession.aggregate<{
    _id: string;
    maxFileSize: number;
  }>([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$dateTime",
            timezone: "UTC",
          },
        },
        maxFileSize: { $max: "$fileSize" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    maxFileSize: row.maxFileSize,
  }));
};

export type ModelWarningSummary = {
  modelId: string;
  fileName: string;
  projectName: string;
  /** From the most recent session in the range (by dateTime). */
  lastWarningCount: number;
  sessionCount: number;
};

export type ModelWarningHistoryPoint = {
  date: string;
  /** Max warning count among sessions for that model on that UTC day. */
  warningCount: number;
};

/**
 * Per-model last recorded warning count (from latest session in range) and
 * daily maxima for the combined chart — same session scope as All Models.
 */
export const getModelWarningsData = async (
  from?: string,
  to?: string,
): Promise<{
  items: ModelWarningSummary[];
  historiesByModelId: Record<string, ModelWarningHistoryPoint[]>;
}> => {
  const matchStage: Record<string, unknown> = {
    $or: [
      { modelId: { $exists: true, $ne: "" } },
      { fileName: { $exists: true, $ne: "" } },
    ],
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter["$gte"] = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter["$lte"] = toDate;
    }
    matchStage["dateTime"] = dateFilter;
  }

  const modelKeyExpr = {
    $cond: [
      {
        $and: [{ $ifNull: ["$modelId", false] }, { $ne: ["$modelId", ""] }],
      },
      "$modelId",
      "$fileName",
    ],
  };

  type SummaryRow = {
    _id: string;
    fileName: string;
    projectName: string;
    lastWarningCount: number;
    sessionCount: number;
  };

  type DailyRow = {
    _id: { date: string; modelKey: string };
    warningCount: number;
  };

  const baseStages: PipelineStage[] = [{ $match: matchStage }];

  const [summaryRows, dailyRows] = await Promise.all([
    RevitSession.aggregate<SummaryRow>([
      ...baseStages,
      { $sort: { dateTime: 1 } },
      {
        $group: {
          _id: modelKeyExpr,
          fileName: { $last: "$fileName" },
          projectName: {
            $last: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$cloudProjectName", false] },
                    { $ne: ["$cloudProjectName", ""] },
                  ],
                },
                "$cloudProjectName",
                "$projectId",
              ],
            },
          },
          lastWarningCount: { $last: { $ifNull: ["$warningCount", 0] } },
          sessionCount: { $sum: 1 },
        },
      },
      { $sort: { lastWarningCount: -1, _id: 1 } },
    ]),
    RevitSession.aggregate<DailyRow>([
      ...baseStages,
      {
        $addFields: {
          modelKey: modelKeyExpr,
        },
      },
      {
        $match: {
          modelKey: { $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$dateTime",
                timezone: "UTC",
              },
            },
            modelKey: "$modelKey",
          },
          warningCount: {
            $max: { $ifNull: ["$warningCount", 0] },
          },
        },
      },
      { $sort: { "_id.date": 1, "_id.modelKey": 1 } },
    ]),
  ]);

  const items: ModelWarningSummary[] = summaryRows.map((row) => ({
    modelId: row._id,
    fileName: row.fileName || row._id,
    projectName: row.projectName || "-",
    lastWarningCount: row.lastWarningCount,
    sessionCount: row.sessionCount,
  }));

  const historiesByModelId: Record<string, ModelWarningHistoryPoint[]> = {};
  for (const row of dailyRows) {
    const key = row._id.modelKey;
    if (!historiesByModelId[key]) {
      historiesByModelId[key] = [];
    }
    historiesByModelId[key].push({
      date: row._id.date,
      warningCount: row.warningCount,
    });
  }

  return { items, historiesByModelId };
};

/**
 * Daily max warning counts for one model (same identity rules as size history).
 */
export const getModelWarningsTimeSeries = async (
  modelId: string,
  from?: string,
  to?: string,
): Promise<ModelWarningHistoryPoint[]> => {
  const selectedIdentifier = modelId.trim();
  const normalizedModelId = normalizeModelId(modelId);
  if (!selectedIdentifier || !normalizedModelId) {
    return [];
  }

  const matchStage: Record<string, unknown> = {
    $or: [
      {
        modelId: {
          $regex: `^\\{?${escapeRegex(normalizedModelId)}\\}?$`,
          $options: "i",
        },
      },
      {
        fileName: {
          $regex: `^${escapeRegex(selectedIdentifier)}$`,
          $options: "i",
        },
      },
    ],
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) {
      dateFilter["$gte"] = new Date(from);
    }
    if (to) {
      const endExclusive = new Date(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter["$lt"] = endExclusive;
    }
    matchStage["dateTime"] = dateFilter;
  }

  const rows = await RevitSession.aggregate<{
    _id: string;
    warningCount: number;
  }>([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$dateTime",
            timezone: "UTC",
          },
        },
        warningCount: { $max: { $ifNull: ["$warningCount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    warningCount: row.warningCount,
  }));
};

export const getModelSummaryHistory = async (
  modelId: string,
  from?: string,
  to?: string,
): Promise<ModelSummaryHistoryPoint[]> => {
  const selectedIdentifier = modelId.trim();
  const normalizedModelId = normalizeModelId(modelId);
  if (!selectedIdentifier || !normalizedModelId) {
    return [];
  }

  const matchStage: Record<string, unknown> = {
    $or: [
      {
        modelId: {
          $regex: `^\\{?${escapeRegex(normalizedModelId)}\\}?$`,
          $options: "i",
        },
      },
      {
        fileName: {
          $regex: `^${escapeRegex(selectedIdentifier)}$`,
          $options: "i",
        },
      },
    ],
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) {
      dateFilter["$gte"] = new Date(from);
    }
    if (to) {
      const endExclusive = new Date(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter["$lt"] = endExclusive;
    }
    matchStage["dateTime"] = dateFilter;
  }

  const sessionRows = await RevitSession.aggregate<{
    _id: string;
    maxFileSize: number;
    openingDurations: number[];
    maxWarningCount: number;
    maxElementCount: number;
  }>([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$dateTime",
            timezone: "UTC",
          },
        },
        maxFileSize: { $max: { $ifNull: ["$fileSize", 0] } },
        openingDurations: {
          $push: { $ifNull: ["$openingDuration", 0] },
        },
        maxWarningCount: { $max: { $ifNull: ["$warningCount", 0] } },
        maxElementCount: { $max: { $ifNull: ["$elementCount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const syncMatchStage: Record<string, unknown> = {
    $or: [
      {
        modelId: {
          $regex: `^\\{?${escapeRegex(normalizedModelId)}\\}?$`,
          $options: "i",
        },
      },
      {
        fileName: {
          $regex: `^${escapeRegex(selectedIdentifier)}$`,
          $options: "i",
        },
      },
    ],
  };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) {
      dateFilter["$gte"] = new Date(from);
    }
    if (to) {
      const endExclusive = new Date(to);
      endExclusive.setDate(endExclusive.getDate() + 1);
      dateFilter["$lt"] = endExclusive;
    }
    syncMatchStage["dateTime"] = dateFilter;
  }

  const syncRows = await RevitSyncEvent.aggregate<{
    _id: string;
    syncDurations: number[];
  }>([
    { $match: syncMatchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$dateTime",
            timezone: "UTC",
          },
        },
        syncDurations: {
          $push: { $ifNull: ["$duration", 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  const dateSet = new Set<string>();
  const fileSizeMap = new Map<string, number>();
  const openingDurationMap = new Map<string, number>();
  const syncDurationMap = new Map<string, number>();
  const warningCountMap = new Map<string, number>();
  const elementCountMap = new Map<string, number>();

  for (const row of sessionRows) {
    dateSet.add(row._id);
    fileSizeMap.set(row._id, row.maxFileSize);
    openingDurationMap.set(row._id, median(row.openingDurations));
    warningCountMap.set(row._id, row.maxWarningCount);
    elementCountMap.set(row._id, row.maxElementCount);
  }

  for (const row of syncRows) {
    dateSet.add(row._id);
    syncDurationMap.set(row._id, median(row.syncDurations));
  }

  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

  return dates
    .map((date) => {
      const ec = elementCountMap.get(date) ?? 0;
      return {
        date,
        maxFileSize: fileSizeMap.get(date) ?? 0,
        maxOpeningDuration: openingDurationMap.get(date) ?? 0,
        maxSyncDuration: syncDurationMap.get(date) ?? 0,
        maxWarningCount: warningCountMap.get(date) ?? 0,
        maxElementCount: ec === 0 ? null : ec,
      };
    })
    .filter((point) => point.maxFileSize > 0 || point.maxElementCount !== null);
};

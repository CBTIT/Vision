import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";

export type ModelSummary = {
  modelId: string;
  fileName: string;
  projectName: string;
  lastFileSize: number | null;
  lastAccessedAt: string;
  lastAccessedBy: string;
  lastAccessedByFullName?: string;
  usersCount: number;
  sessionCount: number;
};

export type ModelSizeHistoryPoint = {
  date: string;
  maxFileSize: number;
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
    sessionCount: number;
    uniqueUsers: string[];
    // full name joined from last session (may not exist)
    lastAccessedByFullName?: string;
  };

  const [results, userMappings] = await Promise.all([
    RevitSession.aggregate<RawModel>([
      { $match: matchStage },
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

    return {
      modelId: r._id,
      fileName: r.fileName || r._id,
      projectName: r.projectName || "-",
      lastFileSize: r.lastFileSize ?? null,
      lastAccessedAt: r.lastAccessedAt ? r.lastAccessedAt.toISOString() : "",
      lastAccessedBy: r.lastAccessedBy || "-",
      lastAccessedByFullName: mappedName || fallbackName,
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

import RevitSession from "../models/RevitSession.js";

export type ModelSummary = {
  modelId: string;
  fileName: string;
  projectName: string;
  lastFileSize: number | null;
  lastAccessedAt: string;
  lastAccessedBy: string;
  lastAccessedByFullName?: string;
  sessionCount: number;
};

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
    // full name joined from last session (may not exist)
    lastAccessedByFullName?: string;
  };

  const results = await RevitSession.aggregate<RawModel>([
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
        sessionCount: { $sum: 1 },
      },
    },
    { $sort: { lastAccessedAt: -1 } },
  ]);

  return results.map((r) => ({
    modelId: r._id,
    fileName: r.fileName || r._id,
    projectName: r.projectName || "-",
    lastFileSize: r.lastFileSize ?? null,
    lastAccessedAt: r.lastAccessedAt ? r.lastAccessedAt.toISOString() : "",
    lastAccessedBy: r.lastAccessedBy || "-",
    lastAccessedByFullName: r.lastAccessedByFullName,
    sessionCount: r.sessionCount,
  }));
};

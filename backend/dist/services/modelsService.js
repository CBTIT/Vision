import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
export const getModelsSummary = async (from, to) => {
    const matchStage = {
        $or: [
            { modelId: { $exists: true, $ne: "" } },
            { fileName: { $exists: true, $ne: "" } },
        ],
    };
    if (from || to) {
        const dateFilter = {};
        if (from)
            dateFilter["$gte"] = new Date(from);
        if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            dateFilter["$lte"] = toDate;
        }
        matchStage["dateTime"] = dateFilter;
    }
    const [results, userMappings] = await Promise.all([
        RevitSession.aggregate([
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
    const fullNameMap = new Map();
    for (const row of userMappings) {
        if (typeof row.fullName !== "string")
            continue;
        const normalized = row.fullName.trim();
        if (!normalized)
            continue;
        fullNameMap.set(row.autodeskUserName, normalized);
    }
    return results.map((r) => {
        const fallbackName = typeof r.lastAccessedByFullName === "string"
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
                    .filter((name) => typeof name === "string")
                    .map((name) => name.trim())
                    .filter((name) => name.length > 0).length
                : 0,
            sessionCount: r.sessionCount,
        };
    });
};

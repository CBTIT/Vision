import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeModelId(value) {
    return value.trim().replace(/^\{+|\}+$/g, "");
}
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
        const revitVersionRaw = typeof r.revitVersion === "string" ? r.revitVersion.trim() : "";
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
                    .filter((name) => typeof name === "string")
                    .map((name) => name.trim())
                    .filter((name) => name.length > 0).length
                : 0,
            sessionCount: r.sessionCount,
        };
    });
};
export const getModelSizeHistory = async (modelId, from, to) => {
    const selectedIdentifier = modelId.trim();
    const normalizedModelId = normalizeModelId(modelId);
    if (!selectedIdentifier || !normalizedModelId) {
        return [];
    }
    const matchStage = {
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
        const dateFilter = {};
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
    const rows = await RevitSession.aggregate([
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

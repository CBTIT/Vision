import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";
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
/**
 * Per-model last recorded warning count (from latest session in range) and
 * daily maxima for the combined chart — same session scope as All Models.
 */
export const getModelWarningsData = async (from, to) => {
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
    const modelKeyExpr = {
        $cond: [
            {
                $and: [{ $ifNull: ["$modelId", false] }, { $ne: ["$modelId", ""] }],
            },
            "$modelId",
            "$fileName",
        ],
    };
    const baseStages = [{ $match: matchStage }];
    const [summaryRows, dailyRows] = await Promise.all([
        RevitSession.aggregate([
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
        RevitSession.aggregate([
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
    const items = summaryRows.map((row) => ({
        modelId: row._id,
        fileName: row.fileName || row._id,
        projectName: row.projectName || "-",
        lastWarningCount: row.lastWarningCount,
        sessionCount: row.sessionCount,
    }));
    const historiesByModelId = {};
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
export const getModelWarningsTimeSeries = async (modelId, from, to) => {
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
export const getModelSummaryHistory = async (modelId, from, to) => {
    const selectedIdentifier = modelId.trim();
    const normalizedModelId = normalizeModelId(modelId);
    if (!selectedIdentifier || !normalizedModelId) {
        console.log("getModelSummaryHistory: empty modelId");
        return [];
    }
    console.log("getModelSummaryHistory query:", { selectedIdentifier, normalizedModelId, from, to });
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
    const sessionRows = await RevitSession.aggregate([
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
            },
        },
        { $sort: { _id: 1 } },
    ]);
    console.log("getModelSummaryHistory sessionRows:", sessionRows.length);
    const syncMatchStage = {
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
        const dateFilter = {};
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
    const syncRows = await RevitSyncEvent.aggregate([
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
    console.log("getModelSummaryHistory syncRows:", syncRows.length);
    function median(values) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    }
    const dateSet = new Set();
    const fileSizeMap = new Map();
    const openingDurationMap = new Map();
    const syncDurationMap = new Map();
    const warningCountMap = new Map();
    for (const row of sessionRows) {
        dateSet.add(row._id);
        fileSizeMap.set(row._id, row.maxFileSize);
        openingDurationMap.set(row._id, median(row.openingDurations));
        warningCountMap.set(row._id, row.maxWarningCount);
    }
    for (const row of syncRows) {
        dateSet.add(row._id);
        syncDurationMap.set(row._id, median(row.syncDurations));
    }
    const dates = [...dateSet].sort((a, b) => a.localeCompare(b));
    return dates
        .map((date) => ({
        date,
        maxFileSize: fileSizeMap.get(date) ?? 0,
        maxOpeningDuration: openingDurationMap.get(date) ?? 0,
        maxSyncDuration: syncDurationMap.get(date) ?? 0,
        maxWarningCount: warningCountMap.get(date) ?? 0,
    }))
        .filter((point) => point.maxFileSize > 0);
};

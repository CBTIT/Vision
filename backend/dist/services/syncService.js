import RevitSyncEvent from "../models/RevitSyncEvents.js";
import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
const buildSyncFilters = (filters) => {
    const query = {};
    if (filters.autodeskUserName) {
        query.autodeskUserName = filters.autodeskUserName;
    }
    if (filters.from || filters.to) {
        const dateFilter = {};
        if (filters.from)
            dateFilter.$gte = new Date(filters.from);
        if (filters.to) {
            const end = new Date(filters.to);
            end.setDate(end.getDate() + 1);
            dateFilter.$lt = end;
        }
        query.$or = [{ dateTime: dateFilter }, { date: dateFilter }];
    }
    return query;
};
export const getSyncsCount = async (filters) => {
    const query = buildSyncFilters(filters);
    const syncsCount = await RevitSyncEvent.countDocuments(query);
    return syncsCount;
};
export const getSyncs = async (filters) => {
    const query = buildSyncFilters(filters);
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 1000);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        RevitSyncEvent.find(query).sort({ dateTime: -1, date: -1 }).skip(skip).limit(limit),
        RevitSyncEvent.countDocuments(query),
    ]);
    const usernames = Array.from(new Set(items
        .map((item) => item.autodeskUserName)
        .filter((name) => Boolean(name))));
    const sessionIds = Array.from(new Set(items
        .map((item) => item.revitSessionId?.toString())
        .filter((id) => Boolean(id))));
    const [mappingDocs, sessionDocs] = await Promise.all([
        usernames.length > 0
            ? UserMappings.find({ autodeskUserName: { $in: usernames } })
                .select({ autodeskUserName: 1, fullName: 1 })
                .lean()
            : [],
        sessionIds.length > 0
            ? RevitSession.find({ _id: { $in: sessionIds } })
                .select({ cloudProjectName: 1, projectId: 1 })
                .lean()
            : [],
    ]);
    const fullNameMap = new Map(mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]));
    const projectNameBySessionId = new Map(sessionDocs.map((doc) => [
        doc._id.toString(),
        (typeof doc.cloudProjectName === "string" && doc.cloudProjectName.trim()) ||
            (typeof doc.projectId === "string" && doc.projectId.trim()) ||
            "",
    ]));
    const enrichedItems = items.map((item) => {
        const row = item.toObject();
        const storedProjectName = typeof row.cloudProjectName === "string" && row.cloudProjectName.trim()
            ? row.cloudProjectName.trim()
            : "";
        return {
            ...row,
            fullName: fullNameMap.get(row.autodeskUserName) ?? "",
            cloudProjectName: storedProjectName ||
                (projectNameBySessionId.get(row.revitSessionId?.toString?.() ?? "") ?? ""),
        };
    });
    return {
        items: enrichedItems,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};
export const getSyncById = async (id) => {
    const item = await RevitSyncEvent.findById(id);
    if (!item) {
        throw new Error("Sync not found");
    }
    const row = item.toObject();
    const storedProjectName = typeof row.cloudProjectName === "string" && row.cloudProjectName.trim()
        ? row.cloudProjectName.trim()
        : "";
    const [mappingDoc, sessionDoc] = await Promise.all([
        row.autodeskUserName
            ? UserMappings.findOne({ autodeskUserName: row.autodeskUserName })
                .select({ fullName: 1 })
                .lean()
            : null,
        !storedProjectName && row.revitSessionId
            ? RevitSession.findById(row.revitSessionId)
                .select({ cloudProjectName: 1, projectId: 1 })
                .lean()
            : null,
    ]);
    return {
        ...row,
        fullName: mappingDoc?.fullName ?? "",
        cloudProjectName: storedProjectName ||
            (typeof sessionDoc?.cloudProjectName === "string" &&
                sessionDoc.cloudProjectName.trim()) ||
            (typeof sessionDoc?.projectId === "string" && sessionDoc.projectId.trim()) ||
            "",
    };
};

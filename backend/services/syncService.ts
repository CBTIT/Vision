import RevitSyncEvent from "../models/RevitSyncEvents.js";
import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";

type SyncFilters = {
  limit?: number;
  page?: number;
  from?: string;
  to?: string;
  autodeskUserName?: string;
};
const buildSyncFilters = (filters: SyncFilters) => {
  const query: any = {};
  if (filters.autodeskUserName) {
    query.autodeskUserName = filters.autodeskUserName;
  }
  if (filters.from || filters.to) {
    query.date = {};
    if (filters.from) {
      query.date.$gte = new Date(filters.from);
    }
    if (filters.to) {
      const end = new Date(filters.to);
      end.setDate(end.getDate() + 1);
      query.date.$lt = end;
    }
  }
  return query;
};
export const getSyncsCount = async (filters: SyncFilters) => {
  const query = buildSyncFilters(filters);
  const syncsCount = await RevitSyncEvent.countDocuments(query);
  return syncsCount;
};
export const getSyncs = async (filters: SyncFilters) => {
  const query = buildSyncFilters(filters);
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 1000);
  const page = Math.max(filters.page ?? 1, 1);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    RevitSyncEvent.find(query).sort({ date: -1 }).skip(skip).limit(limit),
    RevitSyncEvent.countDocuments(query),
  ]);

  const usernames = Array.from(
    new Set(
      items
        .map((item) => item.autodeskUserName)
        .filter((name): name is string => Boolean(name)),
    ),
  );

  const sessionIds = Array.from(
    new Set(
      items
        .map((item) => item.revitSessionId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  );

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

  const fullNameMap = new Map(
    mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]),
  );
  const projectNameBySessionId = new Map(
    sessionDocs.map((doc) => [
      doc._id.toString(),
      (typeof doc.cloudProjectName === "string" && doc.cloudProjectName.trim()) ||
        (typeof doc.projectId === "string" && doc.projectId.trim()) ||
        "",
    ]),
  );

  const enrichedItems = items.map((item) => {
    const row = item.toObject();
    return {
      ...row,
      fullName: fullNameMap.get(row.autodeskUserName) ?? "",
      cloudProjectName:
        projectNameBySessionId.get(row.revitSessionId?.toString?.() ?? "") ?? "",
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

export const getSyncById = async (id: string) => {
  const item = await RevitSyncEvent.findById(id);

  if (!item) {
    throw new Error("Sync not found");
  }

  const row = item.toObject();

  const [mappingDoc, sessionDoc] = await Promise.all([
    row.autodeskUserName
      ? UserMappings.findOne({ autodeskUserName: row.autodeskUserName })
          .select({ fullName: 1 })
          .lean()
      : null,
    row.revitSessionId
      ? RevitSession.findById(row.revitSessionId)
          .select({ cloudProjectName: 1, projectId: 1 })
          .lean()
      : null,
  ]);

  return {
    ...row,
    fullName: mappingDoc?.fullName ?? "",
    cloudProjectName:
      (typeof sessionDoc?.cloudProjectName === "string" &&
        sessionDoc.cloudProjectName.trim()) ||
      (typeof sessionDoc?.projectId === "string" && sessionDoc.projectId.trim()) ||
      "",
  };
};

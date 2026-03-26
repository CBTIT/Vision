import RevitSession from "../models/RevitSession.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";
import UserMappings from "../models/UserMappings.js";

type SessionFilters = {
  limit?: number;
  page?: number;
  from?: string;
  to?: string;
  autodeskUserName?: string;
};
const buildSessionFilters = (filters: SessionFilters) => {
  const query: any = {};
  if (filters.autodeskUserName) {
    query.autodeskUserName = filters.autodeskUserName;
  }
  if (filters.from || filters.to) {
    query.dateTime = {};
    if (filters.from) {
      query.dateTime.$gte = new Date(filters.from);
    }
    if (filters.to) {
      const end = new Date(filters.to);
      end.setDate(end.getDate() + 1);
      query.dateTime.$lt = end;
    }
  }
  return query;
};
export const getSesisonsCount = async (filters: SessionFilters) => {
  const query = buildSessionFilters(filters);
  const count = await RevitSession.countDocuments(query);
  return count;
};
export const getSessions = async (filters: SessionFilters) => {
  const query = buildSessionFilters(filters);
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 1000);
  const page = Math.max(filters.page ?? 1, 1);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    RevitSession.find(query).sort({ dateTime: -1 }).skip(skip).limit(limit),
    RevitSession.countDocuments(query),
  ]);

  const usernames = Array.from(
    new Set(
      items
        .map((item) => item.autodeskUserName)
        .filter((name): name is string => Boolean(name)),
    ),
  );

  const mappingDocs =
    usernames.length > 0
      ? await UserMappings.find({ autodeskUserName: { $in: usernames } })
          .select({ autodeskUserName: 1, fullName: 1 })
          .lean()
      : [];

  const fullNameMap = new Map(
    mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]),
  );

  const allSyncIds = Array.from(
    new Set(
      items.flatMap((item) =>
        (item.syncDatabaseIds ?? []).map((id) => String(id)),
      ),
    ),
  );

  const syncDocs =
    allSyncIds.length > 0
      ? await RevitSyncEvent.find({ _id: { $in: allSyncIds } })
          .select({ _id: 1, revitSessionId: 1, date: 1 })
          .lean()
      : [];

  const syncsBySessionId = new Map<
    string,
    Array<{ _id: unknown; date: Date | string }>
  >();
  for (const sync of syncDocs) {
    const key = String(sync.revitSessionId);
    const list = syncsBySessionId.get(key) ?? [];
    list.push({ _id: sync._id, date: sync.date });
    syncsBySessionId.set(key, list);
  }

  const enrichedItems = items.map((item) => {
    const row = item.toObject();
    const sessionSyncs = (syncsBySessionId.get(String(row._id)) ?? []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const syncTimeline = sessionSyncs.map((sync, index) => {
      const currentTime = new Date(sync.date).getTime();
      const previousTime =
        index > 0 ? new Date(sessionSyncs[index - 1].date).getTime() : null;

      return {
        syncId: String(sync._id),
        time: new Date(sync.date).toISOString(),
        gapMinutesFromPrevious:
          previousTime === null
            ? null
            : Math.round((currentTime - previousTime) / 60000),
      };
    });

    return {
      ...row,
      fullName: fullNameMap.get(row.autodeskUserName) ?? "",
      syncCount: syncTimeline.length,
      syncTimeline,
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

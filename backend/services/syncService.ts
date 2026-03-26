import RevitSyncEvent from "../models/RevitSyncEvents.js";

type SyncFilters = {
  limit?: number;
  from?: string;
  to?: string;
};
const buildSyncFilters = (filters: SyncFilters) => {
  const query: any = {};
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
  const limit = filters.limit ?? 10;
  const syncs = await RevitSyncEvent.find(query)
    .sort({ date: -1 })
    .limit(limit);
  return syncs;
};

import RevitSession from "../models/RevitSession.js";

type SessionFilters = {
  limit?: number;
  from?: string;
  to?: string;
};
const buildSessionFilters = (filters: SessionFilters) => {
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
export const getSesisonsCount = async (filters: SessionFilters) => {
  const query = buildSessionFilters(filters);
  const count = await RevitSession.countDocuments(query);
  return count;
};
export const getSessions = async (filters: SessionFilters) => {
  const query = buildSessionFilters(filters);
  const limit = filters.limit ?? 10;
  const session = await RevitSession.find(query)
    .sort({ dateTime: -1 })
    .limit(limit);
  return session;
};

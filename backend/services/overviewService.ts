import RevitSession from "../models/RevitSession.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";

type DailyPoint = {
  date: string;
  sessionsCount: number;
  syncsCount: number;
};

type DailyCountsResult = {
  from: string;
  to: string;
  points: DailyPoint[];
};

type DateBoundsResult = {
  from: string;
  to: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcStartOfDay = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatUtcYmd = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const getSessionDailyCounts = async (
  startInclusive: Date,
  endExclusive: Date,
): Promise<Map<string, number>> => {
  const rows = await RevitSession.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        dateTime: {
          $gte: startInclusive,
          $lt: endExclusive,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$dateTime",
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row._id, row.count);
  }
  return map;
};

const getSyncDailyCounts = async (
  startInclusive: Date,
  endExclusive: Date,
): Promise<Map<string, number>> => {
  const rows = await RevitSyncEvent.aggregate<{ _id: string; count: number }>([
    {
      $addFields: {
        _syncDate: { $ifNull: ["$dateTime", "$date"] },
      },
    },
    {
      $match: {
        _syncDate: {
          $gte: startInclusive,
          $lt: endExclusive,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$_syncDate",
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row._id, row.count);
  }
  return map;
};

export const getOverviewDailyCounts = async (
  from: string,
  to: string,
): Promise<DailyCountsResult> => {
  const startInclusive = toUtcStartOfDay(from);
  const endInclusive = toUtcStartOfDay(to);
  const endExclusive = addUtcDays(endInclusive, 1);

  const [sessionCounts, syncCounts] = await Promise.all([
    getSessionDailyCounts(startInclusive, endExclusive),
    getSyncDailyCounts(startInclusive, endExclusive),
  ]);

  const points: DailyPoint[] = [];
  for (
    let current = new Date(startInclusive);
    current <= endInclusive;
    current = addUtcDays(current, 1)
  ) {
    const date = formatUtcYmd(current);
    points.push({
      date,
      sessionsCount: sessionCounts.get(date) ?? 0,
      syncsCount: syncCounts.get(date) ?? 0,
    });
  }

  return { from, to, points };
};

export const getOverviewDateBounds = async (): Promise<DateBoundsResult> => {
  const [sessionFirst, sessionLast, syncFirst, syncLast] = await Promise.all([
    RevitSession.findOne({ dateTime: { $exists: true } })
      .sort({ dateTime: 1 })
      .select({ dateTime: 1 })
      .lean(),
    RevitSession.findOne({ dateTime: { $exists: true } })
      .sort({ dateTime: -1 })
      .select({ dateTime: 1 })
      .lean(),
    RevitSyncEvent.findOne({ $or: [{ dateTime: { $exists: true } }, { date: { $exists: true } }] })
      .sort({ dateTime: 1, date: 1 })
      .select({ dateTime: 1, date: 1 })
      .lean(),
    RevitSyncEvent.findOne({ $or: [{ dateTime: { $exists: true } }, { date: { $exists: true } }] })
      .sort({ dateTime: -1, date: -1 })
      .select({ dateTime: 1, date: 1 })
      .lean(),
  ]);

  const resolveSyncBound = (doc: Record<string, unknown> | null): Date | null => {
    if (!doc) return null;
    const raw = (doc.dateTime ?? (doc as any).date) as unknown;
    return raw instanceof Date && !Number.isNaN((raw as Date).getTime()) ? raw : null;
  };

  const starts = [sessionFirst?.dateTime, resolveSyncBound(syncFirst as any)]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  const ends = [sessionLast?.dateTime, resolveSyncBound(syncLast as any)]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  const today = new Date().toISOString().slice(0, 10);
  if (starts.length === 0 || ends.length === 0) {
    return { from: today, to: today };
  }

  const from = new Date(Math.min(...starts)).toISOString().slice(0, 10);
  const to = new Date(Math.max(...ends)).toISOString().slice(0, 10);
  return { from, to };
};

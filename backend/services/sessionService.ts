import RevitSession from "../models/RevitSession.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";
import UserMappings from "../models/UserMappings.js";
import mongoose from "mongoose";

type SessionFilters = {
  limit?: number;
  page?: number;
  from?: string;
  to?: string;
  autodeskUserName?: string;
  modelId?: string;
  deviceName?: string;
  /** Case-insensitive exact match on RevitSession.cloudProjectName */
  cloudProjectName?: string;
  /** When true, only sessions with crashStatus true */
  crashOnly?: boolean;
};

function buildDateRangeMatch(filters: { from?: string; to?: string }): {
  dateTime?: { $gte?: Date; $lt?: Date };
} {
  if (!filters.from && !filters.to) return {};
  const dateTime: { $gte?: Date; $lt?: Date } = {};
  if (filters.from) {
    dateTime.$gte = new Date(filters.from);
  }
  if (filters.to) {
    const end = new Date(filters.to);
    end.setDate(end.getDate() + 1);
    dateTime.$lt = end;
  }
  return { dateTime };
}

function addCloudProjectNameClause(
  match: Record<string, unknown>,
  cloudProjectName: string | undefined,
): void {
  const t = cloudProjectName?.trim();
  if (!t) return;
  match.cloudProjectName = {
    $regex: `^${escapeRegex(t)}$`,
    $options: "i",
  };
}

function addModelIdClause(
  match: Record<string, unknown>,
  modelId: string | undefined,
): void {
  const normalized = modelId?.trim() ? normalizeModelId(modelId.trim()) : "";
  if (!normalized) return;
  match.modelId = {
    $regex: `^\\{?${escapeRegex(normalized)}\\}?$`,
    $options: "i",
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeModelId(value: string): string {
  return value.trim().replace(/^\{+|\}+$/g, "");
}

function usernameAlternatives(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];

  const variants = new Set<string>([raw]);

  const slashParts = raw.split(/\\|\//).filter(Boolean);
  if (slashParts.length > 1) {
    variants.add(slashParts[slashParts.length - 1]);
  }

  const atIndex = raw.indexOf("@");
  if (atIndex > 0) {
    variants.add(raw.slice(0, atIndex));
  }

  return Array.from(variants)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const buildSessionFilters = (filters: SessionFilters) => {
  const query: any = {};
  if (filters.autodeskUserName) {
    const userAlternatives = usernameAlternatives(filters.autodeskUserName);
    if (userAlternatives.length > 0) {
      query.$or = userAlternatives.map((candidate) => ({
        autodeskUserName: {
          $regex: `^${escapeRegex(candidate)}$`,
          $options: "i",
        },
      }));
    }
  }
  if (filters.modelId) {
    const normalizedModelId = normalizeModelId(filters.modelId);
    if (normalizedModelId) {
      const escaped = escapeRegex(normalizedModelId);
      query.modelId = {
        $regex: `^\\{?${escaped}\\}?$`,
        $options: "i",
      };
    }
  }
  if (filters.deviceName) {
    query.deviceName = {
      $regex: `^${escapeRegex(filters.deviceName.trim())}$`,
      $options: "i",
    };
  }
  Object.assign(query, buildDateRangeMatch(filters));

  if (filters.cloudProjectName) {
    const t = filters.cloudProjectName.trim();
    if (t) {
      query.cloudProjectName = {
        $regex: `^${escapeRegex(t)}$`,
        $options: "i",
      };
    }
  }
  if (filters.crashOnly) {
    query.crashStatus = true;
  }
  return query;
};

export type SessionFilterOptions = {
  projects: string[];
  models: Array<{ modelId: string; label: string; count: number }>;
  users: Array<{
    autodeskUserName: string;
    fullName: string;
    count: number;
  }>;
};

/**
 * Distinct projects / models / users for session list dropdowns.
 * Hierarchy: projects always for the date range; models for date (+ project when set);
 * users for date (+ project when set + model when set).
 */
export const getSessionFilterOptions = async (filters: {
  from?: string;
  to?: string;
  /** Narrow models + user list to this ACC project */
  cloudProjectName?: string;
  /** Narrow user list to this model (with date + optional project) */
  modelId?: string;
}): Promise<SessionFilterOptions> => {
  const dateRange = buildDateRangeMatch(filters);

  const projectListMatch: Record<string, unknown> = {
    ...dateRange,
    cloudProjectName: { $nin: [null, ""] },
  };

  const modelListMatch: Record<string, unknown> = { ...dateRange };
  addCloudProjectNameClause(modelListMatch, filters.cloudProjectName);

  const userListMatch: Record<string, unknown> = { ...dateRange };
  addCloudProjectNameClause(userListMatch, filters.cloudProjectName);
  addModelIdClause(userListMatch, filters.modelId);

  const [rawProjects, modelAgg, userAgg] = await Promise.all([
    RevitSession.distinct("cloudProjectName", projectListMatch),
    RevitSession.aggregate([
      { $match: modelListMatch },
      {
        $group: {
          _id: "$modelId",
          fileName: { $first: "$fileName" },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { fileName: 1, _id: 1 } },
    ]),
    RevitSession.aggregate([
      {
        $match: {
          ...userListMatch,
          autodeskUserName: { $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: "$autodeskUserName",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const projects = Array.from(
    new Set(
      rawProjects
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const models: Array<{ modelId: string; label: string; count: number }> =
    modelAgg
      .map(
        (row: {
          _id?: unknown;
          fileName?: unknown;
          count?: unknown;
        }) => {
          const id =
            typeof row._id === "string"
              ? row._id.trim()
              : row._id != null
                ? String(row._id).trim()
                : "";
          const file =
            typeof row.fileName === "string" && row.fileName.trim()
              ? row.fileName.trim()
              : "";
          const count =
            typeof row.count === "number" && Number.isFinite(row.count)
              ? row.count
              : 0;
          return {
            modelId: id,
            label: file || id || "Unknown model",
            count,
          };
        },
      )
      .filter((m) => m.modelId.length > 0);

  const userNames = userAgg
    .map((row: { _id?: unknown; count?: unknown }) =>
      typeof row._id === "string"
        ? row._id.trim()
        : row._id != null
          ? String(row._id).trim()
          : "",
    )
    .filter((u) => u.length > 0);

  const mappingDocs =
    userNames.length > 0
      ? await UserMappings.find({ autodeskUserName: { $in: userNames } })
          .select({ autodeskUserName: 1, fullName: 1 })
          .lean()
      : [];

  const fullNameMap = new Map(
    mappingDocs.map((d) => [d.autodeskUserName, d.fullName ?? ""]),
  );

  const users = userAgg
    .map((row: { _id?: unknown; count?: unknown }) => {
      const autodeskUserName =
        typeof row._id === "string"
          ? row._id.trim()
          : row._id != null
            ? String(row._id).trim()
            : "";
      const count =
        typeof row.count === "number" && Number.isFinite(row.count)
          ? row.count
          : 0;
      if (!autodeskUserName) return null;
      return {
        autodeskUserName,
        fullName: String(fullNameMap.get(autodeskUserName) ?? "").trim(),
        count,
      };
    })
    .filter(
      (u): u is {
        autodeskUserName: string;
        fullName: string;
        count: number;
      } => u !== null,
    );

  return { projects, models, users };
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

export const getSessionById = async (sessionId: string) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    return null;
  }

  const item = await RevitSession.findById(sessionId);
  if (!item) return null;

  const row = item.toObject();
  const username =
    typeof row.autodeskUserName === "string" ? row.autodeskUserName : "";

  const mapping = username
    ? await UserMappings.findOne({ autodeskUserName: username })
        .select({ autodeskUserName: 1, fullName: 1 })
        .lean()
    : null;

  const syncIds = Array.from(
    new Set((row.syncDatabaseIds ?? []).map((id) => String(id))),
  );

  const syncDocs =
    syncIds.length > 0
      ? await RevitSyncEvent.find({ _id: { $in: syncIds } })
          .select({ _id: 1, date: 1 })
          .lean()
      : [];

  const orderedSyncs = syncDocs.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const syncTimeline = orderedSyncs.map((sync, index) => {
    const currentTime = new Date(sync.date).getTime();
    const previousTime =
      index > 0 ? new Date(orderedSyncs[index - 1].date).getTime() : null;

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
    fullName: mapping?.fullName ?? "",
    syncCount: syncTimeline.length,
    syncTimeline,
  };
};

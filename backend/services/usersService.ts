import PluginUse from "../models/PluginUse.js";
import RevitSession from "../models/RevitSession.js";
import RevitSyncEvent from "../models/RevitSyncEvents.js";
import UserMappings from "../models/UserMappings.js";

type UserSummary = {
  autodeskUserName: string;
  fullName: string;
  sessionsCount: number;
  syncsCount: number;
  pluginUseCount: number;
  pluginVersions: string[];
  lastActiveAt: string;
};

export const getUsersSummary = async (): Promise<UserSummary[]> => {
  const [
    sessionCounts,
    syncCounts,
    pluginCounts,
    pluginVersions,
    mappings,
    pluginNames,
  ] = await Promise.all([
    RevitSession.aggregate<{
      _id: string;
      sessionsCount: number;
      lastActiveAt: Date;
    }>([
      { $match: { autodeskUserName: { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: "$autodeskUserName",
          sessionsCount: { $sum: 1 },
          lastActiveAt: { $max: "$dateTime" },
        },
      },
    ]),
    RevitSyncEvent.aggregate<{
      _id: string;
      syncsCount: number;
    }>([
      { $match: { autodeskUserName: { $exists: true, $ne: "" } } },
      { $group: { _id: "$autodeskUserName", syncsCount: { $sum: 1 } } },
    ]),
    PluginUse.aggregate<{
      _id: string;
      pluginUseCount: number;
    }>([
      { $match: { autodeskUserName: { $exists: true, $ne: "" } } },
      { $group: { _id: "$autodeskUserName", pluginUseCount: { $sum: 1 } } },
    ]),
    RevitSession.aggregate<{
      _id: string;
      pluginVersions: string[];
    }>([
      {
        $match: {
          autodeskUserName: { $exists: true, $ne: "" },
        },
      },
      {
        $project: {
          autodeskUserName: 1,
          pluginVersion: {
            $ifNull: ["$cbtAssemblyVersion", "$cbtToolsVersion"],
          },
        },
      },
      {
        $match: {
          pluginVersion: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$autodeskUserName",
          pluginVersions: { $addToSet: "$pluginVersion" },
        },
      },
    ]),
    UserMappings.find({ autodeskUserName: { $exists: true, $ne: "" } })
      .select({ autodeskUserName: 1, fullName: 1 })
      .lean(),
    PluginUse.find({
      autodeskUserName: { $exists: true, $ne: "" },
      fullName: { $exists: true, $ne: "" },
    })
      .select({ autodeskUserName: 1, fullName: 1 })
      .lean(),
  ]);

  const usernames = new Set<string>([
    ...sessionCounts.map((row) => row._id),
    ...syncCounts.map((row) => row._id),
    ...pluginCounts.map((row) => row._id),
  ]);

  const sessionsCountMap = new Map(
    sessionCounts.map((row) => [row._id, row.sessionsCount]),
  );
  const lastActiveMap = new Map(
    sessionCounts.map((row) => [
      row._id,
      row.lastActiveAt instanceof Date ? row.lastActiveAt.toISOString() : "",
    ]),
  );
  const syncsCountMap = new Map(
    syncCounts.map((row) => [row._id, row.syncsCount]),
  );
  const pluginUseCountMap = new Map(
    pluginCounts.map((row) => [row._id, row.pluginUseCount]),
  );
  const pluginVersionsMap = new Map(
    pluginVersions.map((row) => [
      row._id,
      row.pluginVersions
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ]),
  );

  const fullNameMap = new Map<string, string>();
  for (const row of pluginNames) {
    if (!fullNameMap.has(row.autodeskUserName) && row.fullName) {
      fullNameMap.set(row.autodeskUserName, row.fullName);
    }
  }
  for (const row of mappings) {
    if (row.fullName) {
      fullNameMap.set(row.autodeskUserName, row.fullName);
    }
  }

  const items: UserSummary[] = Array.from(usernames).map(
    (autodeskUserName) => ({
      autodeskUserName,
      fullName: fullNameMap.get(autodeskUserName) ?? "",
      sessionsCount: sessionsCountMap.get(autodeskUserName) ?? 0,
      syncsCount: syncsCountMap.get(autodeskUserName) ?? 0,
      pluginUseCount: pluginUseCountMap.get(autodeskUserName) ?? 0,
      pluginVersions: pluginVersionsMap.get(autodeskUserName) ?? [],
      lastActiveAt: lastActiveMap.get(autodeskUserName) ?? "",
    }),
  );

  return items.sort((a, b) => {
    const aName = (a.fullName || a.autodeskUserName).toLowerCase();
    const bName = (b.fullName || b.autodeskUserName).toLowerCase();
    return aName.localeCompare(bName);
  });
};

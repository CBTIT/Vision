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
  pluginVersionDetails: Array<{
    pluginVersion: string;
    revitVersions: string[];
  }>;
  lastActiveAt: string;
};

function compareVersionStrings(left: string, right: string): number {
  const leftParts = left.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const rightParts = right.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? "";
    const rightPart = rightParts[index] ?? "";

    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);
    const leftIsNumber = leftPart !== "" && Number.isFinite(leftNumber);
    const rightIsNumber = rightPart !== "" && Number.isFinite(rightNumber);

    if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    if (leftPart !== rightPart) {
      return leftPart.localeCompare(rightPart, undefined, { numeric: true });
    }
  }

  return left.localeCompare(right, undefined, { numeric: true });
}

export const getUsersSummary = async (): Promise<UserSummary[]> => {
  const [
    sessionCounts,
    syncCounts,
    pluginCounts,
    pluginVersions,
    mappings,
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
      pluginVersionDetails: Array<{
        pluginVersion: string;
        revitVersions: string[];
      }>;
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
          revitVersion: { $ifNull: ["$revitVersion", ""] },
        },
      },
      {
        $match: {
          pluginVersion: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            autodeskUserName: "$autodeskUserName",
            pluginVersion: "$pluginVersion",
          },
          revitVersions: { $addToSet: "$revitVersion" },
        },
      },
      {
        $project: {
          _id: 0,
          autodeskUserName: "$_id.autodeskUserName",
          pluginVersion: "$_id.pluginVersion",
          revitVersions: 1,
        },
      },
      {
        $group: {
          _id: "$autodeskUserName",
          pluginVersionDetails: {
            $push: {
              pluginVersion: "$pluginVersion",
              revitVersions: "$revitVersions",
            },
          },
        },
      },
    ]),
    UserMappings.find({ autodeskUserName: { $exists: true, $ne: "" } })
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
  const pluginVersionDetailsMap = new Map(
    pluginVersions.map((row) => [
      row._id,
      row.pluginVersionDetails
        .filter(
          (
            detail,
          ): detail is { pluginVersion: string; revitVersions: string[] } =>
            typeof detail?.pluginVersion === "string" &&
            detail.pluginVersion.trim().length > 0,
        )
        .map((detail) => ({
          pluginVersion: detail.pluginVersion.trim(),
          revitVersions: detail.revitVersions
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .sort(compareVersionStrings),
        }))
        .sort((left, right) =>
          compareVersionStrings(left.pluginVersion, right.pluginVersion),
        ),
    ]),
  );

  const fullNameMap = new Map<string, string>();
  for (const row of mappings) {
    if (row.fullName) {
      fullNameMap.set(row.autodeskUserName, row.fullName);
    }
  }

  const items: UserSummary[] = Array.from(usernames).map((autodeskUserName) => {
    const pluginVersionDetails =
      pluginVersionDetailsMap.get(autodeskUserName) ?? [];

    return {
      autodeskUserName,
      fullName: fullNameMap.get(autodeskUserName) ?? "",
      sessionsCount: sessionsCountMap.get(autodeskUserName) ?? 0,
      syncsCount: syncsCountMap.get(autodeskUserName) ?? 0,
      pluginUseCount: pluginUseCountMap.get(autodeskUserName) ?? 0,
      pluginVersions: pluginVersionDetails.map(
        (detail) => detail.pluginVersion,
      ),
      pluginVersionDetails,
      lastActiveAt: lastActiveMap.get(autodeskUserName) ?? "",
    };
  });

  return items.sort((a, b) => {
    const aName = (a.fullName || a.autodeskUserName).toLowerCase();
    const bName = (b.fullName || b.autodeskUserName).toLowerCase();
    return aName.localeCompare(bName);
  });
};

import PluginUse from "../models/PluginUse.js";
import UserMappings from "../models/UserMappings.js";

type PluginFilters = {
  limit?: number;
  page?: number;
  pluginName?: string;
};

function normalizePluginName(item: {
  plugin_name?: unknown;
  pluginName?: unknown;
}): string {
  return (
    (typeof item.plugin_name === "string" && item.plugin_name.trim()) ||
    (typeof item.pluginName === "string" && item.pluginName.trim()) ||
    ""
  );
}

function normalizeProjectName(item: {
  project_name?: unknown;
  projectName?: unknown;
}): string {
  return (
    (typeof item.project_name === "string" && item.project_name.trim()) ||
    (typeof item.projectName === "string" && item.projectName.trim()) ||
    ""
  );
}

export const getPluginUseCount = async () => {
  const count = await PluginUse.countDocuments({});
  return count;
};

export const getPluginUseList = async (filters: PluginFilters) => {
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const skip = (page - 1) * limit;
  const pluginNameFilter = filters.pluginName?.trim() || "";
  const query = pluginNameFilter
    ? {
        $or: [
          { plugin_name: pluginNameFilter },
          { pluginName: pluginNameFilter },
        ],
      }
    : {};

  const [items, total, mappings] = await Promise.all([
    PluginUse.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    PluginUse.countDocuments(query),
    UserMappings.find({ autodeskUserName: { $exists: true, $ne: "" } })
      .select({ autodeskUserName: 1, fullName: 1, email: 1 })
      .lean(),
  ]);

  const mappingByUsername = new Map(
    mappings.map((mapping) => [mapping.autodeskUserName.trim(), mapping]),
  );

  const enrichedItems = items.map((item) => {
    const username =
      typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
    const mappedUser = username ? mappingByUsername.get(username) : undefined;
    const pluginName = normalizePluginName(item);
    const projectName = normalizeProjectName(item);

    return {
      ...item,
      fullName:
        (typeof mappedUser?.fullName === "string" && mappedUser.fullName.trim()) ||
        (typeof item.fullName === "string" && item.fullName.trim()) ||
        "",
      email:
        (typeof item.email === "string" && item.email.trim()) ||
        (typeof mappedUser?.email === "string" && mappedUser.email.trim()) ||
        "",
      plugin_name: pluginName,
      project_name: projectName,
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

export const getPluginNames = async (): Promise<string[]> => {
  const items = await PluginUse.find({})
    .select({ plugin_name: 1, pluginName: 1 })
    .lean();

  return Array.from(
    new Set(items.map((item) => normalizePluginName(item)).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
};

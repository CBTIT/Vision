import PluginUse from "../models/PluginUse.js";
import UserMappings from "../models/UserMappings.js";
export const getPluginUseCount = async () => {
    const count = await PluginUse.countDocuments({});
    return count;
};
export const getPluginUseList = async (filters) => {
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const pluginNameFilter = filters.pluginName?.trim() || "";
    const query = pluginNameFilter
        ? { pluginName: pluginNameFilter }
        : {};
    const [items, total, mappings] = await Promise.all([
        PluginUse.find(query).sort({ dateTime: -1 }).skip(skip).limit(limit).lean(),
        PluginUse.countDocuments(query),
        UserMappings.find({ autodeskUserName: { $exists: true, $ne: "" } })
            .select({ autodeskUserName: 1, fullName: 1, email: 1 })
            .lean(),
    ]);
    const mappingByUsername = new Map(mappings.map((mapping) => [mapping.autodeskUserName.trim(), mapping]));
    const enrichedItems = items.map((item) => {
        const username = typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
        const mappedUser = username ? mappingByUsername.get(username) : undefined;
        return {
            ...item,
            fullName: (typeof mappedUser?.fullName === "string" && mappedUser.fullName.trim()) ||
                "",
            email: (typeof mappedUser?.email === "string" && mappedUser.email.trim()) ||
                "",
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
export const getPluginNames = async () => {
    const items = await PluginUse.find({ pluginName: { $exists: true, $ne: "" } })
        .select({ pluginName: 1 })
        .lean();
    return Array.from(new Set(items
        .map((item) => typeof item.pluginName === "string" ? item.pluginName.trim() : "")
        .filter(Boolean))).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
};

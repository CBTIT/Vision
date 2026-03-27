import PluginUse from "../models/PluginUse.js";
export const getPluginUseCount = async () => {
    const count = await PluginUse.countDocuments({});
    return count;
};
export const getPluginUseList = async (filters) => {
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        PluginUse.find({}).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
        PluginUse.countDocuments({}),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
};

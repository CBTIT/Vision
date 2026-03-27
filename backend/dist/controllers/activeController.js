import { getActiveUsers, getActiveUsersCount, } from "../services/heartbeatService.js";
export const getActiveUsersCountController = async (req, res) => {
    const activeCount = await getActiveUsersCount();
    return res.json({ activeUsersCount: activeCount });
};
export const getActiveUsersController = async (req, reS) => {
    const active = await getActiveUsers();
    return reS.json({ activeUsers: active });
};

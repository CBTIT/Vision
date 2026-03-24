import RevitHeartbeat from "../models/RevitHeartbeat.js";

export const getActiveUsersCount = async () => {
  const cutoff = new Date(Date.now() - 90 * 1000);
  const activeCount = await RevitHeartbeat.countDocuments({
    ts: { $gte: cutoff },
  });
  return activeCount;
};

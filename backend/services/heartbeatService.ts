import RevitHeartbeat from "../models/RevitHeartbeat.js";
import { getTimeCutoff } from "../utilities/timeUtils.js";
export const getActiveUsers = async () => {
  const cutoff = getTimeCutoff(90);
  const active = await RevitHeartbeat.find({
    ts: { $gt: cutoff },
    openDocs: { $ne: [] },
  });
  return active;
};

export const getActiveUsersCount = async () => {
  const cutoff = getTimeCutoff(90);
  const activeCount = await RevitHeartbeat.countDocuments({
    ts: { $gte: cutoff },
    openDocs: { $ne: [] },
  });
  return activeCount;
};

import RevitSyncEvent from "../models/RevitSyncEvents.js";

export const getAllSyncsCount = async () => {
  const syncsCount = await RevitSyncEvent.countDocuments({});
  return syncsCount;
};

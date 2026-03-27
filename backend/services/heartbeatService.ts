import RevitHeartbeat from "../models/RevitHeartbeat.js";
import UserMappings from "../models/UserMappings.js";
import { getTimeCutoff } from "../utilities/timeUtils.js";

export const getActiveUsers = async () => {
  const cutoff = getTimeCutoff(90);
  const active = await RevitHeartbeat.find({
    ts: { $gt: cutoff },
    openDocs: { $ne: [] },
  })
    .sort({ ts: -1 })
    .lean();

  const usernames = Array.from(
    new Set(
      active
        .map((item) => item.user)
        .filter((name): name is string => typeof name === "string" && !!name),
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

  return active.map((item) => ({
    ...item,
    fullName: fullNameMap.get(item.user) ?? "",
  }));
};

export const getActiveUsersCount = async () => {
  const cutoff = getTimeCutoff(90);
  const activeCount = await RevitHeartbeat.countDocuments({
    ts: { $gte: cutoff },
    openDocs: { $ne: [] },
  });
  return activeCount;
};

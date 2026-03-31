import RevitHeartbeat from "../models/RevitHeartbeat.js";
import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
import { getTimeCutoff } from "../utilities/timeUtils.js";
const ACTIVE_HEARTBEAT_SECONDS = 90;
const HEARTBEAT_RETENTION_SECONDS = 180;
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeModelId(value) {
    return value.trim().replace(/^\{+|\}+$/g, "");
}
async function getLatestSessionUsername(machine, activeDocId) {
    const normalizedMachine = machine.trim();
    const normalizedModelId = normalizeModelId(activeDocId);
    if (!normalizedMachine || !normalizedModelId) {
        return "";
    }
    const escapedMachine = escapeRegex(normalizedMachine);
    const escapedModelId = escapeRegex(normalizedModelId);
    const session = await RevitSession.findOne({
        deviceName: {
            $regex: `^${escapedMachine}$`,
            $options: "i",
        },
        modelId: {
            $regex: `^\\{?${escapedModelId}\\}?$`,
            $options: "i",
        },
    })
        .sort({ dateTime: -1 })
        .select({ autodeskUserName: 1 })
        .lean();
    return typeof session?.autodeskUserName === "string"
        ? session.autodeskUserName.trim()
        : "";
}
async function cleanupStaleHeartbeats() {
    const retentionCutoff = getTimeCutoff(HEARTBEAT_RETENTION_SECONDS);
    await RevitHeartbeat.deleteMany({
        ts: { $lt: retentionCutoff },
    });
}
export const getActiveUsers = async () => {
    await cleanupStaleHeartbeats();
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const active = await RevitHeartbeat.find({
        ts: { $gt: cutoff },
        openDocs: { $ne: [] },
    })
        .sort({ ts: -1 })
        .lean();
    const resolvedUsernames = await Promise.all(active.map(async (item) => {
        const machine = typeof item.machine === "string" ? item.machine : "";
        const activeDocId = typeof item.activeDocId === "string" ? item.activeDocId : "";
        const sessionUsername = await getLatestSessionUsername(machine, activeDocId);
        if (sessionUsername) {
            return sessionUsername;
        }
        return typeof item.user === "string" ? item.user.trim() : "";
    }));
    const usernames = Array.from(new Set(resolvedUsernames.filter(Boolean)));
    const mappingDocs = usernames.length > 0
        ? await UserMappings.find({ autodeskUserName: { $in: usernames } })
            .select({ autodeskUserName: 1, fullName: 1 })
            .lean()
        : [];
    const fullNameMap = new Map(mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]));
    return active.map((item, index) => {
        const resolvedUsername = resolvedUsernames[index] ?? "";
        return {
            ...item,
            fullName: fullNameMap.get(resolvedUsername) ?? "",
        };
    });
};
export const getActiveUsersCount = async () => {
    await cleanupStaleHeartbeats();
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const activeCount = await RevitHeartbeat.countDocuments({
        ts: { $gte: cutoff },
        openDocs: { $ne: [] },
    });
    return activeCount;
};

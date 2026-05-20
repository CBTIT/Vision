import mongoose from "mongoose";
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
        dateTime: { $lt: retentionCutoff },
    });
}
export const getActiveUsers = async () => {
    await cleanupStaleHeartbeats();
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const active = await RevitHeartbeat.find({
        dateTime: { $gt: cutoff },
        openDocs: { $ne: [] },
    })
        .sort({ dateTime: -1 })
        .lean();
    const resolvedUsernames = await Promise.all(active.map(async (item) => {
        const machine = typeof item.machine === "string" ? item.machine : "";
        const activeDocId = typeof item.activeDocId === "string" ? item.activeDocId : "";
        const sessionUsername = await getLatestSessionUsername(machine, activeDocId);
        if (sessionUsername) {
            return sessionUsername;
        }
        return typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
    }));
    const usernames = Array.from(new Set(resolvedUsernames.filter(Boolean)));
    const mappingDocs = usernames.length > 0
        ? await UserMappings.find({ autodeskUserName: { $in: usernames } })
            .select({ autodeskUserName: 1, fullName: 1 })
            .lean()
        : [];
    const fullNameMap = new Map(mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]));
    const openDocSessionIds = collectOpenDocSessionIds(active);
    const { resolveSession } = await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds, active);
    return active.map((item, index) => {
        const resolvedUsername = resolvedUsernames[index] ?? "";
        const projectKeysFromOpenDocs = [];
        const seenProjectKey = new Set();
        const enrichedOpenDocs = [];
        if (Array.isArray(item.openDocs)) {
            for (const od of item.openDocs) {
                if (!od || typeof od !== "object")
                    continue;
                const open = od;
                const sid = typeof open.sessionId === "string" ? open.sessionId.trim() : "";
                if (!sid)
                    continue;
                const machine = typeof item.machine === "string" ? item.machine : "";
                const username = typeof item.autodeskUserName === "string" ? item.autodeskUserName : "";
                const sessionDoc = resolveSession(sid, machine, username);
                const pk = resolveProjectKeyFromSessionDoc(sessionDoc);
                if (!seenProjectKey.has(pk)) {
                    seenProjectKey.add(pk);
                    projectKeysFromOpenDocs.push(pk);
                }
                const sessionStartAt = sessionDocumentWorkStart(sessionDoc ?? null);
                const syncsCount = sessionDoc && Array.isArray(sessionDoc.syncDatabaseIds)
                    ? sessionDoc.syncDatabaseIds.length
                    : 0;
                enrichedOpenDocs.push({
                    sessionId: sid,
                    modelName: typeof open.modelName === "string" ? open.modelName.trim() : "",
                    sessionStartAt: sessionStartAt ? sessionStartAt.toISOString() : null,
                    syncsCount,
                });
            }
        }
        return {
            ...item,
            fullName: fullNameMap.get(resolvedUsername) ?? "",
            projectKeysFromOpenDocs,
            openDocs: enrichedOpenDocs,
        };
    });
};
export const getActiveUsersCount = async () => {
    await cleanupStaleHeartbeats();
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const activeCount = await RevitHeartbeat.countDocuments({
        dateTime: { $gte: cutoff },
        openDocs: { $ne: [] },
    });
    return activeCount;
};
const UNNAMED_PROJECT = "(Unnamed project)";
function normalizeActiveProjectLabel(raw) {
    if (typeof raw !== "string")
        return UNNAMED_PROJECT;
    const t = raw.trim();
    return t.length > 0 ? t : UNNAMED_PROJECT;
}
/**
 * Heartbeat `openDocs[].sessionId` is the Revit **model id** (matches
 * `RevitSession.modelId`), not necessarily MongoDB `_id`. We load sessions by
 * `modelId` (latest `dateTime` per model) and optionally by `_id` for legacy
 * payloads that still send a session document id.
 */
async function loadSessionResolverForHeartbeatOpenDocs(rawSessionIds, activeHeartbeats) {
    const unique = [...new Set(rawSessionIds.map((s) => s.trim()).filter(Boolean))];
    if (unique.length === 0) {
        return {
            resolveSession: () => undefined,
            sessionStart: () => null,
        };
    }
    const mongoIdStrings = unique.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const modelKeys = [
        ...new Set(unique
            .map((u) => normalizeModelId(u))
            .filter((k) => k.length > 0)),
    ];
    const orModel = modelKeys.length > 0
        ? {
            $or: modelKeys.map((mid) => ({
                modelId: {
                    $regex: `^\\{?${escapeRegex(mid)}\\}?$`,
                    $options: "i",
                },
            })),
        }
        : null;
    const sessionSelect = {
        modelId: 1,
        cloudProjectName: 1,
        projectId: 1,
        fileName: 1,
        openingReadyTime: 1,
        dateTime: 1,
        syncDatabaseIds: 1,
        deviceName: 1,
        autodeskUserName: 1,
        closingTime: 1,
    };
    const uniqueMachines = [
        ...new Set(activeHeartbeats
            .map((h) => (typeof h.machine === "string" ? h.machine.trim().toLowerCase() : ""))
            .filter(Boolean))
    ];
    const uniqueUsernames = [
        ...new Set(activeHeartbeats
            .map((h) => (typeof h.autodeskUserName === "string" ? h.autodeskUserName.trim().toLowerCase() : ""))
            .filter(Boolean))
    ];
    const machineRegexes = uniqueMachines.map((m) => new RegExp(`^${escapeRegex(m)}$`, "i"));
    const usernameRegexes = uniqueUsernames.map((u) => new RegExp(`^${escapeRegex(u)}$`, "i"));
    const filterOr = [
        { closingTime: { $in: [null, ""] } },
        { dateTime: { $gt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }
    ];
    if (machineRegexes.length > 0) {
        filterOr.push({ deviceName: { $in: machineRegexes } });
    }
    if (usernameRegexes.length > 0) {
        filterOr.push({ autodeskUserName: { $in: usernameRegexes } });
    }
    const modelQuery = orModel
        ? {
            $and: [
                orModel,
                {
                    $or: filterOr
                }
            ]
        }
        : null;
    const [byMongoIdDocs, byModelDocs] = await Promise.all([
        mongoIdStrings.length > 0
            ? RevitSession.find({
                _id: {
                    $in: mongoIdStrings.map((id) => new mongoose.Types.ObjectId(id)),
                },
            })
                .select(sessionSelect)
                .lean()
            : [],
        modelQuery
            ? RevitSession.find(modelQuery)
                .sort({ dateTime: -1 })
                .select(sessionSelect)
                .lean()
            : [],
    ]);
    const byMongoId = new Map();
    for (const doc of byMongoIdDocs) {
        byMongoId.set(String(doc._id), doc);
    }
    const sessions = byModelDocs;
    function resolveSession(heartbeatSessionId, machine, username) {
        const t = heartbeatSessionId.trim();
        if (!t)
            return undefined;
        const fromMongo = byMongoId.get(t);
        if (fromMongo)
            return fromMongo;
        const mid = normalizeModelId(t).toLowerCase();
        const mName = machine.trim().toLowerCase();
        const uName = username.trim().toLowerCase();
        // Filter candidate sessions matching this modelId
        const candidates = sessions.filter((s) => {
            const sMid = typeof s.modelId === "string" ? normalizeModelId(s.modelId).toLowerCase() : "";
            return sMid === mid;
        });
        if (candidates.length === 0)
            return undefined;
        // 1. Active session matching both machine and username
        let best = candidates.find((s) => {
            const isClosed = typeof s.closingTime === "string" && s.closingTime !== "";
            const sMachine = typeof s.deviceName === "string" ? s.deviceName.trim().toLowerCase() : "";
            const sUser = typeof s.autodeskUserName === "string" ? s.autodeskUserName.trim().toLowerCase() : "";
            return !isClosed && sMachine === mName && sUser === uName;
        });
        if (best)
            return best;
        // 2. Active session matching machine
        best = candidates.find((s) => {
            const isClosed = typeof s.closingTime === "string" && s.closingTime !== "";
            const sMachine = typeof s.deviceName === "string" ? s.deviceName.trim().toLowerCase() : "";
            return !isClosed && sMachine === mName;
        });
        if (best)
            return best;
        // 3. Active session matching username
        best = candidates.find((s) => {
            const isClosed = typeof s.closingTime === "string" && s.closingTime !== "";
            const sUser = typeof s.autodeskUserName === "string" ? s.autodeskUserName.trim().toLowerCase() : "";
            return !isClosed && sUser === uName;
        });
        if (best)
            return best;
        // 4. Any session matching both machine and username
        best = candidates.find((s) => {
            const sMachine = typeof s.deviceName === "string" ? s.deviceName.trim().toLowerCase() : "";
            const sUser = typeof s.autodeskUserName === "string" ? s.autodeskUserName.trim().toLowerCase() : "";
            return sMachine === mName && sUser === uName;
        });
        if (best)
            return best;
        // 5. Any session matching machine
        best = candidates.find((s) => {
            const sMachine = typeof s.deviceName === "string" ? s.deviceName.trim().toLowerCase() : "";
            return sMachine === mName;
        });
        if (best)
            return best;
        // 6. Any session matching username
        best = candidates.find((s) => {
            const sUser = typeof s.autodeskUserName === "string" ? s.autodeskUserName.trim().toLowerCase() : "";
            return sUser === uName;
        });
        if (best)
            return best;
        // 7. Fallback to latest session for this model
        return candidates[0];
    }
    function sessionStart(heartbeatSessionId, machine, username) {
        return sessionDocumentWorkStart(resolveSession(heartbeatSessionId, machine, username) ?? null);
    }
    return { resolveSession, sessionStart };
}
function collectOpenDocSessionIds(active) {
    const out = [];
    for (const item of active) {
        if (!Array.isArray(item.openDocs))
            continue;
        for (const od of item.openDocs) {
            if (!od || typeof od !== "object")
                continue;
            const sid = od.sessionId;
            if (typeof sid === "string" && sid.trim()) {
                out.push(sid.trim());
            }
        }
    }
    return out;
}
function cloudProjectKeyFromSession(sessionDoc) {
    if (!sessionDoc)
        return null;
    const cn = typeof sessionDoc.cloudProjectName === "string"
        ? sessionDoc.cloudProjectName.trim()
        : "";
    if (cn)
        return normalizeActiveProjectLabel(cn);
    const pid = typeof sessionDoc.projectId === "string" ? sessionDoc.projectId.trim() : "";
    if (pid)
        return normalizeActiveProjectLabel(pid);
    return null;
}
/**
 * Project / model labels use {@link RevitSession} rows found by matching
 * heartbeat `openDocs[].sessionId` to `RevitSession.modelId` (Revit model id).
 * Fallback: legacy payloads that still send Mongo `_id` of a session document.
 * We do not use `heartbeat.activeProjectName`.
 */
function resolveProjectKeyFromSessionDoc(sessionDoc) {
    const cloud = cloudProjectKeyFromSession(sessionDoc);
    if (cloud)
        return cloud;
    if (sessionDoc) {
        const midRaw = typeof sessionDoc.modelId === "string" ? sessionDoc.modelId.trim() : "";
        const mid = normalizeModelId(midRaw);
        if (mid) {
            return normalizeActiveProjectLabel(`model:${mid}`);
        }
    }
    return UNNAMED_PROJECT;
}
/**
 * Heartbeat `sessionId` is the Revit model id — one fingerprint per model.
 */
function openDocDedupeFingerprint(sessionIdRaw, modelName) {
    const mk = normalizeModelId(sessionIdRaw.trim());
    if (mk)
        return `model:${mk}`;
    if (modelName)
        return `name:${modelName.toLowerCase()}`;
    return null;
}
function displayModelLabel(sessionDoc, openDocModelName) {
    const file = sessionDoc && typeof sessionDoc.fileName === "string"
        ? sessionDoc.fileName.trim()
        : "";
    if (file)
        return file;
    if (openDocModelName)
        return openDocModelName;
    return "Unknown model";
}
/** Projects that currently have at least one active heartbeat with open models. */
export const getActiveProjects = async () => {
    await cleanupStaleHeartbeats();
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const active = await RevitHeartbeat.find({
        dateTime: { $gt: cutoff },
        openDocs: { $ne: [] },
    })
        .select({ autodeskUserName: 1, machine: 1, activeProjectName: 1, openDocs: 1 })
        .lean();
    const openDocSessionIds = collectOpenDocSessionIds(active);
    const { resolveSession } = await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds, active);
    const byProject = new Map();
    for (const item of active) {
        const u = typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
        if (!u || !Array.isArray(item.openDocs))
            continue;
        const seenInThisHeartbeat = new Set();
        for (const od of item.openDocs) {
            if (!od || typeof od !== "object")
                continue;
            const open = od;
            const sessionIdRaw = typeof open.sessionId === "string" ? open.sessionId.trim() : "";
            const modelName = typeof open.modelName === "string" ? open.modelName.trim() : "";
            const machine = typeof item.machine === "string" ? item.machine : "";
            const username = typeof item.autodeskUserName === "string" ? item.autodeskUserName : "";
            const sessionDoc = sessionIdRaw
                ? resolveSession(sessionIdRaw, machine, username)
                : undefined;
            const label = displayModelLabel(sessionDoc, modelName);
            const projectKey = resolveProjectKeyFromSessionDoc(sessionDoc);
            const fp = openDocDedupeFingerprint(sessionIdRaw, modelName);
            if (!fp)
                continue;
            if (seenInThisHeartbeat.has(fp)) {
                continue;
            }
            seenInThisHeartbeat.add(fp);
            let group = byProject.get(projectKey);
            if (!group) {
                group = {
                    users: new Set(),
                    models: new Set(),
                    modelLabels: [],
                };
                byProject.set(projectKey, group);
            }
            group.users.add(u);
            if (!group.models.has(fp)) {
                group.models.add(fp);
                group.modelLabels.push(label);
            }
        }
    }
    const rows = [...byProject.entries()].map(([projectName, { users, models, modelLabels }]) => ({
        projectName,
        activeUsersCount: users.size,
        activeModelsCount: models.size,
        activeModelNames: [...modelLabels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    }));
    rows.sort((a, b) => {
        if (b.activeUsersCount !== a.activeUsersCount) {
            return b.activeUsersCount - a.activeUsersCount;
        }
        return a.projectName.localeCompare(b.projectName, undefined, {
            sensitivity: "base",
        });
    });
    return rows;
};
function pickOpenDocInProject(hb, projectKey, resolveSession) {
    if (!Array.isArray(hb.openDocs))
        return null;
    const machine = typeof hb.machine === "string" ? hb.machine : "";
    const username = typeof hb.autodeskUserName === "string" ? hb.autodeskUserName : "";
    for (const od of hb.openDocs) {
        if (!od || typeof od !== "object")
            continue;
        const open = od;
        const sessionIdRaw = typeof open.sessionId === "string" ? open.sessionId.trim() : "";
        if (!sessionIdRaw)
            continue;
        const sessionDoc = resolveSession(sessionIdRaw, machine, username);
        const modelName = typeof open.modelName === "string" ? open.modelName.trim() : "";
        const pk = resolveProjectKeyFromSessionDoc(sessionDoc);
        if (pk !== projectKey)
            continue;
        return { sessionId: sessionIdRaw, modelName };
    }
    return null;
}
function parseDate(val) {
    if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === "string" || typeof val === "number") {
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}
function sessionDocumentWorkStart(s) {
    if (!s)
        return null;
    const ready = parseDate(s.openingReadyTime);
    if (ready)
        return ready;
    return parseDate(s.dateTime);
}
/**
 * Active heartbeats for a project label (as returned by {@link getActiveProjects}),
 * with session duration from Revit session start to now when the session doc exists.
 */
export const getActiveProjectUsers = async (projectNameParam) => {
    await cleanupStaleHeartbeats();
    const projectKey = normalizeActiveProjectLabel(projectNameParam.trim() || undefined);
    const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
    const active = await RevitHeartbeat.find({
        dateTime: { $gt: cutoff },
        openDocs: { $ne: [] },
    })
        .select({
        autodeskUserName: 1,
        machine: 1,
        revitVersion: 1,
        activeProjectName: 1,
        openDocs: 1,
    })
        .lean();
    const openDocSessionIds = collectOpenDocSessionIds(active);
    const { resolveSession, sessionStart } = await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds, active);
    const forProject = active.filter((h) => pickOpenDocInProject(h, projectKey, resolveSession));
    const usernames = Array.from(new Set(forProject
        .map((h) => (typeof h.autodeskUserName === "string" ? h.autodeskUserName.trim() : ""))
        .filter(Boolean)));
    const mappingDocs = usernames.length > 0
        ? await UserMappings.find({ autodeskUserName: { $in: usernames } })
            .select({ autodeskUserName: 1, fullName: 1 })
            .lean()
        : [];
    const fullNameMap = new Map(mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]));
    const now = Date.now();
    const rows = [];
    for (const hb of forProject) {
        const picked = pickOpenDocInProject(hb, projectKey, resolveSession);
        if (!picked)
            continue;
        const autodeskUserName = typeof hb.autodeskUserName === "string" ? hb.autodeskUserName.trim() : "";
        const machine = typeof hb.machine === "string" ? hb.machine.trim() : "";
        const revitVersion = typeof hb.revitVersion === "string" ? hb.revitVersion.trim() : "";
        const sessionDocForRow = resolveSession(picked.sessionId, machine, autodeskUserName);
        const activeModelName = sessionDocForRow
            ? displayModelLabel(sessionDocForRow, picked.modelName)
            : picked.modelName || null;
        const sessionId = picked.sessionId;
        const sessionStartAt = sessionId ? sessionStart(sessionId, machine, autodeskUserName) : null;
        let durationSeconds = null;
        if (sessionStartAt) {
            const elapsed = Math.floor((now - sessionStartAt.getTime()) / 1000);
            durationSeconds = elapsed >= 0 ? elapsed : 0;
        }
        const fullNameRaw = fullNameMap.get(autodeskUserName);
        const fullName = typeof fullNameRaw === "string" && fullNameRaw.trim()
            ? fullNameRaw.trim()
            : "";
        const syncsCount = sessionDocForRow && Array.isArray(sessionDocForRow.syncDatabaseIds)
            ? sessionDocForRow.syncDatabaseIds.length
            : 0;
        rows.push({
            autodeskUserName,
            fullName,
            machine,
            revitVersion,
            activeModelName,
            sessionId,
            sessionStartAt: sessionStartAt
                ? sessionStartAt.toISOString()
                : null,
            durationSeconds,
            syncsCount,
        });
    }
    rows.sort((a, b) => {
        const an = (a.fullName || a.autodeskUserName).toLowerCase();
        const bn = (b.fullName || b.autodeskUserName).toLowerCase();
        const c = an.localeCompare(bn);
        if (c !== 0)
            return c;
        return a.machine.localeCompare(b.machine);
    });
    return { projectName: projectKey, users: rows };
};

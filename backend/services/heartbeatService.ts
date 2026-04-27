import mongoose from "mongoose";
import RevitHeartbeat from "../models/RevitHeartbeat.js";
import RevitSession from "../models/RevitSession.js";
import UserMappings from "../models/UserMappings.js";
import { getTimeCutoff } from "../utilities/timeUtils.js";

const ACTIVE_HEARTBEAT_SECONDS = 90;
const HEARTBEAT_RETENTION_SECONDS = 180;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeModelId(value: string): string {
  return value.trim().replace(/^\{+|\}+$/g, "");
}

async function getLatestSessionUsername(
  machine: string,
  activeDocId: string,
): Promise<string> {
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

async function cleanupStaleHeartbeats(): Promise<void> {
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

  const resolvedUsernames = await Promise.all(
    active.map(async (item) => {
      const machine = typeof item.machine === "string" ? item.machine : "";
      const activeDocId =
        typeof item.activeDocId === "string" ? item.activeDocId : "";

      const sessionUsername = await getLatestSessionUsername(
        machine,
        activeDocId,
      );

      if (sessionUsername) {
        return sessionUsername;
      }

      return typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
    }),
  );

  const usernames = Array.from(new Set(resolvedUsernames.filter(Boolean)));

  const mappingDocs =
    usernames.length > 0
      ? await UserMappings.find({ autodeskUserName: { $in: usernames } })
          .select({ autodeskUserName: 1, fullName: 1 })
          .lean()
      : [];

  const fullNameMap = new Map(
    mappingDocs.map((doc) => [doc.autodeskUserName, doc.fullName]),
  );

  const openDocSessionIds = collectOpenDocSessionIds(active);
  const { resolveSession } =
    await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds);

  return active.map((item, index) => {
    const resolvedUsername = resolvedUsernames[index] ?? "";

    const projectKeysFromOpenDocs: string[] = [];
    const seenProjectKey = new Set<string>();
    if (Array.isArray(item.openDocs)) {
      for (const od of item.openDocs) {
        if (!od || typeof od !== "object") continue;
        const sid = (od as { sessionId?: unknown }).sessionId;
        if (typeof sid !== "string" || !sid.trim()) continue;
        const sessionDoc = resolveSession(sid.trim());
        const pk = resolveProjectKeyFromSessionDoc(sessionDoc);
        if (!seenProjectKey.has(pk)) {
          seenProjectKey.add(pk);
          projectKeysFromOpenDocs.push(pk);
        }
      }
    }

    return {
      ...item,
      fullName: fullNameMap.get(resolvedUsername) ?? "",
      projectKeysFromOpenDocs,
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

function normalizeActiveProjectLabel(raw: unknown): string {
  if (typeof raw !== "string") return UNNAMED_PROJECT;
  const t = raw.trim();
  return t.length > 0 ? t : UNNAMED_PROJECT;
}

type SessionProjectSource = {
  cloudProjectName?: unknown;
  projectId?: unknown;
  modelId?: unknown;
  fileName?: unknown;
};

/** Fields loaded from {@link RevitSession} when resolving heartbeat open docs. */
type LeanSessionForHeartbeat = SessionProjectSource & {
  openingReadyTime?: unknown;
  dateTime?: unknown;
  _id?: unknown;
};

/**
 * Heartbeat `openDocs[].sessionId` is the Revit **model id** (matches
 * `RevitSession.modelId`), not necessarily MongoDB `_id`. We load sessions by
 * `modelId` (latest `dateTime` per model) and optionally by `_id` for legacy
 * payloads that still send a session document id.
 */
async function loadSessionResolverForHeartbeatOpenDocs(
  rawSessionIds: string[],
): Promise<{
  resolveSession: (heartbeatSessionId: string) => LeanSessionForHeartbeat | undefined;
  sessionStart: (heartbeatSessionId: string) => Date | null;
}> {
  const unique = [...new Set(rawSessionIds.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return {
      resolveSession: () => undefined,
      sessionStart: () => null,
    };
  }

  const mongoIdStrings = unique.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  const modelKeys = [
    ...new Set(
      unique
        .map((u) => normalizeModelId(u))
        .filter((k) => k.length > 0),
    ),
  ];

  const orModel =
    modelKeys.length > 0
      ? ({
          $or: modelKeys.map((mid) => ({
            modelId: {
              $regex: `^\\{?${escapeRegex(mid)}\\}?$`,
              $options: "i",
            },
          })),
        } as const)
      : null;

  const sessionSelect = {
    modelId: 1,
    cloudProjectName: 1,
    projectId: 1,
    fileName: 1,
    openingReadyTime: 1,
    dateTime: 1,
  } as const;

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
    orModel
      ? RevitSession.find(orModel)
          .sort({ dateTime: -1 })
          .select(sessionSelect)
          .lean()
      : [],
  ]);

  const latestByNormalizedModelId = new Map<string, LeanSessionForHeartbeat>();
  for (const doc of byModelDocs) {
    const mid =
      typeof doc.modelId === "string" ? normalizeModelId(doc.modelId) : "";
    if (mid && !latestByNormalizedModelId.has(mid)) {
      latestByNormalizedModelId.set(mid, doc as LeanSessionForHeartbeat);
    }
  }

  const byMongoId = new Map<string, LeanSessionForHeartbeat>();
  for (const doc of byMongoIdDocs) {
    byMongoId.set(String(doc._id), doc as LeanSessionForHeartbeat);
  }

  function resolveSession(
    heartbeatSessionId: string,
  ): LeanSessionForHeartbeat | undefined {
    const t = heartbeatSessionId.trim();
    if (!t) return undefined;
    const fromMongo = byMongoId.get(t);
    if (fromMongo) return fromMongo;
    const mk = normalizeModelId(t);
    return latestByNormalizedModelId.get(mk);
  }

  function sessionStart(heartbeatSessionId: string): Date | null {
    return sessionDocumentWorkStart(resolveSession(heartbeatSessionId) ?? null);
  }

  return { resolveSession, sessionStart };
}

function collectOpenDocSessionIds(
  active: Array<{ openDocs?: unknown }>,
): string[] {
  const out: string[] = [];
  for (const item of active) {
    if (!Array.isArray(item.openDocs)) continue;
    for (const od of item.openDocs) {
      if (!od || typeof od !== "object") continue;
      const sid = (od as { sessionId?: unknown }).sessionId;
      if (typeof sid === "string" && sid.trim()) {
        out.push(sid.trim());
      }
    }
  }
  return out;
}

function cloudProjectKeyFromSession(
  sessionDoc: SessionProjectSource | undefined,
): string | null {
  if (!sessionDoc) return null;
  const cn =
    typeof sessionDoc.cloudProjectName === "string"
      ? sessionDoc.cloudProjectName.trim()
      : "";
  if (cn) return normalizeActiveProjectLabel(cn);
  const pid =
    typeof sessionDoc.projectId === "string" ? sessionDoc.projectId.trim() : "";
  if (pid) return normalizeActiveProjectLabel(pid);
  return null;
}

/**
 * Project / model labels use {@link RevitSession} rows found by matching
 * heartbeat `openDocs[].sessionId` to `RevitSession.modelId` (Revit model id).
 * Fallback: legacy payloads that still send Mongo `_id` of a session document.
 * We do not use `heartbeat.activeProjectName`.
 */
function resolveProjectKeyFromSessionDoc(
  sessionDoc: SessionProjectSource | undefined,
): string {
  const cloud = cloudProjectKeyFromSession(sessionDoc);
  if (cloud) return cloud;

  if (sessionDoc) {
    const midRaw =
      typeof sessionDoc.modelId === "string" ? sessionDoc.modelId.trim() : "";
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
function openDocDedupeFingerprint(
  sessionIdRaw: string,
  modelName: string,
): string | null {
  const mk = normalizeModelId(sessionIdRaw.trim());
  if (mk) return `model:${mk}`;
  if (modelName) return `name:${modelName.toLowerCase()}`;
  return null;
}

function displayModelLabel(
  sessionDoc:
    | { fileName?: unknown; modelName?: unknown }
    | undefined,
  openDocModelName: string,
): string {
  const file =
    sessionDoc && typeof sessionDoc.fileName === "string"
      ? sessionDoc.fileName.trim()
      : "";
  if (file) return file;
  if (openDocModelName) return openDocModelName;
  return "Unknown model";
}

export type ActiveProjectSummary = {
  projectName: string;
  activeUsersCount: number;
  activeModelsCount: number;
  /** One label per counted model (Revit file name when available). */
  activeModelNames: string[];
};

/** Projects that currently have at least one active heartbeat with open models. */
export const getActiveProjects = async (): Promise<ActiveProjectSummary[]> => {
  await cleanupStaleHeartbeats();

  const cutoff = getTimeCutoff(ACTIVE_HEARTBEAT_SECONDS);
  const active = await RevitHeartbeat.find({
    dateTime: { $gt: cutoff },
    openDocs: { $ne: [] },
  })
    .select({ autodeskUserName: 1, activeProjectName: 1, openDocs: 1 })
    .lean();

  const openDocSessionIds = collectOpenDocSessionIds(active);
  const { resolveSession } =
    await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds);

  type ProjectAgg = {
    users: Set<string>;
    models: Set<string>;
    modelLabels: string[];
  };

  const byProject = new Map<string, ProjectAgg>();

  for (const item of active) {
    const u = typeof item.autodeskUserName === "string" ? item.autodeskUserName.trim() : "";
    if (!u || !Array.isArray(item.openDocs)) continue;

    const seenInThisHeartbeat = new Set<string>();

    for (const od of item.openDocs) {
      if (!od || typeof od !== "object") continue;
      const open = od as { sessionId?: unknown; modelName?: unknown };
      const sessionIdRaw =
        typeof open.sessionId === "string" ? open.sessionId.trim() : "";
      const modelName =
        typeof open.modelName === "string" ? open.modelName.trim() : "";

      const sessionDoc = sessionIdRaw
        ? resolveSession(sessionIdRaw)
        : undefined;

      const label = displayModelLabel(sessionDoc, modelName);
      const projectKey = resolveProjectKeyFromSessionDoc(sessionDoc);
      const fp = openDocDedupeFingerprint(sessionIdRaw, modelName);
      if (!fp) continue;

      if (seenInThisHeartbeat.has(fp)) {
        continue;
      }
      seenInThisHeartbeat.add(fp);

      let group = byProject.get(projectKey);
      if (!group) {
        group = {
          users: new Set<string>(),
          models: new Set<string>(),
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

  const rows: ActiveProjectSummary[] = [...byProject.entries()].map(
    ([projectName, { users, models, modelLabels }]) => ({
      projectName,
      activeUsersCount: users.size,
      activeModelsCount: models.size,
      activeModelNames: [...modelLabels].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    }),
  );

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

function pickOpenDocInProject(
  hb: { openDocs?: unknown },
  projectKey: string,
  resolveSession: (heartbeatSessionId: string) => SessionProjectSource | undefined,
): { sessionId: string; modelName: string } | null {
  if (!Array.isArray(hb.openDocs)) return null;
  for (const od of hb.openDocs) {
    if (!od || typeof od !== "object") continue;
    const open = od as { sessionId?: unknown; modelName?: unknown };
    const sessionIdRaw =
      typeof open.sessionId === "string" ? open.sessionId.trim() : "";
    if (!sessionIdRaw) continue;
    const sessionDoc = resolveSession(sessionIdRaw);
    const modelName =
      typeof open.modelName === "string" ? open.modelName.trim() : "";
    const pk = resolveProjectKeyFromSessionDoc(sessionDoc);
    if (pk !== projectKey) continue;
    return { sessionId: sessionIdRaw, modelName };
  }
  return null;
}

function sessionDocumentWorkStart(
  s: {
    openingReadyTime?: unknown;
    dateTime?: unknown;
  } | null,
): Date | null {
  if (!s) return null;
  const ready = s.openingReadyTime;
  const dt = s.dateTime;
  if (ready instanceof Date && !Number.isNaN(ready.getTime())) {
    return ready;
  }
  if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
    return dt;
  }
  return null;
}

export type ActiveProjectUserRow = {
  autodeskUserName: string;
  fullName: string;
  machine: string;
  revitVersion: string;
  activeModelName: string | null;
  sessionId: string | null;
  sessionStartAt: string | null;
  durationSeconds: number | null;
};

/**
 * Active heartbeats for a project label (as returned by {@link getActiveProjects}),
 * with session duration from Revit session start to now when the session doc exists.
 */
export const getActiveProjectUsers = async (
  projectNameParam: string,
): Promise<{ projectName: string; users: ActiveProjectUserRow[] }> => {
  await cleanupStaleHeartbeats();

  const projectKey = normalizeActiveProjectLabel(
    projectNameParam.trim() || undefined,
  );

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
  const { resolveSession, sessionStart } =
    await loadSessionResolverForHeartbeatOpenDocs(openDocSessionIds);

  const forProject = active.filter((h) =>
    pickOpenDocInProject(h, projectKey, resolveSession),
  );

  const usernames = Array.from(
    new Set(
      forProject
        .map((h) => (typeof h.autodeskUserName === "string" ? h.autodeskUserName.trim() : ""))
        .filter(Boolean),
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

  const now = Date.now();
  const rows: ActiveProjectUserRow[] = [];

  for (const hb of forProject) {
    const picked = pickOpenDocInProject(hb, projectKey, resolveSession);
    if (!picked) continue;

    const autodeskUserName =
      typeof hb.autodeskUserName === "string" ? hb.autodeskUserName.trim() : "";
    const machine = typeof hb.machine === "string" ? hb.machine.trim() : "";
    const revitVersion =
      typeof hb.revitVersion === "string" ? hb.revitVersion.trim() : "";
    const sessionDocForRow = resolveSession(picked.sessionId);
    const activeModelName = sessionDocForRow
      ? displayModelLabel(sessionDocForRow, picked.modelName)
      : picked.modelName || null;

    const sessionId = picked.sessionId;
    const sessionStartAt = sessionId ? sessionStart(sessionId) : null;

    let durationSeconds: number | null = null;
    if (sessionStartAt) {
      const elapsed = Math.floor((now - sessionStartAt.getTime()) / 1000);
      durationSeconds = elapsed >= 0 ? elapsed : 0;
    }

    const fullNameRaw = fullNameMap.get(autodeskUserName);
    const fullName =
      typeof fullNameRaw === "string" && fullNameRaw.trim()
        ? fullNameRaw.trim()
        : "";

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
    });
  }

  rows.sort((a, b) => {
    const an = (a.fullName || a.autodeskUserName).toLowerCase();
    const bn = (b.fullName || b.autodeskUserName).toLowerCase();
    const c = an.localeCompare(bn);
    if (c !== 0) return c;
    return a.machine.localeCompare(b.machine);
  });

  return { projectName: projectKey, users: rows };
};

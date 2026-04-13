const APS_BASE_URL = "https://developer.api.autodesk.com";
function getCredentials() {
    const clientId = process.env.ACC_CLIENT_ID?.trim();
    const clientSecret = process.env.ACC_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
        throw new Error("ACC_CLIENT_ID and ACC_CLIENT_SECRET must be set in backend .env");
    }
    return { clientId, clientSecret };
}
async function getAccessToken() {
    const { clientId, clientSecret } = getCredentials();
    const body = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "data:read account:read",
    });
    const response = await fetch(`${APS_BASE_URL}/authentication/v2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Autodesk token request failed: ${response.status} ${text}`);
    }
    const payload = (await response.json());
    if (!payload.access_token) {
        throw new Error("Autodesk token response did not include access_token");
    }
    return payload.access_token;
}
async function apsGet(token, pathOrUrl) {
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : `${APS_BASE_URL}${pathOrUrl}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Autodesk API failed: ${response.status} ${text}`);
    }
    return response.json();
}
async function apsGetOptional(token, pathOrUrl) {
    try {
        return await apsGet(token, pathOrUrl);
    }
    catch {
        return null;
    }
}
/** Like {@link apsGet} but returns HTTP status without throwing on 4xx/5xx. */
async function apsGetStatus(token, pathOrUrl) {
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : `${APS_BASE_URL}${pathOrUrl}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        return { ok: false, status: response.status };
    }
    const text = await response.text();
    if (!text.trim()) {
        return { ok: true, json: [] };
    }
    try {
        return { ok: true, json: JSON.parse(text) };
    }
    catch {
        return { ok: false, status: 502 };
    }
}
/**
 * Hub and project IDs from Data Management often use a `b.` prefix; BIM 360 / ACC HQ
 * Admin APIs expect the same logical id without that prefix.
 */
function stripBimIdPrefix(id) {
    return id.replace(/^b\./i, "");
}
function flattenJsonApiCompanyRows(batch) {
    if (batch.length === 0)
        return batch;
    const first = batch[0];
    if (typeof first !== "object" || first === null)
        return batch;
    const rec = first;
    const attrs = rec.attributes;
    const hasJsonApiShape = attrs !== null &&
        typeof attrs === "object" &&
        !Array.isArray(attrs) &&
        ("id" in rec || "type" in rec);
    if (!hasJsonApiShape)
        return batch;
    return batch.map((item) => {
        const row = item;
        return {
            id: row.id,
            ...(row.attributes ?? {}),
        };
    });
}
function normalizeCompanyPageBody(json) {
    if (Array.isArray(json)) {
        return { rows: json, nextPath: null };
    }
    if (!json || typeof json !== "object") {
        return { rows: [], nextPath: null };
    }
    const o = json;
    let batch = (Array.isArray(o.results) && o.results) ||
        (Array.isArray(o.items) && o.items) ||
        (Array.isArray(o.companies) && o.companies) ||
        (Array.isArray(o.data) && o.data) ||
        [];
    batch = flattenJsonApiCompanyRows(batch);
    const pag = o.pagination;
    const pagNext = pag && typeof pag.nextUrl === "string" ? pag.nextUrl.trim() : "";
    const links = o.links;
    const linkNext = links?.next?.href?.trim() ?? "";
    const nextHref = pagNext || linkNext;
    const nextPath = nextHref ? normalizeNextContentsPath(nextHref) : null;
    return { rows: batch, nextPath };
}
async function fetchPartnerCompaniesPageChain(token, firstPath) {
    const rows = [];
    let nextPath = firstPath;
    for (let page = 0; page < 50; page += 1) {
        if (!nextPath)
            break;
        const res = await apsGetStatus(token, nextPath);
        if (!res.ok) {
            return page === 0
                ? { kind: "unreachable", status: res.status }
                : { kind: "ok", rows };
        }
        const parsed = normalizeCompanyPageBody(res.json);
        rows.push(...parsed.rows);
        nextPath = parsed.nextPath;
        if (!nextPath)
            break;
    }
    return { kind: "ok", rows };
}
/**
 * Partner companies for a project: try HQ and Construction Admin URL shapes.
 * Responses vary (array, results[], JSON:API data[]); we normalize before mapping.
 */
async function fetchPartnerCompaniesWithFallback(token, hubId, projectId, warnings) {
    const accountId = stripBimIdPrefix(hubId);
    const strippedProject = stripBimIdPrefix(projectId);
    const attempts = [
        `/hq/v1/accounts/${encodeURIComponent(accountId)}/projects/${encodeURIComponent(strippedProject)}/companies?limit=100`,
        `/hq/v1/accounts/${encodeURIComponent(accountId)}/projects/${encodeURIComponent(projectId)}/companies?limit=100`,
        `/construction/admin/v1/accounts/${encodeURIComponent(accountId)}/projects/${encodeURIComponent(projectId)}/companies`,
        `/construction/admin/v1/accounts/${encodeURIComponent(accountId)}/projects/${encodeURIComponent(strippedProject)}/companies`,
        `/construction/admin/v1/projects/${encodeURIComponent(projectId)}/companies`,
    ];
    let lastStatus = 0;
    for (const path of attempts) {
        const result = await fetchPartnerCompaniesPageChain(token, path);
        if (result.kind === "unreachable") {
            lastStatus = result.status;
            continue;
        }
        return result.rows;
    }
    warnings.push(lastStatus
        ? `Partner companies could not be loaded (last HTTP ${lastStatus}). Ensure the APS app is provisioned for Account Admin / project directory access and uses scope account:read.`
        : "Partner companies could not be loaded (all Autodesk endpoints failed). Ensure the APS app is provisioned for Account Admin access and uses scope account:read.");
    return [];
}
/**
 * ACC Admin — list project members with access metadata.
 * @see https://aps.autodesk.com/en/docs/acc/v1/reference/http/admin-projectsprojectId-users-GET/
 * Project ID for this API is usually the Data Management id **without** the `b.` prefix.
 */
async function fetchProjectUsersWithFallback(token, projectId, warnings) {
    const fields = encodeURIComponent([
        "name",
        "email",
        "firstName",
        "lastName",
        "accessLevels",
        "companyId",
        "companyName",
        "roles",
        "roleIds",
        "status",
        "products",
        "addedOn",
    ].join(","));
    const stripped = stripBimIdPrefix(projectId);
    const attempts = [
        `/construction/admin/v1/projects/${encodeURIComponent(stripped)}/users?limit=100&fields=${fields}`,
        `/construction/admin/v1/projects/${encodeURIComponent(projectId)}/users?limit=100&fields=${fields}`,
    ];
    let lastStatus = 0;
    for (const path of attempts) {
        const result = await fetchPartnerCompaniesPageChain(token, path);
        if (result.kind === "unreachable") {
            lastStatus = result.status;
            continue;
        }
        return result.rows;
    }
    warnings.push(lastStatus
        ? `Project users could not be loaded (ACC Admin GET projects/:projectId/users; last HTTP ${lastStatus}). Check OAuth scope account:read and app permissions.`
        : "Project users could not be loaded (ACC Admin GET projects/:projectId/users failed). Check OAuth scope account:read and app permissions.");
    return [];
}
function normalizeProducts(project) {
    const attrs = project.attributes;
    if (!attrs)
        return [];
    if (Array.isArray(attrs.products)) {
        return attrs.products
            .filter((value) => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    }
    const extensionData = attrs.extension?.data;
    if (!extensionData || typeof extensionData !== "object")
        return [];
    const values = Object.values(extensionData);
    const products = values.find((value) => Array.isArray(value));
    if (!Array.isArray(products))
        return [];
    return products
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
function classifyProject(project) {
    const attrs = project.attributes;
    const extensionType = attrs?.extension?.type?.toLowerCase().trim() || "";
    const extensionData = attrs?.extension?.data;
    const projectTypeRaw = typeof extensionData?.projectType === "string"
        ? extensionData.projectType
        : "";
    const projectType = projectTypeRaw.toLowerCase().trim();
    const platform = (attrs?.platform ?? "").toLowerCase().trim();
    const typeStr = (attrs?.type ?? "").toLowerCase().trim();
    const construction = (attrs?.constructionType ?? "")
        .toLowerCase()
        .trim();
    const products = normalizeProducts(project).map((product) => product.toLowerCase());
    const looksLikeAccOrForma = extensionType.includes("acc") ||
        extensionType.includes("forma") ||
        projectType.includes("acc") ||
        projectType.includes("forma") ||
        platform.includes("acc") ||
        platform.includes("forma") ||
        typeStr.includes("acc") ||
        typeStr.includes("forma") ||
        construction.includes("acc") ||
        products.some((product) => product.includes("acc") || product.includes("forma"));
    return looksLikeAccOrForma ? "acc_forma" : "bim";
}
function pickStringFromRecord(o, keys) {
    for (const key of keys) {
        const v = o[key];
        if (typeof v === "string" && v.trim())
            return v.trim();
    }
    return "";
}
function coerceIsoDateString(v) {
    if (typeof v === "string" && v.trim())
        return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? "" : d.toISOString();
    }
    return "";
}
function pickDateishFromRecord(o, keys) {
    for (const key of keys) {
        const s = coerceIsoDateString(o[key]);
        if (s)
            return s;
    }
    return "";
}
/** Fallback when ACC Admin account projects list has no startDate for this id. */
function extractProjectDateAdded(project) {
    const attrs = project.attributes;
    if (!attrs || typeof attrs !== "object")
        return "";
    const top = attrs;
    for (const key of [
        "createTime",
        "createdTime",
        "lastModifiedTime",
        "updatedTime",
    ]) {
        const s = coerceIsoDateString(top[key]);
        if (s)
            return s;
    }
    const ext = attrs.extension?.data;
    if (ext && typeof ext === "object") {
        for (const key of [
            "projectCreatedDate",
            "createdDate",
            "createdAt",
            "startDate",
            "projectStartDate",
            "updatedAt",
        ]) {
            const s = coerceIsoDateString(ext[key]);
            if (s)
                return s;
        }
    }
    return "";
}
/** Flatten JSON:API-style project row so id/startDate are addressable. */
function flattenAccAdminProjectRow(row) {
    if (!row || typeof row !== "object")
        return {};
    const r = row;
    const attrs = r.attributes;
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        return { ...r, ...attrs };
    }
    return r;
}
function pickAccProjectStartDate(flat) {
    return pickDateishFromRecord(flat, [
        "startDate",
        "start_date",
        "createdAt",
        "created_at",
        "addedOn",
        "updatedAt",
    ]);
}
/**
 * ACC Admin GET accounts/:accountId/projects — project id + startDate (ISO 8601).
 * @see https://aps.autodesk.com/en/docs/acc/v1/reference/http/admin-accounts-accountidprojects-GET/
 */
function accAdminProjectRowsToStartDateMap(rows) {
    const map = new Map();
    for (const row of rows) {
        const flat = flattenAccAdminProjectRow(row);
        const id = pickStringFromRecord(flat, ["id", "projectId", "project_id"]) || "";
        const startDate = pickAccProjectStartDate(flat);
        if (!id || !startDate)
            continue;
        map.set(id, startDate);
        const stripped = stripBimIdPrefix(id);
        if (stripped !== id)
            map.set(stripped, startDate);
    }
    return map;
}
function pickAccProjectImageUrl(flat) {
    const raw = pickStringFromRecord(flat, [
        "imageUrl",
        "image_url",
        "thumbnailImageUrl",
        "thumbnail_image_url",
    ]);
    if (!raw)
        return null;
    const t = raw.trim();
    return /^https?:\/\//i.test(t) ? t : null;
}
/**
 * ACC Admin GET accounts/:accountId/projects — project id → image URL.
 * @see https://aps.autodesk.com/en/docs/acc/v1/reference/http/admin-accounts-accountidprojects-GET/
 */
function accAdminProjectRowsToImageUrlMap(rows) {
    const map = new Map();
    for (const row of rows) {
        const flat = flattenAccAdminProjectRow(row);
        const id = pickStringFromRecord(flat, ["id", "projectId", "project_id"]) || "";
        const imageUrl = pickAccProjectImageUrl(flat);
        if (!id || !imageUrl)
            continue;
        map.set(id, imageUrl);
        const stripped = stripBimIdPrefix(id);
        if (stripped !== id)
            map.set(stripped, imageUrl);
    }
    return map;
}
/**
 * Resolves project image from ACC Admin account projects list
 * (`GET .../construction/admin/v1/accounts/{accountId}/projects`).
 * Tries `fields=id,imageUrl,thumbnailImageUrl` first, then the same path without `fields`.
 */
async function resolveProjectImageUrlFromAccAdmin(token, hubId, projectId) {
    const fieldsQs = `&fields=${encodeURIComponent("id,imageUrl,thumbnailImageUrl")}`;
    const tryAccount = async (accountId) => {
        const base = `/construction/admin/v1/accounts/${encodeURIComponent(accountId)}/projects?limit=200`;
        for (const path of [`${base}${fieldsQs}`, base]) {
            const res = await fetchPartnerCompaniesPageChain(token, path);
            if (res.kind === "ok" && res.rows.length > 0) {
                return res.rows;
            }
        }
        return [];
    };
    const strippedHub = stripBimIdPrefix(hubId);
    let rows = await tryAccount(strippedHub);
    if (rows.length === 0 && strippedHub !== hubId) {
        rows = await tryAccount(hubId);
    }
    const map = accAdminProjectRowsToImageUrlMap(rows);
    const strippedPid = stripBimIdPrefix(projectId);
    return (map.get(projectId) ||
        map.get(strippedPid) ||
        null);
}
async function fetchAccAccountProjectsAllRows(token, accountId) {
    /** No `fields` param — sparse fieldsets can omit dates or error on some tenants. */
    const firstPath = `/construction/admin/v1/accounts/${encodeURIComponent(accountId)}/projects?limit=200`;
    const result = await fetchPartnerCompaniesPageChain(token, firstPath);
    if (result.kind === "unreachable")
        return [];
    return result.rows;
}
/** Some hubs need stripped `b.` account id; others only return rows with the raw hub id. */
async function fetchAccAccountProjectsForHub(token, hubId) {
    const stripped = stripBimIdPrefix(hubId);
    const primary = await fetchAccAccountProjectsAllRows(token, stripped);
    if (primary.length > 0)
        return primary;
    if (stripped !== hubId) {
        const secondary = await fetchAccAccountProjectsAllRows(token, hubId);
        if (secondary.length > 0)
            return secondary;
    }
    return [];
}
function jsonToAccAdminProjectFlat(json) {
    if (!json || typeof json !== "object")
        return {};
    const o = json;
    const data = o.data;
    if (data !== undefined && data !== null && typeof data === "object") {
        return flattenAccAdminProjectRow(data);
    }
    return flattenAccAdminProjectRow(json);
}
async function fetchAccAdminProjectStartDateFromDetail(token, projectId) {
    const stripped = stripBimIdPrefix(projectId);
    const paths = [
        `/construction/admin/v1/projects/${encodeURIComponent(stripped)}`,
        `/construction/admin/v1/projects/${encodeURIComponent(projectId)}`,
    ];
    for (const path of paths) {
        const res = await apsGetStatus(token, path);
        if (!res.ok)
            continue;
        const flat = jsonToAccAdminProjectFlat(res.json);
        const start = pickAccProjectStartDate(flat);
        if (start)
            return start;
    }
    return "";
}
async function fetchDmProjectDetailDateAdded(token, hubId, projectId) {
    const res = await apsGetStatus(token, `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}`);
    if (!res.ok || !res.json || typeof res.json !== "object")
        return "";
    const body = res.json;
    if (!body.data)
        return "";
    return extractProjectDateAdded(body.data);
}
async function enrichMissingProjectDates(token, rows) {
    const missing = rows.filter((r) => !r.dateAdded.trim());
    const chunkSize = 8;
    for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (row) => {
            let d = await fetchAccAdminProjectStartDateFromDetail(token, row.id);
            if (!d)
                d = await fetchDmProjectDetailDateAdded(token, row.hubId, row.id);
            if (d)
                row.dateAdded = d;
        }));
    }
}
function resolveProjectDateAdded(projectId, accStartDateByProjectId, dmProject) {
    const stripped = stripBimIdPrefix(projectId);
    const fromAcc = accStartDateByProjectId.get(projectId) ||
        accStartDateByProjectId.get(stripped) ||
        "";
    if (fromAcc)
        return fromAcc;
    return extractProjectDateAdded(dmProject);
}
async function listAllProjectsForHub(token, hubId) {
    const projects = [];
    let nextPath = `/project/v1/hubs/${encodeURIComponent(hubId)}/projects?page[limit]=200`;
    while (nextPath) {
        const page = await apsGet(token, nextPath);
        if (Array.isArray(page.data)) {
            projects.push(...page.data);
        }
        const nextHref = page.links?.next?.href?.trim();
        nextPath = nextHref || "";
    }
    return projects;
}
export const getCloudProjectsByCategory = async () => {
    const token = await getAccessToken();
    const hubsResponse = await apsGet(token, "/project/v1/hubs");
    const hubs = Array.isArray(hubsResponse.data) ? hubsResponse.data : [];
    const accStartDateMaps = await Promise.all(hubs.map(async (hub) => {
        const rows = await fetchAccAccountProjectsForHub(token, hub.id);
        return accAdminProjectRowsToStartDateMap(rows);
    }));
    const accStartDateByProjectId = new Map();
    for (const m of accStartDateMaps) {
        for (const [k, v] of m) {
            accStartDateByProjectId.set(k, v);
        }
    }
    const projectsByHub = await Promise.all(hubs.map(async (hub) => {
        const projects = await listAllProjectsForHub(token, hub.id);
        return { hub, projects };
    }));
    const bim = [];
    const accForma = [];
    for (const group of projectsByHub) {
        const hubName = group.hub.attributes?.name?.trim() || group.hub.id;
        for (const project of group.projects) {
            const sourceType = classifyProject(project);
            const row = {
                id: project.id,
                hubId: group.hub.id,
                hubName,
                name: project.attributes?.name?.trim() || project.id,
                status: project.attributes?.status?.trim() || "unknown",
                dateAdded: resolveProjectDateAdded(project.id, accStartDateByProjectId, project),
                sourceType,
                products: normalizeProducts(project),
            };
            if (sourceType === "acc_forma") {
                accForma.push(row);
            }
            else {
                bim.push(row);
            }
        }
    }
    await enrichMissingProjectDates(token, [...bim, ...accForma]);
    const byName = (left, right) => left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
    });
    bim.sort(byName);
    accForma.sort(byName);
    return {
        bim,
        accForma,
        total: bim.length + accForma.length,
    };
};
/** Max nesting depth when walking BIM 360 / ACC folder trees (avoids runaway recursion). */
const MAX_FOLDER_DEPTH = 30;
/** Safety cap on how many RVT rows we attach to one project response. */
const MAX_REVIT_MODEL_FILES = 10_000;
function isRevitModelFile(entry) {
    const name = (entry.attributes?.displayName?.trim() ||
        entry.attributes?.name?.trim() ||
        "").toLowerCase();
    if (name.endsWith(".rvt"))
        return true;
    const fileTypeRaw = typeof entry.attributes?.extension?.data?.fileType === "string"
        ? entry.attributes.extension.data.fileType
        : "";
    if (fileTypeRaw.toLowerCase().trim() === "rvt")
        return true;
    const extType = entry.attributes?.extension?.type?.toLowerCase().trim() || "";
    if (extType.includes("revit"))
        return true;
    return false;
}
function entryIsFolder(entry) {
    return entry.type.toLowerCase().includes("folder");
}
function entryIsItem(entry) {
    return entry.type.toLowerCase().includes("item");
}
function normalizeNextContentsPath(href) {
    const t = href.trim();
    if (!t)
        return "";
    if (/^https?:\/\//i.test(t))
        return t;
    return t.startsWith("/") ? t : `/${t}`;
}
async function fetchFolderContentsAllPages(token, projectId, folderId) {
    const out = [];
    let nextPath = `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents?page[limit]=200`;
    while (nextPath) {
        const page = await apsGetOptional(token, nextPath);
        if (!page?.data?.length)
            break;
        out.push(...page.data);
        const nextHref = page.links?.next?.href?.trim();
        nextPath = nextHref ? normalizeNextContentsPath(nextHref) : null;
    }
    return out;
}
async function walkFoldersForRevitModels(token, projectId, folderId, folderPathLabel, depth, state) {
    if (state.stopped)
        return;
    if (depth > MAX_FOLDER_DEPTH) {
        if (!state.depthExceeded) {
            state.depthExceeded = true;
            state.extraWarnings.push(`Folder tree exceeded max depth (${MAX_FOLDER_DEPTH}); some Revit models may be missing.`);
        }
        return;
    }
    const entries = await fetchFolderContentsAllPages(token, projectId, folderId);
    for (const entry of entries) {
        if (state.stopped)
            return;
        if (entryIsFolder(entry)) {
            const subName = entry.attributes?.displayName?.trim() ||
                entry.attributes?.name?.trim() ||
                entry.id;
            const subPath = folderPathLabel
                ? `${folderPathLabel} / ${subName}`
                : subName;
            await walkFoldersForRevitModels(token, projectId, entry.id, subPath, depth + 1, state);
            continue;
        }
        if (!entryIsItem(entry) || !isRevitModelFile(entry))
            continue;
        if (state.totalRvt >= MAX_REVIT_MODEL_FILES) {
            state.extraWarnings.push(`Revit model list capped at ${MAX_REVIT_MODEL_FILES} files.`);
            state.stopped = true;
            return;
        }
        state.totalRvt += 1;
        const extensionType = entry.attributes?.extension?.type?.toLowerCase().trim() || "";
        const fileTypeRaw = typeof entry.attributes?.extension?.data?.fileType === "string"
            ? entry.attributes.extension.data.fileType
            : "";
        const fileType = fileTypeRaw || extensionType || "rvt";
        state.models.push({
            id: entry.id,
            name: entry.attributes?.displayName?.trim() ||
                entry.attributes?.name?.trim() ||
                entry.id,
            fileType,
            folderName: folderPathLabel || "(project)",
            lastModifiedAt: entry.attributes?.lastModifiedTime?.trim() ||
                entry.attributes?.createTime?.trim() ||
                "",
            lastModifiedBy: entry.attributes?.lastModifiedUserName?.trim() ||
                entry.attributes?.createUserName?.trim() ||
                "",
        });
    }
}
async function listProjectModels(token, projectId, topFolders, warnings) {
    const state = {
        models: [],
        extraWarnings: [],
        totalRvt: 0,
        stopped: false,
        depthExceeded: false,
    };
    for (const folder of topFolders) {
        if (state.stopped)
            break;
        const rootLabel = folder.attributes?.displayName?.trim() ||
            folder.attributes?.name?.trim() ||
            folder.id;
        await walkFoldersForRevitModels(token, projectId, folder.id, rootLabel, 0, state);
    }
    for (const w of state.extraWarnings) {
        warnings.push(w);
    }
    state.models.sort((left, right) => left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
    }));
    return state.models;
}
function normalizeUserRow(row) {
    if (!row || typeof row !== "object")
        return {};
    const r = row;
    const attrs = r.attributes;
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        return { ...r, ...attrs };
    }
    return r;
}
function pickUserStringField(row, keys) {
    for (const key of keys) {
        const v = row[key];
        if (typeof v === "string" && v.trim())
            return v.trim();
        if (v &&
            typeof v === "object" &&
            !Array.isArray(v) &&
            "name" in v) {
            const n = v.name;
            if (typeof n === "string" && n.trim())
                return n.trim();
        }
    }
    return "";
}
/**
 * Human-readable access from ACC Admin project user payload
 * (see GET projects/:projectId/users — accessLevels, roles, products).
 */
function formatAccProjectUserAccessDisplay(row) {
    const segments = [];
    const al = row.accessLevels;
    if (al && typeof al === "object" && !Array.isArray(al)) {
        const o = al;
        if (o.accountAdmin === true)
            segments.push("Hub admin");
        if (o.projectAdmin === true)
            segments.push("Project admin");
        if (o.executive === true)
            segments.push("Executive");
    }
    const roles = row.roles;
    if (Array.isArray(roles)) {
        const names = [];
        for (const r of roles) {
            if (r && typeof r === "object" && "name" in r) {
                const n = r.name;
                if (typeof n === "string" && n.trim())
                    names.push(n.trim());
            }
        }
        if (names.length > 0)
            segments.push(names.join(", "));
    }
    if (segments.length > 0) {
        return segments.join(" · ");
    }
    const products = row.products;
    if (Array.isArray(products) && products.length > 0) {
        const bits = [];
        for (const p of products) {
            if (!p || typeof p !== "object")
                continue;
            const key = p.key;
            const access = p.access;
            if (typeof key !== "string" || typeof access !== "string")
                continue;
            if (access === "none")
                continue;
            bits.push(`${key}: ${access}`);
        }
        if (bits.length > 0)
            return bits.join("; ");
    }
    return legacyUserAccessFallback(row);
}
/** Fallback for non-ACC or legacy shapes (HQ, sparse fieldsets). */
function legacyUserAccessFallback(row) {
    const direct = pickUserStringField(row, [
        "accessLevel",
        "access_level",
        "companyAccessLevel",
        "company_access_level",
        "projectAdministration",
        "role",
        "companyRole",
    ]);
    if (direct)
        return direct;
    const levels = row.accessLevels;
    if (Array.isArray(levels)) {
        const parts = levels
            .map((x) => {
            if (typeof x === "string")
                return x.trim();
            if (x && typeof x === "object" && "name" in x) {
                const n = x.name;
                return typeof n === "string" ? n.trim() : "";
            }
            return "";
        })
            .filter((s) => s.length > 0);
        if (parts.length > 0)
            return parts.join(", ");
    }
    return "-";
}
function mapUsers(payload) {
    if (!payload || typeof payload !== "object")
        return [];
    const p = payload;
    const rows = p.results ?? p.data ?? p.items ?? [];
    if (!Array.isArray(rows))
        return [];
    return rows.map((row, index) => {
        const r = normalizeUserRow(row);
        const typed = r;
        const composedName = [typed.firstName, typed.lastName]
            .filter((value) => typeof value === "string")
            .join(" ")
            .trim();
        const company = pickUserStringField(r, [
            "companyName",
            "company",
            "company_name",
            "organization",
            "employer",
            "businessUnit",
        ]) || "-";
        return {
            id: typed.id || typed.userId || `user-${index + 1}`,
            name: typed.name || composedName || "-",
            email: typeof typed.email === "string" && typed.email.trim()
                ? typed.email.trim()
                : "-",
            company,
            accessLevel: formatAccProjectUserAccessDisplay(r),
            status: typeof typed.status === "string" && typed.status.trim()
                ? typed.status.trim()
                : "unknown",
        };
    });
}
function pickCompanyString(row, keys) {
    for (const key of keys) {
        const v = row[key];
        if (typeof v === "string" && v.trim())
            return v.trim();
    }
    return "";
}
function mapCompanies(payload) {
    if (payload == null)
        return [];
    let rows = [];
    if (Array.isArray(payload)) {
        rows = payload;
    }
    else if (typeof payload === "object") {
        const o = payload;
        rows =
            o.results ??
                o.data ??
                o.items ??
                o.companies ??
                [];
    }
    if (!Array.isArray(rows))
        return [];
    return rows.map((row, index) => {
        if (!row || typeof row !== "object") {
            return {
                id: `company-${index + 1}`,
                name: "-",
                trade: "-",
                status: "unknown",
            };
        }
        const typed = row;
        const idRaw = pickCompanyString(typed, [
            "id",
            "companyId",
            "company_id",
        ]);
        const name = pickCompanyString(typed, [
            "name",
            "companyName",
            "company_name",
            "displayName",
            "originalName",
        ]) || "-";
        const trade = pickCompanyString(typed, [
            "trade",
            "businessUnit",
            "business_unit",
        ]) || "-";
        const status = pickCompanyString(typed, ["status", "companyStatus"]) || "unknown";
        return {
            id: idRaw || `company-${index + 1}`,
            name,
            trade,
            status,
        };
    });
}
export const getCloudProjectDetails = async (hubId, projectId) => {
    const token = await getAccessToken();
    const warnings = [];
    const projectPath = `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}`;
    const projectResponse = await apsGet(token, projectPath);
    const projectData = projectResponse.data;
    if (!projectData) {
        throw new Error("Project was not found on Autodesk API");
    }
    let imageUrl = null;
    try {
        imageUrl = await resolveProjectImageUrlFromAccAdmin(token, hubId, projectId);
    }
    catch {
        imageUrl = null;
    }
    const topFoldersResponse = await apsGetOptional(token, `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`);
    const topFolders = Array.isArray(topFoldersResponse?.data)
        ? topFoldersResponse.data
        : [];
    const models = await listProjectModels(token, projectId, topFolders, warnings);
    const userRows = await fetchProjectUsersWithFallback(token, projectId, warnings);
    const users = mapUsers({ results: userRows });
    const companyRows = await fetchPartnerCompaniesWithFallback(token, hubId, projectId, warnings);
    const companies = mapCompanies(companyRows);
    return {
        project: {
            id: projectData.id,
            hubId,
            name: projectData.attributes?.name?.trim() || projectData.id,
            status: projectData.attributes?.status?.trim() || "unknown",
            sourceType: classifyProject(projectData),
            products: normalizeProducts(projectData),
            imageUrl,
        },
        models,
        users,
        companies,
        warnings,
    };
};

// Switch between dev and prod by setting VITE_API_BASE_URL in .env.development / .env.production
const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";

export type OverviewDailyPoint = {
  date: string;
  sessionsCount: number;
  syncsCount: number;
};

export type PaginatedListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SessionListItem = {
  _id: string;
  dateTime: string;
  cloudProjectName?: string;
  projectId?: string;
  fileName?: string;
  modelId?: string;
  autodeskUserName?: string;
  fullName?: string;
  revitVersion?: string;
  closingTime?: string | null;
  sessionDuration?: number | string | null;
  crashStatus?: boolean | number | string;
  syncCount?: number;
  syncTimeline?: Array<{
    syncId: string;
    time: string;
    gapMinutesFromPrevious: number | null;
  }>;
  [key: string]: unknown;
};

export type SyncListItem = {
  _id: string;
  dateTime?: string;
  date?: string;
  revitSessionId?: string;
  projectId?: string;
  cloudProjectName?: string;
  fileName?: string;
  modelId?: string;
  autodeskUserName?: string;
  fullName?: string;
  duration?: number;
  [key: string]: unknown;
};

export type PluginUseItem = {
  _id: string;
  dateTime?: string;
  autodeskUserName?: string;
  fullName?: string;
  email?: string;
  pluginName?: string;
  fileName?: string;
  cloudProjectName?: string;
  modelId?: string;
  projectId?: string;
  notes?: string;
  [key: string]: unknown;
};

export type UserSummaryItem = {
  autodeskUserName: string;
  fullName?: string;
  sessionsCount: number;
  syncsCount: number;
  pluginUseCount: number;
  pluginVersions: string[];
  pluginVersionDetails?: Array<{
    pluginVersion: string;
    revitVersions: string[];
  }>;
  lastActiveAt?: string;
  firstActiveAt?: string;
};

export type ActiveUserItem = {
  _id: string;
  autodeskUserName: string;
  fullName?: string;
  machine: string;
  revitVersion: string;
  openDocs: Array<{
    sessionId: string;
    modelName: string;
    sessionStartAt?: string | null;
    syncsCount?: number;
  }>;
  activeDocId?: string | null;
  activeDocName?: string | null;
  activeViewId?: string | null;
  activeViewName?: string | null;
  activeProjectName?: string | null;
  /** Project keys from each open doc (same rules as Active Projects), not only the UI-active project */
  projectKeysFromOpenDocs?: string[];
  dateTime: string;
};

async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
  options?: {
    timeoutMs?: number;
  },
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs;
  const timeoutId =
    timeoutMs === undefined
      ? undefined
      : window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      credentials: "include",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out: ${path}`);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const error = (await res.json()) as { error?: string };
    throw new Error(error.error || `API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

// Auth Types
export type User = {
  userId: string;
  email: string;
  fullName?: string;
  profileIcon?: string;
};

// Auth Functions
export async function login(
  email: string,
  password: string,
): Promise<{ user: User }> {
  return apiPost<{ user: User }>("/api/auth/login", { email, password });
}

export async function logout(): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>("/api/auth/logout", {});
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>(
    "/api/auth/change-password",
    { currentPassword, newPassword, confirmPassword },
  );
}

export async function updateProfileIcon(
  profileIcon: string,
): Promise<{ user: User }> {
  return apiPut<{ user: User }>("/api/auth/profile-icon", { profileIcon });
}

async function apiPut<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const error = (await res.json()) as { error?: string };
    throw new Error(error.error || `API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function getMe(): Promise<User> {
  return apiFetch<User>("/api/auth/me", undefined, { timeoutMs: 6000 });
}

export async function fetchSessionsCount(
  from: string,
  to: string,
): Promise<number> {
  const data = await apiFetch<{ sessionCount: number }>("/api/sessions/count", {
    from,
    to,
  });
  return data.sessionCount;
}

export async function fetchSyncsCount(
  from: string,
  to: string,
): Promise<number> {
  const data = await apiFetch<{ syncsCount: number }>("/api/syncs/count", {
    from,
    to,
  });
  return data.syncsCount;
}

export async function fetchActiveUsersCount(): Promise<number> {
  const data = await apiFetch<{ activeUsersCount: number }>(
    "/api/active/count",
  );
  return data.activeUsersCount;
}

export async function fetchActiveUsers(): Promise<ActiveUserItem[]> {
  const data = await apiFetch<{ activeUsers: ActiveUserItem[] }>(
    "/api/active/users",
  );
  return data.activeUsers;
}

export type ActiveProjectSummaryItem = {
  projectName: string;
  activeUsersCount: number;
  activeModelsCount: number;
  /** Revit file names (or open-doc titles) counted toward activeModelsCount */
  activeModelNames: string[];
};

export async function fetchActiveProjects(): Promise<ActiveProjectSummaryItem[]> {
  const data = await apiFetch<{ projects: ActiveProjectSummaryItem[] }>(
    "/api/active/projects",
  );
  return (data.projects ?? []).map((p) => ({
    ...p,
    activeModelNames: p.activeModelNames ?? [],
  }));
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
  syncsCount: number;
};

export async function fetchActiveProjectUsers(projectName: string): Promise<{
  projectName: string;
  users: ActiveProjectUserRow[];
}> {
  const q = encodeURIComponent(projectName);
  return apiFetch<{ projectName: string; users: ActiveProjectUserRow[] }>(
    `/api/active/project-users?projectName=${q}`,
  );
}

export async function fetchPluginUseCount(): Promise<number> {
  const data = await apiFetch<{ pluginUseCount: number }>("/api/plugins/count");
  return data.pluginUseCount;
}

export async function fetchOverviewDailyCounts(
  from: string,
  to: string,
): Promise<OverviewDailyPoint[]> {
  const data = await apiFetch<{
    from: string;
    to: string;
    points: OverviewDailyPoint[];
  }>("/api/overview/daily-counts", {
    from,
    to,
  });
  return data.points;
}

export async function fetchOverviewDateBounds(): Promise<{
  from: string;
  to: string;
}> {
  return apiFetch<{ from: string; to: string }>("/api/overview/date-bounds");
}

export type SessionFilterOptions = {
  projects: string[];
  models: Array<{ modelId: string; label: string; count: number }>;
  users: Array<{
    autodeskUserName: string;
    fullName: string;
    count: number;
  }>;
};

export async function fetchSessionFilterOptions(params: {
  from?: string;
  to?: string;
  /** Cascading: narrows models + users */
  cloudProjectName?: string;
  /** Cascading: narrows users (after project when set) */
  modelId?: string;
}): Promise<SessionFilterOptions> {
  const query: Record<string, string> = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.cloudProjectName) {
    query.cloudProjectName = params.cloudProjectName;
  }
  if (params.modelId) {
    query.modelId = params.modelId;
  }
  return apiFetch<SessionFilterOptions>(
    "/api/sessions/filter-options",
    query,
  );
}

export async function fetchSessionsList(params: {
  from?: string;
  to?: string;
  page: number;
  limit: number;
  autodeskUserName?: string;
  modelId?: string;
  deviceName?: string;
  cloudProjectName?: string;
  /** Only sessions with crash flag set */
  crashOnly?: boolean;
  /** Only sessions still open (no closing time) */
  liveOnly?: boolean;
}): Promise<PaginatedListResponse<SessionListItem>> {
  const query: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.autodeskUserName) {
    query.autodeskUserName = params.autodeskUserName;
  }
  if (params.modelId) {
    query.modelId = params.modelId;
  }
  if (params.deviceName) {
    query.deviceName = params.deviceName;
  }
  if (params.cloudProjectName) {
    query.cloudProjectName = params.cloudProjectName;
  }
  if (params.crashOnly) {
    query.crashOnly = "true";
  }
  if (params.liveOnly) {
    query.liveOnly = "true";
  }
  return apiFetch<PaginatedListResponse<SessionListItem>>(
    "/api/sessions",
    query,
  );
}

export async function fetchSessionById(id: string): Promise<SessionListItem> {
  return apiFetch<SessionListItem>(`/api/sessions/${id}`);
}

export async function fetchSyncsList(params: {
  from?: string;
  to?: string;
  page: number;
  limit: number;
  autodeskUserName?: string;
}): Promise<PaginatedListResponse<SyncListItem>> {
  const query: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.autodeskUserName) {
    query.autodeskUserName = params.autodeskUserName;
  }
  return apiFetch<PaginatedListResponse<SyncListItem>>("/api/syncs", query);
}

export async function fetchSyncById(id: string): Promise<SyncListItem> {
  return apiFetch<SyncListItem>(`/api/syncs/${id}`);
}

export async function fetchPluginUseList(params: {
  page: number;
  limit: number;
  pluginName?: string;
}): Promise<PaginatedListResponse<PluginUseItem>> {
  const query: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (params.pluginName) {
    query.pluginName = params.pluginName;
  }
  return apiFetch<PaginatedListResponse<PluginUseItem>>("/api/plugins", query);
}

export async function fetchPluginNames(): Promise<string[]> {
  const data = await apiFetch<{ items: string[] }>("/api/plugins/names");
  return data.items;
}

export async function fetchUsersSummary(): Promise<{
  items: UserSummaryItem[];
  total: number;
}> {
  return apiFetch<{ items: UserSummaryItem[]; total: number }>(
    "/api/users/summary",
  );
}

export type ModelSummaryItem = {
  modelId: string;
  fileName: string;
  projectName: string;
  lastFileSize: number | null;
  lastAccessedAt: string;
  lastAccessedBy: string;
  lastAccessedByFullName?: string;
  revitVersion: string;
  usersCount: number;
  sessionCount: number;
};

export type ModelSizeHistoryPoint = {
  date: string;
  maxFileSize: number;
};

export type ModelSummaryHistoryPoint = {
  date: string;
  maxFileSize: number;
  maxOpeningDuration: number;
  maxSyncDuration: number;
  maxWarningCount: number;
};

export async function fetchModelsList(params?: {
  from?: string;
  to?: string;
}): Promise<{ items: ModelSummaryItem[]; total: number }> {
  const query: Record<string, string> = {};
  if (params?.from) query.from = params.from;
  if (params?.to) query.to = params.to;
  return apiFetch<{ items: ModelSummaryItem[]; total: number }>(
    "/api/models",
    query,
  );
}

export async function fetchModelSizeHistory(params: {
  modelId: string;
  from?: string;
  to?: string;
}): Promise<ModelSizeHistoryPoint[]> {
  const query: Record<string, string> = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  const data = await apiFetch<{
    modelId: string;
    points: ModelSizeHistoryPoint[];
  }>(`/api/models/${encodeURIComponent(params.modelId)}/size-history`, query);
  return data.points;
}

export type ModelWarningSummaryItem = {
  modelId: string;
  fileName: string;
  projectName: string;
  lastWarningCount: number;
  sessionCount: number;
};

export type ModelWarningHistoryPoint = {
  date: string;
  warningCount: number;
};

export async function fetchModelWarningsOverview(params?: {
  from?: string;
  to?: string;
}): Promise<{
  items: ModelWarningSummaryItem[];
  historiesByModelId: Record<string, ModelWarningHistoryPoint[]>;
}> {
  const query: Record<string, string> = {};
  if (params?.from) query.from = params.from;
  if (params?.to) query.to = params.to;
  return apiFetch<{
    items: ModelWarningSummaryItem[];
    historiesByModelId: Record<string, ModelWarningHistoryPoint[]>;
  }>("/api/models/model-warnings", query);
}

export async function fetchModelWarningsHistory(params: {
  modelId: string;
  from?: string;
  to?: string;
}): Promise<ModelWarningHistoryPoint[]> {
  const query: Record<string, string> = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  const data = await apiFetch<{
    modelId: string;
    points: ModelWarningHistoryPoint[];
  }>(
    `/api/models/${encodeURIComponent(params.modelId)}/warning-history`,
    query,
  );
  return data.points;
}

export async function fetchModelSummaryHistory(params: {
  modelId: string;
  from?: string;
  to?: string;
}): Promise<ModelSummaryHistoryPoint[]> {
  const query: Record<string, string> = {};
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  const data = await apiFetch<{
    modelId: string;
    points: ModelSummaryHistoryPoint[];
  }>(
    `/api/models/${encodeURIComponent(params.modelId)}/summary-history`,
    query,
  );
  return data.points;
}

export type CloudProjectListItem = {
  id: string;
  hubId: string;
  hubName: string;
  name: string;
  status: string;
  /** ISO-like timestamp from APS when present; may be empty. */
  dateAdded: string;
  sourceType: "bim" | "acc_forma";
  products: string[];
};

export type CloudProjectDetails = {
  project: {
    id: string;
    hubId: string;
    name: string;
    status: string;
    sourceType: "bim" | "acc_forma";
    products: string[];
    /** ACC Admin account projects list — `imageUrl` / `thumbnailImageUrl`. */
    imageUrl: string | null;
  };
  models: Array<{
    id: string;
    name: string;
    fileType: string;
    folderName: string;
    lastModifiedAt: string;
    lastModifiedBy: string;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    company: string;
    accessLevel: string;
    status: string;
  }>;
  companies: Array<{
    id: string;
    name: string;
    trade: string;
    status: string;
  }>;
  warnings: string[];
};

// ── Autodesk 3-legged OAuth + AEC Data Model GraphQL ──────────────────────────

export async function fetchAutodeskAuthUrl(): Promise<string> {
  const data = await apiFetch<{ url: string }>("/api/autodesk/auth-url");
  return data.url;
}

export async function fetchAutodeskStatus(): Promise<{ connected: boolean }> {
  return apiFetch<{ connected: boolean }>("/api/autodesk/status");
}

export async function autodeskGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data: T; errors?: Array<{ message: string }> }> {
  return apiPost<{ data: T; errors?: Array<{ message: string }> }>(
    "/api/autodesk/graphql",
    variables ? { query, variables } : { query },
  );
}

export async function disconnectAutodesk(): Promise<void> {
  await fetch(`${BASE_URL}/api/autodesk/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function fetchCloudProjects(): Promise<{
  bim: CloudProjectListItem[];
  accForma: CloudProjectListItem[];
  total: number;
}> {
  return apiFetch<{
    bim: CloudProjectListItem[];
    accForma: CloudProjectListItem[];
    total: number;
  }>("/api/cloud/projects");
}

export async function fetchCloudProjectDetails(
  hubId: string,
  projectId: string,
): Promise<CloudProjectDetails> {
  return apiFetch<CloudProjectDetails>(
    `/api/cloud/projects/${encodeURIComponent(hubId)}/${encodeURIComponent(projectId)}/details`,
  );
}

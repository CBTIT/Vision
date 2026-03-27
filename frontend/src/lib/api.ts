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
  date: string;
  projectId?: string;
  fileName?: string;
  modelId?: string;
  autodeskUserName?: string;
  fullName?: string;
  duration?: number;
  [key: string]: unknown;
};

export type PluginUseItem = {
  _id: string;
  autodeskUserName?: string;
  fullName?: string;
  email?: string;
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
};

export type ActiveUserItem = {
  _id: string;
  user: string;
  fullName?: string;
  machine: string;
  revitVersion: string;
  openDocs: Array<{
    sessionId: string;
    modelName: string;
  }>;
  activeDocId?: string | null;
  activeDocName?: string | null;
  activeViewId?: string | null;
  activeViewName?: string | null;
  activeProjectName?: string | null;
  ts: string;
};

async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    credentials: "include",
  });
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
  return apiFetch<User>("/api/auth/me");
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

export async function fetchSessionsList(params: {
  from?: string;
  to?: string;
  page: number;
  limit: number;
  autodeskUserName?: string;
  modelId?: string;
  deviceName?: string;
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

export async function fetchPluginUseList(params: {
  page: number;
  limit: number;
}): Promise<PaginatedListResponse<PluginUseItem>> {
  return apiFetch<PaginatedListResponse<PluginUseItem>>("/api/plugins", {
    page: String(params.page),
    limit: String(params.limit),
  });
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
  usersCount: number;
  sessionCount: number;
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

export type CloudProjectListItem = {
  id: string;
  hubId: string;
  hubName: string;
  name: string;
  status: string;
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
    role: string;
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

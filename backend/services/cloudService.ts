const APS_BASE_URL = "https://developer.api.autodesk.com";

type ApiListResponse<T> = {
  data?: T[];
  links?: {
    next?: {
      href?: string;
    };
  };
};

type HubApi = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    extension?: {
      type?: string;
      data?: Record<string, unknown>;
    };
  };
};

type ProjectApi = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    status?: string;
    extension?: {
      type?: string;
      data?: Record<string, unknown>;
    };
  };
};

type TopFolderApi = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    displayName?: string;
  };
};

type FolderContentsApi = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    displayName?: string;
    extension?: {
      type?: string;
      data?: Record<string, unknown>;
    };
    createTime?: string;
    lastModifiedTime?: string;
    createUserName?: string;
    lastModifiedUserName?: string;
  };
};

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

function getCredentials() {
  const clientId = process.env.ACC_CLIENT_ID?.trim();
  const clientSecret = process.env.ACC_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "ACC_CLIENT_ID and ACC_CLIENT_SECRET must be set in backend .env",
    );
  }

  return { clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
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
    throw new Error(
      `Autodesk token request failed: ${response.status} ${text}`,
    );
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Autodesk token response did not include access_token");
  }

  return payload.access_token;
}

async function apsGet<T>(token: string, pathOrUrl: string): Promise<T> {
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

  return response.json() as Promise<T>;
}

async function apsGetOptional<T>(
  token: string,
  pathOrUrl: string,
): Promise<T | null> {
  try {
    return await apsGet<T>(token, pathOrUrl);
  } catch {
    return null;
  }
}

function normalizeProducts(project: ProjectApi): string[] {
  const extensionData = project.attributes?.extension?.data;
  if (!extensionData || typeof extensionData !== "object") return [];

  const values = Object.values(extensionData);
  const products = values.find((value) => Array.isArray(value));
  if (!Array.isArray(products)) return [];

  return products
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function classifyProject(project: ProjectApi): "bim" | "acc_forma" {
  const extensionType =
    project.attributes?.extension?.type?.toLowerCase().trim() || "";
  const extensionData = project.attributes?.extension?.data;
  const projectTypeRaw =
    typeof extensionData?.projectType === "string"
      ? extensionData.projectType
      : "";
  const projectType = projectTypeRaw.toLowerCase().trim();
  const products = normalizeProducts(project).map((product) =>
    product.toLowerCase(),
  );

  const looksLikeAccOrForma =
    extensionType.includes("acc") ||
    projectType.includes("acc") ||
    projectType.includes("forma") ||
    products.some(
      (product) => product.includes("acc") || product.includes("forma"),
    );

  return looksLikeAccOrForma ? "acc_forma" : "bim";
}

async function listAllProjectsForHub(
  token: string,
  hubId: string,
): Promise<ProjectApi[]> {
  const projects: ProjectApi[] = [];
  let nextPath = `/project/v1/hubs/${encodeURIComponent(hubId)}/projects?page[limit]=200`;

  while (nextPath) {
    const page = await apsGet<ApiListResponse<ProjectApi>>(token, nextPath);
    if (Array.isArray(page.data)) {
      projects.push(...page.data);
    }

    const nextHref = page.links?.next?.href?.trim();
    nextPath = nextHref || "";
  }

  return projects;
}

export const getCloudProjectsByCategory = async (): Promise<{
  bim: CloudProjectListItem[];
  accForma: CloudProjectListItem[];
  total: number;
}> => {
  const token = await getAccessToken();
  const hubsResponse = await apsGet<ApiListResponse<HubApi>>(
    token,
    "/project/v1/hubs",
  );
  const hubs = Array.isArray(hubsResponse.data) ? hubsResponse.data : [];

  const projectsByHub = await Promise.all(
    hubs.map(async (hub) => {
      const projects = await listAllProjectsForHub(token, hub.id);
      return { hub, projects };
    }),
  );

  const bim: CloudProjectListItem[] = [];
  const accForma: CloudProjectListItem[] = [];

  for (const group of projectsByHub) {
    const hubName = group.hub.attributes?.name?.trim() || group.hub.id;
    for (const project of group.projects) {
      const sourceType = classifyProject(project);
      const row: CloudProjectListItem = {
        id: project.id,
        hubId: group.hub.id,
        hubName,
        name: project.attributes?.name?.trim() || project.id,
        status: project.attributes?.status?.trim() || "unknown",
        sourceType,
        products: normalizeProducts(project),
      };

      if (sourceType === "acc_forma") {
        accForma.push(row);
      } else {
        bim.push(row);
      }
    }
  }

  const byName = (left: CloudProjectListItem, right: CloudProjectListItem) =>
    left.name.localeCompare(right.name, undefined, {
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

async function listProjectModels(
  token: string,
  projectId: string,
  topFolders: TopFolderApi[],
): Promise<CloudProjectDetails["models"]> {
  const models: CloudProjectDetails["models"] = [];

  for (const folder of topFolders) {
    const folderName =
      folder.attributes?.displayName?.trim() ||
      folder.attributes?.name?.trim() ||
      folder.id;
    const content = await apsGetOptional<ApiListResponse<FolderContentsApi>>(
      token,
      `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folder.id)}/contents?page[limit]=200`,
    );

    if (!content?.data) continue;

    for (const entry of content.data) {
      const extensionType =
        entry.attributes?.extension?.type?.toLowerCase().trim() || "";
      const fileTypeRaw =
        typeof entry.attributes?.extension?.data?.fileType === "string"
          ? entry.attributes.extension.data.fileType
          : "";
      const fileType = fileTypeRaw || extensionType || "unknown";

      // In folder contents, "items" are model/files. "folders" are containers.
      if (!entry.type.toLowerCase().includes("item")) continue;

      models.push({
        id: entry.id,
        name:
          entry.attributes?.displayName?.trim() ||
          entry.attributes?.name?.trim() ||
          entry.id,
        fileType,
        folderName,
        lastModifiedAt:
          entry.attributes?.lastModifiedTime?.trim() ||
          entry.attributes?.createTime?.trim() ||
          "",
        lastModifiedBy:
          entry.attributes?.lastModifiedUserName?.trim() ||
          entry.attributes?.createUserName?.trim() ||
          "",
      });
    }
  }

  models.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return models;
}

function mapUsers(payload: unknown): CloudProjectDetails["users"] {
  if (!payload || typeof payload !== "object") return [];
  const rows =
    (payload as { results?: unknown[]; data?: unknown[] }).results ||
    (payload as { results?: unknown[]; data?: unknown[] }).data ||
    [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const typed = row as {
      id?: string;
      userId?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: string;
      companyRole?: string;
      status?: string;
    };

    const composedName = [typed.firstName, typed.lastName]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .trim();

    return {
      id: typed.id || typed.userId || `user-${index + 1}`,
      name: typed.name || composedName || "-",
      email: typed.email || "-",
      role: typed.role || typed.companyRole || "-",
      status: typed.status || "unknown",
    };
  });
}

function mapCompanies(payload: unknown): CloudProjectDetails["companies"] {
  if (!payload || typeof payload !== "object") return [];
  const rows =
    (payload as { results?: unknown[]; data?: unknown[] }).results ||
    (payload as { results?: unknown[]; data?: unknown[] }).data ||
    [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const typed = row as {
      id?: string;
      companyId?: string;
      name?: string;
      trade?: string;
      status?: string;
      businessUnit?: string;
    };

    return {
      id: typed.id || typed.companyId || `company-${index + 1}`,
      name: typed.name || "-",
      trade: typed.trade || typed.businessUnit || "-",
      status: typed.status || "unknown",
    };
  });
}

export const getCloudProjectDetails = async (
  hubId: string,
  projectId: string,
): Promise<CloudProjectDetails> => {
  const token = await getAccessToken();
  const warnings: string[] = [];

  const projectResponse = await apsGet<{ data?: ProjectApi }>(
    token,
    `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}`,
  );

  const projectData = projectResponse.data;
  if (!projectData) {
    throw new Error("Project was not found on Autodesk API");
  }

  const topFoldersResponse = await apsGetOptional<
    ApiListResponse<TopFolderApi>
  >(
    token,
    `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`,
  );
  const topFolders = Array.isArray(topFoldersResponse?.data)
    ? topFoldersResponse.data
    : [];

  const models = await listProjectModels(token, projectId, topFolders);

  const usersRaw = await apsGetOptional<unknown>(
    token,
    `/construction/admin/v1/projects/${encodeURIComponent(projectId)}/users`,
  );
  if (!usersRaw) {
    warnings.push(
      "Users endpoint was unavailable for this project/token. Returning empty list.",
    );
  }

  const companiesRaw = await apsGetOptional<unknown>(
    token,
    `/construction/admin/v1/projects/${encodeURIComponent(projectId)}/companies`,
  );
  if (!companiesRaw) {
    warnings.push(
      "Companies endpoint was unavailable for this project/token. Returning empty list.",
    );
  }

  const users = mapUsers(usersRaw);
  const companies = mapCompanies(companiesRaw);

  return {
    project: {
      id: projectData.id,
      hubId,
      name: projectData.attributes?.name?.trim() || projectData.id,
      status: projectData.attributes?.status?.trim() || "unknown",
      sourceType: classifyProject(projectData),
      products: normalizeProducts(projectData),
    },
    models,
    users,
    companies,
    warnings,
  };
};

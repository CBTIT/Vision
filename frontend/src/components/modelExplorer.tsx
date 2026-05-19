import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  autodeskGraphQL,
  disconnectAutodesk,
  fetchAutodeskAuthUrl,
  fetchAutodeskStatus,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileBox,
  Box,
  Settings,
  ArrowLeft,
} from "lucide-react";

type Hub = { id: string; name: string };
type Project = { id: string; name: string };
type ElementGroup = { id: string; name: string };
type Element = { id: string; name: string; category?: string };
type Property = { name: string; value: string; unit?: string };

type HubsResp = { hubs: { results: Hub[] } };
type ProjectsResp = { projects: { results: Project[]; pagination?: { cursor: string | null } } };
type ElementGroupsResp = { elementGroupsByProject: { results: ElementGroup[] } };
type ElementsResp = {
  elementsByElementGroup: {
    results: Array<{
      id: string;
      name: string;
      properties?: { results: Array<{ name: string; value: string }> };
    }>;
  };
};
type PropertiesResp = {
  elementAtTip: {
    id: string;
    name: string;
    properties?: {
      results: Array<{
        name: string;
        value: string;
        definition?: { units?: { name?: string } };
      }>;
    };
  };
};

type NavLevel = "hubs" | "projects" | "models" | "elements";

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        connected
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1 rounded-full",
          connected ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

export default function ModelExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusLoading, setStatusLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [navLevel, setNavLevel] = useState<NavLevel>("hubs");

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsError, setHubsError] = useState<string | null>(null);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [elementGroups, setElementGroups] = useState<ElementGroup[]>([]);
  const [elementGroupsLoading, setElementGroupsLoading] = useState(false);
  const [elementGroupsError, setElementGroupsError] = useState<string | null>(null);
  const [selectedElementGroup, setSelectedElementGroup] = useState<ElementGroup | null>(null);

  const [elements, setElements] = useState<Element[]>([]);
  const [elementsLoading, setElementsLoading] = useState(false);
  const [elementsError, setElementsError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const { connected: isConnected } = await fetchAutodeskStatus();
      setConnected(isConnected);
    } catch {
      setConnected(false);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setConnectError(
        oauthError === "auth_cancelled" ? "Authorization was cancelled." : "Authorization failed.",
      );
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("connected") === "true") {
      setSearchParams({}, { replace: true });
    }
    checkStatus();
  }, []);

  useEffect(() => {
    if (!connected) {
      setNavLevel("hubs");
      setHubs([]); setSelectedHub(null);
      setProjects([]); setSelectedProject(null);
      setElementGroups([]); setSelectedElementGroup(null);
      setElements([]); setSelectedElement(null);
      setProperties([]);
      return;
    }
    setHubsLoading(true); setHubsError(null);
    autodeskGraphQL<HubsResp>(`query { hubs { results { id name } } }`)
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        setHubs(res.data?.hubs?.results ?? []);
      })
      .catch((err) => setHubsError(String(err?.message ?? err)))
      .finally(() => setHubsLoading(false));
  }, [connected]);

  const loadProjects = useCallback(async () => {
    if (!selectedHub) return;
    setProjectsLoading(true); setProjectsError(null);
    try {
      let allProjects: Project[] = [];
      let cursor: string | null = null;
      
      do {
        const query: string = cursor
          ? `query ($hubId: ID!, $cursor: String) {
              projects(hubId: $hubId, pagination: { cursor: $cursor, limit: 99 }) {
                results { id name }
                pagination { cursor }
              }
            }`
          : `query ($hubId: ID!) {
              projects(hubId: $hubId) {
                results { id name }
                pagination { cursor }
              }
            }`;
        
        const res = await autodeskGraphQL<ProjectsResp>(query, { hubId: selectedHub.id });
        if (res.errors?.length) throw new Error(res.errors[0].message);
        
        const page = res.data?.projects;
        allProjects = [...allProjects, ...(page?.results ?? [])];
        cursor = page?.pagination?.cursor ?? null;
      } while (cursor);
      
      setProjects(allProjects);
    } catch (err) {
      setProjectsError(String(err));
    } finally {
      setProjectsLoading(false);
    }
  }, [selectedHub]);

  useEffect(() => {
    if (!selectedHub) {
      setProjects([]); setSelectedProject(null);
      setElementGroups([]); setSelectedElementGroup(null);
      setElements([]); setSelectedElement(null);
      setProperties([]);
      return;
    }
    loadProjects();
  }, [selectedHub, loadProjects]);

  useEffect(() => {
    if (!selectedProject) {
      setElementGroups([]); setSelectedElementGroup(null);
      setElements([]); setSelectedElement(null);
      setProperties([]);
      return;
    }
    setElementGroupsLoading(true); setElementGroupsError(null);
    autodeskGraphQL<ElementGroupsResp>(
      `query ($projectId: ID!) {
        elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
          results { id name }
          pagination { cursor }
        }
      }`,
      { projectId: selectedProject.id },
    )
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        setElementGroups(res.data?.elementGroupsByProject?.results ?? []);
      })
      .catch((err) => setElementGroupsError(String(err?.message ?? err)))
      .finally(() => setElementGroupsLoading(false));
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedElementGroup) {
      setElements([]); setSelectedElement(null);
      setProperties([]);
      return;
    }
    setElementsLoading(true); setElementsError(null);
    autodeskGraphQL<ElementsResp>(
      `query ($elementGroupId: ID!) {
        elementsByElementGroup(elementGroupId: $elementGroupId, pagination: { limit: 100 }) {
          results { id name properties { results { name value } } }
        }
      }`,
      { elementGroupId: selectedElementGroup.id },
    )
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        const elems = (res.data?.elementsByElementGroup?.results ?? []).map((e) => {
          const cat = e.properties?.results.find((p) => p.name === "category");
          return { id: e.id, name: e.name, category: cat?.value };
        });
        setElements(elems);
      })
      .catch((err) => setElementsError(String(err?.message ?? err)))
      .finally(() => setElementsLoading(false));
  }, [selectedElementGroup]);

  useEffect(() => {
    if (!selectedElement) { setProperties([]); return; }
    setPropertiesLoading(true); setPropertiesError(null);
    autodeskGraphQL<PropertiesResp>(
      `query ($elementId: ID!) {
        elementAtTip(elementId: $elementId) {
          id name
          properties { results { name value definition { units { name } } } }
        }
      }`,
      { elementId: selectedElement.id },
    )
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        setProperties(
          res.data?.elementAtTip?.properties?.results.map((p) => ({
            name: p.name, value: p.value, unit: p.definition?.units?.name,
          })) ?? [],
        );
      })
      .catch((err) => setPropertiesError(String(err?.message ?? err)))
      .finally(() => setPropertiesLoading(false));
  }, [selectedElement]);

  const handleConnect = async () => {
    setConnectError(null);
    try { window.location.href = await fetchAutodeskAuthUrl(); }
    catch { setConnectError("Failed to initiate Autodesk login."); }
  };

  const handleDisconnect = async () => { await disconnectAutodesk(); setConnected(false); };

  const goBack = () => {
    switch (navLevel) {
      case "elements":
        setNavLevel("models"); setSelectedElement(null); setProperties([]); break;
      case "models":
        setNavLevel("projects"); setSelectedElementGroup(null); setElements([]); break;
      case "projects":
        setNavLevel("hubs"); setSelectedProject(null); setElementGroups([]); break;
    }
  };

  const goToLevel = (level: NavLevel) => {
    if (level === "hubs") {
      setNavLevel("hubs"); setSelectedHub(null); setSelectedProject(null);
      setElementGroups([]); setSelectedElementGroup(null); setElements([]); setSelectedElement(null); setProperties([]);
    } else if (level === "projects") {
      setNavLevel("projects"); setSelectedProject(null);
      setElementGroups([]); setSelectedElementGroup(null); setElements([]); setSelectedElement(null); setProperties([]);
    } else if (level === "models") {
      setNavLevel("models"); setSelectedElementGroup(null);
      setElements([]); setSelectedElement(null); setProperties([]);
    } else if (level === "elements") {
      setNavLevel("elements"); setSelectedElement(null); setProperties([]);
    }
  };

  const breadcrumbs: Array<{ label: string; level: NavLevel; id: string | null }> = [
    { label: "Hubs", level: "hubs", id: null },
    ...(selectedHub ? [{ label: selectedHub.name, level: "projects" as NavLevel, id: selectedHub.id }] : []),
    ...(selectedProject ? [{ label: selectedProject.name, level: "models" as NavLevel, id: selectedProject.id }] : []),
    ...(selectedElementGroup ? [{ label: selectedElementGroup.name, level: "elements" as NavLevel, id: selectedElementGroup.id }] : []),
  ];

  const currentItems = navLevel === "hubs" ? hubs
    : navLevel === "projects" ? projects
    : navLevel === "models" ? elementGroups
    : elements;
  const currentLoading = navLevel === "hubs" ? hubsLoading
    : navLevel === "projects" ? projectsLoading
    : navLevel === "models" ? elementGroupsLoading
    : elementsLoading;
  const currentError = navLevel === "hubs" ? hubsError
    : navLevel === "projects" ? projectsError
    : navLevel === "models" ? elementGroupsError
    : elementsError;
  const currentEmpty = currentItems.length === 0;

  const handleItemClick = (item: Hub | Project | ElementGroup | Element) => {
    if (navLevel === "hubs") {
      setSelectedHub(item as Hub); setNavLevel("projects");
    } else if (navLevel === "projects") {
      setSelectedProject(item as Project); setNavLevel("models");
    } else if (navLevel === "models") {
      setSelectedElementGroup(item as ElementGroup); setNavLevel("elements");
    } else if (navLevel === "elements") {
      setSelectedElement(item as Element);
    }
  };

  const isSelected = (item: Hub | Project | ElementGroup | Element) => {
    if (navLevel === "hubs") return selectedHub?.id === (item as Hub).id;
    if (navLevel === "projects") return selectedProject?.id === (item as Project).id;
    if (navLevel === "models") return selectedElementGroup?.id === (item as ElementGroup).id;
    return selectedElement?.id === (item as Element).id;
  };

  const getItemCategory = (item: Hub | Project | ElementGroup | Element) => {
    if (navLevel === "elements") return (item as Element).category;
    return undefined;
  };

  const getIcon = () => {
    if (navLevel === "hubs") return <Folder className="size-3" />;
    if (navLevel === "projects") return <FolderOpen className="size-3" />;
    if (navLevel === "models") return <FileBox className="size-3" />;
    return <Box className="size-3" />;
  };

  const getTitle = () => {
    if (navLevel === "hubs") return "Hubs";
    if (navLevel === "projects") return selectedHub?.name ?? "Projects";
    if (navLevel === "models") return selectedProject?.name ?? "Models";
    return selectedElementGroup?.name ?? "Elements";
  };

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col gap-2 overflow-hidden p-3">
      <Card className="shrink-0 border-border/80 bg-background/95">
        <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Model Explorer</CardTitle>
            {!statusLoading && <StatusBadge connected={connected} />}
          </div>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : connected ? (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleDisconnect}>Disconnect</Button>
            ) : (
              <Button size="sm" className="h-7 px-2 text-[11px]" onClick={handleConnect}>Connect</Button>
            )}
          </div>
        </CardHeader>
        {connectError && <p className="px-4 pb-2 text-[10px] text-destructive">{connectError}</p>}
      </Card>

      {connected && (
        <>
          {breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto px-1 text-[11px]">
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.level} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                  <button
                    type="button"
                    onClick={() => goToLevel(crumb.level)}
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors hover:bg-muted",
                      crumb.level === navLevel ? "bg-muted font-medium" : "text-muted-foreground",
                    )}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex min-h-0 flex-1 gap-2">
            <Card className="flex w-64 shrink-0 flex-col border-border/80 bg-background/95">
              <CardHeader className="flex flex-row items-center gap-1.5 py-1.5 px-2">
                {navLevel !== "hubs" && (
                  <button type="button" onClick={goBack} className="p-0.5 hover:bg-muted rounded">
                    <ArrowLeft className="size-3" />
                  </button>
                )}
                {getIcon()}
                <CardTitle className="text-[11px] font-semibold leading-none truncate">
                  {getTitle()}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-0 text-[11px]">
                {currentLoading ? (
                  <div className="space-y-0.5 px-2 pb-1">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                  </div>
                ) : currentError ? (
                  <p className="px-2 pb-1 text-[10px] text-destructive">{currentError}</p>
                ) : currentEmpty ? (
                  <p className="px-2 pb-1 text-[10px] text-muted-foreground">
                    {navLevel === "hubs" ? "No hubs" : "Select above"}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/20">
                    {currentItems.map((item) => (
                      <li key={(item as any).id}>
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className={cn(
                            "flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/50",
                            isSelected(item) ? "bg-muted font-medium" : "text-foreground",
                          )}
                        >
                          <ChevronRight className="size-2.5 shrink-0" />
                          <span className="truncate">{(item as any).name}</span>
                          {getItemCategory(item) && (
                            <span className="ml-auto shrink-0 text-muted-foreground">{getItemCategory(item)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="flex min-w-0 flex-1 flex-col border-border/80 bg-background/95">
              <CardHeader className="flex flex-row items-center gap-1.5 py-1.5 px-3">
                <Settings className="size-3" />
                <CardTitle className="text-[11px] font-semibold leading-none">
                  {selectedElement?.name ?? "Properties"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto px-3 text-[11px]">
                {!selectedElement ? (
                  <p className="text-muted-foreground">Select an element</p>
                ) : propertiesLoading ? (
                  <div className="space-y-0.5">
                    {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                  </div>
                ) : propertiesError ? (
                  <p className="text-destructive">{propertiesError}</p>
                ) : properties.length === 0 ? (
                  <p className="text-muted-foreground">No properties</p>
                ) : (
                  <div className="divide-y divide-border/20">
                    {properties.map((prop, i) => (
                      <div key={i} className="flex gap-2 py-1">
                        <span className="shrink-0 font-medium text-muted-foreground">{prop.name}</span>
                        <span className="truncate">
                          {prop.value || "-"}
                          {prop.unit && <span className="ml-1 text-muted-foreground">({prop.unit})</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!connected && !statusLoading && (
        <Card className="flex flex-1 items-center justify-center border-border/80 bg-background/95">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">Connect your Autodesk account</p>
            <p className="mt-1 text-xs text-muted-foreground">Sign in to explore models via AEC Data Model API.</p>
            <Button className="mt-3" size="sm" onClick={handleConnect}>Connect</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

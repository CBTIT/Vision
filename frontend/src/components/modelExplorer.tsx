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

type Hub = { id: string; name: string };
type Project = { id: string; name: string };

type HubsResponse = {
  hubs: { results: Hub[] };
};

type ProjectsResponse = {
  projects: { results: Project[] };
};

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        connected
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
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

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsError, setHubsError] = useState<string | null>(null);

  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Check connection status on mount and after OAuth redirect
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
        oauthError === "auth_cancelled"
          ? "Authorization was cancelled."
          : "Authorization failed. Please try again.",
      );
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("connected") === "true") {
      setSearchParams({}, { replace: true });
    }
    checkStatus();
  }, []);

  // Load hubs when connected
  useEffect(() => {
    if (!connected) {
      setHubs([]);
      setSelectedHub(null);
      setProjects([]);
      return;
    }
    setHubsLoading(true);
    setHubsError(null);
    autodeskGraphQL<HubsResponse>(`query { hubs { results { id name } } }`)
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        setHubs(res.data?.hubs?.results ?? []);
      })
      .catch((err) => setHubsError(String(err?.message ?? err)))
      .finally(() => setHubsLoading(false));
  }, [connected]);

  // Load projects when a hub is selected
  useEffect(() => {
    if (!selectedHub) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    setProjectsError(null);
    autodeskGraphQL<ProjectsResponse>(
      `query GetProjects($hubId: ID!) { projects(hubId: $hubId) { results { id name } } }`,
      { hubId: selectedHub.id },
    )
      .then((res) => {
        if (res.errors?.length) throw new Error(res.errors[0].message);
        setProjects(res.data?.projects?.results ?? []);
      })
      .catch((err) => setProjectsError(String(err?.message ?? err)))
      .finally(() => setProjectsLoading(false));
  }, [selectedHub]);

  const handleConnect = async () => {
    setConnectError(null);
    try {
      const url = await fetchAutodeskAuthUrl();
      window.location.href = url;
    } catch {
      setConnectError("Failed to initiate Autodesk login. Please try again.");
    }
  };

  const handleDisconnect = async () => {
    await disconnectAutodesk();
    setConnected(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto px-1 py-1">
      {/* Header card */}
      <Card className="shrink-0 border-border/90 bg-background/95 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>Model Explorer</CardTitle>
              {!statusLoading && <StatusBadge connected={connected} />}
            </div>
            <div className="flex items-center gap-2">
              {statusLoading ? (
                <Skeleton className="h-9 w-32" />
              ) : connected ? (
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={handleConnect}>
                  Connect with Autodesk
                </Button>
              )}
            </div>
          </div>
          {connectError && (
            <p className="mt-1 text-xs text-destructive">{connectError}</p>
          )}
        </CardHeader>
      </Card>

      {connected && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Hubs */}
          <Card className="border-border/90 bg-background/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Hubs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {hubsLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : hubsError ? (
                <p className="px-4 pb-4 text-xs text-destructive">{hubsError}</p>
              ) : hubs.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-muted-foreground">No hubs found.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {hubs.map((hub) => (
                    <li key={hub.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHub(hub);
                          setProjects([]);
                        }}
                        className={cn(
                          "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                          selectedHub?.id === hub.id
                            ? "bg-muted font-medium"
                            : "text-foreground",
                        )}
                      >
                        {hub.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card className="border-border/90 bg-background/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedHub ? `Projects — ${selectedHub.name}` : "Projects"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!selectedHub ? (
                <p className="px-4 pb-4 text-xs text-muted-foreground">
                  Select a hub to view its projects.
                </p>
              ) : projectsLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : projectsError ? (
                <p className="px-4 pb-4 text-xs text-destructive">{projectsError}</p>
              ) : projects.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-muted-foreground">No projects found.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <div className="px-4 py-2.5 text-sm">{project.name}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Placeholder for future content */}
          <Card className="border-border/90 bg-background/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Select a project to explore its contents.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!connected && !statusLoading && (
        <Card className="flex flex-1 items-center justify-center border-border/90 bg-background/95 shadow-sm">
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium">Connect your Autodesk account</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in with Autodesk to explore models via the AEC Data Model API.
            </p>
            <Button className="mt-4" onClick={handleConnect}>
              Connect with Autodesk
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Suspense, lazy } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "./components/layout";
import { useAuth } from "./contexts/AuthContext";
import { Skeleton } from "./components/ui/skeleton";

const Overview = lazy(() => import("./components/overview"));
const AllUsers = lazy(() => import("./components/allUsers"));
const CloudData = lazy(() => import("./components/cloudData"));
const Plugins = lazy(() => import("./components/plugins"));
const AllModels = lazy(() => import("./components/alModels"));
const ModelSummary = lazy(() => import("./components/modelSummary"));
const ActiveUsers = lazy(() => import("./components/activeUsers"));
const ActiveProjects = lazy(() => import("./components/activeProjects"));
const SessionsSyncsPage = lazy(() => import("./components/sessions-syncs"));
const Warnings = lazy(() => import("./components/warnings"));
const ModelExplorer = lazy(() => import("./components/modelExplorer"));
const Login = lazy(() => import("./components/login"));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-64 w-64" />
    </div>
  );
}

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

function LoginRoute() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Overview />} />
          <Route path="users" element={<AllUsers />} />
          <Route path="active-users" element={<ActiveUsers />} />
          <Route path="active-projects" element={<ActiveProjects />} />
          <Route path="models" element={<AllModels />} />
          <Route path="model-summary" element={<ModelSummary />} />
          <Route path="plugins" element={<Plugins />} />
          <Route path="cloud-data" element={<CloudData />} />
          <Route
            path="sessions"
            element={<SessionsSyncsPage mode="sessions" />}
          />
          <Route path="syncs" element={<SessionsSyncsPage mode="syncs" />} />
          <Route path="warnings" element={<Warnings />} />
          <Route path="model-explorer" element={<ModelExplorer />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;

import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "./components/layout";
import Overview from "./components/overview";
import AllUsers from "./components/allUsers";
import CloudData from "./components/cloudData";
import Plugins from "./components/plugins";
import AllModels from "./components/alModels";
import ActiveUsers from "./components/activeUsers";
import SessionsSyncsPage from "./components/sessions-syncs";
import Login from "./components/login";
import { useAuth } from "./contexts/AuthContext";
import { Skeleton } from "./components/ui/skeleton";

function App() {
  const { isLoading, isAuthenticated } = useAuth();

  // If still loading auth check, show skeleton
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-64 w-64" />
      </div>
    );
  }

  // If not authenticated, navigate to login immediately
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="users" element={<AllUsers />} />
        <Route path="active-users" element={<ActiveUsers />} />
        <Route path="models" element={<AllModels />} />
        <Route path="plugins" element={<Plugins />} />
        <Route path="cloud-data" element={<CloudData />} />
        <Route
          path="sessions"
          element={<SessionsSyncsPage mode="sessions" />}
        />
        <Route path="syncs" element={<SessionsSyncsPage mode="syncs" />} />
      </Route>
    </Routes>
  );
}

export default App;

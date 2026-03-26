import { Route, Routes } from "react-router-dom";
import Layout from "./components/layout";
import Overview from "./components/overview";
import AllUsers from "./components/allUsers";
import CloudData from "./components/cloudData";
import Plugins from "./components/plugins";
import AllModels from "./components/alModels";
import ActiveUsers from "./components/activeUsers";
import SessionsSyncsPage from "./components/sessions-syncs";

function App() {
  return (
    <Routes>
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

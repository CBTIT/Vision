import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <main className="flex-1 p-4">
        <SidebarTrigger />
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

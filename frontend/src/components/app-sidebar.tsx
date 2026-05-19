import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
import { Separator } from "./ui/separator";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../hooks/use-theme";
import { Moon, Sun } from "lucide-react";

const data = {
  navMain: [
    {
      title: "Overview",
      url: "/",
    },
    {
      title: "All Users",
      url: "/users",
    },
    {
      title: "Active Users",
      url: "/active-users",
    },
    {
      title: "Active Projects",
      url: "/active-projects",
    },
    {
      title: "All Models",
      url: "/models",
    },
    {
      title: "Model Summary",
      url: "/model-summary",
    },
    {
      title: "Plugins",
      url: "/plugins",
    },
    {
      title: "Cloud Data",
      url: "/cloud-data",
    },
    {
      title: "Sessions",
      url: "/sessions",
    },
    {
      title: "Syncs",
      url: "/syncs",
    },
    {
      title: "Warnings",
      url: "/warnings",
    },
    {
      title: "Model Explorer",
      url: "/model-explorer",
    },
  ],
};

export function AppSidebar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Generate initials from name or email
  const getInitials = (name: string | undefined, email: string) => {
    if (name) {
      const parts = name.split(" ");
      return parts.map((p) => p[0].toUpperCase()).join("");
    }
    const parts = email.split("@")[0].split(".");
    return parts.map((p) => p[0].toUpperCase()).join("");
  };

  const userData = user
    ? {
        name: user.fullName || "User",
        email: user.email,
        avatar: "https://i.pravatar.cc/150?u=" + user.email,
        fallback: getInitials(user.fullName, user.email),
        profileIcon: user.profileIcon,
      }
    : {
        name: "User",
        email: "user@example.com",
        avatar: "",
        fallback: "U",
        profileIcon: "user",
      };

  return (
    <Sidebar variant="floating">
      <SidebarHeader className="gap-0 p-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-11.75 rounded-none px-4 group-data-[collapsible=icon]:h-11.75! group-data-[collapsible=icon]:rounded-none"
              asChild
            >
              <Link to="/">
                <div className="truncate font-bold text-2xl">CBT Vision</div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator className="ml-4 mr-4 w-auto" />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup />
        <SidebarGroupContent>
          <SidebarMenu>
            {data.navMain.map((item) => {
              const isActive =
                pathname === item.url ||
                (item.url !== "/" && pathname.startsWith(item.url + "/"));
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className="px-5"
                    isActive={isActive}
                    asChild
                  >
                    <Link to={item.url}>{item.title}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="px-5"
              onClick={toggleTheme}
              tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}

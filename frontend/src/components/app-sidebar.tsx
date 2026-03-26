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

const data = {
  user: {
    name: "Avinash Verma",
    email: "verma@cbtarchitects.com",
    avatar: "/avatars/shadcn.jpg",
    fallback: "AV",
  },
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
      title: "All Models",
      url: "/models",
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
  ],
};

export function AppSidebar() {
  const { pathname } = useLocation();
  return (
    <Sidebar variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="truncate font-bold text-2xl">CBT Vision</div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator />
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
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}

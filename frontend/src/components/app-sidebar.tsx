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
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
import { Separator } from "./ui/separator";

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
      url: "#",
    },
    {
      title: "All Users",
      url: "#",
    },
    {
      title: "Active Users",
      url: "#",
    },
    {
      title: "All Models",
      url: "#",
    },
    {
      title: "Plugins",
      url: "#",
    },
    {
      title: "ACC / BIM 360",
      url: "#",
    },
  ],
};

export function AppSidebar() {
  return (
    <Sidebar variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="truncate font-bold text-2xl">CBT Vision</div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup />
        <SidebarGroupContent>
          <SidebarMenu>
            {data.navMain.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton className="px-5" asChild>
                  <a href={item.url}>{item.title}</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
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

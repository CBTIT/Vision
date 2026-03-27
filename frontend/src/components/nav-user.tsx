import { ChevronsUpDown, LogOut, Lock, Edit } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { logout } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import ChangePassword from "./change-password";
import EditProfileIcon from "./edit-profile-icon";
import { getProfileIconComponent } from "../lib/profile-icons";

type NavUserProp = {
  user: {
    name: string;
    email: string;
    avatar: string;
    fallback: string;
    profileIcon?: string;
  };
};

export function NavUser({ user }: NavUserProp) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditIcon, setShowEditIcon] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleIconUpdate = (newIcon: string) => {
    setShowEditIcon(false);
    setUser({ ...user, profileIcon: newIcon } as any);
  };

  const profileIcon = user.profileIcon || "user";

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg bg-muted">
                  <AvatarFallback className="rounded-lg text-foreground">
                    {getProfileIconComponent(profileIcon, "h-4 w-4")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side="right"
              align="end"
              sideOffset={15}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg bg-muted">
                    <AvatarFallback className="rounded-lg text-foreground">
                      {getProfileIconComponent(profileIcon, "h-4 w-4")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowEditIcon(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
                <Lock className="mr-2 h-4 w-4" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {showChangePassword && (
        <ChangePassword
          onSuccess={() => {
            setShowChangePassword(false);
          }}
          onCancel={() => setShowChangePassword(false)}
        />
      )}

      {showEditIcon && (
        <EditProfileIcon
          currentIcon={profileIcon}
          onSuccess={handleIconUpdate}
          onCancel={() => setShowEditIcon(false)}
        />
      )}
    </>
  );
}

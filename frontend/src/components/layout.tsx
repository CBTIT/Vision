import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { Outlet } from "react-router-dom";
import { HeaderProvider, useHeaderRightContent } from "./header-context";
import { Separator } from "./ui/separator";
import { DateRangeProvider } from "./date-range-context";

function LayoutInner() {
  const headerRight = useHeaderRightContent();
  const currentYear = new Date().getFullYear();

  return (
    <>
      <AppSidebar />
      <div className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-5 self-center!" />
          </div>
          {headerRight && (
            <div className="flex items-center">{headerRight}</div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <footer className="shrink-0 border-t bg-background px-4 py-2 text-center text-xs text-muted-foreground">
          {`© ${currentYear} CBT Digital Practice. All rights reserved.`}
        </footer>
      </div>
    </>
  );
}

export default function Layout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DateRangeProvider>
        <HeaderProvider>
          <LayoutInner />
        </HeaderProvider>
      </DateRangeProvider>
    </SidebarProvider>
  );
}

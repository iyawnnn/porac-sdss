import { getAdminSessionFromApi } from "@/lib/api-client";
import { AdminHeader } from "@/components/layouts/AdminHeader";
import AdminSidebar from "@/components/layouts/AdminSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSessionFromApi();
  if (!session) return <>{children}</>;

  return (
    <TooltipProvider>
      <SidebarProvider className="[--app-header-height:3rem] [--app-wrapper-max-width:96rem]">
        <AdminSidebar session={session} />
        <SidebarInset className="bg-background">
          <AdminHeader session={session} />
          <main className="mx-auto flex w-full min-h-0 max-w-(--app-wrapper-max-width) min-w-0 flex-1 flex-col p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

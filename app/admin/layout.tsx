import { getAdminSessionFromApi } from "@/lib/api-client";
import AdminSidebar from "@/components/layouts/AdminSidebar";
import AdminShellScope from "@/components/layouts/AdminShellScope";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

// proxy.ts already gates every /admin/* route except /admin/login, so a
// missing session here only happens on that login page — render it bare,
// with no sidebar/office badge/sign-out to show yet, and crucially outside
// the data-shell="admin" wrapper below so the dark admin theme never leaks
// onto the login screen (DESIGN.md §0/§5).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSessionFromApi();
  if (!session) return <>{children}</>;

  return (
    <div data-shell="admin" className="min-h-screen bg-canvas">
      <AdminShellScope />
      <SidebarProvider>
        <AdminSidebar session={session} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-200 px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-medium text-ink-900">PORAC-SDSS</span>
          </header>
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

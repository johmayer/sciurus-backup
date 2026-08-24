import Link from "next/link";
import { LayoutDashboard, Server, Folder, Clock, Settings, FileText, Menu } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40 overflow-x-hidden">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background sm:flex">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/logo.png" width={24} height={24} alt="Sciurus" className="rounded-sm" />
            <span className="">Sciurus</span>
          </Link>
        </div>
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4 mt-4">
          <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/logs" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <FileText className="h-4 w-4" /> Logs
          </Link>
          <Link href="/remotes" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <Server className="h-4 w-4" /> Remotes
          </Link>
          <Link href="/sources" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <Folder className="h-4 w-4" /> Sources
          </Link>
          <Link href="/plans" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <Clock className="h-4 w-4" /> Backup Plans
          </Link>
          <div className="mt-8 border-t pt-4"></div>
          <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </nav>
      </aside>
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <Sheet>
            <SheetTrigger render={<Button size="icon" variant="outline" className="sm:hidden" />}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs p-6 pt-5">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex items-center gap-3 mb-8 mt-[-2px]">
                <img src="/logo.png" width={24} height={24} alt="Sciurus" className="rounded-sm" />
                <span className="font-semibold text-lg text-foreground">Sciurus</span>
              </div>
              <nav className="grid gap-6 text-lg font-medium">
                <Link href="/" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <LayoutDashboard className="h-5 w-5" /> Dashboard
                </Link>
                <Link href="/logs" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <FileText className="h-5 w-5" /> Logs
                </Link>
                <Link href="/remotes" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <Server className="h-5 w-5" /> Remotes
                </Link>
                <Link href="/sources" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <Folder className="h-5 w-5" /> Sources
                </Link>
                <Link href="/plans" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <Clock className="h-5 w-5" /> Backup Plans
                </Link>
                <div className="border-t my-2"></div>
                <Link href="/settings" className="flex items-center gap-4 text-muted-foreground hover:text-foreground">
                  <Settings className="h-5 w-5" /> Settings
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex w-full items-center justify-end">
            <LogoutButton />
          </div>
        </header>
        <main className="flex flex-col flex-1 w-full gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

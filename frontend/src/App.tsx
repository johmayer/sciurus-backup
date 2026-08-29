import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Database, HardDrive, LayoutDashboard, Settings, Activity, LogOut, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import './index.css';

// Import pages (stubbing imports, we assume they export default components)
import DashboardPage from './pages/(dashboard)/index';
import PlansPage from './pages/(dashboard)/plans/index';
import SourcesPage from './pages/(dashboard)/sources/index';
import RemotesPage from './pages/(dashboard)/remotes/index';
import LogsPage from './pages/(dashboard)/logs/index';
import SettingsPage from './pages/(dashboard)/settings/index';
import LoginPage from './pages/login/index';
import SetupPage from './pages/setup/index';
import ValidatePage from './pages/validate/index';

const queryClient = new QueryClient();

function Sidebar() {
  const location = useLocation();
  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Plans", href: "/plans", icon: Activity },
    { name: "Sources", href: "/sources", icon: HardDrive },
    { name: "Remotes", href: "/remotes", icon: Database },
    { name: "Logs", href: "/logs", icon: Activity },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-full py-4 flex flex-col">
      <div className="text-2xl font-bold mb-8 flex items-center gap-3 px-4 pt-4">
        <img src="/logo.png" width={32} height={32} alt="Sciurus" className="rounded-sm" />
        <span>Sciurus</span>
      </div>
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === item.href
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-slate-800 flex flex-col gap-4">
        <button 
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-slate-400 hover:text-white hover:bg-slate-800/50 w-full text-left"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
        
        <div className="text-sm text-slate-500 px-4">
          Sciurus Backup
        </div>
      </div>
    </div>
  );
}

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Navbar */}
        <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2 font-bold text-xl">
            <img src="/logo.png" width={28} height={28} alt="Sciurus" className="rounded-sm" />
            <span>Sciurus</span>
          </div>
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger className="p-2 -mr-2">
              <Menu className="w-6 h-6" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-slate-900 border-none text-white [&>button]:text-white">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Sidebar />
            </SheetContent>
          </Sheet>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto pb-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/validate" element={<ValidatePage />} />
          
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="remotes" element={<RemotesPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

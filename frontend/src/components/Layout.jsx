import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import {
  ChartLineUp, FolderSimple, ArrowsLeftRight, UsersThree, SignOut,
  ClockCounterClockwise, AddressBook, Storefront, Key, List as ListIcon,
  X as XIcon, GearSix, ChatsCircle, Receipt,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard" },
  { to: "/projects", label: "Proyectos", icon: FolderSimple, testid: "nav-projects" },
  { to: "/transactions", label: "Ingresos y Egresos", icon: ArrowsLeftRight, testid: "nav-transactions" },
  { to: "/operacion", label: "Gastos Fijos", icon: Receipt, testid: "nav-operations" },
  { to: "/clients", label: "Clientes", icon: AddressBook, testid: "nav-clients" },
  { to: "/providers", label: "Proveedores", icon: Storefront, testid: "nav-providers" },
  { to: "/partners", label: "Portal de Socios", icon: UsersThree, testid: "nav-partners" },
  { to: "/espacio", label: "Espacio Socios", icon: ChatsCircle, testid: "nav-hub" },
  { to: "/audit", label: "Auditoría", icon: ClockCounterClockwise, testid: "nav-audit" },
  { to: "/configuracion", label: "Configuración", icon: GearSix, testid: "nav-settings" },
];

const STORAGE_KEY = "sidebar-collapsed";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex">
      {/* Mobile hamburger */}
      <button
        type="button"
        data-testid="sidebar-mobile-toggle"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2.5 bg-white border border-slate-300 hover:border-slate-950"
      >
        <ListIcon size={18} weight="bold" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        data-collapsed={collapsed ? "1" : "0"}
        className={`
          ${sidebarWidth}
          bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen z-50
          transition-[width] duration-200
          max-lg:fixed max-lg:top-0 max-lg:left-0 max-lg:h-screen
          ${mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}
          max-lg:transition-transform max-lg:w-64
        `}
      >
        <div className={`px-3 py-5 border-b border-slate-200 flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <div className="px-2">
              <div className="font-display font-black text-lg tracking-tighter text-slate-950">
                CONTROL<span className="text-brand">.</span>
              </div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-slate-500 mt-0.5">
                Administración
              </div>
            </div>
          )}
          {/* Desktop collapse toggle */}
          <button
            type="button"
            data-testid="sidebar-collapse-toggle"
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:inline-flex p-2 border border-slate-300 hover:border-slate-950 hover:bg-slate-50"
            title={collapsed ? "Expandir" : "Contraer"}
          >
            <ListIcon size={14} weight="bold" />
          </button>
          {/* Mobile close */}
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 border border-slate-300 hover:border-slate-950 hover:bg-slate-50"
          >
            <XIcon size={14} weight="bold" />
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto" data-testid="main-nav">
          {NAV.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-3 py-2.5 transition-colors duration-200",
                  "border-l-2 text-sm font-medium",
                  collapsed ? "justify-center" : "",
                  isActive
                    ? "bg-slate-50 border-brand text-slate-950"
                    : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                ].join(" ")
              }
            >
              <Icon size={18} weight="bold" className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-200">
          {!collapsed ? (
            <>
              <div className="flex items-center gap-3 px-2 py-2">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-9 w-9 object-cover border border-slate-300" />
                ) : (
                  <div className="h-9 w-9 bg-slate-200 flex items-center justify-center font-bold text-xs">
                    {user?.name?.[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-950 truncate">{user?.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                </div>
              </div>
              <NavLink
                to="/cambiar-contrasena"
                data-testid="change-password-link"
                onClick={() => setMobileOpen(false)}
                className="mt-2 w-full flex items-center justify-center gap-2 border border-slate-300 text-slate-700 py-2 text-xs uppercase tracking-wider font-semibold hover:border-slate-950 hover:text-slate-950 transition-colors duration-200"
              >
                <Key size={14} weight="bold" />
                Cambiar contraseña
              </NavLink>
              <button
                data-testid="logout-btn"
                onClick={onLogout}
                className="mt-2 w-full flex items-center justify-center gap-2 border border-slate-900 text-slate-900 py-2 text-sm font-semibold hover:bg-slate-900 hover:text-white transition-colors duration-200"
              >
                <SignOut size={16} weight="bold" />
                Cerrar sesión
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-1.5 items-center">
              <NavLink
                to="/cambiar-contrasena"
                data-testid="change-password-link"
                title="Cambiar contraseña"
                className="p-2 border border-slate-300 text-slate-700 hover:border-slate-950 hover:text-slate-950"
              >
                <Key size={14} weight="bold" />
              </NavLink>
              <button
                data-testid="logout-btn"
                onClick={onLogout}
                title="Cerrar sesión"
                className="p-2 border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white"
              >
                <SignOut size={14} weight="bold" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

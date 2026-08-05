import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Truck,
  UserCircle,
  X,
  Landmark,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { env } from "../config/env";
import type { View } from "../types/domain";
import { canViewFinance } from "../utils/permissions";
import { useAuth } from "../hooks/useAuth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { Modal } from "./ui";
import { SettingsPanel, type ProfileItem } from "./Header";

type ShellProps = {
  view: View;
  setView: (view: View) => void;
  query: string;
  setQuery: (query: string) => void;
  openShipment: () => void;
};

const SIDEBAR_PINNED_STORAGE_KEY = "transportflow.sidebarPinned";

const primaryItems: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "Shipments", label: "Shipments", icon: Truck },
  { view: "Finance", label: "Finance", icon: Landmark },
];

const moreItems: { view: View; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { view: "Directory", label: "Directory", description: "Clients, drivers and fleet", icon: FolderKanban },
  { view: "Reports", label: "Reports", description: "Operational and finance exports", icon: FileSpreadsheet },
];

function Brand({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return (
    <div className="v2-brand" aria-label={name}>
      {logoUrl ? (
        <span className="v2-brand-logo-frame">
          <img className="v2-brand-logo" src={logoUrl} alt="" />
        </span>
      ) : (
        <span className="v2-brand-mark">TF</span>
      )}
      <span className="v2-brand-copy">
        <strong>{name}</strong>
        <small>Transport operations</small>
      </span>
    </div>
  );
}

export function AppShell({ view, setView, query, setQuery, openShipment }: ShellProps) {
  const { activeOrganization, organizations, role, setActiveOrganization, signOut } = useAuth();
  const { company } = useBusinessSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<ProfileItem | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY) !== "false";
  });
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const sidebarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement | null>(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.getAttribute("data-theme") || window.localStorage.getItem("transportflow.theme") || "light";
  });

  const orgName = activeOrganization?.name ?? "TransportFlow";
  const brandName = company.companyName?.trim() || orgName;
  const logoUrl = company.logoUrl?.trim() || undefined;
  const initials = orgName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const allowedPrimaryItems = primaryItems.filter(
    (item) => item.view !== "Finance" || env.demoMode || canViewFinance(role),
  );
  const moreActive = view === "Directory" || view === "Reports";

  useEffect(() => {
    setMoreOpen(false);
    setAccountOpen(false);
    setMobileSearchOpen(false);
  }, [view]);

  useEffect(() => {
    if (!moreOpen && !accountOpen) return;
    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".v2-menu-boundary")) return;
      setMoreOpen(false);
      setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, [accountOpen, moreOpen]);

  useEffect(() => {
    document.documentElement.dataset.sidebarPinned = String(sidebarPinned);
    window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, String(sidebarPinned));
    if (sidebarPinned) setSidebarDrawerOpen(false);

    return () => {
      delete document.documentElement.dataset.sidebarPinned;
    };
  }, [sidebarPinned]);

  useEffect(() => {
    if (!sidebarDrawerOpen || sidebarPinned) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => sidebarCloseRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarDrawerOpen(false);
      window.requestAnimationFrame(() => sidebarTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarDrawerOpen, sidebarPinned]);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMoreOpen(false);
    setAccountOpen(false);
    setMobileSearchOpen(false);
    setSidebarDrawerOpen(false);
  };

  const hideSidebar = () => {
    setSidebarPinned(false);
    setSidebarDrawerOpen(false);
    window.requestAnimationFrame(() => sidebarTriggerRef.current?.focus());
  };

  const pinSidebar = () => {
    setSidebarPinned(true);
    setSidebarDrawerOpen(false);
  };

  const closeSidebarDrawer = () => {
    setSidebarDrawerOpen(false);
    window.requestAnimationFrame(() => sidebarTriggerRef.current?.focus());
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("transportflow.theme", next);
  };

  const openSettings = (panel: ProfileItem) => {
    setMoreOpen(false);
    setAccountOpen(false);
    setSettingsPanel(panel);
  };

  return (
    <>
      {!sidebarPinned && sidebarDrawerOpen && (
        <button
          className="v2-sidebar-backdrop"
          onClick={closeSidebarDrawer}
          aria-label="Close navigation menu"
          type="button"
        />
      )}
      <aside
        id="application-sidebar"
        className={`v2-sidebar${!sidebarPinned ? " is-hidden" : ""}${sidebarDrawerOpen ? " is-drawer-open" : ""}`}
        aria-label="Application navigation"
        aria-hidden={!sidebarPinned && !sidebarDrawerOpen}
        inert={!sidebarPinned && !sidebarDrawerOpen ? true : undefined}
      >
        <div className="v2-sidebar-brand">
          <Brand name={brandName} logoUrl={logoUrl} />
          <button
            ref={sidebarCloseRef}
            className="v2-sidebar-toggle"
            onClick={sidebarPinned ? hideSidebar : pinSidebar}
            aria-label={sidebarPinned ? "Hide sidebar" : "Keep sidebar open"}
            title={sidebarPinned ? "Hide sidebar" : "Keep sidebar open"}
            type="button"
          >
            {sidebarPinned ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className="v2-sidebar-nav" aria-label="Primary navigation">
          <span className="v2-nav-label">Workspace</span>
          {allowedPrimaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={`v2-nav-item${view === item.view ? " active" : ""}`}
                onClick={() => navigate(item.view)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <span className="v2-nav-label v2-nav-label-secondary">Manage</span>
          {moreItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={`v2-nav-item${view === item.view ? " active" : ""}`}
                onClick={() => navigate(item.view)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="v2-sidebar-footer">
          <button className="v2-nav-item" onClick={() => openSettings("Company Profile")} type="button">
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button className="v2-sidebar-account" onClick={() => setAccountOpen((open) => !open)} type="button">
            <span className="v2-avatar">{initials || "TF"}</span>
            <span className="v2-account-copy">
              <strong>{orgName}</strong>
              <small>{role ? `${role} account` : "Demo workspace"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <header className="v2-topbar">
        <div className="v2-topbar-leading">
          {!sidebarPinned && (
            <button
              ref={sidebarTriggerRef}
              className="v2-sidebar-trigger"
              onClick={() => setSidebarDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-controls="application-sidebar"
              aria-expanded={sidebarDrawerOpen}
              type="button"
            >
              <Menu size={20} />
            </button>
          )}
          <div className="v2-topbar-context">
            <span>{moreActive ? "Manage" : "Workspace"}</span>
            <strong>{view}</strong>
          </div>
        </div>
        <div className="v2-topbar-actions">
          {view === "Shipments" && (
            <label className="v2-header-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search shipments"
                aria-label="Search shipments"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear shipment search">
                  <X size={14} />
                </button>
              )}
            </label>
          )}
          <button className="btn-primary v2-new-shipment-button" onClick={openShipment} type="button">
            <Plus size={16} />
            New shipment
          </button>
          <div className="v2-menu-boundary v2-account-menu-wrap">
            <button
              className="v2-topbar-account"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              type="button"
            >
              <span className="v2-avatar">{initials || "TF"}</span>
              <ChevronDown size={14} />
            </button>
            {accountOpen && (
              <div className="v2-popover-menu" role="menu">
                <div className="v2-popover-heading">
                  <strong>{orgName}</strong>
                  <span>{role || "Demo workspace"}</span>
                </div>
                {organizations.length > 1 && (
                  <label className="field" style={{ padding: "0 10px 8px" }}>
                    <span>Active organization</span>
                    <select
                      value={activeOrganization?.id ?? ""}
                      onChange={(event) => setActiveOrganization(event.target.value)}
                    >
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button onClick={() => openSettings("Company Profile")} role="menuitem" type="button">
                  <Building2 size={16} /> Company profile
                </button>

                <button onClick={toggleTheme} role="menuitem" type="button">
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === "dark" ? "Light appearance" : "Dark appearance"}
                </button>
                <div className="v2-menu-divider" />
                <button className="danger" onClick={() => void signOut()} role="menuitem" type="button">
                  <LogOut size={16} /> Account / logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <header className="v2-mobile-topbar">
        <Brand name={brandName} logoUrl={logoUrl} />
        <div className="v2-mobile-topbar-actions">
          {view === "Shipments" && (
            <button
              className="v2-mobile-icon-button"
              onClick={() => setMobileSearchOpen((open) => !open)}
              aria-label={mobileSearchOpen ? "Close shipment search" : "Search shipments"}
              type="button"
            >
              {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
            </button>
          )}
          <button
            className="v2-mobile-icon-button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-label="Open account menu"
            type="button"
          >
            <UserCircle size={22} />
          </button>
        </div>
        {mobileSearchOpen && view === "Shipments" && (
          <label className="v2-mobile-search-panel">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reference, client, driver or route"
              autoFocus
            />
          </label>
        )}
        {accountOpen && (
          <div className="v2-mobile-account-panel v2-menu-boundary">
            <div>
              <strong>{orgName}</strong>
              <span>{role || "Demo workspace"}</span>
            </div>
            <button onClick={() => openSettings("Company Profile")} type="button"><Building2 size={17} /> Company profile</button>

            <button onClick={toggleTheme} type="button">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              {theme === "dark" ? "Light appearance" : "Dark appearance"}
            </button>
            <button className="danger" onClick={() => void signOut()} type="button"><LogOut size={17} /> Account / logout</button>
          </div>
        )}
      </header>

      <nav
        className="v2-mobile-nav"
        aria-label="Mobile navigation"
        style={{ gridTemplateColumns: `repeat(${allowedPrimaryItems.length + 1}, minmax(0, 1fr))` }}
      >
        {allowedPrimaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => navigate(item.view)}
              type="button"
            >
              <Icon size={20} />
              <span>{item.label === "Dashboard" ? "Home" : item.label}</span>
            </button>
          );
        })}
        <div className="v2-menu-boundary v2-mobile-more-wrap">
          <button
            className={moreActive ? "active" : ""}
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            type="button"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="v2-mobile-more-sheet">
              <div className="v2-sheet-handle" />
              <div className="v2-sheet-heading">
                <div>
                  <span>More</span>
                  <strong>Manage your workspace</strong>
                </div>
                <button onClick={() => setMoreOpen(false)} aria-label="Close more menu" type="button"><X size={20} /></button>
              </div>
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.view} className="v2-sheet-item" onClick={() => navigate(item.view)} type="button">
                    <span className="v2-sheet-icon"><Icon size={20} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </button>
                );
              })}
              <button className="v2-sheet-item" onClick={() => openSettings("Company Profile")} type="button">
                <span className="v2-sheet-icon"><Settings size={20} /></span>
                <span><strong>Settings</strong><small>Company, currency and invoice preferences</small></span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {(view === "Dashboard" || view === "Shipments") && (
        <button className="v2-mobile-fab" onClick={openShipment} aria-label="New shipment" type="button">
          <Plus size={24} />
        </button>
      )}

      {settingsPanel && (
        <Modal title={settingsPanel} onClose={() => setSettingsPanel(null)} size="large">
          <SettingsPanel panel={settingsPanel} orgName={orgName} onClose={() => setSettingsPanel(null)} />
        </Modal>
      )}
    </>
  );
}

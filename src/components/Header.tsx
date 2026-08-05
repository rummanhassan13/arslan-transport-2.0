import { useEffect, useRef, useState } from "react";
import { Bell, Building2, Check, ChevronDown, CreditCard, FileText, ImagePlus, LogOut, Menu, Moon, Plus, Search, Settings, Sun, Trash2, UserCircle, UsersRound, X } from "lucide-react";
import type { View } from "../types/domain";
import { navIcons, views } from "../constants/views";
import { env } from "../config/env";
import { canViewFinance } from "../utils/permissions";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { useAuth } from "../hooks/useAuth";
import { useCurrency } from "../hooks/useCurrency";
import type { CurrencyCode } from "../constants/currencies";
import type { CompanyProfileSettings, InvoiceSettings } from "../contexts/BusinessSettingsContext";
import { EmptyState, Modal, StatusBadge } from "./ui";

const PROFILE_ITEMS = ["Company Profile", "User & Roles", "Billing & Plan"] as const;
export type ProfileItem = (typeof PROFILE_ITEMS)[number];

export function Header({
  view,
  setView,
  query,
  setQuery,
  openShipment,
}: {
  view: View;
  setView: (view: View) => void;
  query: string;
  setQuery: (query: string) => void;
  openShipment: () => void;
}) {
  const { activeOrganization, signOut, role } = useAuth();
  const filteredViews = env.demoMode ? views : views.filter((v) => v !== "Finance" || canViewFinance(role));
  const { company } = useBusinessSettings();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState<ProfileItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [desktopSearchActive, setDesktopSearchActive] = useState(false);
  const desktopProfileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const orgName = activeOrganization?.name ?? "TransportFlow";
  const brandName = company.companyName?.trim() || orgName;
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.getAttribute("data-theme") || localStorage.getItem("transportflow.theme") || "light";
  });
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("transportflow.theme", next);
  };
  const companyLogo = company.logoUrl?.trim();
  const initials = orgName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    setProfileOpen(false);
    setDrawerOpen(false);
  }, [view]);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!desktopSearchActive) return;
    desktopSearchInputRef.current?.focus();
  }, [desktopSearchActive]);

  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!profileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const isOutsideDesktop = !desktopProfileMenuRef.current?.contains(event.target as Node);
      const isOutsideMobile = !mobileProfileMenuRef.current?.contains(event.target as Node);
      if (isOutsideDesktop && isOutsideMobile) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  const navigate = (item: View) => {
    setProfileOpen(false);
    setDrawerOpen(false);
    setMobileSearchOpen(false);
    setDesktopSearchActive(false);
    setView(item);
  };

  const openSettings = () => {
    setDrawerOpen(false);
    setProfileOpen(false);
    setProfilePanel("Company Profile");
  };

  const logout = () => {
    setDrawerOpen(false);
    setProfileOpen(false);
    void signOut();
  };

  return (
    <>
      <header className="app-header">
        {/* Mobile Top Header (only visible below md breakpoint) */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 w-full border-b border-line-soft gap-2">
          {/* Burger Menu - Left aligned */}
          <div className="flex-1 flex justify-start">
            <button
              className="flex items-center justify-center p-2 -ml-2 text-ink-2 hover:text-ink"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Logo/company name centered */}
          <div className="flex-shrink min-w-0 max-w-[50%] flex justify-center">
            <BrandLockup logoUrl={companyLogo} companyName={brandName} />
          </div>

          {/* Right Controls: Search Icon + Theme Toggle + Profile Avatar */}
          <div className="flex-1 flex items-center justify-end gap-1">
            <button
              className="flex items-center justify-center p-2 text-ink-2 hover:text-ink"
              aria-label="Search"
            >
              <Search size={20} />
            </button>
            
            <button 
              className="flex items-center justify-center p-2 text-ink-2 hover:text-ink theme-toggle" 
              onClick={toggleTheme} 
              aria-label="Toggle theme" 
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="avatar-menu-wrap" ref={mobileProfileMenuRef}>
              <button
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className="profile-button !border-0 !p-2 !bg-transparent"
                onClick={() => setProfileOpen((open) => !open)}
                title="Account menu"
              >
                <UserCircle size={24} className="text-ink-2 hover:text-ink" />
              </button>
              {profileOpen && (
                <div className="avatar-menu" role="menu">
                  {PROFILE_ITEMS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setProfileOpen(false);
                        setProfilePanel(item);
                      }}
                      role="menuitem"
                    >
                      {item}
                    </button>
                  ))}
                  <button
                    onClick={logout}
                    role="menuitem"
                  >
                    Account / Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Header (only visible on md breakpoint and above) */}
        <div className="!hidden md:!flex header-inner items-center justify-between w-full px-8 h-[60px] relative">
          {/* Left Column: Brand/Logo and Nav */}
          <div className="flex-1 min-w-0 flex items-center justify-start gap-8">
            <BrandLockup logoUrl={companyLogo} companyName={brandName} />
            <nav className="nav-row" aria-label="Primary">
              {filteredViews.map((item) => (
                <button
                  key={item}
                  className={`nav-tab${view === item ? " nav-tab-active" : ""}`}
                  onClick={() => navigate(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>
          
          {/* Right Column: Controls & Profile */}
          <div className="flex items-center justify-end gap-3 flex-shrink-0">
            <div className="flex items-center">
              <div 
                className={`hidden md:flex items-center overflow-hidden transition-all duration-300 ease-in-out ${
                  desktopSearchActive ? "w-[240px] opacity-100 mr-2" : "w-0 opacity-0 mr-0"
                }`}
              >
                <div className="flex items-center gap-2 bg-surface-soft rounded-lg px-3 w-full h-[34px] border border-transparent focus-within:bg-white focus-within:border-line transition-colors">
                  <input
                    ref={desktopSearchInputRef}
                    className="bg-transparent border-none outline-none w-full text-ink text-[13px] placeholder:text-ink-3"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search..."
                  />
                </div>
              </div>
              <button 
                className={`header-icon-btn flex-shrink-0 flex transition-colors ${desktopSearchActive ? 'bg-surface-soft text-ink border-transparent' : ''}`}
                aria-label={desktopSearchActive ? "Close search" : "Search"}
                onClick={() => setDesktopSearchActive((prev) => !prev)}
              >
                {desktopSearchActive ? <X size={15} /> : <Search size={15} />}
              </button>
            </div>

            <button className="theme-toggle flex-shrink-0 flex" onClick={toggleTheme} aria-label="Toggle theme" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button className="btn-primary inline-flex flex-shrink-0" onClick={openShipment}>
              <Plus size={14} />
              <span className="hidden lg:inline">New shipment</span>
            </button>

            {/* Profile Menu (Desktop) */}
            <div className="avatar-menu-wrap flex-shrink-0" ref={desktopProfileMenuRef}>
              <button
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className="profile-button !border md:!px-2"
                onClick={() => setProfileOpen((open) => !open)}
                title="Account menu"
              >
                <span className="avatar !w-[26px] !h-[26px] !text-[10.5px]">{initials}</span>
                <span className="profile-button-label hidden xl:inline">{orgName}</span>
                <ChevronDown className="profile-button-chevron hidden xl:inline" size={13} />
              </button>
              {profileOpen && (
                <div className="avatar-menu" role="menu">
                  {PROFILE_ITEMS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setProfileOpen(false);
                        setProfilePanel(item);
                      }}
                      role="menuitem"
                    >
                      {item}
                    </button>
                  ))}
                  <button
                    onClick={logout}
                    role="menuitem"
                  >
                    Account / Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Mobile Search Drawer/Input */}
        <div className={`md:hidden bg-surface border-t border-line-soft overflow-hidden transition-all duration-200 ${mobileSearchOpen ? "max-h-[60px] opacity-100 py-2 px-4" : "max-h-0 opacity-0 py-0 px-4"}`}>
          <label className="flex items-center gap-2 bg-surface-soft rounded-lg px-3 py-2 text-ink-3">
            <Search size={15} />
            <input
              ref={mobileSearchRef}
              className="bg-transparent border-none outline-none w-full text-ink text-[13px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shipments, clients, invoices..."
            />
          </label>
        </div>
      </header>

      {/* Mobile Drawer - outside header to avoid backdrop-filter containing block */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[1200] md:hidden" onClick={() => setDrawerOpen(false)}>
          <div 
            className="absolute top-0 left-0 bottom-0 w-[min(86vw,320px)] bg-surface border-r border-line shadow-2xl flex flex-col transition-transform"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-line-soft">
              <BrandLockup logoUrl={companyLogo} companyName={brandName} />
              <button className="p-2 text-ink-2 hover:text-ink" onClick={() => setDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-1">
              {filteredViews.map((item) => (
                <button
                  key={item}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] font-semibold transition-colors w-full text-left ${view === item ? 'bg-surface-soft text-ink' : 'text-ink-2 hover:bg-surface-soft hover:text-ink'}`}
                  onClick={() => navigate(item)}
                >
                  <span className={`${view === item ? 'text-accent-strong' : 'text-ink-3'}`}>
                    {navIcons[item]}
                  </span>
                  <span>{item}</span>
                </button>
              ))}
              
              <div className="my-2 border-t border-line-soft"></div>
              
              <button 
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] font-semibold text-ink-2 hover:bg-surface-soft hover:text-ink transition-colors w-full text-left"
                onClick={openSettings}
              >
                <span className="text-ink-3"><Settings size={16} /></span>
                <span>Settings</span>
              </button>
              
              <button 
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] font-semibold text-ink-2 hover:bg-surface-soft hover:text-ink transition-colors w-full text-left"
                onClick={logout}
              >
                <span className="text-ink-3"><LogOut size={16} /></span>
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation - outside header so position:fixed works relative to viewport */}
      <nav className="bottom-nav-bar md:!hidden" aria-label="Mobile navigation">
        {filteredViews.map((item) => (
          <button
            key={item}
            className={`bottom-nav-item${view === item ? " bottom-nav-item-active" : ""}`}
            onClick={() => navigate(item)}
          >
            {navIcons[item]}
            <span>{item}</span>
          </button>
        ))}
      </nav>

      {/* FAB - outside header so position:fixed works relative to viewport */}
      <button
        className="fab-primary !right-5 md:!hidden z-[60]"
        onClick={openShipment}
        aria-label="New shipment"
      >
        <Plus size={24} />
      </button>

      {profilePanel && (
        <Modal title={profilePanel} onClose={() => setProfilePanel(null)}>
          <SettingsPanel panel={profilePanel} orgName={orgName} onClose={() => setProfilePanel(null)} />
        </Modal>
      )}
    </>
  );
}

function BrandLockup({ logoUrl, companyName }: { logoUrl?: string; companyName: string }) {
  const firstSpaceIndex = companyName.indexOf(" ");
  const title = firstSpaceIndex !== -1 ? companyName.substring(0, firstSpaceIndex) : companyName;
  const subtitle = firstSpaceIndex !== -1 ? companyName.substring(firstSpaceIndex + 1) : "";
  const firstLetter = companyName.charAt(0).toUpperCase() || "T";

  return (
    <div className={`brand-lockup${logoUrl ? " brand-lockup-custom" : ""}`} aria-label={logoUrl ? `${companyName} logo` : companyName}>
      {logoUrl ? (
        <span className="brand-logo-frame">
          <img className="brand-logo-image" src={logoUrl} alt={`${companyName} logo`} />
        </span>
      ) : (
        <>
          <span className="brand-mark flex-shrink-0">{firstLetter}</span>
          <span className="min-w-0 truncate flex items-baseline">
            <span className="brand-title truncate">{title}</span>
            {subtitle && <span className="brand-subtitle truncate ml-1 hidden sm:inline">{subtitle}</span>}
          </span>
        </>
      )}
    </div>
  );
}

export function SettingsPanel({ panel, orgName, onClose }: { panel: ProfileItem; orgName: string; onClose: () => void }) {
  if (panel === "Company Profile") return <CompanyProfilePanel orgName={orgName} onClose={onClose} />;
  if (panel === "User & Roles") return <UserRolesPanel onClose={onClose} />;

  return <BillingPlanPanel onClose={onClose} />;
}

function CompanyProfilePanel({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const { currencies, currencyCode, setCurrencyCode } = useCurrency();
  const { company, updateCompanyProfile } = useBusinessSettings();
  const [form, setForm] = useState<CompanyProfileSettings>({
    ...company,
    companyName: company.companyName || orgName,
  });
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  const dirty =
    form.companyName !== (company.companyName || orgName) ||
    form.tagline !== company.tagline ||
    form.phone !== company.phone ||
    form.email !== company.email ||
    form.address !== company.address ||
    form.cityCountry !== company.cityCountry ||
    form.logoUrl !== company.logoUrl;

  useEffect(() => {
    setForm({
      ...company,
      companyName: company.companyName || orgName,
    });
  }, [company, orgName]);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const update = (key: keyof CompanyProfileSettings, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadLogo = (file: File | undefined) => {
    setSaved(false);
    setLogoError("");
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Upload a PNG, JPG, or WebP logo.");
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const maxDimension = 400;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          setLogoError("Unable to initialize compression canvas.");
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Keep PNG as PNG to preserve transparency, otherwise JPEG for small footprint
        const exportType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const compressedDataUrl = canvas.toDataURL(exportType, 0.85);
        update("logoUrl", compressedDataUrl);
      } catch (err) {
        setLogoError("Unable to compress company logo.");
        console.error(err);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };
    image.onerror = () => {
      setLogoError("Unable to load logo image file.");
      URL.revokeObjectURL(imageUrl);
    };
    image.src = imageUrl;
  };

  const save = async () => {
    setLogoError("");
    try {
      await updateCompanyProfile({
        companyName: form.companyName.trim() || orgName,
        tagline: form.tagline.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        cityCountry: form.cityCountry.trim(),
        logoUrl: form.logoUrl.trim(),
      });
      setSaved(true);
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "Unable to save company profile.");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon">
          <Building2 size={18} />
        </span>
        <p>Company profile values are shared organization settings used by invoices and finance documents.</p>
      </div>
      <div className="settings-grid">
        <label className="field">
          <span>Company name</span>
          <input value={form.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder={orgName} />
        </label>
        <label className="field">
          <span>Tagline / short description</span>
          <input value={form.tagline} onChange={(event) => update("tagline", event.target.value)} placeholder="Professional transport billing" />
        </label>
        <label className="field">
          <span>Phone number</span>
          <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+92 300 0000000" />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="accounts@company.com" />
        </label>
        <label className="field form-wide">
          <span>Address</span>
          <input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Business address" />
        </label>
        <label className="field">
          <span>City / country</span>
          <input value={form.cityCountry} onChange={(event) => update("cityCountry", event.target.value)} placeholder="Karachi, Pakistan" />
        </label>
        <div className="field form-wide">
          <span>Company logo</span>
          <div className="logo-upload-row">
            <div className="logo-preview-box">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Company logo preview" />
              ) : (
                <ImagePlus size={24} />
              )}
            </div>
            <div className="logo-upload-controls">
              <label className="btn-ghost logo-upload-button">
                <ImagePlus size={14} />
                Upload logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => uploadLogo(event.target.files?.[0])}
                />
              </label>
              <button className="btn-ghost" type="button" onClick={() => update("logoUrl", "")} disabled={!form.logoUrl}>
                <Trash2 size={14} /> Remove
              </button>
              <p className="field-help">PNG, JPG, or WebP. Stored locally as a data URL for now.</p>
              {logoError && <p className="field-error">{logoError}</p>}
            </div>
          </div>
        </div>
        <label className="field form-wide">
          <span>Currency</span>
          <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value as CurrencyCode)}>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.label}
              </option>
            ))}
          </select>
          <p className="field-help">Changes display formatting only. Stored amounts and calculations are not converted.</p>
        </label>
      </div>
      <div className="settings-actions">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <div className="settings-save-group">
          {dirty && !saved && <span className="settings-save-note">Unsaved changes</span>}
          {saved && <span className="settings-save-note settings-save-note-success"><Check size={14} /> Changes saved</span>}
          <button className={`btn-primary${saved ? " btn-saved" : ""}`} onClick={save}>
            {saved ? <Check size={14} /> : null}
            {saved ? "Saved" : dirty ? "Save Changes" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRolesPanel({ onClose }: { onClose: () => void }) {
  const roles = ["Owner", "Admin", "Manager", "Accountant", "Dispatcher", "Viewer"];

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon">
          <UsersRound size={18} />
        </span>
        <p>Roles define access boundaries. Invite and member management will be connected after the pilot admin flow.</p>
      </div>
      <div className="role-list">
        {roles.map((role) => (
          <div key={role} className="role-row">
            <span>{role}</span>
            <StatusBadge status={role === "Viewer" ? "Read Only" : "Access Role"} />
          </div>
        ))}
      </div>
      <EmptyState text="User invitation and member management are not enabled yet." />
      <div className="settings-actions">
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function InvoiceSettingsPanel({ onClose }: { onClose: () => void }) {
  const { invoice, updateInvoiceSettings } = useBusinessSettings();
  const [form, setForm] = useState<InvoiceSettings>({ ...invoice });
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const update = (key: keyof InvoiceSettings, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaveError("");
    try {
      await updateInvoiceSettings({
        invoicePrefix: form.invoicePrefix.trim(),
        startingInvoiceNumber: form.startingInvoiceNumber.trim(),
        dueDateTerms: form.dueDateTerms.trim(),
        footerNotes: form.footerNotes.trim(),
        defaultInvoiceStatus: "Draft",
      });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save invoice settings.");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon">
          <FileText size={18} />
        </span>
        <p>Invoice numbering and due-date rules are stored for the active organization. Existing issued invoices remain unchanged.</p>
      </div>
      {saveError && <div className="form-error">{saveError}</div>}
      <div className="settings-grid">
        <label className="field">
          <span>Invoice prefix</span>
          <input value={form.invoicePrefix} onChange={(event) => update("invoicePrefix", event.target.value)} placeholder="AT" />
        </label>
        <label className="field">
          <span>Starting invoice number</span>
          <input className="num" value={form.startingInvoiceNumber} onChange={(event) => update("startingInvoiceNumber", event.target.value)} placeholder="1001" />
        </label>
        <label className="field">
          <span>Due date terms</span>
          <select value={form.dueDateTerms} onChange={(event) => update("dueDateTerms", event.target.value)}>
            {["Due on receipt", "7 days", "15 days", "30 days"].map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Default invoice status</span>
          <select value="Draft" disabled>
            <option value="Draft">Draft</option>
          </select>
        </label>
        <label className="field form-wide">
          <span>Footer notes</span>
          <textarea value={form.footerNotes} onChange={(event) => update("footerNotes", event.target.value)} placeholder="Payment terms and invoice footer notes..." />
        </label>
      </div>
      <div className="settings-actions">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={() => void save()}>{saved ? "Saved" : "Save settings"}</button>
      </div>
    </div>
  );
}

function BillingPlanPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <span className="settings-panel-icon">
          <CreditCard size={18} />
        </span>
        <p>Subscription billing is planned for a later SaaS phase. This panel is a visual placeholder only.</p>
      </div>
      <div className="usage-grid">
        {["Users", "Shipments", "Storage"].map((item) => (
          <div key={item} className="usage-card">
            <span>{item}</span>
            <strong className="num">Pilot</strong>
          </div>
        ))}
      </div>
      <div className="plan-grid">
        {["Starter", "Professional", "Business"].map((plan) => (
          <div key={plan} className="plan-card">
            <strong>{plan}</strong>
            <span>Upgrade coming soon</span>
            <button className="btn-ghost" disabled>Unavailable</button>
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

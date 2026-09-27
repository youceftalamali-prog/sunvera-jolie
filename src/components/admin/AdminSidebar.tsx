"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";

type NavItem = {
  label: string;
  href: string;
  icon: "dashboard" | "products" | "add" | "media" | "categories" | "home" | "orders" | "customers" | "shipping" | "settings";
};

type AdminSidebarProps = {
  items: readonly NavItem[];
};

function Icon({ name, className = "" }: { name: NavItem["icon"]; className?: string }) {
  const common = {
    className: "h-4 w-4 shrink-0 " + className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<NavItem["icon"], ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    products: <><path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z" /><path d="M3.5 12 12 16.5 20.5 12" /><path d="M3.5 16.5 12 21l8.5-4.5" /></>,
    add: <><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="8.5" /></>,
    media: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8.5" cy="9" r="1.3" /><path d="m5.5 17 4.4-4 3.2 2.8 2.6-2.3 2.8 2.5" /></>,
    categories: <><path d="M4 5.5h16M4 12h16M4 18.5h16" /><path d="M8 5.5v13" /></>,
    home: <><path d="m3.5 10 8.5-6 8.5 6" /><path d="M5.5 9.5V20h13V9.5M9.5 20v-5h5v5" /></>,
    orders: <><path d="M5 6.5h14M5 12h14M5 17.5h9" /><circle cx="4" cy="6.5" r=".7" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r=".7" fill="currentColor" stroke="none" /><circle cx="4" cy="17.5" r=".7" fill="currentColor" stroke="none" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.6 2.4-5.5 5.5-5.5s5 1.9 5.5 5.5" /><path d="M15.5 11.5c2.2.2 3.9 1.7 4.5 4.5M16 5.5a2.7 2.7 0 0 1 0 5.2" /></>,
    shipping: <><path d="M3.5 6.5h10v10h-10z" /><path d="M13.5 10h4l3 3v3.5h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1-1.7 1.7-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1.1 1.7v.2h-2.4v-.2a1.8 1.8 0 0 0-1.1-1.7 1.8 1.8 0 0 0-2 .3l-.1.1-1.7-1.7.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.7-1.1h-.2v-2.4h.2A1.8 1.8 0 0 0 7.9 9.8a1.8 1.8 0 0 0-.3-2l-.1-.1 1.7-1.7.1.1a1.8 1.8 0 0 0 2 .3A1.8 1.8 0 0 0 12.4 4h2.4v.2a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.3l.1-.1 1.7 1.7-.1.1a1.8 1.8 0 0 0-.3 2 1.8 1.8 0 0 0 1.7 1.1h.2v2.4H21a1.8 1.8 0 0 0-1.6 1.2Z" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export default function AdminSidebar({ items }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sunvera-admin-sidebar");
      if (saved === "collapsed") setCollapsed(true);
    } catch {
      // Ignore local-storage access errors.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("sunvera-admin-sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Ignore local-storage access errors.
      }
      return next;
    });
  }

  const expanded = !collapsed;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed start-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--svj-border)] bg-white/95 text-[var(--svj-foreground)] shadow-sm backdrop-blur lg:hidden"
        aria-label="Open admin menu"
        title="Open admin menu"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close admin menu"
        />
      )}

      <aside
        className={
          "group relative z-50 shrink-0 transition-[width,transform] duration-200 ease-out lg:static " +
          (collapsed ? "lg:w-[68px]" : "lg:w-[248px]") +
          (mobileOpen ? " fixed inset-y-0 start-0 w-[280px] translate-x-0 shadow-2xl" : " fixed inset-y-0 start-0 w-[280px] -translate-x-full lg:relative lg:translate-x-0")
        }
        aria-label="Admin sidebar"
      >
        <div className="flex h-full min-h-[calc(100vh-3rem)] flex-col rounded-2xl border border-[var(--svj-border)] bg-white p-2 shadow-[0_12px_35px_rgba(58,43,34,0.05)]">
          <div className={"flex items-center gap-2 px-2 py-2 " + (expanded ? "justify-between" : "justify-center")}>
            {expanded ? (
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">SunVera Jolie</p>
                <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--svj-muted)]">Admin Console</p>
              </div>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fbf7f0] text-[11px] font-semibold text-gold" title="SunVera Jolie">
                SVJ
              </div>
            )}

            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--svj-border)] text-[var(--svj-muted)] transition hover:border-gold hover:text-[var(--svj-foreground)] lg:flex"
              aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="text-sm">{collapsed ? "→" : "←"}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--svj-border)] text-[var(--svj-muted)] transition hover:border-gold hover:text-[var(--svj-foreground)] lg:hidden"
              aria-label="Close admin menu"
            >
              ×
            </button>
          </div>

          <nav className="mt-3 flex-1 space-y-1" aria-label="Admin">
            {items.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={!expanded ? item.label : undefined}
                  aria-label={item.label}
                  className={
                    "flex min-h-10 items-center rounded-xl text-[11px] transition " +
                    (expanded ? "gap-3 px-3" : "justify-center px-2") +
                    (active
                      ? " bg-[#fbf7f0] font-semibold text-[#2f2823] ring-1 ring-inset ring-[rgba(201,164,92,0.35)]"
                      : " text-[var(--svj-muted)] hover:bg-[var(--svj-background)] hover:text-[var(--svj-foreground)]")
                  }
                >
                  <Icon name={item.icon} />
                  {expanded && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className={"mt-3 border-t border-[var(--svj-border)] pt-3 " + (expanded ? "space-y-2" : "space-y-2")}>
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              title={!expanded ? "View storefront" : undefined}
              className={"flex min-h-10 items-center rounded-xl text-[11px] text-[var(--svj-muted)] hover:bg-[var(--svj-background)] " + (expanded ? "gap-3 px-3" : "justify-center px-2")}
            >
              <span className="text-base leading-none">↗</span>
              {expanded && <span>View storefront</span>}
            </Link>
            <div className={expanded ? "px-3" : "flex justify-center"}>
              {expanded ? (
                <LogoutButton admin />
              ) : (
                <button
                  type="button"
                  title="Logout"
                  aria-label="Logout"
                  onClick={() => void fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logout: true }) }).then(() => window.location.reload())}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--svj-border)] text-[var(--svj-muted)] transition hover:border-red-200 hover:text-red-700"
                >
                  <span className="text-sm">↪</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

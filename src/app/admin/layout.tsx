import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import AdminLogin from "@/components/admin/AdminLogin";
import LogoutButton from "@/components/LogoutButton";
import { ToastProvider } from "@/components/admin/ui";
import { storageWarning } from "@/lib/storage";

export const metadata: Metadata = { title: "Admin Console", robots: { index: false, follow: false } };

const NAV: [string, string][] = [
  ["Dashboard", "/admin"],
  ["Products", "/admin/products"],
  ["Add Product", "/admin/products/new"],
  ["Media Library", "/admin/media"],
  ["Categories", "/admin/categories"],
  ["Homepage CMS", "/admin/content/homepage"],
  ["Orders", "/admin/orders"],
  ["Customers", "/admin/customers"],
  ["Shipping & Wilayas", "/admin/shipping"],
  ["Settings", "/admin/settings"],
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await isAdmin();
  if (!admin) {
    return (
      <ToastProvider>
        <div className="admin-shell min-h-screen">
          <AdminLogin />
        </div>
      </ToastProvider>
    );
  }
  const warning = storageWarning();

  return (
    <ToastProvider>
      <div className="admin-shell min-h-screen">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row">
          <aside className="lg:w-60 lg:shrink-0">
            <div className="bg-white p-4">
              <p className="font-display text-lg">SunVera Jolie</p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">Admin Console</p>
              <nav className="mt-4 space-y-1" aria-label="Admin">
                {NAV.map(([label, href]) => (
                  <Link key={href} href={href} className="block px-2 py-1.5 text-[12px] hover:bg-[var(--svj-background)]">
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 border-t border-[var(--svj-border)] pt-3">
                <Link href="/" className="text-[11px] text-[var(--svj-muted)] underline">View storefront</Link>
                <div className="mt-2"><LogoutButton admin /></div>
              </div>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            {warning && (
              <p className="mb-4 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800">
                ⚠ Storage: {warning}
              </p>
            )}
            {children}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

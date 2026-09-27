import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/auth";
import AdminLogin from "@/components/admin/AdminLogin";
import { ToastProvider } from "@/components/admin/ui";
import { storageWarning } from "@/lib/storage";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata: Metadata = { title: "Admin Console", robots: { index: false, follow: false } };

const NAV = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Products", href: "/admin/products", icon: "products" },
  { label: "Add Product", href: "/admin/products/new", icon: "add" },
  { label: "Media Library", href: "/admin/media", icon: "media" },
  { label: "Categories", href: "/admin/categories", icon: "categories" },
  { label: "Homepage CMS", href: "/admin/content/homepage", icon: "home" },
  { label: "Orders", href: "/admin/orders", icon: "orders" },
  { label: "Customers", href: "/admin/customers", icon: "customers" },
  { label: "Shipping & Wilayas", href: "/admin/shipping", icon: "shipping" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
] as const;

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
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1500px] gap-4 px-2 py-3 sm:px-4 lg:gap-5">
          <AdminSidebar items={NAV} />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            {warning && (
              <p className="mb-4 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800">
                ⚠ Storage: {warning}
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

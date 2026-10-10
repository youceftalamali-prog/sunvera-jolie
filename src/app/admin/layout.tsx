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
        <div className="admin-shell min-h-screen lg:h-[100dvh] lg:overflow-hidden">
          <AdminLogin />
        </div>
      </ToastProvider>
    );
  }
  const warning = storageWarning();

  return (
    <ToastProvider>
      <div className="admin-shell min-h-screen">
        <div className="mx-auto block min-h-screen w-full max-w-[1500px] px-0 py-0 sm:px-4 sm:py-3 lg:flex lg:h-full lg:gap-5 lg:overflow-hidden">
          <AdminSidebar items={NAV} />
          <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden pt-0 lg:h-full lg:w-auto lg:overflow-hidden lg:pt-0">
            {warning && (
              <p className="mb-4 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800 lg:hidden">
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

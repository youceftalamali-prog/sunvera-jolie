"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Storefront chrome belongs on public pages, regardless of whether an admin is signed in. */
export default function StoreChromeVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return children;
}

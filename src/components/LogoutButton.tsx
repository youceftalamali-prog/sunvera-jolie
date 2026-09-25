"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch(admin ? "/api/admin/login" : "/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(admin ? { logout: true } : { action: "logout" }),
        });
        router.refresh();
      }}
      className="text-[11px] uppercase tracking-widest text-cocoa-soft underline hover:text-gold"
    >
      Logout
    </button>
  );
}

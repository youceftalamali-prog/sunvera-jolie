"use client";

import Link from "next/link";
import { useStore } from "@/components/StoreProvider";

export default function MobileNav() {
  const { count, setCartOpen, wishlist } = useStore();
  const item = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] tracking-wide text-cocoa";
  return (
    <nav
      aria-label="Mobile quick navigation"
      className="fixed inset-x-0 bottom-0 z-[60] flex border-t border-cocoa/10 bg-ivory/98 backdrop-blur sm:hidden"
    >
      <Link href="/" className={item}><span aria-hidden>🏠</span>Home</Link>
      <Link href="/search" className={item}><span aria-hidden>🔍</span>Search</Link>
      <Link href="/wishlist" className={item}>
        <span aria-hidden>{wishlist.length ? "❤️" : "🤍"}</span>Wishlist
      </Link>
      <button onClick={() => setCartOpen(true)} className={item}>
        <span aria-hidden>🛍</span>Cart{count > 0 ? ` (${count})` : ""}
      </button>
      <Link href="/account" className={item}><span aria-hidden>👤</span>Account</Link>
    </nav>
  );
}

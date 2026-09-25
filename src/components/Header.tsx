"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore, track, type Lang } from "@/components/StoreProvider";
import { money } from "@/lib/format";
import type { ShopProduct } from "@/lib/types";

export default function Header({
  nav,
  storeName,
  tagline,
  logoUrl,
}: {
  nav: { label: string; url: string }[];
  storeName: string;
  tagline: string;
  logoUrl?: string;
}) {
  const { count, setCartOpen, wishlist, lang, setLang } = useStore();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ShopProduct[]>([]);
  const [cats, setCats] = useState<{ name: string; slug: string }[]>([]);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      setCats([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const d = (await res.json()) as { products: ShopProduct[]; categories: { name: string; slug: string }[] };
      setResults(d.products);
      setCats(d.categories);
      track("search", { search_string: q });
    }, 220);
  }, [q]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-cocoa/10 bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <button className="lg:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <span className="text-xl" aria-hidden>☰</span>
          </button>

          <Link href="/" className="shrink-0 leading-none">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={storeName} className="h-9 w-auto" />
            ) : (
              <>
                <span className="font-display text-xl tracking-[0.22em] text-cocoa sm:text-2xl">{storeName}</span>
                <span className="mt-0.5 block text-[9px] tracking-[0.42em] text-gold">{tagline.toUpperCase()}</span>
              </>
            )}
          </Link>

          <nav aria-label="Main" className="mx-auto hidden items-center gap-5 lg:flex">
            {nav.map((n) => (
              <Link
                key={`${n.label}-${n.url}`}
                href={n.url}
                className="text-[11px] uppercase tracking-[0.14em] text-cocoa transition hover:text-gold"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3 text-sm lg:ms-0">
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="hidden bg-transparent text-[11px] uppercase tracking-widest text-cocoa-soft outline-none sm:block"
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
              <option value="ar">ع</option>
            </select>
            <button aria-label="Search" onClick={() => setSearchOpen(true)}>🔍</button>
            <Link href="/account" aria-label="Account" className="hidden sm:block">👤</Link>
            <Link href="/wishlist" aria-label="Wishlist" className="relative hidden sm:block">
              🤍
              {wishlist.length > 0 && (
                <span className="absolute -right-2 -top-1 rounded-full bg-gold px-1.5 text-[9px] text-white">
                  {wishlist.length}
                </span>
              )}
            </Link>
            <button aria-label="Open cart" onClick={() => setCartOpen(true)} className="relative">
              🛍
              {count > 0 && (
                <span className="absolute -right-2 -top-1 rounded-full bg-cocoa px-1.5 text-[9px] text-ivory">{count}</span>
              )}
            </button>
          </div>
        </div>

        {menu && (
          <nav aria-label="Mobile" className="border-t border-cocoa/10 bg-ivory px-6 py-4 lg:hidden">
            {nav.map((n) => (
              <Link key={`m-${n.label}`} href={n.url} onClick={() => setMenu(false)} className="block py-2 text-sm tracking-wide text-cocoa">
                {n.label}
              </Link>
            ))}
            <Link href="/track" onClick={() => setMenu(false)} className="block py-2 text-sm text-cocoa">Track My Order</Link>
          </nav>
        )}
      </header>

      {searchOpen && (
        <div className="fixed inset-0 z-[80] bg-cocoa/40" onClick={() => setSearchOpen(false)}>
          <div className="bg-ivory p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearchOpen(false);
                  router.push(`/search?q=${encodeURIComponent(q)}`);
                }}
              >
                { }
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Vitamin C, shampoo, dry skin…" aria-label="Search products" className="inp" />
              </form>
              {(results.length > 0 || cats.length > 0) && (
                <div className="mt-4 max-h-[60vh] overflow-y-auto bg-white p-2">
                  {cats.map((c) => (
                    <Link key={c.slug} href={`/category/${c.slug}`} onClick={() => setSearchOpen(false)} className="block px-3 py-2 text-xs uppercase tracking-widest text-gold">
                      Category · {c.name}
                    </Link>
                  ))}
                  {results.map((p) => (
                    <Link key={p.id} href={`/product/${p.slug}`} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-beige">
                      <span className="text-xl">{p.emoji}</span>
                      <span className="flex-1 text-sm">{p.name}</span>
                      <span className="text-xs text-cocoa-soft">{money(p.price)}</span>
                    </Link>
                  ))}
                </div>
              )}
              <button onClick={() => setSearchOpen(false)} className="mt-4 text-xs underline">Close search</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

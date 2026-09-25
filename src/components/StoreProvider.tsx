"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLine } from "@/lib/types";

type Ctx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  addItem: (line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (productId: number, variant: string, qty: number) => void;
  removeItem: (productId: number, variant: string) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  wishlist: number[];
  toggleWish: (id: number) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
};

export type Lang = "en" | "fr" | "ar";

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    shop: "Shop", home: "Home", cart: "Cart", wishlist: "Wishlist", account: "Account",
    search: "Search", checkout: "Checkout", addToCart: "Add to Cart", subtotal: "Subtotal",
    emptyCart: "Your cart is empty", bestSellers: "Best Sellers", newArrivals: "New Arrivals",
  },
  fr: {
    shop: "Boutique", home: "Accueil", cart: "Panier", wishlist: "Favoris", account: "Compte",
    search: "Recherche", checkout: "Commander", addToCart: "Ajouter au panier", subtotal: "Sous-total",
    emptyCart: "Votre panier est vide", bestSellers: "Meilleures ventes", newArrivals: "Nouveautés",
  },
  ar: {
    shop: "المتجر", home: "الرئيسية", cart: "السلة", wishlist: "المفضلة", account: "حسابي",
    search: "بحث", checkout: "إتمام الطلب", addToCart: "أضف إلى السلة", subtotal: "المجموع",
    emptyCart: "سلتك فارغة", bestSellers: "الأكثر مبيعاً", newArrivals: "وصل حديثاً",
  },
};

const StoreCtx = createContext<Ctx | null>(null);

export function track(name: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    fbq?: (...a: unknown[]) => void;
    ttq?: { track: (...a: unknown[]) => void };
    dataLayer?: unknown[];
  };
  const map: Record<string, string> = {
    product_view: "ViewContent",
    add_to_cart: "AddToCart",
    begin_checkout: "InitiateCheckout",
    purchase: "Purchase",
    search: "Search",
    wishlist: "AddToWishlist",
  };
  const std = map[name];
  if (w.fbq && std) w.fbq("track", std, payload);
  if (w.ttq && std) w.ttq.track(std, payload);
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event: name, ...payload });
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, payload }),
    keepalive: true,
  }).catch(() => {});
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [lang, setLangState] = useState<Lang>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem("svj_cart") ?? "[]") as CartLine[]);
      setWishlist(JSON.parse(localStorage.getItem("svj_wish") ?? "[]") as number[]);
      const l = localStorage.getItem("svj_lang") as Lang | null;
      if (l) setLangState(l);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("svj_cart", JSON.stringify(lines));
  }, [lines, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("svj_wish", JSON.stringify(wishlist));
  }, [wishlist, ready]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("svj_lang", l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  }, []);

  useEffect(() => {
    if (ready) {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    }
  }, [lang, ready]);

  const addItem = useCallback((line: Omit<CartLine, "qty">, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === line.productId && l.variant === line.variant);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [...prev, { ...line, qty }];
    });
    setCartOpen(true);
    track("add_to_cart", { content_ids: [line.productId], value: line.price * qty, currency: "DZD" });
  }, []);

  const setQty = useCallback((productId: number, variant: string, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId && l.variant === variant ? { ...l, qty } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const removeItem = useCallback((productId: number, variant: string) => {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.variant === variant)));
    track("remove_from_cart", { content_ids: [productId] });
  }, []);

  const toggleWish = useCallback((id: number) => {
    setWishlist((prev) => {
      const has = prev.includes(id);
      if (!has) track("wishlist", { content_ids: [id] });
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    return {
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal,
      addItem,
      setQty,
      removeItem,
      clearCart: () => setLines([]),
      cartOpen,
      setCartOpen,
      wishlist,
      toggleWish,
      lang,
      setLang,
      t: (k: string) => DICT[lang][k] ?? DICT.en[k] ?? k,
    };
  }, [lines, cartOpen, wishlist, lang, addItem, setQty, removeItem, toggleWish, setLang]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

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
    closeCart: "Close cart", addMore: "Add", addForDelivery: "more for FREE delivery", deliveryUnlocked: "Free delivery unlocked", startShopping: "Start shopping",

    checkoutTitle: "Checkout",
    secureCheckout: "Secure checkout · Cash on Delivery 🇩🇿",
    customerInformation: "Customer Information",
    fullName: "Full Name *",
    phoneNumber: "Phone Number *",
    emailOptional: "Email (optional)",
    shippingAddress: "Shipping Address",
    searchWilaya: "Search wilaya",
    searchCommune: "Search commune",
    wilaya: "Wilaya *",
    selectWilaya: "Select your wilaya",
    commune: "Commune *",
    selectCommune: "Select your commune",
    selectWilayaFirst: "Select a wilaya first",
    fullAddress: "Full Address *",
    notesOptional: "Notes (optional)",
    payment: "Payment",
    cashOnDelivery: "Cash on Delivery — pay when you receive your parcel",
    placingOrder: "Placing your order…",
    placeOrder: "Place Order",
    orderSummary: "Order Summary",
    couponCode: "Coupon code (SAVE10, WELCOME10…)",
    couponApplied: "Coupon applied ✓",
    subtotalLabel: "Subtotal",
    deliveryLabel: "Delivery",
    free: "Free",
    selectWilayaPrompt: "Select wilaya",
    discountLabel: "Discount",
    totalLabel: "Total",
    secureData: "🔒 Your data is stored securely and never shared.",
    thankYou: "Thank you for your order",
    orderConfirmed: "is confirmed. We will call you shortly to arrange delivery. Please prepare",
    trackOrder: "Track my order",
    continueShopping: "Continue shopping",
    discoverCollection: "Discover the collection",
    pleaseSelectCommune: "Please select your commune.",
    orderFailed: "We could not place your order. Please try again.",
    calcFailed: "Could not calculate your total. Please try again.",
    networkError: "Network error while calculating your total.",
    decreaseQuantity: "Decrease quantity", increaseQuantity: "Increase quantity", remove: "Remove", deliveryAtCheckout: "Delivery calculated at checkout", cashOnDeliveryAvailable: "Cash on Delivery available",
  },
  fr: {
    shop: "Boutique", home: "Accueil", cart: "Panier", wishlist: "Favoris", account: "Compte",
    search: "Recherche", checkout: "Commander", addToCart: "Ajouter au panier", subtotal: "Sous-total",
    emptyCart: "Votre panier est vide", bestSellers: "Meilleures ventes", newArrivals: "Nouveautés",
    closeCart: "Fermer le panier", addMore: "Ajouter", addForDelivery: "de plus pour la livraison GRATUITE", deliveryUnlocked: "Livraison gratuite débloquée", startShopping: "Commencer les achats",

    checkoutTitle: "Commande",
    secureCheckout: "Commande sécurisée · Paiement à la livraison 🇩🇿",
    customerInformation: "Informations client",
    fullName: "Nom complet *",
    phoneNumber: "Numéro de téléphone *",
    emailOptional: "E-mail (facultatif)",
    shippingAddress: "Adresse de livraison",
    searchWilaya: "Rechercher une wilaya",
    searchCommune: "Rechercher une commune",
    wilaya: "Wilaya *",
    selectWilaya: "Choisissez votre wilaya",
    commune: "Commune *",
    selectCommune: "Choisissez votre commune",
    selectWilayaFirst: "Choisissez d’abord une wilaya",
    fullAddress: "Adresse complète *",
    notesOptional: "Notes (facultatif)",
    payment: "Paiement",
    cashOnDelivery: "Paiement à la livraison — payez à la réception",
    placingOrder: "Commande en cours…",
    placeOrder: "Commander",
    orderSummary: "Récapitulatif",
    couponCode: "Code promo (SAVE10, WELCOME10…)",
    couponApplied: "Code promo appliqué ✓",
    subtotalLabel: "Sous-total",
    deliveryLabel: "Livraison",
    free: "Gratuite",
    selectWilayaPrompt: "Choisissez une wilaya",
    discountLabel: "Remise",
    totalLabel: "Total",
    secureData: "🔒 Vos données sont conservées en sécurité et ne sont pas partagées.",
    thankYou: "Merci pour votre commande",
    orderConfirmed: "est confirmée. Nous vous appellerons bientôt pour organiser la livraison. Préparez",
    trackOrder: "Suivre ma commande",
    continueShopping: "Continuer les achats",
    discoverCollection: "Découvrir la collection",
    pleaseSelectCommune: "Veuillez sélectionner votre commune.",
    orderFailed: "Impossible de passer la commande. Veuillez réessayer.",
    calcFailed: "Impossible de calculer le total. Veuillez réessayer.",
    networkError: "Erreur réseau lors du calcul du total.",
    decreaseQuantity: "Diminuer la quantité", increaseQuantity: "Augmenter la quantité", remove: "Retirer", deliveryAtCheckout: "Livraison calculée à la commande", cashOnDeliveryAvailable: "Paiement à la livraison disponible",
  },
  ar: {
    shop: "المتجر", home: "الرئيسية", cart: "السلة", wishlist: "المفضلة", account: "حسابي",
    search: "بحث", checkout: "إتمام الطلب", addToCart: "أضف إلى السلة", subtotal: "المجموع",
    emptyCart: "سلتك فارغة", bestSellers: "الأكثر مبيعاً", newArrivals: "وصل حديثاً",
    closeCart: "إغلاق السلة", addMore: "أضف", addForDelivery: "إضافية للحصول على التوصيل المجاني", deliveryUnlocked: "تم تفعيل التوصيل المجاني", startShopping: "ابدأ التسوق",

    checkoutTitle: "إتمام الطلب",
    secureCheckout: "طلب آمن · الدفع عند الاستلام 🇩🇿",
    customerInformation: "معلومات الزبون",
    fullName: "الاسم الكامل *",
    phoneNumber: "رقم الهاتف *",
    emailOptional: "البريد الإلكتروني (اختياري)",
    shippingAddress: "عنوان التوصيل",
    searchWilaya: "ابحث عن الولاية",
    searchCommune: "ابحث عن البلدية",
    wilaya: "الولاية *",
    selectWilaya: "اختر ولايتك",
    commune: "البلدية *",
    selectCommune: "اختر بلديتك",
    selectWilayaFirst: "اختر الولاية أولاً",
    fullAddress: "العنوان الكامل *",
    notesOptional: "ملاحظات (اختياري)",
    payment: "الدفع",
    cashOnDelivery: "الدفع عند الاستلام — ادفع عند وصول طلبك",
    placingOrder: "جارٍ إرسال الطلب…",
    placeOrder: "تأكيد الطلب",
    orderSummary: "ملخص الطلب",
    couponCode: "رمز التخفيض (SAVE10، WELCOME10…)",
    couponApplied: "تم تطبيق رمز التخفيض ✓",
    subtotalLabel: "المجموع الفرعي",
    deliveryLabel: "التوصيل",
    free: "مجاني",
    selectWilayaPrompt: "اختر الولاية",
    discountLabel: "التخفيض",
    totalLabel: "الإجمالي",
    secureData: "🔒 تُحفظ بياناتك بأمان ولا تتم مشاركتها.",
    thankYou: "شكراً على طلبك",
    orderConfirmed: "تم تأكيده. سنتصل بك قريباً لترتيب التوصيل. يرجى تجهيز مبلغ",
    trackOrder: "تتبع طلبي",
    continueShopping: "مواصلة التسوق",
    discoverCollection: "اكتشف المجموعة",
    pleaseSelectCommune: "يرجى اختيار البلدية.",
    orderFailed: "تعذر تسجيل طلبك. يرجى المحاولة مجدداً.",
    calcFailed: "تعذر حساب الإجمالي. يرجى المحاولة مجدداً.",
    networkError: "حدث خطأ في الشبكة أثناء حساب الإجمالي.",
    decreaseQuantity: "تقليل الكمية", increaseQuantity: "زيادة الكمية", remove: "حذف", deliveryAtCheckout: "تُحسب تكلفة التوصيل عند إتمام الطلب", cashOnDeliveryAvailable: "الدفع عند الاستلام متاح",
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

  const t = useCallback((k: string) => DICT[lang][k] ?? DICT.en[k] ?? k, [lang]);

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
      t,
    };
  }, [lines, cartOpen, wishlist, lang, addItem, setQty, removeItem, toggleWish, setLang, t]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

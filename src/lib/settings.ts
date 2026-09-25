import { db } from "@/db";
import { storeSettings, themeSettings, type ThemeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSafeColor } from "@/lib/sanitize";

/* ----------------------------- Section types ----------------------------- */

export type StoreInfoSettings = {
  name: string;
  tagline: string;
  logoUrl: string;
  /** Optional dark-background variant, mobile variant, favicon and social card. */
  logoDarkUrl: string;
  logoMobileUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  /** Intrinsic size of the main logo, captured at upload time to avoid layout shift. */
  logoWidth: number;
  logoHeight: number;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
};

export type SocialSettings = {
  instagram: string;
  facebook: string;
  tiktok: string;
  pinterest: string;
  whatsapp: string;
};

export type AnnouncementSettings = {
  text: string;
  background: string;
  textColor: string;
  link: string;
  active: boolean;
};

export type FooterSettings = {
  description: string;
  copyright: string;
  newsletterTitle: string;
  newsletterText: string;
};

export type NewsletterSettings = {
  enabled: boolean;
  imageUrl: string;
  heading: string;
  description: string;
  discountCode: string;
  buttonText: string;
};

export type CheckoutSettings = {
  freeShippingThreshold: number;
  codEnabled: boolean;
  codNote: string;
  cardEnabled: boolean;
};

export type SeoSettings = {
  siteUrl: string;
  defaultTitle: string;
  defaultDescription: string;
  keywords: string;
};

export type AnalyticsSettings = {
  metaPixelId: string;
  tiktokPixelId: string;
  gaMeasurementId: string;
};

export type AiSettings = {
  enabled: boolean;
  model: string;
  prompt: string;
};

export type SecuritySettings = {
  maxUploadMb: number;
  allowedTypes: string;
};

export type SettingsMap = {
  store: StoreInfoSettings;
  social: SocialSettings;
  announcement: AnnouncementSettings;
  footer: FooterSettings;
  newsletter: NewsletterSettings;
  checkout: CheckoutSettings;
  seo: SeoSettings;
  analytics: AnalyticsSettings;
  ai: AiSettings;
  security: SecuritySettings;
};

export const DEFAULTS: SettingsMap = {
  store: {
    name: "SUNVERA JOLIE",
    tagline: "Timeless Elegance",
    logoUrl: "",
    logoDarkUrl: "",
    logoMobileUrl: "",
    faviconUrl: "",
    ogImageUrl: "",
    logoWidth: 0,
    logoHeight: 0,
    email: "care@sunverajolie.com",
    phone: "+213 000 000 000",
    whatsapp: "+213 000 000 000",
    address: "Alger, Algérie",
  },
  social: {
    instagram: "https://instagram.com",
    facebook: "https://facebook.com",
    tiktok: "https://tiktok.com",
    pinterest: "https://pinterest.com",
    whatsapp: "https://wa.me/213000000000",
  },
  announcement: {
    text: "✨ Discover Your Beauty Ritual — Premium Care for Your Skin & Hair",
    background: "#3a2b22",
    textColor: "#fdfbf7",
    link: "/shop",
    active: true,
  },
  footer: {
    description:
      "Premium beauty and personal care, thoughtfully selected for your daily ritual. Delivered across Algeria with Cash on Delivery.",
    copyright: "© SunVera Jolie. All rights reserved. · Cash on Delivery · DZD",
    newsletterTitle: "Join the SunVera Jolie Beauty Club",
    newsletterText: "New arrivals, exclusive offers and beauty inspiration.",
  },
  newsletter: {
    enabled: true,
    imageUrl: "",
    heading: "Get 10% Off Your First Order",
    description:
      "Join our beauty community and discover new arrivals, exclusive offers and beauty inspiration.",
    discountCode: "WELCOME10",
    buttonText: "Get My 10% Off",
  },
  checkout: { freeShippingThreshold: 9000, codEnabled: true, codNote: "Cash on Delivery available across Algeria", cardEnabled: false },
  seo: {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunverajolie.com",
    defaultTitle: "SunVera Jolie | Timeless Elegance — Premium Skincare & Beauty",
    defaultDescription:
      "SunVera Jolie — premium skincare, hair care, body care and beauty essentials. Cash on delivery across Algeria.",
    keywords: "skincare, beauty, hair care, body care, Algeria, vitamin C serum",
  },
  analytics: {
    metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "",
    tiktokPixelId: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "",
    gaMeasurementId: process.env.NEXT_PUBLIC_GA_ID ?? "",
  },
  ai: {
    enabled: true,
    model: "gpt-4o-mini",
    prompt:
      "You are the SunVera Jolie beauty concierge for a premium Algerian skincare boutique. Recommend ONLY from the provided products, in 3-5 warm, elegant sentences. Never give medical advice, never diagnose, never promise to cure anything.",
  },
  security: { maxUploadMb: 8, allowedTypes: "image/jpeg,image/png,image/webp,image/avif" },
};

export async function getSettingsMap(): Promise<SettingsMap> {
  try {
    const rows = await db.select().from(storeSettings);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(DEFAULTS)) out[k] = { ...v };
    for (const row of rows) {
      const key = row.key as keyof SettingsMap;
      if (key in DEFAULTS) out[key] = { ...DEFAULTS[key], ...(row.value as object) };
    }
    return out as SettingsMap;
  } catch {
    return DEFAULTS;
  }
}

export async function saveSection<K extends keyof SettingsMap>(key: K, patch: Partial<SettingsMap[K]>) {
  const all = await getSettingsMap();
  const value = { ...all[key], ...patch };
  await db
    .insert(storeSettings)
    .values({ key: key as string, value })
    .onConflictDoUpdate({ target: storeSettings.key, set: { value } });
  return value;
}

/* -------------------------------- Theme --------------------------------- */

export async function getTheme(): Promise<ThemeSettings> {
  try {
    const [row] = await db.select().from(themeSettings).where(eq(themeSettings.id, 1)).limit(1);
    if (row) return row;
  } catch {
    /* not migrated yet */
  }
  return {
    id: 1,
    primary: "#c9a45c",
    secondary: "#e3cdbb",
    accent: "#c9a45c",
    background: "#fdfbf7",
    surface: "#ffffff",
    textColor: "#3a2b22",
    mutedColor: "#6b5749",
    buttonBg: "#3a2b22",
    buttonText: "#fdfbf7",
    borderColor: "#e8ddcd",
    headingFont: "serif",
    bodyFont: "sans",
    buttonFont: "sans",
  };
}

export async function saveTheme(patch: Partial<ThemeSettings>) {
  const current = await getTheme();
  const value = { ...current, ...patch, id: 1 };
  await db
    .insert(themeSettings)
    .values(value)
    .onConflictDoUpdate({ target: themeSettings.id, set: value });
  return value;
}

const FONT_STACKS: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  display: '"Playfair Display", Georgia, serif',
  mono: "ui-monospace, SFMono-Regular, monospace",
};

export function themeCss(t: ThemeSettings) {
  const stack = (f: string) => FONT_STACKS[f] ?? FONT_STACKS.sans;
  const color = (v: string, fallback: string) => (isSafeColor(v) ? v.trim() : fallback);
  return `:root{
  --svj-primary:${color(t.primary, "#c9a45c")};
  --svj-secondary:${color(t.secondary, "#e3cdbb")};
  --svj-accent:${color(t.accent, "#c9a45c")};
  --svj-background:${color(t.background, "#fdfbf7")};
  --svj-surface:${color(t.surface, "#ffffff")};
  --svj-text:${color(t.textColor, "#3a2b22")};
  --svj-muted:${color(t.mutedColor, "#6b5749")};
  --svj-button-bg:${color(t.buttonBg, "#3a2b22")};
  --svj-button-text:${color(t.buttonText, "#fdfbf7")};
  --svj-border:${color(t.borderColor, "#e8ddcd")};
  --svj-font-heading:${stack(t.headingFont)};
  --svj-font-body:${stack(t.bodyFont)};
  --svj-font-button:${stack(t.buttonFont)};
}`;
}

/* ------------------------- Backwards-compatible helpers ------------------ */

export type StoreSettings = SettingsMap["store"] & { announcement: string };

export async function getSettings(): Promise<StoreSettings> {
  const all = await getSettingsMap();
  return { ...all.store, announcement: all.announcement.text };
}

export async function saveSettings(patch: Partial<StoreSettings>) {
  const { announcement, ...store } = patch;
  await saveSection("store", store);
  if (announcement) await saveSection("announcement", { text: announcement });
  return getSettings();
}

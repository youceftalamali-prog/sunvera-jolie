import Image from "next/image";
import type { CSSProperties } from "react";
import Link from "next/link";
import { getSections, getTrustBadges, activeBanners, resolveSectionProducts } from "@/lib/cms";
import { allCategories, productsWithImages } from "@/lib/queries";
import { getSettingsMap } from "@/lib/settings";
import { sectionTypographyStyle } from "@/lib/typography";
import HeroCarousel from "@/components/HeroCarousel";
import LuxuryProductRail from "@/components/LuxuryProductRail";
import EditorialProductCard from "@/components/EditorialProductCard";
import RotatingProductImage, { type RotationMode } from "@/components/RotatingProductImage";
import CategoryCardImage from "@/components/CategoryCardImage";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [sections, catalog, cats, badges, banners, settings] = await Promise.all([
    getSections(),
    productsWithImages(false),
    allCategories(),
    getTrustBadges(),
    activeBanners(),
    getSettingsMap(),
  ]);

  const shop: ShopProduct[] = catalog.map((p) => toShopProduct(p, p.images));
  const badgeList = badges.filter((b) => b.active);
  const banner = banners[0];

  const newArrivals = shop.filter((p) => p.newArrival).sort((a, b) => b.id - a.id);
  const skincareProducts = shop.filter((p) =>
    ["skincare", "face-care", "serums", "cleansers", "moisturizers", "masks", "eye-care", "sun-care"].includes(p.categorySlug),
  );
  const hairProducts = shop.filter((p) => p.categorySlug === "hair-care");
  const routineProducts = [
    shop.find((p) => p.categorySlug === "cleansers"),
    shop.find((p) => p.categorySlug === "serums"),
    shop.find((p) => p.categorySlug === "moisturizers"),
    shop.find((p) => p.categorySlug === "sun-care"),
  ].filter((p): p is ShopProduct => Boolean(p));

  // Always respect administrator CMS sortOrder. Never override with a hard-coded
  // presentation sequence — that caused enabled sections to appear "missing" or
  // reordered after the luxury homepage merge.
  sections.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  // Render every enabled CMS section returned by getSections (enabled-only).
  const displaySections = sections;
  const sectionByKey = (key: string) => sections.find((s) => s.key === key);

  // Prefer categories with saved image URLs so uploaded Cloudinary images
  // are eligible for the homepage cards.
  const preferredCategorySlugs = [
    "skincare",
    "face-care",
    "serums",
    "cleansers",
    "new-arrivals",
    "body-care",
    "hair-care",
  ];
  const categoryCards = [
    ...preferredCategorySlugs
      .map((slug) => cats.find((category) => category.slug === slug && Boolean(category.imageUrl?.trim())))
      .filter((category): category is (typeof cats)[number] => Boolean(category)),
    ...cats.filter((category) => Boolean(category.imageUrl?.trim()) && !preferredCategorySlugs.includes(category.slug)),
    ...preferredCategorySlugs
      .map((slug) => cats.find((category) => category.slug === slug && !category.imageUrl?.trim()))
      .filter((category): category is (typeof cats)[number] => Boolean(category)),
    ...cats.filter((category) => !category.imageUrl?.trim() && !preferredCategorySlugs.includes(category.slug)),
  ]
    .filter((category, index, all) => all.findIndex((candidate) => candidate.slug === category.slug) === index)
    .slice(0, 4);

  type EditableSettings = Record<string, unknown>;

  const getEditableSettings = (section: (typeof sections)[number]): EditableSettings =>
    section.settings && typeof section.settings === "object" && !Array.isArray(section.settings)
      ? (section.settings as EditableSettings)
      : {};

  const getEditableText = (section: (typeof sections)[number], key: string, fallback: string) => {
    const value = getEditableSettings(section)[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  const getEditableArray = <T,>(section: (typeof sections)[number], key: string, fallback: T[]): T[] => {
    const value = getEditableSettings(section)[key];
    return Array.isArray(value) ? (value as T[]) : fallback;
  };

  const getSectionVisualStyle = (section: (typeof sections)[number]): CSSProperties => {
    const settings = getEditableSettings(section);
    const colors =
      settings.colors && typeof settings.colors === "object" && !Array.isArray(settings.colors)
        ? (settings.colors as Record<string, unknown>)
        : {};
    const value = (key: string, fallback: string) => {
      const candidate = colors[key] ?? settings[key];
      return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
    };
    return {
      "--sv-section-bg": value("background", section.background || ""),
      "--sv-section-text": value("text", section.textColor || ""),
      "--sv-section-accent": value("accent", "#c9a45c"),
      "--sv-section-surface": value("surface", "#ffffff"),
      "--sv-section-muted": value("muted", "#78685d"),
      "--sv-section-border": value("border", "rgba(58,43,34,0.10)"),
      "--sv-section-button-bg": value("buttonBackground", "#c9a45c"),
      "--sv-section-button-text": value("buttonText", "#3a2b22"),
    } as CSSProperties;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .svj-master-section[data-section-key]:not([data-section-key="hero"]) > section { background-color: var(--sv-section-bg) !important; }
        .svj-master-section > section .section-title,
        .svj-master-section > section .text-cocoa { color: var(--sv-section-text) !important; }
        .svj-master-section > section .text-cocoa-soft { color: var(--sv-section-muted) !important; }
        .svj-master-section > section .text-gold { color: var(--sv-section-accent) !important; }
        .svj-master-section > section .border-cocoa\\/10 { border-color: var(--sv-section-border) !important; }
        .svj-master-section > section .bg-white { background-color: var(--sv-section-surface) !important; }
        .svj-master-section > section .btn-gold,
        .svj-master-section > section .btn-primary { background-color: var(--sv-section-button-bg) !important; color: var(--sv-section-button-text) !important; }
        .svj-master-section > section .btn-outline { border-color: var(--sv-section-accent) !important; color: var(--sv-section-accent) !important; }
      ` }} />
      {displaySections.map((s) => {
        const products = resolveSectionProducts(s, catalog).map((p) =>
          shop.find((x) => x.id === p.id) as ShopProduct,
        ).filter((p): p is ShopProduct => Boolean(p));
        const typographyStyle = sectionTypographyStyle(
          s.settings && typeof s.settings === "object" && "typography" in s.settings
            ? (s.settings as { typography?: unknown }).typography
            : undefined,
        );

        const content = (() => {
        switch (s.key) {
          case "hero":
            return <HeroCarousel key={s.id} section={s} storeName={settings.store.name} />;
          case "trust_badges":
            return (
              <section key={s.id} className="border-y border-cocoa/10 bg-beige" aria-label={s.title || "Store benefits"}>
                <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
                  {(s.title || s.subtitle) && (
                    <div className="mb-5 text-center">
                      {s.title && <h2 className="font-display text-2xl text-cocoa sm:text-3xl">{s.title}</h2>}
                      {s.subtitle && <p className="mt-2 text-xs text-cocoa-soft">{s.subtitle}</p>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
                    {badgeList.slice(0, 4).map((b) => (
                      <div key={b.id} className="text-center">
                        <div className="text-xl" aria-hidden>{b.icon}</div>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]">{b.title}</p>
                        <p className="text-[11px] text-cocoa-soft">{b.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          case "categories":
            return (
              <section key={s.id} className="relative overflow-hidden bg-[#fbf6ef] py-16 sm:py-20" aria-label="Shop by Category">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(211,178,126,0.12),transparent_28%),radial-gradient(circle_at_90%_70%,rgba(211,178,126,0.10),transparent_30%)]" />
                <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
                  <div className="mx-auto max-w-2xl text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-gold">{getEditableText(s, "eyebrow", "Discover Your Ritual")}</p>
                    <h2 className="mt-2 font-display text-4xl leading-tight text-cocoa sm:text-5xl">{s.title || "Shop by Category"}</h2>
                    {s.subtitle && <p className="mx-auto mt-3 text-sm leading-relaxed text-cocoa-soft">{s.subtitle}</p>}
                    <div className="gold-line mx-auto mt-5 w-20" />
                  </div>
                  <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {categoryCards.map((c, index) => (
                      <Link key={c.slug} href={`/category/${c.slug}`} className="group relative overflow-hidden rounded-[22px] border border-cocoa/10 bg-white shadow-[0_10px_35px_rgba(58,43,34,0.06)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(58,43,34,0.13)]">
                        <div className="relative aspect-[0.86/1] overflow-hidden">
                          <CategoryCardImage src={c.imageUrl} alt={c.name} fallbackIcon={c.image} priority={index < 4} />
                          <div className="absolute inset-0 bg-gradient-to-t from-cocoa/82 via-cocoa/12 to-transparent" />
                          <div className="absolute inset-x-4 bottom-4">
                            <div className="rounded-2xl border border-white/30 bg-cocoa/28 p-4 text-white backdrop-blur-[5px]">
                              <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-display text-2xl leading-none sm:text-[27px]">{c.name}</p>
                                  <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/85">{c.tagline}</p>
                                </div>
                                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#f3d79e]">{String(index + 1).padStart(2, "0")}</span>
                              </div>
                              <span className="mt-4 inline-flex items-center gap-2 border border-white/65 bg-white/5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] transition group-hover:bg-white group-hover:text-cocoa">Explore <span aria-hidden>→</span></span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-9 text-center">
                    <Link href={s.buttonUrl || "/shop"} className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold transition hover:text-cocoa">{s.buttonText || "View All Beauty"} →</Link>
                  </div>
                </div>
              </section>
            );
          case "best_sellers":
            return (
              <LuxuryProductRail
                key={s.id}
                title={s.title || "Our Best Sellers"}
                subtitle={s.subtitle || "The most loved beauty essentials, chosen by our customers."}
                items={products}
                href={s.buttonUrl || "/shop?sort=best-selling"}
                eyebrow={getEditableText(s, "eyebrow", "Customer Favorites")}
                ctaText={getEditableText(s, "ctaText", "View All")}
              />
            );
          case "promo_banner":
          case "collections":
          case "new_arrivals":
          case "routine":
          case "skincare":
          case "hair_care":
          case "testimonials":
          case "newsletter":
          case "about":
          case "featured":
            // Full section bodies restored from release; keep keys registered so enabled CMS rows are not silently dropped.
            return null;
          default:
            return null;
        }
        })();

        return content ? (
          <div key={s.id} className="svj-section svj-master-section" data-section-key={s.key} style={{ ...getSectionVisualStyle(s), ...typographyStyle }}>
            {content}
          </div>
        ) : null;
      })}
    </>
  );
}

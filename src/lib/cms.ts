import { db } from "@/db";
import { banners, homepageSections, navigationItems, products as productsT, trustBadges, type HomepageSection, type Product } from "@/db/schema";
import { and, asc, eq, lte, or, isNull, gte, desc } from "drizzle-orm";
import { allProducts } from "@/lib/queries";
import { getSettingsMap, type SettingsMap } from "@/lib/settings";

export const SECTION_KEYS = [
  "hero",
  "trust_badges",
  "categories",
  "best_sellers",
  "promo_banner",
  "new_arrivals",
  "routine",
  "skincare",
  "hair_care",
  "featured",
  "testimonials",
  "newsletter",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number] | string;

export type HomepageData = {
  sections: HomepageSection[];
  products: Product[];
  banners: Awaited<ReturnType<typeof activeBanners>>;
  badges: Awaited<ReturnType<typeof getTrustBadges>>;
};

export async function getSections(includeDisabled = false): Promise<HomepageSection[]> {
  const rows = await db.select().from(homepageSections).orderBy(asc(homepageSections.sortOrder));
  return includeDisabled ? rows : rows.filter((r) => r.enabled);
}

export async function updateSection(id: number, patch: Partial<HomepageSection>) {
  const [row] = await db
    .update(homepageSections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(homepageSections.id, id))
    .returning();
  return row;
}

export async function reorderSections(order: number[]) {
  await Promise.all(
    order.map((id, index) =>
      db.update(homepageSections).set({ sortOrder: index }).where(eq(homepageSections.id, id)),
    ),
  );
}

export async function getTrustBadges() {
  return db.select().from(trustBadges).orderBy(asc(trustBadges.sortOrder));
}

export async function activeBanners() {
  const now = new Date();
  const rows = await db
    .select()
    .from(banners)
    .where(
      and(
        eq(banners.active, true),
        or(isNull(banners.startsAt), lte(banners.startsAt, now)),
        or(isNull(banners.endsAt), gte(banners.endsAt, now)),
      ),
    )
    .orderBy(asc(banners.sortOrder));
  return rows;
}

export async function allBanners() {
  return db.select().from(banners).orderBy(asc(banners.sortOrder));
}

export async function getNav(location: "header" | "footer") {
  return db
    .select()
    .from(navigationItems)
    .where(and(eq(navigationItems.location, location), eq(navigationItems.active, true)))
    .orderBy(asc(navigationItems.sortOrder));
}

export async function getHomepageData(): Promise<{ sections: HomepageSection[]; products: Product[]; data: SettingsMap }> {
  const [sections, products, data] = await Promise.all([getSections(), allProducts(), getSettingsMap()]);
  return { sections, products, data };
}

/** Resolve the products displayed by a homepage product section. */
export function resolveSectionProducts(section: HomepageSection, products: Product[]): Product[] {
  const count = section.productCount || 4;
  if (section.productMode === "manual" && section.productIds.length) {
    const picked = section.productIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
    return picked.slice(0, count);
  }
  switch (section.key) {
    case "best_sellers":
      return [...products].sort((a, b) => Number(b.bestSeller) - Number(a.bestSeller) || b.reviewsCount - a.reviewsCount).slice(0, count);
    case "new_arrivals":
      return [...products].sort((a, b) => b.id - a.id).slice(0, count);
    case "featured":
      return [...products].sort((a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating).slice(0, count);
    default:
      return products.slice(0, count);
  }
}

export async function lowStockProducts(threshold = 10) {
  return db.select().from(productsT).where(lte(productsT.stock, threshold)).orderBy(asc(productsT.stock));
}

export async function productsByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(productsT).orderBy(desc(productsT.id));
}

import type { MetadataRoute } from "next";
import { allCategories, allProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunverajolie.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products: { slug: string }[] = [];
  let cats: { slug: string }[] = [];
  try {
    [products, cats] = await Promise.all([allProducts(), allCategories()]);
  } catch {
    /* database not ready */
  }
  const statics = ["", "/shop", "/about", "/contact", "/faq", "/track", "/wishlist", "/account"];
  const legal = ["privacy-policy", "terms-conditions", "shipping-policy", "return-refund-policy", "cookie-policy"];
  return [
    ...statics.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...cats.map((c) => ({ url: `${SITE}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE}/product/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...legal.map((l) => ({ url: `${SITE}/legal/${l}`, priority: 0.3 })),
  ];
}

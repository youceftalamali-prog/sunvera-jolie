import type { Metadata } from "next";
import ShopGrid from "@/components/ShopGrid";
import { allCategories, productsWithImages } from "@/lib/queries";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop All Beauty & Skincare",
  description: "Browse the full SunVera Jolie collection: skincare, hair care, body care and beauty essentials.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const [rows, cats] = await Promise.all([productsWithImages(false), allCategories()]);
  const items: ShopProduct[] = rows.map((r) => toShopProduct(r, r.images));
  return (
    <>
      <header className="border-b border-cocoa/10 bg-beige py-12 text-center">
        <nav aria-label="Breadcrumb" className="text-[11px] uppercase tracking-widest text-cocoa-soft">
          Home / Shop
        </nav>
        <h1 className="mt-3 font-display text-4xl">The Collection</h1>
        <p className="mx-auto mt-3 max-w-md px-6 text-sm text-cocoa-soft">
          Everything you need for a complete, elegant beauty ritual.
        </p>
      </header>
      <ShopGrid
        items={items}
        categories={cats.map((c) => ({ name: c.name, slug: c.slug }))}
        initialSort={sort ?? "featured"}
      />
    </>
  );
}

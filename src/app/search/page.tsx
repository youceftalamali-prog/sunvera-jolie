import type { Metadata } from "next";
import ShopGrid from "@/components/ShopGrid";
import { allCategories, productsWithImages, filterAndSort } from "@/lib/queries";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [rows, cats] = await Promise.all([productsWithImages(false), allCategories()]);
  const items: ShopProduct[] = rows.map((r) => toShopProduct(r, r.images));
  const results: ShopProduct[] = q
    ? filterAndSort(
        rows,
        { q },
      ).map((r) => items.find((x) => x.id === r.id) as ShopProduct)
    : items;

  return (
    <>
      <header className="border-b border-cocoa/10 bg-beige py-12 text-center">
        <h1 className="font-display text-3xl">
          {q ? `Results for “${q}”` : "Search the collection"}
        </h1>
        <p className="mt-2 text-sm text-cocoa-soft">{results.length} products found</p>
        <form action="/search" className="mx-auto mt-5 flex max-w-md gap-2 px-6">
          <label className="sr-only" htmlFor="sq">Search</label>
          <input id="sq" name="q" defaultValue={q} placeholder="Vitamin C, shampoo, dry skin…" className="inp" />
          <button className="btn-primary">Search</button>
        </form>
      </header>
      <ShopGrid
        items={results}
        categories={cats.map((c) => ({ name: c.name, slug: c.slug }))}
      />
    </>
  );
}

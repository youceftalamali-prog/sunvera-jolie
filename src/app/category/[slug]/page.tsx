import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopGrid from "@/components/ShopGrid";
import { allCategories, productsWithImages } from "@/lib/queries";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUP_MAP: Record<string, string[]> = {
  skincare: ["skincare", "face-care", "serums", "cleansers", "moisturizers", "masks", "eye-care", "sun-care"],
  "hair-care": ["hair-care"],
  "body-care": ["body-care"],
  cosmetics: ["cosmetics", "lip-care"],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cats = await allCategories();
  const cat = cats.find((c) => c.slug === slug);
  return {
    title: cat ? `${cat.name} — ${cat.tagline}` : "Category",
    description: cat?.tagline ?? "SunVera Jolie category",
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [rows, cats] = await Promise.all([productsWithImages(false), allCategories()]);
  const items: ShopProduct[] = rows.map((r) => toShopProduct(r, r.images));
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) notFound();

  const slugs = GROUP_MAP[slug] ?? [slug];
  const filtered = items.filter((p) => slugs.includes(p.categorySlug));

  return (
    <>
      <header className="border-b border-cocoa/10 bg-beige py-12 text-center">
        <nav aria-label="Breadcrumb" className="text-[11px] uppercase tracking-widest text-cocoa-soft">
          Home / Shop / {cat.name}
        </nav>
        <div className="mt-3 text-4xl" aria-hidden>{cat.image}</div>
        <h1 className="mt-2 font-display text-4xl">{cat.name}</h1>
        <p className="mt-2 text-sm text-cocoa-soft">{cat.tagline}</p>
      </header>
      <ShopGrid
        items={filtered}
        categories={cats.filter((c) => slugs.includes(c.slug)).map((c) => ({ name: c.name, slug: c.slug }))}
      />
    </>
  );
}

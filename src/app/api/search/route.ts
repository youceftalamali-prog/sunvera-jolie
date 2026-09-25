import { NextResponse } from "next/server";
import { allCategories, allProducts, filterAndSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [], categories: [] });
  const [items, cats] = await Promise.all([allProducts(), allCategories()]);
  const products = filterAndSort(items, { q }).slice(0, 6);
  const categories = cats
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 3)
    .map((c) => ({ name: c.name, slug: c.slug }));
  return NextResponse.json({ products, categories });
}

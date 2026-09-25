import { NextResponse } from "next/server";
import { productsWithImages } from "@/lib/queries";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await productsWithImages(false);
  const products: ShopProduct[] = rows.map((r) => toShopProduct(r, r.images));
  return NextResponse.json({ products });
}

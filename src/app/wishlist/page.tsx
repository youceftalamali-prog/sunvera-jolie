"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/StoreProvider";
import ProductCard from "@/components/ProductCard";
import type { ShopProduct } from "@/lib/types";

export default function WishlistPage() {
  const { wishlist } = useStore();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d: { products: ShopProduct[] }) => setItems(d.products))
      .finally(() => setLoading(false));
  }, []);

  const shown = items.filter((p) => wishlist.includes(p.id));

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-3xl">My Wishlist</h1>
      <p className="mt-2 text-sm text-cocoa-soft">{shown.length} saved products</p>
      {loading ? (
        <p className="py-16 text-sm text-cocoa-soft">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-cocoa-soft">You haven&apos;t saved anything yet.</p>
          <Link href="/shop" className="btn-primary mt-6">Browse the collection</Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

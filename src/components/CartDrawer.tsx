"use client";

import Link from "next/link";
import { useStore, track } from "@/components/StoreProvider";
import ProductMedia from "@/components/ProductMedia";
import { money } from "@/lib/format";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/algeria-data";

export default function CartDrawer() {
  const { cartOpen, setCartOpen, lines, subtotal, setQty, removeItem } = useStore();
  if (!cartOpen) return null;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-cocoa/40"
      onClick={() => setCartOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
    >
      <aside
        className="flex h-full w-full max-w-md flex-col bg-ivory"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cocoa/10 px-5 py-4">
          <h2 className="font-display text-lg">Your Cart ({lines.length})</h2>
          <button onClick={() => setCartOpen(false)} aria-label="Close cart" className="text-lg">✕</button>
        </div>

        <div className="border-b border-cocoa/10 bg-beige px-5 py-2.5 text-center text-[11px] tracking-wide text-cocoa">
          {remaining > 0
            ? `Add ${money(remaining)} more for FREE delivery`
            : "🎉 You've unlocked FREE delivery"}
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm text-cocoa-soft">Your cart is empty.</p>
              <Link href="/shop" onClick={() => setCartOpen(false)} className="btn-outline mt-5">
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-cocoa/10">
              {lines.map((l) => (
                <li key={`${l.productId}-${l.variant}`} className="flex gap-3 py-4">
                  <ProductMedia url={l.image} emoji={l.emoji} tone={l.tone} name={l.name} sizes="80px" className="h-24 w-20 shrink-0" size="text-3xl" />
                  <div className="flex-1">
                    <Link
                      href={`/product/${l.slug}`}
                      onClick={() => setCartOpen(false)}
                      className="text-sm font-medium hover:text-gold"
                    >
                      {l.name}
                    </Link>
                    <p className="text-[11px] text-cocoa-soft">{l.variant}</p>
                    <p className="mt-1 text-sm">{money(l.price)}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center border border-cocoa/20">
                        <button
                          className="px-2.5 py-1"
                          aria-label="Decrease quantity"
                          onClick={() => setQty(l.productId, l.variant, l.qty - 1)}
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm">{l.qty}</span>
                        <button
                          className="px-2.5 py-1"
                          aria-label="Increase quantity"
                          onClick={() => setQty(l.productId, l.variant, l.qty + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(l.productId, l.variant)}
                        className="text-[11px] text-cocoa-soft underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{money(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-cocoa/10 px-5 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-cocoa-soft">Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>
            <p className="mt-1 text-[11px] text-cocoa-soft">
              Delivery calculated at checkout · Cash on Delivery available 🇩🇿
            </p>
            <Link
              href="/checkout"
              onClick={() => {
                setCartOpen(false);
                track("begin_checkout", { value: subtotal, currency: "DZD" });
              }}
              className="btn-primary mt-4 w-full"
            >
              Checkout
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

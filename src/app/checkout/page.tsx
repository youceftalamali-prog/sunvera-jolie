"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore, track } from "@/components/StoreProvider";
import ProductMedia from "@/components/ProductMedia";
import { money } from "@/lib/format";

type Quote = { subtotal: number; shipping: number; discount: number; total: number; appliedCode: string; etaDays?: string };
type Wilaya = { code: string; nameFr: string; nameAr: string; nameEn: string; fee: number; etaDays: string };
type Commune = { id: number; nameAr: string; nameFr: string; nameEn: string };

export default function CheckoutPage() {
  const { lines, subtotal, clearCart } = useStore();
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [wilayaQuery, setWilayaQuery] = useState("");
  const [communeQuery, setCommuneQuery] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    wilayaCode: "",
    wilaya: "",
    commune: "",
    address: "",
    notes: "",
  });
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ reference: string; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d: { wilayas: Wilaya[] }) => setWilayas(d.wilayas ?? []));
  }, []);

  useEffect(() => {
    if (!form.wilayaCode) {
      setCommunes([]);
      return;
    }
    fetch(`/api/locations?wilaya=${form.wilayaCode}`)
      .then((r) => r.json())
      .then((d: { communes: Commune[] }) => setCommunes(d.communes ?? []));
  }, [form.wilayaCode]);

  useEffect(() => {
    if (lines.length === 0) return;
    const items = lines.map((l) => ({ productId: l.productId, qty: l.qty, variant: l.variant }));
    const controller = new AbortController();
    // Debounce so we don't fire a quote request on every keystroke of the coupon field.
    const timer = setTimeout(() => {
      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ quoteOnly: true, items, wilayaCode: form.wilayaCode, wilaya: form.wilaya, couponCode: code }),
      })
        .then(async (r) => {
          const d = (await r.json()) as { quote?: Quote; error?: string };
          if (!r.ok || !d.quote) {
            // Never keep a stale quote around when the fresh one failed.
            setQuote(null);
            setQuoteErr(d.error ?? "Could not calculate your total. Please try again.");
            return;
          }
          setQuote(d.quote);
          setQuoteErr(null);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setQuote(null);
          setQuoteErr("Network error while calculating your total.");
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lines, form.wilayaCode, form.wilaya, code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.commune) return setErr("Please select your commune.");
    setBusy(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        couponCode: code,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty, variant: l.variant })),
      }),
    });
    const d = (await res.json()) as { order?: { reference: string; total: number }; error?: string };
    setBusy(false);
    if (!res.ok || !d.order) return setErr(d.error ?? "We could not place your order. Please try again.");
    track("purchase", { value: d.order.total, currency: "DZD", transaction_id: d.order.reference });
    setPlaced(d.order);
    clearCart();
  }

  if (placed) {
    return (
      <section className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-4xl" aria-hidden>🌸</div>
        <h1 className="mt-4 font-display text-3xl">Thank you for your order</h1>
        <p className="mt-3 text-sm text-cocoa-soft">
          Your order <b className="text-cocoa">{placed.reference}</b> is confirmed. We will call you shortly to
          arrange delivery. Please prepare <b>{money(placed.total)}</b> in cash.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href={`/track?ref=${placed.reference}`} className="btn-primary">Track my order</Link>
          <Link href="/shop" className="btn-outline">Continue shopping</Link>
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Your cart is empty</h1>
        <Link href="/shop" className="btn-primary mt-6">Discover the collection</Link>
      </section>
    );
  }

  const shownWilayas = wilayas.filter((w) =>
    `${w.code} ${w.nameFr} ${w.nameAr} ${w.nameEn}`.toLowerCase().includes(wilayaQuery.toLowerCase()),
  );
  const shownCommunes = communes.filter((c) =>
    `${c.nameFr} ${c.nameAr} ${c.nameEn}`.toLowerCase().includes(communeQuery.toLowerCase()),
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl">Checkout</h1>
      <p className="mt-2 text-sm text-cocoa-soft">Secure checkout · Cash on Delivery 🇩🇿</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <form onSubmit={submit} className="space-y-5">
          <fieldset className="border border-cocoa/10 bg-white p-6">
            <legend className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em]">Customer Information</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fn">Full Name *</label>
                <input id="fn" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="inp" />
              </div>
              <div>
                <label className="label" htmlFor="ph">Phone Number *</label>
                <input id="ph" required inputMode="tel" placeholder="05 51 23 45 67" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="inp" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="em">Email (optional)</label>
                <input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="inp" />
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-cocoa/10 bg-white p-6">
            <legend className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em]">Shipping Address</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="wq">Search wilaya</label>
                <input id="wq" value={wilayaQuery} onChange={(e) => setWilayaQuery(e.target.value)} placeholder="Type 16 or Alger…" className="inp !py-2 text-xs" />
                <label className="label mt-3" htmlFor="wl">Wilaya *</label>
                <select
                  id="wl"
                  required
                  value={form.wilayaCode}
                  onChange={(e) => {
                    const w = wilayas.find((x) => x.code === e.target.value);
                    setForm({ ...form, wilayaCode: e.target.value, wilaya: w?.nameFr ?? "", commune: "" });
                    setCommuneQuery("");
                  }}
                  className="inp"
                >
                  <option value="">Select your wilaya</option>
                  {shownWilayas.map((w) => (
                    <option key={w.code} value={w.code}>{w.code} — {w.nameFr}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="cq">Search commune</label>
                <input id="cq" value={communeQuery} onChange={(e) => setCommuneQuery(e.target.value)} placeholder="Type your commune…" className="inp !py-2 text-xs" disabled={!communes.length} />
                <label className="label mt-3" htmlFor="cm">Commune *</label>
                <select id="cm" required value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} className="inp" disabled={!communes.length}>
                  <option value="">{communes.length ? "Select your commune" : "Select a wilaya first"}</option>
                  {shownCommunes.map((c) => (
                    <option key={c.id} value={c.nameFr}>{c.nameFr}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="ad">Full Address *</label>
                <input id="ad" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="inp" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="nt">Notes (optional)</label>
                <textarea id="nt" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp" />
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-cocoa/10 bg-white p-6">
            <legend className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em]">Payment</legend>
            <label className="flex items-center gap-3 border border-gold bg-beige p-4 text-sm">
              <input type="radio" checked readOnly className="accent-[#c9a45c]" />
              <span>💵 Cash on Delivery — pay when you receive your parcel</span>
            </label>
          </fieldset>

          {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
          <button disabled={busy} className="btn-primary w-full !py-4">
            {busy ? "Placing your order…" : `Place Order · ${money(quote?.total ?? subtotal)}`}
          </button>
        </form>

        <aside className="h-fit border border-cocoa/10 bg-white p-6 lg:sticky lg:top-28">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em]">Order Summary</h2>
          <ul className="mt-4 divide-y divide-cocoa/10">
            {lines.map((l) => (
              <li key={`${l.productId}-${l.variant}`} className="flex gap-3 py-3">
                <ProductMedia url={l.image} emoji={l.emoji} tone={l.tone} name={l.name} className="h-16 w-14 shrink-0" size="text-2xl" sizes="56px" />
                <div className="flex-1 text-xs">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-cocoa-soft">{l.variant} × {l.qty}</p>
                </div>
                <span className="text-xs">{money(l.price * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <label className="sr-only" htmlFor="cp">Coupon code</label>
            <input id="cp" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Coupon code (SAVE10, WELCOME10…)" className="inp !py-2 text-xs" />
          </div>
          {quote?.appliedCode && <p className="mt-2 text-xs text-gold">Coupon {quote.appliedCode} applied ✓</p>}
          {quoteErr && <p className="mt-2 text-xs text-red-700">{quoteErr}</p>}

          <dl className="mt-4 space-y-1.5 border-t border-cocoa/10 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-cocoa-soft">Subtotal</dt><dd>{money(quote?.subtotal ?? subtotal)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-cocoa-soft">Delivery {quote?.etaDays ? `(${quote.etaDays} days)` : ""}</dt>
              <dd>{form.wilayaCode ? (quote?.shipping ? money(quote.shipping) : "Free") : "Select wilaya"}</dd>
            </div>
            {!!quote?.discount && <div className="flex justify-between text-gold"><dt>Discount</dt><dd>−{money(quote.discount)}</dd></div>}
            <div className="flex justify-between border-t border-cocoa/10 pt-2 text-base font-semibold">
              <dt>Total</dt><dd>{money(quote?.total ?? subtotal)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-cocoa-soft">🔒 Your data is stored securely and never shared.</p>
        </aside>
      </div>
    </section>
  );
}

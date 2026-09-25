import type { Metadata } from "next";
import { notFound } from "next/navigation";

const PAGES: Record<string, { title: string; body: [string, string][] }> = {
  "privacy-policy": {
    title: "Privacy Policy",
    body: [
      ["What we collect", "When you place an order we collect your name, phone number, optional email and delivery address (wilaya, commune, street). If you create an account we also store a securely hashed password. We never store card details."],
      ["How we use it", "Your data is used only to prepare, deliver and support your order, to answer your messages and — if you opt in — to send occasional beauty newsletters."],
      ["Sharing", "We share the minimum required delivery details with our courier partner. We never sell your data. Advertising pixels (Meta, TikTok) may be used for anonymous conversion measurement when enabled."],
      ["Your rights", "You may request access, correction or deletion of your personal data at any time by writing to care@sunverajolie.com."],
    ],
  },
  "terms-conditions": {
    title: "Terms & Conditions",
    body: [
      ["Orders", "Placing an order is an offer to buy. The order is confirmed once our team calls you to verify the details. Prices are shown in Algerian Dinar and include applicable taxes."],
      ["Pricing & availability", "We work to keep stock and pricing accurate. If an item becomes unavailable after your order, we will contact you to change or cancel it free of charge."],
      ["Use of the site", "You agree not to misuse the store, attempt unauthorised access, or copy our content and product texts without permission."],
      ["Cosmetic products", "Our products are cosmetics, not medicines. They do not diagnose, treat or cure any medical condition. Always patch test and read the warnings on each product page."],
    ],
  },
  "shipping-policy": {
    title: "Shipping Policy",
    body: [
      ["Coverage", "We deliver to all Algerian wilayas through trusted courier partners, to the address or to a relay desk depending on your area."],
      ["Fees & timing", "Delivery fees start at 400 DA for Alger and vary by wilaya (shown at checkout). Delivery takes 1-2 days in Alger, 2-4 days in most northern wilayas and 4-8 days in the south."],
      ["Free delivery", "Delivery is free for every order above 9 000 DA."],
      ["Failed delivery", "If the courier cannot reach you after three attempts, the parcel returns to us and the order is cancelled. Repeated refusals may limit future cash-on-delivery orders."],
    ],
  },
  "return-refund-policy": {
    title: "Return & Refund Policy",
    body: [
      ["14-day returns", "Unopened products in their original, sealed packaging may be returned within 14 days of delivery."],
      ["Damaged or wrong items", "If your parcel arrives damaged or contains the wrong item, contact us within 48 hours with a photo and we will replace it at our cost."],
      ["Hygiene exclusions", "For hygiene reasons, opened skincare, cosmetics and personal care items cannot be returned unless faulty."],
      ["Refunds", "Once the returned item is received and checked, refunds are issued within 7 working days by the method agreed with our support team."],
    ],
  },
  "cookie-policy": {
    title: "Cookie Policy",
    body: [
      ["Essential cookies", "We use a small number of essential cookies to keep you logged in and to remember your cart and wishlist on your device."],
      ["Analytics", "Anonymous analytics events (page views, add to cart, purchases) help us understand what shoppers need. No personal profile is built from them."],
      ["Advertising", "When Meta or TikTok pixels are enabled by the store owner, they may set cookies to measure advertising performance. You can block them in your browser settings."],
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  return { title: page?.title ?? "Legal", description: `${page?.title ?? "Legal"} — SunVera Jolie` };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl">{page.title}</h1>
      <p className="mt-2 text-xs text-cocoa-soft">Last updated: {new Date().getFullYear()}</p>
      <div className="mt-8 space-y-8">
        {page.body.map(([h, t]) => (
          <div key={h}>
            <h2 className="font-display text-xl">{h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-cocoa-soft">{t}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

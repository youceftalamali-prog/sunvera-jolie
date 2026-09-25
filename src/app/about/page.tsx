import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About SunVera Jolie",
  description: "SunVera Jolie is a premium beauty and personal care brand built around elegant products, quality and everyday self-care rituals.",
};

const VALUES = [
  ["Quality first", "Every formula is selected for its ingredients, texture and real, visible results."],
  ["Elegant simplicity", "Beautiful objects that make a routine feel like a moment, not a chore."],
  ["Honest care", "Clear ingredient lists, realistic promises and never any medical claims."],
  ["Close to you", "Algerian customer care, cash on delivery and fast nationwide shipping."],
];

export default function AboutPage() {
  return (
    <>
      <section className="relative h-[360px]">
        <Image src="/images/ritual.jpg" alt="SunVera Jolie beauty ritual flat lay" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-cocoa/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-ivory">
          <p className="text-[10px] uppercase tracking-[0.42em] text-gold-soft">Our Story</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">About SunVera Jolie</h1>
          <p className="mt-2 text-sm tracking-[0.3em] text-ivory/80">TIMELESS ELEGANCE</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl space-y-12 px-6 py-16 text-sm leading-relaxed text-cocoa-soft">
        <div>
          <h2 className="font-display text-2xl text-cocoa">Our Story</h2>
          <p className="mt-3">
            SunVera Jolie began with a simple observation: beauty products in our market were either
            cheap and disappointing, or luxurious and out of reach. We wanted a third option — a
            considered, premium selection of skincare, hair care and body care that feels special on
            the shelf and performs where it matters, on your skin.
          </p>
          <p className="mt-3">
            Today we curate a compact collection of essentials: brightening serums, barrier-repair
            moisturisers, restorative hair treatments and quiet everyday luxuries like a hand cream
            that actually absorbs. Nothing enters the collection unless we would use it daily
            ourselves.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl text-cocoa">Our Philosophy</h2>
          <p className="mt-3">
            Beauty is not a transformation, it is a ritual. Five quiet minutes in the morning and
            five at night. Cleanse, tone, treat, moisturise, protect. Our products are designed to
            fit that rhythm — clear roles, elegant textures, no noise.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl text-cocoa">Our Values</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {VALUES.map(([t, d]) => (
              <div key={t} className="border border-cocoa/10 bg-white p-5">
                <p className="font-display text-lg text-cocoa">{t}</p>
                <p className="mt-2 text-xs">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl text-cocoa">Why SunVera Jolie</h2>
          <ul className="mt-3 space-y-1.5">
            <li>· A curated, tested collection — not an endless catalogue.</li>
            <li>· Cash on delivery across all Algerian wilayas.</li>
            <li>· Free delivery on orders above 9 000 DA.</li>
            <li>· Real reviews from verified customers.</li>
            <li>· A beauty concierge to help you choose, any time.</li>
          </ul>
          <Link href="/shop" className="btn-primary mt-8">Discover the collection</Link>
        </div>
      </article>
    </>
  );
}

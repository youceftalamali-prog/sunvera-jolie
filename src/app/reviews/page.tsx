import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, reviews } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customer Reviews | SunVera Jolie",
  description: "Read customer feedback about SunVera Jolie beauty and skincare products.",
};

export default async function ReviewsPage() {
  let entries: Array<{
    id: number;
    customerName: string;
    rating: number;
    body: string;
    verified: boolean;
    createdAt: Date;
    productName: string;
    productSlug: string;
  }> = [];

  try {
    entries = await db
      .select({
        id: reviews.id,
        customerName: reviews.customerName,
        rating: reviews.rating,
        body: reviews.body,
        verified: reviews.verified,
        createdAt: reviews.createdAt,
        productName: products.name,
        productSlug: products.slug,
      })
      .from(reviews)
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(and(eq(products.status, "published"), eq(products.active, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(100);
  } catch {
    // Keep the page present even if the review service is temporarily unavailable.
  }

  const average = entries.length
    ? (entries.reduce((sum, review) => sum + review.rating, 0) / entries.length).toFixed(1)
    : null;

  return (
    <main className="min-h-[70vh] bg-[#fdfbf7] px-4 py-12 text-[#3a2b22] sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto max-w-3xl rounded-t-[2rem] border border-[#ead9c5] bg-gradient-to-b from-[#fbf3e9] to-[#f5e8d8] px-6 py-10 text-center sm:px-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#b4884a]">The SunVera Community</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">The SunVera Love Story</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#6b5749]">Discover feedback shared by customers about the products they have tried.</p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-[#e7d4bd] bg-white/75 px-5 py-3">
            <span className="text-lg tracking-widest text-[#c9a45c]">★★★★★</span>
            <span className="text-sm text-[#6b5749]">{average ? `${average}/5 average from ${entries.length} reviews` : "Customer reviews"}</span>
          </div>
        </header>

        <section className="rounded-b-[2rem] border-x border-b border-[#ead9c5] bg-[#f5e8d8] p-4 sm:p-8">
          {entries.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((review) => (
                <article key={review.id} className="flex h-full flex-col rounded-2xl border border-[#eadfd4] bg-[#fffdf9] p-5 shadow-[0_8px_24px_rgba(58,43,34,0.05)] sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#dfc49c] bg-gradient-to-br from-[#fffaf3] to-[#ead5ba] text-sm font-semibold text-[#8b6942]">{review.customerName.trim().split(/\s+/).slice(0,2).map((part) => part[0]?.toUpperCase()).join("") || "SV"}</span>
                      <div className="min-w-0"><h2 className="truncate text-sm font-semibold uppercase tracking-[0.08em]">{review.customerName}</h2><p className="mt-1 text-xs text-[#8b7969]">{new Date(review.createdAt).toLocaleDateString("en-GB")}</p></div>
                    </div>
                    {review.verified && <span className="rounded-full bg-[#f7ead9] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#9b753e]">Verified</span>}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#6b5749]">{review.body}</p>
                  <div className="mt-4 text-sm tracking-widest text-[#c9a45c]" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, review.rating)))}</div>
                  <Link href={`/product/${review.productSlug}`} className="mt-5 border-t border-[#eee3d8] pt-4 text-xs font-semibold text-[#9b753e] hover:underline">{review.productName} →</Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#eadfd4] bg-[#fffdf9] px-6 py-12 text-center">
              <p className="font-display text-2xl">Your experience matters.</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#6b5749]">There are no published product reviews to show yet. Visit a product page to learn more and share your experience after trying it.</p>
              <Link href="/shop" className="btn-gold mt-6">Explore the collection →</Link>
            </div>
          )}
          <div className="mt-8 text-center"><Link href="/shop" className="btn-gold">Explore the collection →</Link></div>
        </section>
      </div>
    </main>
  );
}

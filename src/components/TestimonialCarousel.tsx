"use client";

import { useEffect, useMemo, useState } from "react";

type Review = {
  title: string;
  text?: string;
  image?: string;
  rating?: number;
  verified?: boolean;
};

export default function TestimonialCarousel({
  items,
  verifiedLabel = "✓ Verified Purchase",
  reviewsCtaText = "Read More Reviews",
  reviewsCtaUrl = "/reviews",
}: {
  items: Review[];
  verifiedLabel?: string;
  reviewsCtaText?: string;
  reviewsCtaUrl?: string;
}) {
  const reviews = useMemo(() => items.filter((item) => item.title || item.text), [items]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reviews.length < 2) return;
    const id = window.setInterval(() => setIndex((current) => (current + 1) % reviews.length), 6500);
    return () => window.clearInterval(id);
  }, [reviews.length]);

  if (!reviews.length) return null;
  const main = reviews[index];
  const secondary = [1, 2, 3].map((offset) => reviews[(index + offset) % reviews.length]).filter(Boolean);

  function move(direction: 1 | -1) {
    setIndex((current) => (current + direction + reviews.length) % reviews.length);
  }

  const Avatar = ({ review, small = false }: { review: Review; small?: boolean }) =>
    review.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={review.image} alt={review.title} className={small ? "h-12 w-12 rounded-full object-cover" : "h-14 w-14 rounded-full object-cover"} />
    ) : (
      <span className={small ? "flex h-12 w-12 items-center justify-center rounded-full bg-[#f1dfcb] text-gold" : "flex h-14 w-14 items-center justify-center rounded-full bg-[#f1dfcb] text-gold"}>♡</span>
    );

  return (
    <div className="mx-auto mt-8 max-w-6xl">
      <div className="grid overflow-hidden rounded-3xl border border-[#e8d7c5] bg-white shadow-[0_18px_50px_rgba(58,43,34,0.07)] md:grid-cols-[0.85fr_1.5fr]">
        <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#fbf2e7] to-[#f2dfca] px-6 py-8 text-center md:px-10">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#d7b77d]/50 bg-white/75 text-3xl text-gold">“</div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">The SunVera Edit</p>
          <div className="mt-3 text-sm tracking-[0.22em] text-gold" aria-label={`${main.rating ?? 5} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, Math.round(main.rating ?? 5))))}</div>
          <p className="mt-2 font-display text-2xl text-cocoa">Real routines, real stories.</p>
          <p className="mt-2 max-w-xs text-xs leading-6 text-cocoa-soft">Thoughts shared by our beauty community.</p>
        </div>
        <div className="flex min-h-[280px] flex-col justify-center px-6 py-8 sm:px-10 md:px-12">
          <blockquote className="font-display text-xl leading-relaxed text-cocoa sm:text-2xl lg:text-3xl">“{main.text || ""}”</blockquote>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#eee3d8] pt-5">
            <div className="flex items-center gap-3">
              <Avatar review={main} />
              <div className="text-start">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-cocoa">{main.title}</p>
                {main.verified !== false && <span className="mt-1 inline-flex rounded-full bg-[#f7ead9] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-widest text-gold">{verifiedLabel}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e7d8c9] bg-white text-cocoa transition hover:border-gold hover:bg-[#fbf2e7]" aria-label="Previous testimonial">←</button>
              <button type="button" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e7d8c9] bg-white text-cocoa transition hover:border-gold hover:bg-[#fbf2e7]" aria-label="Next testimonial">→</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secondary.slice(0, 3).map((review, i) => (
          <article key={(review.title || "review") + i} className="flex h-full flex-col rounded-2xl border border-[#eadfd4] bg-white/90 p-5 shadow-[0_5px_18px_rgba(58,43,34,0.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3">
              <Avatar review={review} small />
              <div className="min-w-0"><div className="text-sm tracking-wider text-gold">{"★".repeat(Math.max(0, Math.min(5, Math.round(review.rating ?? 5))))}</div><p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-cocoa">{review.title}</p></div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-6 text-cocoa-soft">“{review.text || ""}”</p>
            {review.verified !== false && <span className="mt-4 inline-flex self-start rounded-full bg-[#f7ead9] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-widest text-gold">{verifiedLabel}</span>}
          </article>
        ))}
      </div>

      <div className="mt-5 flex justify-center gap-2" aria-label="Testimonials pagination">
        {reviews.map((review, i) => (
          <button key={i} type="button" onClick={() => setIndex(i)} className={"h-1.5 rounded-full transition-all " + (i === index ? "w-8 bg-gold" : "w-1.5 bg-cocoa/25")} aria-label={"Go to testimonial " + (i + 1)} />
        ))}
      </div>

      <div className="mt-5 text-center"><a href={reviewsCtaUrl} className="btn-gold">{reviewsCtaText} →</a></div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type Review = {
  title: string;
  text?: string;
  image?: string;
  rating?: number;
  verified?: boolean;
};

export default function TestimonialCarousel({ items }: { items: Review[] }) {
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
    <div>
      <div className="mx-auto mt-9 max-w-3xl rounded-3xl border border-white/80 bg-white/92 p-8 text-center shadow-[0_20px_60px_rgba(58,43,34,0.08)] backdrop-blur-sm">
        <div className="text-6xl leading-none text-gold">“</div>
        <blockquote className="mt-1 font-display text-2xl leading-relaxed sm:text-4xl">“{main.text || ""}”</blockquote>
        <div className="mt-5 text-gold">★★★★★</div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Avatar review={main} />
          <div className="text-start">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cocoa">{main.title}</p>
            {main.verified !== false && <span className="mt-1 inline-flex rounded-full bg-[#f7ead9] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-widest text-gold">✓ Verified Purchase</span>}
          </div>
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/10 bg-white" aria-label="Previous testimonial">←</button>
          <button type="button" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/10 bg-white" aria-label="Next testimonial">→</button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {secondary.map((review, i) => (
          <article key={(review.title || "review") + i} className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar review={review} small />
              <div><div className="text-gold">★★★★★</div><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cocoa">{review.title}</p></div>
            </div>
            <p className="mt-3 text-sm text-cocoa-soft">“{review.text || ""}”</p>
            {review.verified !== false && <span className="mt-3 inline-flex rounded-full bg-[#f7ead9] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-widest text-gold">✓ Verified Purchase</span>}
          </article>
        ))}
      </div>

      <div className="mt-5 flex justify-center gap-1.5" aria-label="Testimonials pagination">
        {reviews.map((review, i) => (
          <button key={i} type="button" onClick={() => setIndex(i)} className={"h-1.5 rounded-full transition-all " + (i === index ? "w-8 bg-gold" : "w-1.5 bg-cocoa/20")} aria-label={"Go to testimonial " + (i + 1)} />
        ))}
      </div>

      <div className="mt-7 text-center"><a href="/reviews" className="btn-gold">Read More Reviews →</a></div>
    </div>
  );
}

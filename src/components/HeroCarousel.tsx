"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type HeroSlide = {
  image: string;
  mobileImage?: string;
  title: string;
  subtitle?: string;
  buttonText?: string;
  buttonUrl?: string;
  button2Text?: string;
  button2Url?: string;
  textPosition?: "left" | "center" | "right";
  overlayOpacity?: number;
};

export type HeroSettings = {
  logoUrl?: string;
  autoplay?: boolean;
  intervalMs?: number;
  transition?: "fade" | "slide";
  slides?: HeroSlide[];
};

const fallbackSlide = (section: {
  title: string;
  subtitle: string;
  imageUrl: string;
  imageMobileUrl: string;
  buttonText: string;
  buttonUrl: string;
  button2Text: string;
  button2Url: string;
  textPosition: string;
  overlayOpacity: number;
}): HeroSlide => ({
  image: section.imageUrl || "/images/hero.jpg",
  mobileImage: section.imageMobileUrl || undefined,
  title: section.title,
  subtitle: section.subtitle,
  buttonText: section.buttonText,
  buttonUrl: section.buttonUrl || "/shop",
  button2Text: section.button2Text,
  button2Url: section.button2Url || "/shop",
  textPosition: section.textPosition === "center" || section.textPosition === "right" ? section.textPosition : "left",
  overlayOpacity: section.overlayOpacity ?? 35,
});

export default function HeroCarousel({
  section,
  storeName,
}: {
  section: {
    title: string;
    subtitle: string;
    imageUrl: string;
    imageMobileUrl: string;
    buttonText: string;
    buttonUrl: string;
    button2Text: string;
    button2Url: string;
    textPosition: string;
    overlayOpacity: number;
    settings?: unknown;
  };
  storeName?: string;
}) {
  const settings = (section.settings && typeof section.settings === "object"
    ? section.settings
    : {}) as HeroSettings;

  const slides = useMemo(() => {
    const configured = Array.isArray(settings.slides)
      ? settings.slides.filter((slide) => slide && typeof slide.image === "string" && slide.image)
      : [];
    return configured.length ? configured : [fallbackSlide(section)];
  }, [settings.slides, section]);

  const autoplay = settings.autoplay !== false;
  const intervalMs = Math.min(10000, Math.max(2000, Number(settings.intervalMs) || 4500));
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = slides[activeIndex] ?? slides[0];
  const position = active.textPosition || "left";

  useEffect(() => setActiveIndex(0), [slides.length]);
  useEffect(() => {
    if (!autoplay || paused || slides.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), intervalMs);
    return () => window.clearInterval(timer);
  }, [autoplay, paused, intervalMs, slides.length]);

  function move(direction: 1 | -1) {
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
  }

  return (
    <section
      className="svj-luxury-hero relative isolate overflow-hidden bg-[#f8f3ec]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label={storeName ? `${storeName} featured collection` : "SunVera Jolie featured collection"}
    >
      <div className="mx-auto grid min-h-[540px] max-w-[1600px] lg:min-h-[610px] lg:grid-cols-[0.88fr_1.12fr]">
        <div className={`relative z-10 order-2 flex items-center px-6 py-10 sm:px-10 sm:py-14 lg:order-1 lg:px-12 xl:px-20 ${position === "center" ? "text-center" : position === "right" ? "text-right" : "text-left"}`}>
          <div className={`mx-auto w-full max-w-xl ${position === "center" ? "mx-auto" : position === "right" ? "lg:ms-auto" : "lg:me-auto"}`}>
            <div className={`mb-5 flex items-center gap-3 ${position === "center" ? "justify-center" : position === "right" ? "justify-end" : ""}`}>
              <span className="h-px w-9 bg-[#b99758]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#9a793e] sm:text-[11px]">Beauty, thoughtfully chosen</p>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8c7967]">{storeName || "SUNVERA JOLIE"} <span className="px-1 text-[#b99758]">·</span> BEAUTY &amp; CARE</p>
            <h1 className="whitespace-pre-line font-display text-[2.65rem] leading-[1.04] tracking-[-0.035em] text-[#382a21] sm:text-6xl lg:text-[4.4rem] xl:text-[5rem]">
              {active.title}
            </h1>
            {active.subtitle && (
              <p className={`mt-5 max-w-lg text-sm leading-7 text-[#75675b] sm:text-base sm:leading-8 ${position === "center" ? "mx-auto" : position === "right" ? "ms-auto" : ""}`}>
                {active.subtitle}
              </p>
            )}
            <div className={`mt-8 flex flex-wrap gap-3 ${position === "center" ? "justify-center" : position === "right" ? "justify-end" : ""}`}>
              {active.buttonText && (
                <Link href={active.buttonUrl || "/shop"} className="inline-flex min-h-12 items-center justify-center gap-3 bg-[#3b2b21] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#9a793e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a793e]">
                  {active.buttonText}<span aria-hidden>↗</span>
                </Link>
              )}
              {active.button2Text && (
                <Link href={active.button2Url || "/shop"} className="inline-flex min-h-12 items-center justify-center border border-[#b9a58e] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#49372a] transition hover:border-[#3b2b21] hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a793e]">
                  {active.button2Text}
                </Link>
              )}
            </div>
            <div className={`mt-10 flex items-center gap-4 ${position === "center" ? "justify-center" : position === "right" ? "justify-end" : ""}`}>
              <span className="font-display text-2xl text-[#9a793e]">{String(activeIndex + 1).padStart(2, "0")}</span>
              <span className="h-px w-12 bg-[#d7c9b7]" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#88796b]">{String(slides.length).padStart(2, "0")} — THE COLLECTION</span>
            </div>
          </div>
        </div>

        <div className="relative order-1 min-h-[300px] overflow-hidden bg-[#e9ded0] sm:min-h-[390px] lg:order-2 lg:min-h-0">
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={`${slide.image}-${index}`}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? "z-[2] opacity-100" : "z-[1] opacity-0"}`}
                aria-hidden={!isActive}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.image}
                  alt={slide.title || storeName || "SunVera Jolie beauty collection"}
                  className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[7000ms] ease-out ${isActive ? "scale-100" : "scale-105"} ${slide.mobileImage ? "hidden sm:block" : ""}`}
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
                {slide.mobileImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.mobileImage} alt={slide.title || storeName || "SunVera Jolie beauty collection"} className="absolute inset-0 h-full w-full object-cover sm:hidden" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#302318]/25 via-transparent to-white/10" />
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-y-0 start-0 z-10 hidden w-20 bg-gradient-to-r from-[#f8f3ec] to-transparent lg:block" />
          {slides.length > 1 && (
            <div className="absolute bottom-5 end-5 z-20 flex items-center gap-2 sm:bottom-8 sm:end-8">
              <button type="button" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center border border-white/70 bg-white/85 text-[#3b2b21] backdrop-blur-sm transition hover:bg-[#3b2b21] hover:text-white" aria-label="Previous slide">←</button>
              <button type="button" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center border border-white/70 bg-white/85 text-[#3b2b21] backdrop-blur-sm transition hover:bg-[#3b2b21] hover:text-white" aria-label="Next slide">→</button>
            </div>
          )}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-[#e9dfd2] bg-[#f8f3ec] px-4 py-3" role="tablist" aria-label="Featured slides">
          {slides.map((slide, index) => (
            <button
              key={`slide-tab-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-1 rounded-full transition-all duration-300 ${index === activeIndex ? "w-10 bg-[#9a793e]" : "w-3 bg-[#d7c9b7] hover:bg-[#b9a58e]"}`}
              aria-label={`Go to slide ${index + 1}`}
              aria-selected={index === activeIndex}
              role="tab"
            />
          ))}
        </div>
      )}
    </section>
  );
}

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
  const intervalMs = Math.min(10000, Math.max(2000, Number(settings.intervalMs) || 4000));
  const transition = settings.transition === "slide" ? "slide" : "fade";
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (!autoplay || paused || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoplay, paused, intervalMs, slides.length]);

  const active = slides[activeIndex] ?? slides[0];
  const position = active.textPosition || "left";
  const overlay = Math.min(90, Math.max(0, active.overlayOpacity ?? 35));

  function previous() {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }

  function next() {
    setActiveIndex((current) => (current + 1) % slides.length);
  }

  return (
    <section
      className="relative isolate overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="SunVera Jolie featured collection"
    >
      <div className="relative h-[560px] w-full sm:h-[640px]">
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          const opacity = transition === "fade" ? (isActive ? 1 : 0) : 1;
          const translate = transition === "slide" ? `translateX(${(index - activeIndex) * 100}%)` : undefined;
          return (
            <div
              key={`${slide.image}-${index}`}
              className="absolute inset-0 transition-all duration-1000 ease-out"
              style={{ opacity, transform: translate, zIndex: isActive ? 2 : 1 }}
              aria-hidden={!isActive}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image}
                alt={slide.title || storeName || "SunVera Jolie"}
                className={`absolute inset-0 h-full w-full object-cover ${slide.mobileImage ? "hidden sm:block" : ""}`}
              />
              {slide.mobileImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slide.mobileImage} alt={slide.title || storeName || "SunVera Jolie"} className="absolute inset-0 h-full w-full object-cover sm:hidden" />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    position === "left"
                      ? `linear-gradient(to right, rgba(253,251,247,${overlay / 100}), rgba(253,251,247,0.08))`
                      : position === "right"
                        ? `linear-gradient(to left, rgba(253,251,247,${overlay / 100}), rgba(253,251,247,0.08))`
                        : `rgba(58,43,34,${overlay / 100})`,
                }}
              />
            </div>
          );
        })}

        <div className="absolute inset-0 z-10 flex items-center">
          <div className={`mx-auto w-full max-w-7xl px-6 ${position === "center" ? "text-center" : position === "right" ? "text-right" : "text-left"}`}>
            <div className={`max-w-xl ${position === "center" ? "mx-auto" : position === "right" ? "ms-auto" : ""}`}>
              {settings.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt={storeName || "SunVera Jolie"} className="mb-6 h-auto max-h-20 w-auto max-w-[220px] object-contain" />
              )}
              {!settings.logoUrl && storeName && (
                <p className="text-[10px] uppercase tracking-[0.42em] text-gold">{storeName}</p>
              )}
              <h1 className="mt-3 whitespace-pre-line font-display text-4xl leading-[1.15] text-cocoa sm:text-6xl">
                {active.title}
              </h1>
              {active.subtitle && <p className="mt-5 max-w-md text-sm leading-relaxed text-cocoa-soft sm:text-base">{active.subtitle}</p>}
              <div className={`mt-8 flex flex-wrap gap-3 ${position === "center" ? "justify-center" : position === "right" ? "justify-end" : ""}`}>
                {active.buttonText && <Link href={active.buttonUrl || "/shop"} className="btn-primary">{active.buttonText}</Link>}
                {active.button2Text && <Link href={active.button2Url || "/shop"} className="btn-outline">{active.button2Text}</Link>}
              </div>
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button type="button" onClick={previous} className="absolute start-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/10 text-white backdrop-blur-sm transition hover:bg-black/25" aria-label="Previous slide">‹</button>
            <button type="button" onClick={next} className="absolute end-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/10 text-white backdrop-blur-sm transition hover:bg-black/25" aria-label="Next slide">›</button>
            <div className="absolute bottom-6 start-1/2 z-20 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Hero slides">
              {slides.map((slide, index) => (
                <button
                  key={`dot-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-8 bg-white" : "w-1.5 bg-white/60"}`}
                  aria-label={`Go to slide ${index + 1}`}
                  aria-selected={index === activeIndex}
                  role="tab"
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

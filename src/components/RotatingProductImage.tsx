"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

export type RotationMode = "static" | "hover" | "auto" | "hover-auto";

export default function RotatingProductImage({
  images,
  alt,
  href,
  mode = "static",
  intervalMs = 3500,
  sizes = "(max-width: 640px) 90vw, 320px",
  className = "",
}: {
  images: string[];
  alt: string;
  href?: string;
  mode?: RotationMode;
  intervalMs?: number;
  sizes?: string;
  className?: string;
}) {
  const clean = useMemo(() => images.filter(Boolean), [images]);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const visibleImages = useMemo(() => clean.filter((src) => !failedImages.includes(src)), [clean, failedImages]);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const displayIndex = visibleImages.length ? index % visibleImages.length : 0;

  useEffect(() => {
    if (visibleImages.length < 2 || (mode !== "auto" && mode !== "hover-auto")) return;
    const id = window.setInterval(() => {
      if (mode === "hover-auto" && hovered) return;
      setIndex((current) => (current + 1) % visibleImages.length);
    }, Math.max(1500, intervalMs));
    return () => window.clearInterval(id);
  }, [visibleImages.length, intervalMs, mode, hovered]);

  function next() {
    if (visibleImages.length < 2) return;
    setIndex((current) => (current + 1) % visibleImages.length);
  }

  function handleEnter() {
    setHovered(true);
    if (mode === "hover" || mode === "hover-auto") next();
  }

  const content = (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleEnter}
      onBlur={() => setHovered(false)}
    >
      {visibleImages.length ? visibleImages.map((src, i) => (
        <Image
          key={src + i}
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          onError={() => setFailedImages((previous) => previous.includes(src) ? previous : [...previous, src])}
          className={`object-cover transition-opacity duration-700 ${i === displayIndex ? "opacity-100" : "opacity-0"}`}
          priority={i === 0}
        />
      )) : (
        <div className="flex h-full items-center justify-center bg-beige text-5xl text-gold">✦</div>
      )}
    </div>
  );

  return href ? <a href={href} className="block h-full w-full" aria-label={alt}>{content}</a> : content;
}

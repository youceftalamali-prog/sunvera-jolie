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
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (clean.length < 2 || (mode !== "auto" && mode !== "hover-auto")) return;
    const id = window.setInterval(() => {
      if (mode === "hover-auto" && hovered) return;
      setIndex((current) => (current + 1) % clean.length);
    }, Math.max(1500, intervalMs));
    return () => window.clearInterval(id);
  }, [clean.length, intervalMs, mode, hovered]);

  function next() {
    if (clean.length < 2) return;
    setIndex((current) => (current + 1) % clean.length);
  }

  function handleEnter() {
    setHovered(true);
    if (mode === "hover" || mode === "hover-auto") next();
  }

  const content = (
    <div
      className={\`relative h-full w-full overflow-hidden \${className}\`}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleEnter}
      onBlur={() => setHovered(false)}
    >
      {clean.length ? clean.map((src, i) => (
        <Image
          key={src + i}
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={\`object-cover transition-opacity duration-700 \${i === index ? "opacity-100" : "opacity-0"}\`}
          priority={i === 0}
        />
      )) : (
        <div className="flex h-full items-center justify-center bg-beige text-5xl text-gold">✦</div>
      )}
    </div>
  );

  return href ? <a href={href} className="block h-full w-full" aria-label={alt}>{content}</a> : content;
}

"use client";

import Image from "next/image";
import { useState } from "react";

type CategoryCardImageProps = {
  src?: string | null;
  alt: string;
  fallbackIcon?: string | null;
  priority?: boolean;
};

export default function CategoryCardImage({
  src,
  alt,
  fallbackIcon,
  priority = false,
}: CategoryCardImageProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = src?.trim();

  if (!imageUrl || failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#f6eee4] via-[#fffaf5] to-[#ead9c4]">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gold/25 bg-white/55 text-4xl shadow-[0_12px_30px_rgba(58,43,34,0.08)] backdrop-blur-sm transition duration-500 group-hover:scale-110">
          <span aria-hidden>{fallbackIcon || "✦"}</span>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      fill
      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
      priority={priority}
      onError={() => setFailed(true)}
      className="object-cover transition duration-700 group-hover:scale-110"
    />
  );
}

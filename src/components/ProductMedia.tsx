import Image from "next/image";

const TONES: Record<string, string> = {
  gold: "from-[#f6e7c6] via-[#efdcb9] to-[#e5c894]",
  beige: "from-[#f6efe5] via-[#efe4d5] to-[#e6d7c2]",
  ivory: "from-[#fdfbf7] via-[#f4f1ea] to-[#e9e4d9]",
  nude: "from-[#f7e9e1] via-[#f0dacd] to-[#e3c6b4]",
};

export default function ProductMedia({
  url,
  emoji,
  tone = "beige",
  name,
  className = "",
  size = "text-6xl",
  sizes = "(max-width: 640px) 50vw, 320px",
  priority = false,
}: {
  url?: string;
  emoji: string;
  tone?: string;
  name: string;
  className?: string;
  size?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (url) {
    return (
      <div className={`relative overflow-hidden bg-beige ${className}`}>
        <Image
          src={url}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={`flex items-center justify-center bg-gradient-to-br ${TONES[tone] ?? TONES.beige} ${className}`}
    >
      <span className={`${size} drop-shadow-sm select-none`} aria-hidden>{emoji}</span>
    </div>
  );
}

export default function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`text-gold ${className}`} aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(full)}
      <span className="text-cocoa/20">{"★".repeat(5 - full)}</span>
    </span>
  );
}

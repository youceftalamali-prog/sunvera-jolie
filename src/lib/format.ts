export const CURRENCY = "DZD";

export function money(amount: number, currency: string = CURRENCY) {
  const n = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(amount);
  if (currency === "USD") return `$${n}`;
  if (currency === "EUR") return `€${n}`;
  return `${n} DA`;
}

export function discountPct(price: number, compare: number) {
  if (!compare || compare <= price) return 0;
  return Math.round(((compare - price) / compare) * 100);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

import { db } from "@/db";
import { communes, shippingRates, wilayas } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/algeria-data";

export { FREE_SHIPPING_THRESHOLD };

export type WilayaOption = {
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  fee: number;
  etaDays: string;
};

export async function getWilayas(onlyActive = true): Promise<WilayaOption[]> {
  const ws = await db.select().from(wilayas).orderBy(asc(wilayas.sortOrder));
  const rates = await db.select().from(shippingRates);
  return ws
    .filter((w) => (onlyActive ? w.active : true))
    .map((w) => {
      const r = rates.find((x) => x.wilayaCode === w.code);
      return {
        code: w.code,
        nameFr: w.nameFr,
        nameAr: w.nameAr,
        nameEn: w.nameEn,
        fee: r?.fee ?? 700,
        etaDays: r?.etaDays ?? "2-4",
      };
    });
}

export async function getCommunes(wilayaCode: string, onlyActive = true) {
  const rows = await db
    .select()
    .from(communes)
    .where(eq(communes.wilayaCode, wilayaCode))
    .orderBy(asc(communes.nameFr));
  return rows.filter((c) => (onlyActive ? c.active : true));
}

export async function shippingFor(wilayaCodeOrName: string, subtotal: number) {
  const all = await getWilayas(false);
  const w =
    all.find((x) => x.code === wilayaCodeOrName) ??
    all.find((x) => x.nameFr.toLowerCase() === wilayaCodeOrName.toLowerCase());
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return w?.fee ?? 700;
}

export async function activeShippingCount() {
  const [row] = await db
    .select()
    .from(shippingRates)
    .where(and(eq(shippingRates.active, true)))
    .limit(1);
  return row ? 1 : 0;
}

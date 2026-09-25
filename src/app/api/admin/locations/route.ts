import { NextResponse } from "next/server";
import { db } from "@/db";
import { communes, shippingRates, wilayas } from "@/db/schema";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { kind?: string; id?: number };

async function guard() {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const str = (v: unknown, f = "") => (typeof v === "string" ? v : f);
const num = (v: unknown, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const bool = (v: unknown, f = true) => (typeof v === "boolean" ? v : f);

export async function GET(req: Request) {
  if (await guard()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const q = p.get("q")?.trim() ?? "";
  const wilayaCode = p.get("wilaya")?.trim() ?? "";
  const withInactive = p.get("all") === "1";

  const wRows = await db
    .select()
    .from(wilayas)
    .where(
      q
        ? or(ilike(wilayas.nameFr, `%${q}%`), ilike(wilayas.nameAr, `%${q}%`), ilike(wilayas.code, `%${q}%`))
        : undefined,
    )
    .orderBy(asc(wilayas.sortOrder));
  const rates = await db.select().from(shippingRates);

  let cRows: (typeof communes.$inferSelect)[] = [];
  if (wilayaCode) {
    cRows = await db.select().from(communes).where(eq(communes.wilayaCode, wilayaCode)).orderBy(asc(communes.nameFr));
    if (!withInactive) cRows = cRows.filter((c) => c.active);
  } else if (q) {
    cRows = await db
      .select()
      .from(communes)
      .where(or(ilike(communes.nameFr, `%${q}%`), ilike(communes.nameAr, `%${q}%`)))
      .limit(50);
  }

  return NextResponse.json({
    wilayas: wRows.map((w) => ({
      ...w,
      fee: rates.find((r) => r.wilayaCode === w.code)?.fee ?? 700,
      stopDeskFee: rates.find((r) => r.wilayaCode === w.code)?.stopDeskFee ?? 0,
      etaDays: rates.find((r) => r.wilayaCode === w.code)?.etaDays ?? "2-4",
      communes: cRows.filter((c) => c.wilayaCode === w.code).length,
    })),
    communes: cRows,
    count: { wilayas: wRows.length, communes: cRows.length },
  });
}

export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const b = (await req.json()) as Body;

  switch (b.kind) {
    case "wilaya-save": {
      const values = {
        code: str(b.code),
        nameAr: str(b.nameAr),
        nameFr: str(b.nameFr),
        nameEn: str(b.nameEn),
        active: bool(b.active, true),
        sortOrder: num(b.sortOrder),
      };
      if (!values.code || !values.nameFr) return NextResponse.json({ error: "Code and French name are required" }, { status: 400 });
      const [row] = await db
        .insert(wilayas)
        .values(values)
        .onConflictDoUpdate({ target: wilayas.code, set: values })
        .returning();
      const fee = num(b.fee, 700);
      if (fee < 0) return NextResponse.json({ error: "Invalid shipping price" }, { status: 400 });
      await db
        .insert(shippingRates)
        .values({ wilayaCode: values.code, fee, stopDeskFee: num(b.stopDeskFee), etaDays: str(b.etaDays, "2-4") })
        .onConflictDoUpdate({
          target: shippingRates.wilayaCode,
          set: { fee, stopDeskFee: num(b.stopDeskFee), etaDays: str(b.etaDays, "2-4") },
        });
      return NextResponse.json({ wilaya: row });
    }
    case "wilaya-toggle": {
      await db.update(wilayas).set({ active: bool(b.active) }).where(eq(wilayas.code, str(b.code)));
      return NextResponse.json({ ok: true });
    }
    case "rate-save": {
      const fee = num(b.fee, 700);
      if (fee < 0) return NextResponse.json({ error: "Invalid shipping price" }, { status: 400 });
      await db
        .update(shippingRates)
        .set({ fee, etaDays: str(b.etaDays, "2-4"), stopDeskFee: num(b.stopDeskFee) })
        .where(eq(shippingRates.wilayaCode, str(b.code)));
      return NextResponse.json({ ok: true });
    }
    case "commune-save": {
      const values = {
        wilayaCode: str(b.wilayaCode),
        nameAr: str(b.nameAr),
        nameFr: str(b.nameFr),
        nameEn: str(b.nameEn) || str(b.nameFr),
        active: bool(b.active, true),
      };
      if (!values.wilayaCode || !values.nameFr) {
        return NextResponse.json({ error: "Wilaya and French name are required" }, { status: 400 });
      }
      const [row] = b.id
        ? await db.update(communes).set(values).where(eq(communes.id, num(b.id))).returning()
        : await db.insert(communes).values(values).returning();
      return NextResponse.json({ commune: row });
    }
    case "commune-toggle": {
      await db.update(communes).set({ active: bool(b.active) }).where(eq(communes.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "commune-delete": {
      await db.delete(communes).where(eq(communes.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "commune-add-many": {
      const code = str(b.wilayaCode);
      const list = String(b.names ?? "")
        .split(/\r?\n|,/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!code || list.length === 0) return NextResponse.json({ error: "Wilaya and at least one name are required" }, { status: 400 });
      await db.insert(communes).values(list.map((nameFr) => ({ wilayaCode: code, nameFr, nameAr: "", nameEn: nameFr })));
      return NextResponse.json({ ok: true, added: list.length });
    }
    default:
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const b = (await req.json()) as Body;
  const ids = (b.ids ?? []) as number[];
  if (b.kind === "bulk-wilaya-shipping" && ids.length) {
    await db
      .update(shippingRates)
      .set({ fee: num(b.fee, 700) })
      .where(and(eq(shippingRates.active, true)));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown request" }, { status: 400 });
}

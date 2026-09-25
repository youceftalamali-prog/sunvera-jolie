import { db } from "@/db";
import { coupons, orderItems, orders, productVariants, products } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCommunes, getWilayas, shippingFor } from "@/lib/algeria";

export type LineIn = { productId: number; qty: number; variant?: string; variantId?: number };

export { STATUSES, STATUS_LABEL } from "@/lib/status";
export type { Status } from "@/lib/status";

export async function resolveWilaya(input: { code?: string; name?: string }) {
  const code = input.code?.trim();
  const name = input.name?.trim();
  const all = await getWilayas();

  if (code) {
    const byCode = all.find((w) => w.code === code);
    if (!byCode) return null;
    if (!name) return byCode;

    const lower = name.toLowerCase();
    const sameWilaya =
      byCode.nameFr.toLowerCase() === lower || byCode.nameEn.toLowerCase() === lower || byCode.nameAr === name;
    return sameWilaya ? byCode : null;
  }

  if (name) {
    const lower = name.toLowerCase();
    return (
      all.find((w) => w.nameFr.toLowerCase() === lower || w.nameEn.toLowerCase() === lower || w.nameAr === name) ??
      null
    );
  }

  return null;
}

export async function resolveCommune(wilayaCode: string, input?: string) {
  const name = input?.trim();
  if (!name) return null;
  const all = await getCommunes(wilayaCode);
  const lower = name.toLowerCase();
  return (
    all.find((c) => c.nameFr.toLowerCase() === lower || c.nameEn.toLowerCase() === lower || c.nameAr === name) ??
    null
  );
}

export async function priceCart(
  items: LineIn[],
  wilayaInput: { code?: string; name?: string },
  code?: string,
) {
  const ids = items.map((i) => i.productId);
  const variantIds = items
    .map((i) => i.variantId)
    .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0);
  const rows = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
  const variants = variantIds.length
    ? await db.select().from(productVariants).where(inArray(productVariants.id, variantIds))
    : [];

  const lines = items.map((i) => {
    const p = rows.find((r) => r.id === i.productId);
    if (!p) throw new Error(`Product ${i.productId} is no longer available`);

    const hasVariantId = i.variantId !== undefined && i.variantId !== null;
    const v = hasVariantId ? variants.find((candidate) => candidate.id === i.variantId) : undefined;
    if (hasVariantId && (!v || v.productId !== p.id)) {
      throw new Error("The selected variant is invalid or unavailable");
    }

    const quantity = Math.max(1, Math.min(Number(i.qty), 99));
    return {
      productId: p.id,
      name: p.name,
      variantId: v?.id,
      variant: v?.label ?? i.variant ?? p.size,
      unitPrice: v ? v.price : p.price,
      quantity,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const wilayaProvided = Boolean(wilayaInput.code?.trim() || wilayaInput.name?.trim());
  const wilaya = await resolveWilaya(wilayaInput);
  if (wilayaProvided && !wilaya) throw new Error("The selected wilaya is invalid or unavailable.");
  let shipping = wilaya ? await shippingFor(wilaya.code, subtotal) : 0;
  let discount = 0;
  let appliedCode = "";

  if (code) {
    const [c] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code.trim().toUpperCase()), eq(coupons.active, true)))
      .limit(1);
    if (c && subtotal >= c.minSubtotal) {
      appliedCode = c.code;
      if (c.type === "percent") discount = Math.round((subtotal * c.value) / 100);
      else if (c.type === "fixed") discount = Math.min(c.value, subtotal);
      else if (c.type === "free_shipping") shipping = 0;
    }
  }

  return {
    lines,
    subtotal,
    shipping,
    discount,
    appliedCode,
    total: subtotal + shipping - discount,
    wilaya,
  };
}

export function makeReference() {
  return (
    "SVJ-" +
    Math.random().toString(36).slice(2, 7).toUpperCase() +
    Date.now().toString(36).slice(-4).toUpperCase()
  );
}

export async function createOrder(input: {
  fullName: string;
  phone: string;
  email?: string;
  wilayaCode?: string;
  wilayaName?: string;
  commune?: string;
  address: string;
  notes?: string;
  items: LineIn[];
  couponCode?: string;
  customerId?: number | null;
  source?: string;
}) {
  const priced = await priceCart(input.items, { code: input.wilayaCode, name: input.wilayaName }, input.couponCode);
  if (priced.lines.length === 0) throw new Error("Your cart is empty");
  if (!priced.wilaya) throw new Error("A valid active wilaya is required.");
  if (!input.commune?.trim()) throw new Error("A valid commune is required.");
  const commune = await resolveCommune(priced.wilaya.code, input.commune);
  if (!commune) throw new Error("The selected commune is invalid or unavailable for this wilaya.");

  return await db.transaction(async (tx) => {
    const ids = priced.lines.map((l) => l.productId);
    const prods = await tx.select().from(products).where(inArray(products.id, ids));
    const variantIds = priced.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
    const variants = variantIds.length
      ? await tx.select().from(productVariants).where(inArray(productVariants.id, variantIds))
      : [];

    for (const l of priced.lines) {
      const p = prods.find((x) => x.id === l.productId);
      if (!p) throw new Error(`A product in your cart is no longer available (id ${l.productId})`);

      if (l.variantId) {
        const v = variants.find((x) => x.id === l.variantId);
        if (!v || v.productId !== p.id) throw new Error("The selected variant is invalid or unavailable");
        if (!p.trackInventory) continue;
        if (!p.allowBackorders && l.quantity > v.stock) {
          throw new Error(`Insufficient stock for variant "${v.label}". Only ${v.stock} available but ${l.quantity} requested.`);
        }
        const guard = p.allowBackorders
          ? eq(productVariants.id, v.id)
          : and(eq(productVariants.id, v.id), sql`${productVariants.stock} >= ${l.quantity}`);
        const updated = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${l.quantity}` })
          .where(guard)
          .returning({ id: productVariants.id });
        if (updated.length === 0) throw new Error(`Insufficient stock for variant "${v.label}".`);
        continue;
      }

      if (!p.trackInventory) continue;
      if (!p.allowBackorders && l.quantity > p.stock) {
        throw new Error(`Insufficient stock for "${p.name}". Only ${p.stock} available but ${l.quantity} requested.`);
      }
      const guard = p.allowBackorders
        ? eq(products.id, l.productId)
        : and(eq(products.id, l.productId), sql`${products.stock} >= ${l.quantity}`);
      const updated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${l.quantity}` })
        .where(guard)
        .returning({ id: products.id });
      if (updated.length === 0) throw new Error(`Insufficient stock for "${p.name}".`);
    }

    const reference = makeReference();
    const [order] = await tx
      .insert(orders)
      .values({
        reference,
        customerId: input.customerId ?? null,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email ?? "",
        wilayaCode: priced.wilaya?.code ?? input.wilayaCode ?? "",
        wilaya: priced.wilaya.nameFr,
        commune: commune.nameFr,
        address: input.address,
        notes: input.notes ?? "",
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        discount: priced.discount,
        total: priced.total,
        couponCode: priced.appliedCode,
        paymentMethod: "cod",
        status: "pending",
        source: input.source ?? "direct",
      })
      .returning();

    await tx.insert(orderItems).values(priced.lines.map((l) => ({ ...l, orderId: order.id })));

    if (priced.appliedCode) {
      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.code, priced.appliedCode));
    }

    return { order, lines: priced.lines };
  });
}

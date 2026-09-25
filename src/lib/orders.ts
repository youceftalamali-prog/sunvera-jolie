import { db } from "@/db";
import { coupons, orderItems, orders, productVariants, products } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getWilayas, shippingFor } from "@/lib/algeria";

export type LineIn = { productId: number; qty: number; variant?: string; variantId?: number };

export { STATUSES, STATUS_LABEL } from "@/lib/status";
export type { Status } from "@/lib/status";

export async function resolveWilaya(input: { code?: string; name?: string }) {
  const all = await getWilayas(false);
  if (input.code) {
    const byCode = all.find((w) => w.code === input.code);
    if (byCode) return byCode;
  }
  if (input.name) {
    const lower = input.name.toLowerCase();
    const byName = all.find(
      (w) => w.nameFr.toLowerCase() === lower || w.nameEn.toLowerCase() === lower || w.nameAr === input.name,
    );
    if (byName) return byName;
  }
  return null;
}

export async function priceCart(
  items: LineIn[],
  wilayaInput: { code?: string; name?: string },
  code?: string,
) {
  const ids = items.map((i) => i.productId);
  const variantIds = items
    .map((i) => i.variantId)
    .filter((id): id is number => Number.isInteger(id) && id > 0);
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
  const wilaya = await resolveWilaya(wilayaInput);
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
        wilaya: priced.wilaya?.nameFr ?? input.wilayaName ?? "",
        commune: input.commune ?? "",
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

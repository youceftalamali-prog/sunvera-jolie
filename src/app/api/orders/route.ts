import { NextResponse } from "next/server";
import { publicOrderError } from "@/lib/api-errors";
import { createOrder, priceCart, type LineIn } from "@/lib/orders";
import { getCustomerId } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { sendNewOrderNotification } from "@/lib/order-notification";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeed();
  let b: {
    fullName?: string;
    phone?: string;
    email?: string;
    wilayaCode?: string;
    wilaya?: string;
    commune?: string;
    address?: string;
    notes?: string;
    couponCode?: string;
    items?: LineIn[];
    quoteOnly?: boolean;
  };
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    b = parsed as typeof b;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const items = Array.isArray(b.items)
    ? b.items.filter((item): item is LineIn => Boolean(item && typeof item === "object"))
    : [];
  if (items.length === 0) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });

  if (b.quoteOnly) {
    try {
      const quote = await priceCart(items, { code: b.wilayaCode, name: b.wilaya }, b.couponCode);
      return NextResponse.json({
        quote: {
          subtotal: quote.subtotal,
          shipping: quote.shipping,
          discount: quote.discount,
          total: quote.total,
          appliedCode: quote.appliedCode,
          wilayaName: quote.wilaya?.nameFr ?? "",
          etaDays: quote.wilaya?.etaDays ?? "",
        },
      });
    } catch (e) {
      return NextResponse.json({ error: publicOrderError(e) }, { status: 400 });
    }
  }

  if (!b.fullName || !b.phone || !b.wilaya || !b.address) {
    return NextResponse.json({ error: "Full name, phone, wilaya and address are required" }, { status: 400 });
  }
  if (!/^0[5-7]\d{8}$/.test(b.phone.replace(/\s/g, ""))) {
    return NextResponse.json({ error: "Enter a valid Algerian phone number (e.g. 0551234567)" }, { status: 400 });
  }

  const customerId = await getCustomerId();
  const ref = req.headers.get("referer") ?? "";
  const source = /tiktok/i.test(ref) ? "tiktok" : /facebook|fb\./i.test(ref) ? "facebook" : /instagram/i.test(ref) ? "instagram" : "direct";

  try {
    const { order, lines } = await createOrder({
      fullName: b.fullName,
      phone: b.phone,
      email: b.email,
      wilayaCode: b.wilayaCode,
      wilayaName: b.wilaya,
      commune: b.commune,
      address: b.address,
      notes: b.notes,
      items,
      couponCode: b.couponCode,
      customerId,
      source,
    });
    const emailSent = await sendNewOrderNotification({
      reference: order.reference,
      fullName: order.fullName,
      phone: order.phone,
      email: order.email,
      wilaya: order.wilaya,
      commune: order.commune,
      address: order.address,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      total: order.total,
      createdAt: order.createdAt,
      lines: lines.map((line) => ({ name: line.name, variant: line.variant, quantity: line.quantity, unitPrice: line.unitPrice })),
    }).catch((error) => {
      console.error("Order saved, but notification email failed:", error);
      return false;
    });
    return NextResponse.json({ order, notificationEmailSent: emailSent }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: publicOrderError(e) }, { status: 400 });
  }
}

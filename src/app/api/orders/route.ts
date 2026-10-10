import { NextResponse } from "next/server";
import { publicOrderError } from "@/lib/api-errors";
import { createOrder, priceCart, type LineIn } from "@/lib/orders";
import { getCustomerId } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeed();
  const b = (await req.json()) as {
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

  const items = (b.items ?? []).filter((i) => i && i.qty > 0);
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
    const { order } = await createOrder({
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
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: publicOrderError(e) }, { status: 400 });
  }
}

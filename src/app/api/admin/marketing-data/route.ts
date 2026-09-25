import { NextResponse } from "next/server";
import { db } from "@/db";
import { coupons, navigationItems, shippingRates } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { allBanners, getTrustBadges } from "@/lib/cms";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [banners, badges, couponRows, nav, rates] = await Promise.all([
    allBanners(),
    getTrustBadges(),
    db.select().from(coupons),
    db.select().from(navigationItems).orderBy(navigationItems.sortOrder),
    db.select().from(shippingRates),
  ]);
  return NextResponse.json({ banners, badges, coupons: couponRows, nav, rates });
}

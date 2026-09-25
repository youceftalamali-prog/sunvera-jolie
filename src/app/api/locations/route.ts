import { NextResponse } from "next/server";
import { getCommunes, getWilayas } from "@/lib/algeria";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSeed();
  const wilaya = new URL(req.url).searchParams.get("wilaya");
  if (wilaya) {
    const communes = await getCommunes(wilaya);
    return NextResponse.json({
      communes: communes.map((c) => ({ id: c.id, nameAr: c.nameAr, nameFr: c.nameFr, nameEn: c.nameEn })),
    });
  }
  const wilayas = await getWilayas();
  return NextResponse.json({ wilayas });
}

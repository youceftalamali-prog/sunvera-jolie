import { NextResponse } from "next/server";
import { getCommunes, getWilayas } from "@/lib/algeria";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeed();
    const wilaya = new URL(req.url).searchParams.get("wilaya");
    if (wilaya) {
      if (!/^\d{1,3}$/.test(wilaya)) return NextResponse.json({ error: "Invalid wilaya code" }, { status: 400 });
      const communes = await getCommunes(wilaya);
      return NextResponse.json({
        communes: communes.map((c) => ({ id: c.id, nameAr: c.nameAr, nameFr: c.nameFr, nameEn: c.nameEn })),
      });
    }
    const wilayas = await getWilayas();
    return NextResponse.json({ wilayas });
  } catch {
    return NextResponse.json({ error: "Could not load delivery locations" }, { status: 503 });
  }
}

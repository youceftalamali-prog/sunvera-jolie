import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { allCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await allCategories(false);
  return NextResponse.json({ categories });
}

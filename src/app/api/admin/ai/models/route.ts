import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getAIRouteCatalog, getAIModelCatalog } from "@/lib/ai-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [routes, models] = await Promise.all([getAIRouteCatalog(), getAIModelCatalog()]);
    return NextResponse.json({ routes, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load AI routes";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

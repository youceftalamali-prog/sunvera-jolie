import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getAIRouteCatalog } from "@/lib/ai-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const routes = await getAIRouteCatalog();
    return NextResponse.json({ routes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load AI routes";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

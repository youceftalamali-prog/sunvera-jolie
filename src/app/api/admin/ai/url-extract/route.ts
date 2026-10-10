import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { extractUniversalUrl } from "@/lib/universal-url-extractor";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("admin-ai-url-extract", clientIp(req), 20, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many URL extraction requests. Try again later." }, { status: 429 });

  try {
    const body = (await req.json()) as { url?: string };
    const url = String(body.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

    const result = await extractUniversalUrl(url);
    return NextResponse.json(result, {
      status: result.extractionStatus === "failed" ? 422 : 200,
    });
  } catch (error) {
    console.error("[Universal URL Extractor] Request failed:", error);
    return NextResponse.json(
      {
        error: "URL extraction failed.",
        detail: error instanceof Error ? error.message : "Unknown extraction error",
      },
      { status: 500 },
    );
  }
}

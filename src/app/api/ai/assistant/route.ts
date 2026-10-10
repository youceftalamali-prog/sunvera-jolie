import { NextResponse } from "next/server";
import { allProducts } from "@/lib/queries";
import { llm, rankProducts } from "@/lib/ai";
import { money } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "This is cosmetic guidance only — SunVera Jolie does not diagnose or treat medical conditions.";

export async function POST(req: Request) {
  const rl = await rateLimit("ai-assistant", clientIp(req), 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }
  const { query } = (await req.json()) as { query?: string };
  const q = (query ?? "").trim();
  if (!q) return NextResponse.json({ error: "A question is required" }, { status: 400 });

  const items = await allProducts();
  const picks = rankProducts(q, items).slice(0, 3);

  const generated = await llm(
    "You are the SunVera Jolie beauty concierge for a premium Algerian skincare boutique. Recommend ONLY from the provided products, in 3-5 warm, elegant sentences. Explain how to use them together as a ritual. Never give medical advice, never diagnose, never promise to cure anything.",
    `Customer: ${q}\n\nAvailable products:\n${picks
      .map((p) => `- ${p.name} (${money(p.price)}, ${p.productType}, for ${p.skinType || p.hairType}): ${p.shortDescription}`)
      .join("\n")}`,
  );

  const fallback = picks.length
    ? `For "${q}", I'd begin with the ${picks[0].name} — ${picks[0].shortDescription.toLowerCase()} It suits ${picks[0].skinType || picks[0].hairType || "most routines"} and is one of our best-rated pieces at ${picks[0].rating.toFixed(1)}/5.` +
      (picks[1]
        ? ` Pair it with the ${picks[1].name} to complete the ritual${picks[2] ? `, and add the ${picks[2].name} two or three times a week` : ""}.`
        : "") +
      ` ${DISCLAIMER}`
    : `I couldn't find a close match. Tell me your skin or hair type and what you'd like to improve. ${DISCLAIMER}`;

  return NextResponse.json({
    reply: generated ? `${generated}\n\n${DISCLAIMER}` : fallback,
    products: picks,
    source: generated ? "openai" : "builtin",
  });
}

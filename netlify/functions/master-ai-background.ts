import { runMasterAI } from "./_lib/master-ai-runner";
import { addAIMessage } from "../../src/lib/ai-conversations";
import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_COOKIE = "svj_admin";

function isAdminRequest(request: Request): boolean {
  const header = request.headers.get("cookie") || "";
  const raw = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(ADMIN_COOKIE + "="))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (!raw) return false;

  const idx = raw.lastIndexOf(".");
  const secret = process.env.AUTH_SECRET || "";
  if (idx <= 0 || !secret) return false;

  const value = raw.slice(0, idx);
  const mac = raw.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(value).digest("hex");
  if (mac.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) && value === "admin";
  } catch {
    return false;
  }
}


export default async function masterAIBackground(request: Request) {
  if (!isAdminRequest(request)) {
    console.warn("[Master AI Background] Ignored unauthorized invocation.");
    return;
  }

  const body = await request.text();
  const targetUrl = new URL("/api/admin/ai/master", request.url);

  let conversationId: number | null = null;
  try {
    const parsed = JSON.parse(body) as { conversationId?: unknown };
    const id = Number(parsed?.conversationId);
    conversationId = Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    // The Master route will produce the authoritative validation error.
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");

  // Safe runtime diagnostics: never log the actual secret value.
  console.info("[Master AI Background] Runtime config:", {
    masterModel: process.env.MASTER_AI_MODEL || "(missing)",
    tokenHarborKey: process.env.TOKENHARBOR_API_KEY ? "present" : "missing",
    aiHubMixKey: process.env.AIHUBMIX_API_KEY ? "present" : "missing",
    openRouterKey: process.env.OPENROUTER_API_KEY ? "present" : "missing",
    deepSeekKey: process.env.DEEPSEEK_API_KEY ? "present" : "missing",
    qwenKey: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY ? "present" : "missing",
    geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY ? "present" : "missing",
  });

  try {
    const response = await runMasterAI(
      new Request(targetUrl, {
        method: "POST",
        headers,
        body,
      }),
      { skipAuth: true },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200);
      const message = `Master AI background job failed (HTTP ${response.status}).${detail ? ` ${detail}` : ""}`;
      console.error("[Master AI Background]", message);

      if (conversationId && response.status !== 401 && response.status !== 403) {
        try {
          await addAIMessage(conversationId, {
            role: "assistant",
            content: message,
            attachments: [],
            webMode: "off",
          });
        } catch (persistError) {
          console.error("[Master AI Background] Could not persist failure message:", persistError);
        }
      }
      return;
    }

    console.info("[Master AI Background] Master AI job completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown background error";
    console.error("[Master AI Background] Master AI job failed:", error);

    if (conversationId) {
      try {
        await addAIMessage(conversationId, {
          role: "assistant",
          content: `Master AI background job failed: ${message}`,
          attachments: [],
          webMode: "off",
        });
      } catch (persistError) {
        console.error("[Master AI Background] Could not persist failure message:", persistError);
      }
    }
  }
}

export const config = {
  background: true,
};

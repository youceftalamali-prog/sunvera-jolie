import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  getAIConversation,
  getAIMessages,
} from "@/lib/ai-conversations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawId = new URL(req.url).searchParams.get("conversationId");
  const conversationId = Number(rawId);

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  const conversation = await getAIConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await getAIMessages(conversation.id, 100);

  return NextResponse.json({
    conversationId: conversation.id,
    context: conversation.workingContext,
    messages: messages.map((message) => ({
      id: String(message.id),
      role: message.role,
      text: message.content,
      reply: message.role === "assistant" ? message.content : undefined,
      plan: message.plan,
      route: message.route,
      execution: message.execution,
      webMode: message.webMode,
      attachments: Array.isArray(message.attachments)
        ? message.attachments
        : undefined,
      status: "done",
    })),
  });
}

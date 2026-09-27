import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversations = await db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      activeProductId: aiConversations.activeProductId,
      activeMediaIds: aiConversations.activeMediaIds,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.id))
    .limit(100);

  const messageCounts = await db
    .select({
      conversationId: aiMessages.conversationId,
    })
    .from(aiMessages)
    .orderBy(desc(aiMessages.id))
    .limit(5000);

  const counts = new Map<number, number>();
  for (const row of messageCounts) {
    counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
  }

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      ...conversation,
      messageCount: counts.get(conversation.id) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let title = "New chat";
  try {
    const body = (await req.json()) as { title?: string };
    if (body.title) title = String(body.title);
  } catch {
    // Empty body is fine.
  }

  const [row] = await db
    .insert(aiConversations)
    .values({
      title: title.trim().slice(0, 120) || "New chat",
    })
    .returning();

  if (!row) return NextResponse.json({ error: "Could not create chat." }, { status: 500 });

  return NextResponse.json({
    conversation: {
      id: row.id,
      title: row.title,
      activeProductId: row.activeProductId,
      activeMediaIds: row.activeMediaIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: 0,
    },
  });
}

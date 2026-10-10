import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";

export type AIConversationMemory = {
  activeProductId: number | null;
  activeMediaIds: number[];
  visualAnalysis?: string;
  lastPlan?: unknown;
  lastExecution?: unknown;
  lastAssistantReply?: string;
  [key: string]: unknown;
};

export type StoredAIMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: unknown[];
  plan?: unknown;
  route?: unknown;
  execution?: unknown[];
  webMode?: string;
};

export async function createAIConversation(title = "New chat") {
  const [row] = await db
    .insert(aiConversations)
    .values({
      title: title.trim().slice(0, 120) || "New chat",
    })
    .returning();
  if (!row) throw new Error("Could not create AI conversation.");
  return row;
}

export async function getAIConversation(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  return row ?? null;
}

export async function getAIMessages(conversationId: number, limit = 40) {
  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.id))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.reverse();
}

export async function addAIMessage(conversationId: number, message: StoredAIMessage) {
  const [row] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      role: message.role,
      content: message.content,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      plan: message.plan ?? null,
      route: message.route ?? null,
      execution: Array.isArray(message.execution) ? message.execution : [],
      webMode: message.webMode || "auto",
    })
    .returning();
  if (!row) throw new Error("Could not save AI message.");

  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));

  return row;
}

export async function updateAIConversation(
  conversationId: number,
  patch: {
    title?: string;
    activeProductId?: number | null;
    activeMediaIds?: number[];
    workingContext?: AIConversationMemory;
  },
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title.trim().slice(0, 120) || "New chat";
  if (patch.activeProductId !== undefined) values.activeProductId = patch.activeProductId;
  if (patch.activeMediaIds !== undefined) values.activeMediaIds = patch.activeMediaIds;
  if (patch.workingContext !== undefined) values.workingContext = patch.workingContext;

  const [row] = await db
    .update(aiConversations)
    .set(values as never)
    .where(eq(aiConversations.id, conversationId))
    .returning();

  return row ?? null;
}

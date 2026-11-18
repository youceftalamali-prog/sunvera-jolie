import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/db";
import { crmActivities, crmLeadChannels, crmLeads } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Channel = "whatsapp" | "messenger" | "instagram";
type JsonRecord = Record<string, unknown>;

type IncomingMessage = {
  channel: Channel;
  externalAccountId: string;
  externalContactId: string;
  externalMessageId: string;
  displayName: string;
  phone: string;
  body: string;
  messageType: string;
  timestamp: Date;
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function runtimeSecret(name: string): string {
  try {
    const context = getCloudflareContext();
    const env = context.env as unknown as Record<string, unknown>;
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Local development can use .env.local.
  }
  const fallback = process.env[name];
  return typeof fallback === "string" ? fallback.trim() : "";
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function validMetaSignature(rawBody: ArrayBuffer, header: string, appSecret: string): Promise<boolean> {
  if (!header.startsWith("sha256=")) return false;
  const supplied = header.slice(7).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, supplied);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^00213\d{9}$/.test(digits)) return "0" + digits.slice(5);
  if (/^213\d{9}$/.test(digits)) return "0" + digits.slice(3);
  return digits;
}

function whatsappPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) return "+213" + digits.slice(1);
  return "+" + digits;
}

function dateFromMetaTimestamp(value: unknown): Date {
  const timestamp = Number(value);
  if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < 4102444800) {
    return new Date(timestamp * 1000);
  }
  return new Date();
}

function messageBody(message: JsonRecord, platform: Channel): { body: string; type: string } {
  const type = stringValue(message.type) || "text";
  if (platform === "whatsapp") {
    const text = record(message.text);
    const caption = stringValue(record(message.image)?.caption) ||
      stringValue(record(message.video)?.caption) ||
      stringValue(record(message.document)?.caption);
    const body = stringValue(text?.body) || caption;
    return { body: body || "[WhatsApp " + type + " message]", type };
  }

  const text = stringValue(message.text);
  const attachments = arrayValue(message.attachments).map(record).filter((item): item is JsonRecord => item !== null);
  const attachmentType = stringValue(record(attachments[0]?.payload)?.type) || stringValue(attachments[0]?.type);
  return { body: text || (attachments.length ? "[" + platform + " " + (attachmentType || "attachment") + " message]" : "[" + platform + " message]"), type: attachments.length ? attachmentType || "attachment" : type };
}

function extractIncomingMessages(payload: JsonRecord): IncomingMessage[] {
  const incoming: IncomingMessage[] = [];
  const objectName = stringValue(payload.object);
  const entries = arrayValue(payload.entry).map(record).filter((item): item is JsonRecord => item !== null);

  if (objectName === "whatsapp_business_account") {
    for (const entry of entries) {
      const accountId = stringValue(entry.id);
      for (const changeValue of arrayValue(entry.changes)) {
        const change = record(changeValue);
        if (!change || stringValue(change.field) !== "messages") continue;
        const value = record(change.value);
        if (!value) continue;
        const metadata = record(value.metadata);
        const phoneNumberId = stringValue(metadata?.phone_number_id) || accountId;
        const contacts = arrayValue(value.contacts).map(record).filter((item): item is JsonRecord => item !== null);
        for (const messageValue of arrayValue(value.messages)) {
          const message = record(messageValue);
          if (!message) continue;
          const sender = stringValue(message.from);
          const messageId = stringValue(message.id);
          if (!sender || !messageId) continue;
          const contact = contacts.find((item) => stringValue(item.wa_id) === sender);
          const profile = record(contact?.profile);
          const parsed = messageBody(message, "whatsapp");
          incoming.push({
            channel: "whatsapp",
            externalAccountId: phoneNumberId,
            externalContactId: sender,
            externalMessageId: "whatsapp:" + messageId,
            displayName: stringValue(profile?.name),
            phone: whatsappPhone(sender),
            body: parsed.body,
            messageType: parsed.type,
            timestamp: dateFromMetaTimestamp(message.timestamp),
          });
        }
      }
    }
    return incoming;
  }

  const configuredInstagramAccount = runtimeSecret("META_INSTAGRAM_ACCOUNT_ID");
  const channel: Channel =
    objectName === "instagram" ||
    objectName === "instagram_business_account"
      ? "instagram"
      : "messenger";

  for (const entry of entries) {
    const accountId = stringValue(entry.id);
    const resolvedChannel: Channel = configuredInstagramAccount && accountId === configuredInstagramAccount
      ? "instagram"
      : channel;
    for (const eventValue of arrayValue(entry.messaging)) {
      const event = record(eventValue);
      const message = record(event?.message);
      if (!event || !message || message.is_echo === true) continue;
      const sender = stringValue(record(event.sender)?.id);
      const messageId = stringValue(message.mid);
      if (!sender || !messageId) continue;
      const parsed = messageBody(message, resolvedChannel);
      incoming.push({
        channel: resolvedChannel,
        externalAccountId: accountId,
        externalContactId: sender,
        externalMessageId: resolvedChannel + ":" + messageId,
        displayName: "",
        phone: "",
        body: parsed.body,
        messageType: parsed.type,
        timestamp: dateFromMetaTimestamp(event.timestamp),
      });
    }
  }

  return incoming;
}

async function persistIncomingMessage(message: IncomingMessage): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [duplicate] = await tx.select({ id: crmActivities.id })
      .from(crmActivities)
      .where(eq(crmActivities.externalId, message.externalMessageId))
      .limit(1);
    if (duplicate) return false;

    const identityCondition = and(
      eq(crmLeadChannels.channel, message.channel),
      eq(crmLeadChannels.externalAccountId, message.externalAccountId),
      eq(crmLeadChannels.externalContactId, message.externalContactId),
    );
    const [identity] = await tx.select({ leadId: crmLeadChannels.leadId })
      .from(crmLeadChannels)
      .where(identityCondition)
      .limit(1);

    let leadId = identity?.leadId;
    let createdLeadId: number | null = null;

    if (!leadId) {
      if (message.phone) {
        const candidates = await tx.select({
          id: crmLeads.id,
          phone: crmLeads.phone,
        }).from(crmLeads)
          .where(eq(crmLeads.phone, crmLeads.phone))
          .orderBy(desc(crmLeads.updatedAt))
          .limit(1000);
        const matches = candidates.filter((candidate) =>
          normalizePhone(candidate.phone) === normalizePhone(message.phone)
        );
        if (matches.length === 1) leadId = matches[0].id;
      }

      if (!leadId) {
        const fullName = message.displayName ||
          (message.channel.charAt(0).toUpperCase() + message.channel.slice(1) + " contact " + message.externalContactId.slice(-6));
        const [created] = await tx.insert(crmLeads).values({
          fullName,
          phone: message.phone,
          source: message.channel,
          stage: "new",
          notes: "",
        }).returning({ id: crmLeads.id });
        if (!created) throw new Error("Could not create CRM lead");
        leadId = created.id;
        createdLeadId = created.id;
      }

      const [linkedIdentity] = await tx.insert(crmLeadChannels).values({
        leadId,
        channel: message.channel,
        externalAccountId: message.externalAccountId,
        externalContactId: message.externalContactId,
        displayName: message.displayName,
      }).onConflictDoNothing().returning({ id: crmLeadChannels.id });

      if (!linkedIdentity) {
        const [winner] = await tx.select({ leadId: crmLeadChannels.leadId })
          .from(crmLeadChannels)
          .where(identityCondition)
          .limit(1);
        if (winner && winner.leadId !== leadId) {
          if (createdLeadId !== null) await tx.delete(crmLeads).where(eq(crmLeads.id, createdLeadId));
          leadId = winner.leadId;
        }
      }
    }

    if (!leadId) throw new Error("Could not resolve CRM lead");

    const [activity] = await tx.insert(crmActivities).values({
      leadId,
      channel: message.channel,
      direction: "inbound",
      body: message.body,
      externalId: message.externalMessageId,
      metadata: {
        platform: message.channel,
        accountId: message.externalAccountId,
        senderId: message.externalContactId,
        messageType: message.messageType,
      },
      createdAt: message.timestamp,
    }).onConflictDoNothing().returning({ id: crmActivities.id });

    if (!activity) return false;

    await tx.update(crmLeads).set({
      updatedAt: new Date(),
      lastContactAt: message.timestamp,
    }).where(eq(crmLeads.id, leadId));

    return true;
  });
}

export async function GET(request: Request) {
  const verifyToken = runtimeSecret("META_WEBHOOK_VERIFY_TOKEN");
  if (!verifyToken) {
    return new Response("Meta webhook verification token is not configured.", { status: 503 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") || url.searchParams.get("hub_mode");
  const suppliedToken = url.searchParams.get("hub.verify_token") || url.searchParams.get("hub_verify_token");
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("hub_challenge");

  if (mode === "subscribe" && challenge && suppliedToken && constantTimeEqual(verifyToken, suppliedToken)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = runtimeSecret("META_APP_SECRET");
  if (!appSecret) {
    return NextResponse.json({ error: "Meta webhook app secret is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength > 1_000_000) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!(await validMetaSignature(rawBody, signature, appSecret))) {
    return NextResponse.json({ error: "Invalid Meta webhook signature." }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    const parsedRecord = record(parsed);
    if (!parsedRecord) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    payload = parsedRecord;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const messages = extractIncomingMessages(payload);
  if (messages.length > 500) {
    return NextResponse.json({ error: "Too many messages in one webhook batch." }, { status: 413 });
  }

  try {
    let processed = 0;
    let duplicates = 0;
    for (const message of messages) {
      if (await persistIncomingMessage(message)) processed += 1;
      else duplicates += 1;
    }
    return NextResponse.json({ received: true, processed, duplicates }, { status: 200 });
  } catch {
    // Return a non-2xx response so Meta can retry; never log message content or tokens.
    console.error("Meta CRM webhook processing failed.");
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

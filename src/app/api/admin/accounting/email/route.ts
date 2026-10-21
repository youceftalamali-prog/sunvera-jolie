import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { getSettingsMap } from "@/lib/settings";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value) ?? "";
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

type ReportRequest = { from?: string; to?: string; status?: string };
type ReportRow = {
  order: typeof orders.$inferSelect;
  lines: (typeof orderItems.$inferSelect)[];
  units: number;
  estimatedCost: number;
};

function parseDateRange(body: ReportRequest) {
  const start = body.from ? new Date(body.from + "T00:00:00") : null;
  const end = body.to ? new Date(body.to + "T23:59:59.999") : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return { error: "Invalid report date range." as const, start, end, period: "" };
  }
  if (start && end && start > end) {
    return { error: "Start date must be before end date." as const, start, end, period: "" };
  }
  const period = body.from || body.to ? (body.from || "beginning") + " to " + (body.to || "today") : "all available dates";
  return { error: null, start, end, period };
}

function isInDateRange(order: typeof orders.$inferSelect, start: Date | null, end: Date | null, status?: string) {
  if (start && order.createdAt < start) return false;
  if (end && order.createdAt > end) return false;
  if (status && status !== "all" && order.status !== status) return false;
  return true;
}

function formatLineItems(lines: (typeof orderItems.$inferSelect)[]) {
  return lines.map((item) => String(item.quantity) + " x " + item.name).join(", ");
}

function buildReportHtml(
  reportRows: ReportRow[],
  deliveredSales: number,
  estimatedCost: number,
  estimatedGross: number,
  period: string,
) {
  const tableRows = reportRows.slice(0, 100).map(({ order, lines }) => {
    const productsText = escapeHtml(formatLineItems(lines));
    return '<tr><td>' + escapeHtml(order.reference) + '</td><td>' +
      escapeHtml(new Date(order.createdAt).toLocaleDateString("en-GB")) + '</td><td>' +
      escapeHtml(order.fullName) + '</td><td>' + escapeHtml(order.status) +
      '</td><td>' + productsText + '</td><td style="text-align:right;white-space:nowrap">' +
      escapeHtml(money(order.total)) + '</td></tr>';
  }).join("");
  return '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#30271f;line-height:1.5"><div style="max-width:900px;margin:auto">' +
    '<h1 style="color:#80632f">SunVera Jolie — Accounting Report</h1><p>Period: ' +
    escapeHtml(period) + ' · Generated ' + escapeHtml(new Date().toLocaleString("en-GB")) +
    '</p><div style="padding:16px;background:#f8f4ed;margin:16px 0"><p><strong>Orders in report:</strong> ' +
    reportRows.length + '</p><p><strong>Delivered sales:</strong> ' + escapeHtml(money(deliveredSales)) +
    '</p><p><strong>Estimated product cost:</strong> ' + escapeHtml(money(estimatedCost)) +
    '</p><p><strong>Estimated gross margin:</strong> ' + escapeHtml(money(estimatedGross)) +
    '</p></div><p style="font-size:12px;color:#6b5749">Estimate only: cost uses current catalog cost prices and excludes ads, packaging, delivery-provider charges, operating expenses and taxes. This is not net profit. Showing up to 100 order rows below.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f8f4ed"><th style="text-align:left;padding:8px">Reference</th><th style="text-align:left;padding:8px">Date</th><th style="text-align:left;padding:8px">Customer</th><th style="text-align:left;padding:8px">Status</th><th style="text-align:left;padding:8px">Products</th><th style="text-align:right;padding:8px">Total</th></tr></thead><tbody>' +
    tableRows + '</tbody></table><p style="font-size:11px;color:#6b5749">This report was requested from the SunVera Jolie admin console. Export CSV there for the full spreadsheet data.</p></div></body></html>';
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REPORT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return NextResponse.json({
      error: "Email is not configured yet. Add RESEND_API_KEY and REPORT_FROM_EMAIL to Cloudflare Worker secrets/variables.",
    }, { status: 503 });
  }

  const settings = await getSettingsMap();
  const recipient = settings.reports.recipientEmail.trim();
  if (!recipient) return NextResponse.json({ error: "Set the report recipient in Admin → Settings → Accounting Reports first." }, { status: 400 });

  let body: ReportRequest = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as ReportRequest;
  } catch {
    body = {};
  }

  const range = parseDateRange(body);
  if (range.error) return NextResponse.json({ error: range.error }, { status: 400 });

  const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500);
  const filtered = orderRows.filter((order) => isInDateRange(order, range.start, range.end, body.status));
  const ids = filtered.map((order) => order.id);
  const [items, catalog] = await Promise.all([
    ids.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : Promise.resolve([]),
    db.select().from(products),
  ]);
  const costById = new Map(catalog.map((product) => [product.id, Number(product.costPrice) || 0]));
  const reportRows: ReportRow[] = filtered.map((order) => {
    const lines = items.filter((item) => item.orderId === order.id);
    const units = lines.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedCost = lines.reduce((sum, item) => sum + (item.productId ? (costById.get(item.productId) ?? 0) * item.quantity : 0), 0);
    return { order, lines, units, estimatedCost };
  });
  const delivered = reportRows.filter((row) => row.order.status === "delivered");
  const deliveredSales = delivered.reduce((sum, row) => sum + row.order.total, 0);
  const estimatedCost = delivered.reduce((sum, row) => sum + row.estimatedCost, 0);
  const estimatedGross = deliveredSales - estimatedCost;
  const html = buildReportHtml(reportRows, deliveredSales, estimatedCost, estimatedGross, range.period);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject: "SunVera Jolie Accounting Report — " + range.period,
      html,
    }),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok) {
    return NextResponse.json({ error: result.message ?? result.name ?? "Email provider rejected the report." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: "Report sent to " + recipient, emailId: result.id });
}

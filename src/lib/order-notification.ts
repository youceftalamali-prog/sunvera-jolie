type OrderNotice = {
  reference: string;
  fullName: string;
  phone: string;
  email?: string;
  wilaya: string;
  commune?: string;
  address: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  createdAt?: Date | string;
  lines: { name: string; variant?: string; quantity: number; unitPrice: number }[];
};

export async function sendNewOrderNotification(order: OrderNotice): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFICATION_EMAIL || "youceftalamali@gmail.com";
  const from = process.env.ORDER_NOTIFICATION_FROM;
  if (!apiKey || !from) {
    console.error("Order email not sent: configure RESEND_API_KEY and ORDER_NOTIFICATION_FROM in Cloudflare secrets.");
    return false;
  }

  const money = (n: number) => new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n) + " DA";
  const items = order.lines.map(line =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(line.name)} ${line.variant ? "— " + escapeHtml(line.variant) : ""}</td><td style="padding:8px;text-align:center;border-bottom:1px solid #eee">${line.quantity}</td><td style="padding:8px;text-align:right;border-bottom:1px solid #eee">${money(line.unitPrice * line.quantity)}</td></tr>`
  ).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#382719;max-width:680px;margin:auto"><h1>Nouvelle commande SunVera Jolie</h1><p>Commande <strong>${escapeHtml(order.reference)}</strong></p><h2>Client</h2><p>${escapeHtml(order.fullName)}<br>Téléphone : ${escapeHtml(order.phone)}<br>Email : ${escapeHtml(order.email || "Non renseigné")}<br>Wilaya : ${escapeHtml(order.wilaya)}<br>Commune : ${escapeHtml(order.commune || "")}<br>Adresse : ${escapeHtml(order.address)}</p><h2>Produits commandés</h2><table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Produit</th><th>Qté</th><th align="right">Total</th></tr></thead><tbody>${items}</tbody></table><p>Sous-total : ${money(order.subtotal)}<br>Livraison : ${money(order.shipping)}<br>Réduction : ${money(order.discount)}<br><strong>Total à encaisser : ${money(order.total)}</strong></p><p>Mode de paiement : paiement à la livraison (COD).</p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Nouvelle commande ${order.reference} — ${money(order.total)}`,
      html
    })
  });
  if (!response.ok) {
    console.error("Order email provider returned", response.status, (await response.text()).slice(0, 500));
    return false;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char] ?? char);
}

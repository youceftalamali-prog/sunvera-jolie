import Link from "next/link";
import { db } from "@/db";
import { addresses, customers, orderItems, orders } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getCustomerId } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import LogoutButton from "@/components/LogoutButton";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const id = await getCustomerId();
  if (!id) return <AuthForm />;

  const [me] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!me) return <AuthForm />;

  const myOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.id));
  const items = myOrders.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, myOrders.map((o) => o.id)))
    : [];
  const addr = await db.select().from(addresses).where(eq(addresses.customerId, id));
  const spent = myOrders.reduce((s, o) => s + o.total, 0);

  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Hello, {me.fullName.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-cocoa-soft">{me.phone}{me.email ? ` · ${me.email}` : ""}</p>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Orders", String(myOrders.length)],
          ["Total spent", money(spent)],
          ["Last order", myOrders[0] ? new Date(myOrders[0].createdAt).toLocaleDateString() : "—"],
        ].map(([l, v]) => (
          <div key={l} className="border border-cocoa/10 bg-white p-5">
            <p className="text-[11px] uppercase tracking-widest text-cocoa-soft">{l}</p>
            <p className="mt-1 font-display text-2xl">{v}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 font-display text-2xl">My Orders</h2>
      {myOrders.length === 0 ? (
        <p className="mt-3 text-sm text-cocoa-soft">
          No orders yet. <Link href="/shop" className="text-gold underline">Start shopping</Link>.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {myOrders.map((o) => (
            <li key={o.id} className="border border-cocoa/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{o.reference}</p>
                <span className="bg-beige px-3 py-1 text-[11px] uppercase tracking-widest">{STATUS_LABEL[o.status]}</span>
                <span className="font-semibold">{money(o.total)}</span>
              </div>
              <p className="mt-1 text-xs text-cocoa-soft">
                {new Date(o.createdAt).toLocaleString()} · {o.wilaya}{o.commune ? `, ${o.commune}` : ""}
              </p>
              <ul className="mt-2 text-xs text-cocoa-soft">
                {items.filter((i) => i.orderId === o.id).map((i) => (
                  <li key={i.id}>{i.quantity} × {i.name} ({i.variant}) — {money(i.unitPrice * i.quantity)}</li>
                ))}
              </ul>
              <Link href={`/track?ref=${o.reference}`} className="mt-3 inline-block text-[11px] uppercase tracking-widest text-gold underline">
                Track this order
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-12 font-display text-2xl">Addresses</h2>
      {addr.length === 0 ? (
        <p className="mt-3 text-sm text-cocoa-soft">
          Your delivery details are saved with each order. {myOrders[0] ? `Last used: ${myOrders[0].address}, ${myOrders[0].commune} ${myOrders[0].wilaya}.` : ""}
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-cocoa-soft">
          {addr.map((a) => (
            <li key={a.id}>{a.label}: {a.street}, {a.commune} {a.wilaya}</li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex gap-4">
        <Link href="/wishlist" className="btn-outline">My Wishlist</Link>
        <Link href="/track" className="btn-outline">Track an order</Link>
      </div>
    </section>
  );
}

import Link from "next/link";
import { getNav } from "@/lib/cms";
import { getSettingsMap } from "@/lib/settings";
import NewsletterForm from "@/components/NewsletterForm";

function SocialIcon({ label }: { label: string }) {
  const common = "h-4 w-4";
  if (label === "Instagram") return <svg viewBox="0 0 24 24" className={common} aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>;
  if (label === "Facebook") return <svg viewBox="0 0 24 24" className={common} aria-hidden><path d="M14 8h3V4h-3c-3.2 0-5 1.9-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.7.3-1 1-1Z" fill="currentColor"/></svg>;
  if (label === "TikTok") return <svg viewBox="0 0 24 24" className={common} aria-hidden><path d="M14 4v10.2a3.8 3.8 0 1 1-3-3.7V14a1.8 1.8 0 1 0 1 1.7V4h3c.3 1.3 1.1 2.3 2.4 2.9V10c-1.2-.2-2.3-.7-3.4-1.5V4h0Z" fill="currentColor"/></svg>;
  if (label === "Pinterest") return <svg viewBox="0 0 24 24" className={common} aria-hidden><path d="M12 3.5a8.5 8.5 0 0 0-3.1 16.4c-.1-1.4 0-3.1.4-4.7l1.1-4.6s-.3-.7-.3-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.8 1.5 1.7 0 1-.6 2.5-.9 3.9-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.7-2.3 3.7-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.6 2.6-5.6 5.4 0 1.1.4 2.3 1 2.9.1.1.1.2.1.4l-.3 1.1c-.1.4-.3.5-.7.4-1.9-.8-2.8-2.9-2.8-5.2 0-3.9 2.9-7.4 8.2-7.4 4.3 0 7.6 3.1 7.6 7.2 0 4.3-2.7 7.7-6.5 7.7-1.3 0-2.6-.7-3-1.5l-.8 3.1c-.3 1.2-1 2.7-1.5 3.7A8.5 8.5 0 1 0 12 3.5Z" fill="currentColor"/></svg>;
  return <svg viewBox="0 0 24 24" className={common} aria-hidden><path d="M4 5h16v14H4z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m5 6 7 6 7-6M5 18l5-5m9 5-5-5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

export default async function Footer() {
  const [footerNav, settings] = await Promise.all([getNav("footer"), getSettingsMap()]);
  const columns = Array.from(new Set(footerNav.map((n) => n.column || "quick")));
  const titles: Record<string, string> = {
    quick: "Quick Links",
    care: "Customer Care",
    categories: "Categories",
    help: "Help",
  };
  const socials: [string, string][] = [
    ["Instagram", settings.social.instagram],
    ["Facebook", settings.social.facebook],
    ["TikTok", settings.social.tiktok],
    ["Pinterest", settings.social.pinterest],
    ["WhatsApp", settings.social.whatsapp],
  ];

  const head = "mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-cocoa";
  const item = "text-xs text-cocoa-soft transition hover:text-gold";

  return (
    <footer className="mt-20 border-t border-cocoa/10 bg-[#fbf4eb] pb-24 pt-8 sm:pb-10">
      <section className="relative overflow-hidden border-b border-cocoa/10 bg-[#f1dfcb]">
        {settings.newsletter.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.newsletter.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        )}
        <div className="relative mx-auto max-w-7xl px-6 py-10 sm:py-12">
          <div className="grid gap-7 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gold">Beauty Club</p>
              <h2 className="mt-2 font-display text-3xl text-cocoa sm:text-4xl">{settings.newsletter.heading || "Join the SunVera Jolie Beauty Club"}</h2>
              <p className="mt-3 max-w-xl text-sm text-cocoa-soft">{settings.newsletter.description || settings.footer.newsletterText}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.14em] text-cocoa-soft">
                <span>✦ Exclusive Offers</span><span>✦ New Arrivals</span><span>✦ Beauty Tips</span><span>✦ Special Discounts</span>
              </div>
            </div>
            <NewsletterForm buttonText={settings.newsletter.buttonText || "Subscribe"} />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr_1.1fr]">
        <div>
          {settings.store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.store.logoUrl} alt={settings.store.name} width={settings.store.logoWidth || undefined} height={settings.store.logoHeight || undefined} className="block h-11 w-auto object-contain" />
          ) : (
            <p className="font-display text-2xl tracking-[0.18em]">{settings.store.name}</p>
          )}
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.42em] text-gold">{settings.store.tagline}</p>
          <p className="mt-5 max-w-xs text-xs leading-relaxed text-cocoa-soft">{settings.footer.description}</p>
          <p className="mt-4 font-display text-xl italic text-[#b98639]">Timeless Elegance. Beautifully Yours.</p>
          <div className="mt-6 flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.12em] text-cocoa-soft">
            <span>Cash on Delivery</span><span>Secure Shopping</span><span>100% Original Products</span>
          </div>
        </div>

        {columns.map((col) => (
          <div key={col}>
            <p className={head}>{titles[col] ?? col}</p>
            <ul className="space-y-2">
              {footerNav.filter((n) => (n.column || "quick") === col).map((n) => (
                <li key={n.id}><Link href={n.url} className={item}>{n.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className={head}>Need Help?</p>
          <p className="text-xs text-cocoa-soft">We’re here for you.</p>
          <div className="mt-4 space-y-3 text-xs text-cocoa-soft">
            <a href={settings.social.whatsapp || "#"} className="flex items-center gap-2 hover:text-gold">WhatsApp · {settings.store.whatsapp}</a>
            <a href={`mailto:${settings.store.email}`} className="flex items-center gap-2 hover:text-gold">{settings.store.email}</a>
            <span className="block">Mon–Sat · 09:00–18:00</span>
          </div>
          <p className={head + " mt-7"}>Follow Us</p>
          <div className="flex flex-wrap gap-2">
            {socials.filter(([, url]) => url).map(([label, url]) => (
              <a key={label} href={url} aria-label={label} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/10 bg-white text-cocoa transition hover:border-gold hover:text-gold">
                <SocialIcon label={label} />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-cocoa/10 px-6 pt-6">
        <div className="flex flex-col gap-3 text-[10px] text-cocoa-soft sm:flex-row sm:items-center sm:justify-between">
          <p>{settings.footer.copyright} · Cash on Delivery · DZD · {new Date().getFullYear()}</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/legal/privacy-policy" className="hover:text-gold">Privacy Policy</Link>
            <Link href="/legal/terms-conditions" className="hover:text-gold">Terms & Conditions</Link>
            <Link href="/legal/return-refund-policy" className="hover:text-gold">Returns & Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

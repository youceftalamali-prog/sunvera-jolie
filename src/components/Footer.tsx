import Link from "next/link";
import { getNav } from "@/lib/cms";
import { getSettingsMap } from "@/lib/settings";
import NewsletterForm from "@/components/NewsletterForm";

export default async function Footer() {
  const [footerNav, settings] = await Promise.all([getNav("footer"), getSettingsMap()]);
  const columns = Array.from(new Set(footerNav.map((n) => n.column || "quick")));
  const titles: Record<string, string> = {
    quick: "Quick Links",
    care: "Customer Care",
    categories: "Categories",
    help: "Help",
  };
  const socials: [string, string, string][] = [
    ["Instagram", settings.social.instagram, "📷"],
    ["Facebook", settings.social.facebook, "📘"],
    ["TikTok", settings.social.tiktok, "🎵"],
    ["Pinterest", settings.social.pinterest, "📌"],
    ["WhatsApp", settings.social.whatsapp, "💬"],
  ];

  const head = "mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-cocoa";
  const item = "text-xs text-cocoa-soft hover:text-gold";

  return (
    <footer className="mt-24 border-t border-cocoa/10 bg-beige pb-24 pt-16 sm:pb-16">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="font-display text-xl tracking-[0.2em]">{settings.store.name}</p>
          <p className="mt-1 text-[10px] tracking-[0.4em] text-gold">{settings.store.tagline.toUpperCase()}</p>
          <p className="mt-4 text-xs leading-relaxed text-cocoa-soft">{settings.footer.description}</p>
        </div>

        {columns.map((col) => (
          <div key={col}>
            <p className={head}>{titles[col] ?? col}</p>
            <ul className="space-y-2">
              {footerNav
                .filter((n) => (n.column || "quick") === col)
                .map((n) => (
                  <li key={n.id}>
                    <Link href={n.url} className={item}>{n.label}</Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}

        <div>
          <p className={head}>{settings.footer.newsletterTitle}</p>
          <p className="text-xs text-cocoa-soft">{settings.footer.newsletterText}</p>
          <NewsletterForm />
          <div className="mt-4 flex gap-3 text-sm">
            {socials
              .filter(([, url]) => url)
              .map(([label, url, icon]) => (
                <a key={label} href={url} aria-label={label} className="hover:text-gold" target="_blank" rel="noreferrer">
                  {icon}
                </a>
              ))}
          </div>
          <p className="mt-4 text-[11px] text-cocoa-soft">
            {settings.store.email} · {settings.store.phone}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-cocoa/10 px-6 pt-6 text-[11px] text-cocoa-soft">
        <p>{settings.footer.copyright} · {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}

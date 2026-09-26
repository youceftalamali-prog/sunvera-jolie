import Image from "next/image";
import Link from "next/link";
import { getSections, getTrustBadges, activeBanners, resolveSectionProducts } from "@/lib/cms";
import { allCategories, productsWithImages } from "@/lib/queries";
import { getSettingsMap } from "@/lib/settings";
import { ProductRow } from "@/components/Sections";
import HeroCarousel from "@/components/HeroCarousel";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [sections, catalog, cats, badges, banners, settings] = await Promise.all([
    getSections(),
    productsWithImages(false),
    allCategories(),
    getTrustBadges(),
    activeBanners(),
    getSettingsMap(),
  ]);

  const shop: ShopProduct[] = catalog.map((p) => toShopProduct(p, p.images));
  const badgeList = badges.filter((b) => b.active);
  const banner = banners[0];

  const sectionByKey = (key: string) => sections.find((s) => s.key === key);

  return (
    <>
      {sections.map((s) => {
        const products = resolveSectionProducts(s, catalog).map((p) =>
          shop.find((x) => x.id === p.id) as ShopProduct,
        );

        switch (s.key) {
          case "hero":
            return <HeroCarousel key={s.id} section={s} storeName={settings.store.name} />;

          case "trust_badges":
            return (
              <section key={s.id} className="border-y border-cocoa/10 bg-beige" aria-label="Store benefits">
                <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-8 lg:grid-cols-5">
                  {badgeList.map((b) => (
                    <div key={b.id} className="text-center">
                      <div className="text-xl" aria-hidden>{b.icon}</div>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]">{b.title}</p>
                      <p className="text-[11px] text-cocoa-soft">{b.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            );

          case "categories":
            return (
              <section key={s.id} className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
                <div className="text-center">
                  <h2 className="section-title">{s.title}</h2>
                  {s.subtitle && <p className="mt-2 text-sm text-cocoa-soft">{s.subtitle}</p>}
                  <div className="gold-line mx-auto mt-4 w-24" />
                </div>
                <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {cats.map((c) => (
                    <Link key={c.slug} href={`/category/${c.slug}`} className="group border border-cocoa/10 bg-white p-5 text-center transition hover:border-gold hover:shadow-[0_8px_30px_rgba(58,43,34,0.07)]">
                      {c.imageUrl ? (
                        <span className="relative mx-auto block h-16 w-16 overflow-hidden rounded-full">
                          <Image src={c.imageUrl} alt={c.name} fill sizes="64px" className="object-cover" />
                        </span>
                      ) : (
                        <div className="text-3xl transition-transform duration-300 group-hover:scale-110" aria-hidden>{c.image}</div>
                      )}
                      <p className="mt-3 font-display text-sm">{c.name}</p>
                      <p className="mt-1 text-[10px] leading-snug text-cocoa-soft">{c.tagline}</p>
                      <span className="mt-3 inline-block text-[10px] uppercase tracking-[0.18em] text-gold">Shop Now →</span>
                    </Link>
                  ))}
                </div>
              </section>
            );

          case "promo_banner": {
            const bg = banner?.imageDesktop || s.imageUrl;
            const mobileBg = banner?.imageMobile || s.imageMobileUrl || bg;
            return (
              <section key={s.id} className="relative my-10 h-[360px] w-full" style={{ background: s.background || undefined }}>
                {bg && <Image src={bg} alt={banner?.title || s.title} fill sizes="100vw" loading="lazy" className="hidden object-cover sm:block" />}
                {mobileBg && <Image src={mobileBg} alt={s.title} fill sizes="100vw" loading="lazy" className="object-cover sm:hidden" />}
                <div className="absolute inset-0" style={{ background: `rgba(58,43,34,${s.overlayOpacity / 100})` }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-ivory">
                  <h2 className="font-display text-3xl sm:text-5xl" style={{ color: s.textColor || undefined }}>{banner?.title || s.title}</h2>
                  <p className="mt-3 text-sm text-ivory/90">{banner?.subtitle || s.subtitle}</p>
                  {(banner?.buttonText || s.buttonText) && (
                    <Link href={banner?.buttonUrl || s.buttonUrl || "/shop"} className="btn-gold mt-7">
                      {banner?.buttonText || s.buttonText}
                    </Link>
                  )}
                </div>
              </section>
            );
          }

          case "routine":
            return (
              <section key={s.id} className="py-16" style={{ background: s.background || "#f3ece2" }}>
                <div className="mx-auto max-w-7xl px-6 text-center">
                  <h2 className="section-title">{s.title}</h2>
                  <p className="mx-auto mt-3 max-w-lg text-sm text-cocoa-soft">{s.subtitle}</p>
                  <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
                    {s.items.map((it) => (
                      <Link key={it.title} href={it.url || "/shop"} className="border border-cocoa/10 bg-white p-6 transition hover:border-gold">
                        <div className="text-2xl" aria-hidden>{it.icon}</div>
                        <p className="mt-2 font-display text-lg">{it.title}</p>
                        <p className="text-[11px] text-cocoa-soft">{it.text}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            );

          case "skincare":
          case "hair_care":
            return (
              <section key={s.id} className="mx-auto max-w-7xl px-6 py-16">
                <div className="grid gap-10 lg:grid-cols-2">
                  <div className="border border-cocoa/10 bg-white p-8">
                    <h2 className="font-display text-2xl">{s.title}</h2>
                    <p className="mt-2 text-sm text-cocoa-soft">{s.subtitle}</p>
                    <ul className="mt-5 grid grid-cols-2 gap-2 text-xs">
                      {s.items.map((it) => (
                        <li key={it.title}>
                          <Link href={it.url || "/shop"} className="text-cocoa-soft hover:text-gold">· {it.title}</Link>
                        </li>
                      ))}
                    </ul>
                    <Link href={s.buttonUrl || "/shop"} className="btn-primary mt-7">{s.buttonText || "Shop now"}</Link>
                  </div>
                  <ProductRow title={s.title} subtitle="" items={products} href={s.buttonUrl || "/shop"} cta="Shop now" compact />
                </div>
              </section>
            );

          case "testimonials":
            return (
              <section key={s.id} className="border-t border-cocoa/10 bg-white py-16">
                <div className="mx-auto max-w-5xl px-6 text-center">
                  <h2 className="section-title">{s.title}</h2>
                  <div className="mt-10 grid gap-6 sm:grid-cols-3">
                    {s.items.map((it) => (
                      <figure key={it.title} className="border border-cocoa/10 p-6 text-start">
                        <div className="text-gold" aria-hidden>★★★★★</div>
                        <blockquote className="mt-3 text-sm text-cocoa-soft">“{it.text}”</blockquote>
                        <figcaption className="mt-3 text-[11px] uppercase tracking-widest text-cocoa">{it.title} · Verified Purchase ✓</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              </section>
            );

          case "newsletter":
            return (
              <section key={s.id} className="bg-beige py-16 text-center">
                <div className="mx-auto max-w-xl px-6">
                  <h2 className="section-title">{s.title}</h2>
                  <p className="mt-3 text-sm text-cocoa-soft">{s.subtitle}</p>
                  <form action="/api/newsletter" method="post" className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor="hp-nl">Email</label>
                    <input id="hp-nl" name="email" type="email" required placeholder="Enter your email" className="inp" />
                    <button className="btn-gold">{s.buttonText || "Subscribe"}</button>
                  </form>
                </div>
              </section>
            );

          default:
            if (s.key === "best_sellers" || s.key === "new_arrivals" || s.key === "featured") {
              return (
                <ProductRow
                  key={s.id}
                  title={s.title}
                  subtitle={s.subtitle}
                  items={products}
                  href={s.buttonUrl || "/shop"}
                  background={s.background}
                />
              );
            }
            return null;
        }
      })}

      {!sectionByKey("hero") && (
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="font-display text-4xl">{settings.store.name}</h1>
          <p className="mt-3 text-sm text-cocoa-soft">{settings.store.tagline}</p>
          <Link href="/shop" className="btn-primary mt-6">Shop Now</Link>
        </section>
      )}
    </>
  );
}

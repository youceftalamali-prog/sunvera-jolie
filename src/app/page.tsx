import Image from "next/image";
import Link from "next/link";
import { getSections, getTrustBadges, activeBanners, resolveSectionProducts } from "@/lib/cms";
import { allCategories, productsWithImages } from "@/lib/queries";
import { getSettingsMap } from "@/lib/settings";
import { ProductRow } from "@/components/Sections";
import { sectionTypographyStyle } from "@/lib/typography";
import HeroCarousel from "@/components/HeroCarousel";
import LuxuryProductRail from "@/components/LuxuryProductRail";
import EditorialProductCard from "@/components/EditorialProductCard";
import RotatingProductImage, { type RotationMode } from "@/components/RotatingProductImage";
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

  const newArrivals = shop.filter((p) => p.newArrival).sort((a, b) => b.id - a.id);
  const skincareProducts = shop.filter((p) =>
    ["skincare", "face-care", "serums", "cleansers", "moisturizers", "masks", "eye-care", "sun-care"].includes(p.categorySlug),
  );
  const hairProducts = shop.filter((p) => p.categorySlug === "hair-care");
  const routineProducts = [
    shop.find((p) => p.categorySlug === "cleansers"),
    shop.find((p) => p.categorySlug === "serums"),
    shop.find((p) => p.categorySlug === "moisturizers"),
    shop.find((p) => p.categorySlug === "sun-care"),
  ].filter((p): p is ShopProduct => Boolean(p));

  const sectionByKey = (key: string) => sections.find((s) => s.key === key);

  return (
    <>
      {sections.map((s) => {
        const products = resolveSectionProducts(s, catalog).map((p) =>
          shop.find((x) => x.id === p.id) as ShopProduct,
        );
        const typographyStyle = sectionTypographyStyle(
          s.settings && typeof s.settings === "object" && "typography" in s.settings
            ? (s.settings as { typography?: unknown }).typography
            : undefined,
        );

        const content = (() => {
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
              <section key={s.id} className="relative my-8 overflow-hidden bg-cocoa text-ivory sm:my-12">
                {bg && <Image src={bg} alt={banner?.title || s.title} fill sizes="100vw" className="hidden object-cover sm:block" />}
                {mobileBg && <Image src={mobileBg} alt={banner?.title || s.title} fill sizes="100vw" className="object-cover sm:hidden" />}
                <div className="absolute inset-0 bg-gradient-to-r from-cocoa/85 via-cocoa/55 to-cocoa/20" />
                <div className="relative mx-auto min-h-[430px] max-w-7xl px-6 py-20 sm:min-h-[520px] sm:px-10 lg:flex lg:items-center">
                  <div className="max-w-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#e2bf7a]">{s.body || "YOUR DAILY BEAUTY RITUAL"}</p>
                    <h2 className="mt-4 font-display text-4xl leading-tight sm:text-6xl">{banner?.title || s.title}</h2>
                    <p className="mt-4 max-w-lg text-sm leading-relaxed text-ivory/85">{banner?.subtitle || s.subtitle}</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      {(banner?.buttonText || s.buttonText) && <Link href={banner?.buttonUrl || s.buttonUrl || "/shop"} className="btn-gold">{banner?.buttonText || s.buttonText}</Link>}
                      {s.button2Text && <Link href={s.button2Url || "/shop"} className="btn-outline border-white/50 text-white hover:border-white hover:text-white">{s.button2Text}</Link>}
                    </div>
                  </div>
                </div>
              </section>
            );
          }

          case "collections":
            return (
              <section key={s.id} className="bg-beige py-14 sm:py-16" aria-label="Explore our collections">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                  <div className="text-center">
                    <h2 className="section-title">{s.title || "EXPLORE OUR COLLECTIONS"}</h2>
                    {s.subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-cocoa-soft">{s.subtitle}</p>}
                    <div className="gold-line mx-auto mt-4 w-24" />
                  </div>
                  <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {s.items.slice(0, 4).map((it, index) => (
                      <Link
                        key={`${it.title}-${index}`}
                        href={it.url || "/shop"}
                        className="group relative overflow-hidden rounded-2xl border border-cocoa/10 bg-white shadow-[0_10px_30px_rgba(58,43,34,0.06)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(58,43,34,0.12)]"
                      >
                        <div className="relative aspect-[1.05/1] overflow-hidden">
                          {it.image ? (
                            <Image
                              src={it.image}
                              alt={it.title}
                              fill
                              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                              className="scale-[1.015] object-cover blur-[1.2px] transition duration-700 group-hover:scale-105 group-hover:blur-[0.7px]"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#f3ece2] via-white to-[#ead8c3] text-5xl text-gold" aria-hidden>✦</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-cocoa/65 via-cocoa/10 to-transparent" />
                          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/30 bg-cocoa/25 p-4 text-center text-white backdrop-blur-[3px]">
                            <p className="font-display text-2xl leading-tight">{it.title}</p>
                            {it.text && <p className="mt-1 text-xs text-white/90">{it.text}</p>}
                            <span className="mt-4 inline-flex border border-white/70 bg-white/5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em]">Explore Collection →</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            );

          case "new_arrivals": {
            const picks = newArrivals.slice(0, 4);
            if (!picks.length) return null;
            const hero = picks[0];
            const rest = picks.slice(1);
            const modeValue = String(s.settings?.newArrivalsMode ?? "hover-auto");
            const rotationMode: RotationMode =
              modeValue === "static" || modeValue === "hover" || modeValue === "auto" || modeValue === "hover-auto"
                ? modeValue
                : "hover-auto";
            const interval = Number(s.settings?.newArrivalsIntervalMs ?? 3500);

            return (
              <section key={s.id} className="bg-[#faf3ea] py-16 sm:py-20" aria-label="New Arrivals">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gold">New Arrivals</p>
                    <h2 className="section-title mt-2">{s.title || "New Arrivals"}</h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-cocoa-soft">{s.subtitle || "Freshly added to the SunVera Jolie collection."}</p>
                  </div>

                  <div className="mt-10 grid gap-4 lg:grid-cols-[1.55fr_1fr_1fr_1fr]">
                    <article className="group relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_50px_rgba(58,43,34,0.08)]">
                      <Link href={"/product/" + hero.slug} className="block">
                        <div className="relative min-h-[470px] overflow-hidden">
                          <RotatingProductImage
                            images={gallery(hero)}
                            alt={hero.name}
                            mode={rotationMode}
                            intervalMs={interval}
                            className="transition duration-700 group-hover:scale-[1.02]"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-cocoa/80 via-cocoa/10 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f3d79e]">New Collection</p>
                            <h3 className="mt-2 font-display text-4xl leading-tight">A New Glow Awaits</h3>
                            <p className="mt-3 max-w-md text-sm text-white/85">{hero.shortDescription}</p>
                            <span className="mt-5 inline-flex border border-white/70 bg-white/10 px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.2em]">Discover New In →</span>
                          </div>
                        </div>
                      </Link>
                    </article>

                    {rest.map((product) => (
                      <EditorialProductCard
                        key={product.id}
                        product={product}
                        compact
                        rotationMode={rotationMode}
                        intervalMs={interval}
                      />
                    ))}
                  </div>

                  <div className="mt-8 text-center">
                    <Link href={s.buttonUrl || "/shop?sort=newest"} className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
                      View All New Arrivals →
                    </Link>
                  </div>
                </div>
              </section>
            );
          }

          case "routine":
            return (
              <section key={s.id} className="bg-ivory py-14 sm:py-16" aria-label="The SunVera Ritual">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                  <div className="rounded-[28px] border border-cocoa/10 bg-white/90 px-4 py-10 shadow-[0_18px_60px_rgba(58,43,34,0.06)] sm:px-6 lg:px-8">
                    <div className="text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gold">The SunVera Ritual</p>
                      <h2 className="section-title mt-2">{s.title || "Beauty Essentials for Every Moment"}</h2>
                      {s.subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-cocoa-soft">{s.subtitle}</p>}
                      <div className="gold-line mx-auto mt-4 w-24" />
                    </div>
                    <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {s.items.slice(0, 4).map((it, index) => (
                        <Link
                          key={`${it.title}-${index}`}
                          href={it.url || "/shop"}
                          className="group relative overflow-hidden rounded-2xl border border-cocoa/10 bg-beige transition duration-500 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(58,43,34,0.12)]"
                        >
                          <div className="relative aspect-[1.12/1] overflow-hidden">
                            {it.image ? (
                              <Image
                                src={it.image}
                                alt={it.title}
                                fill
                                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                                className="object-cover transition duration-700 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-[#f3ece2] text-4xl text-gold" aria-hidden>{it.icon || "✦"}</div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-cocoa/70 via-cocoa/5 to-transparent opacity-80" />
                            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                              <p className="font-display text-2xl">{it.title}</p>
                              {it.text && <p className="mt-1 text-xs text-white/90">{it.text}</p>}
                              <span className="mt-4 inline-flex border border-white/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em]">Explore →</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
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
            if (s.key === "featured") {
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
        })();

        return content ? (
          <div key={s.id} className="svj-section" style={typographyStyle}>
            {content}
          </div>
        ) : null;
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

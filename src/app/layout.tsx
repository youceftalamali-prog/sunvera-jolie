import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { StoreProvider } from "@/components/StoreProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import MobileNav from "@/components/MobileNav";
import BeautyAI from "@/components/BeautyAI";
import NewsletterPopup from "@/components/NewsletterPopup";
import { getSettingsMap, getTheme, themeCss } from "@/lib/settings";
import { getNav } from "@/lib/cms";
import { isSafeId } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettingsMap();
  // Uploaded social card first, main logo as a sensible fallback, nothing when neither exists.
  const ogImage = s.store.ogImageUrl || s.store.logoUrl || undefined;
  return {
    metadataBase: new URL(s.seo.siteUrl),
    title: { default: s.seo.defaultTitle, template: `%s | ${s.store.name}` },
    description: s.seo.defaultDescription,
    keywords: s.seo.keywords.split(",").map((k) => k.trim()),
    openGraph: {
      title: s.seo.defaultTitle,
      description: s.seo.defaultDescription,
      type: "website",
      url: s.seo.siteUrl,
      siteName: s.store.name,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: s.store.name,
      description: s.store.tagline,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, theme, headerNav] = await Promise.all([getSettingsMap(), getTheme(), getNav("header")]);
  const nav = headerNav.length
    ? headerNav.map((n) => ({ label: n.label, url: n.url }))
    : [
        { label: "Home", url: "/" },
        { label: "Shop", url: "/shop" },
        { label: "About Us", url: "/about" },
        { label: "Contact", url: "/contact" },
      ];

  return (
    <html lang="en" dir="ltr">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
        {settings.store.faviconUrl && (
          <>
            <link rel="icon" href={settings.store.faviconUrl} />
            <link rel="apple-touch-icon" href={settings.store.faviconUrl} />
          </>
        )}
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:bg-cocoa focus:px-4 focus:py-2 focus:text-ivory"
        >
          Skip to content
        </a>
        <StoreProvider>
          {settings.announcement.active && (
            <div
              className="px-4 py-2 text-center text-[11px] tracking-[0.12em]"
              style={{ background: settings.announcement.background, color: settings.announcement.textColor }}
            >
              {settings.announcement.link ? (
                <a href={settings.announcement.link}>{settings.announcement.text}</a>
              ) : (
                settings.announcement.text
              )}
            </div>
          )}
          <Header
            nav={nav}
            storeName={settings.store.name}
            tagline={settings.store.tagline}
            logoUrl={settings.store.logoUrl}
            logoMobileUrl={settings.store.logoMobileUrl}
            logoWidth={settings.store.logoWidth}
            logoHeight={settings.store.logoHeight}
          />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
          <MobileNav />
          {settings.ai.enabled && <BeautyAI />}
          <NewsletterPopup settings={settings.newsletter} />
        </StoreProvider>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: settings.store.name,
              slogan: settings.store.tagline,
              url: settings.seo.siteUrl,
              email: settings.store.email,
              telephone: settings.store.phone,
              ...(settings.store.logoUrl ? { logo: settings.store.logoUrl } : {}),
            }),
          }}
        />
        {isSafeId(settings.analytics.metaPixelId) && (
          <Script id="meta-pixel" strategy="afterInteractive">{`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init','${settings.analytics.metaPixelId}');fbq('track','PageView');
          `}</Script>
        )}
        {isSafeId(settings.analytics.tiktokPixelId) && (
          <Script id="tiktok-pixel" strategy="afterInteractive">{`
            !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||[];ttq._i[e]=[];ttq._u=n;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]={};var o=d.createElement(e);o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${settings.analytics.tiktokPixelId}');ttq.page()}(window,document,'ttq');
          `}</Script>
        )}
      </body>
    </html>
  );
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { banners, categories, homepageSections, navigationItems, trustBadges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { reorderSections, updateSection } from "@/lib/cms";
import { slugify } from "@/lib/format";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { kind?: string; id?: number; order?: number[] };

async function guard() {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);

export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const b = (await req.json()) as Body;

  switch (b.kind) {
    case "section-update": {
      if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const row = await updateSection(num(b.id), {
        ...(b.title !== undefined ? { title: str(b.title) } : {}),
        ...(b.subtitle !== undefined ? { subtitle: str(b.subtitle) } : {}),
        ...(b.body !== undefined ? { body: str(b.body) } : {}),
        ...(b.imageUrl !== undefined ? { imageUrl: str(b.imageUrl) } : {}),
        ...(b.imageMobileUrl !== undefined ? { imageMobileUrl: str(b.imageMobileUrl) } : {}),
        ...(b.imageTabletUrl !== undefined ? { imageTabletUrl: str(b.imageTabletUrl) } : {}),
        ...(b.buttonText !== undefined ? { buttonText: str(b.buttonText) } : {}),
        ...(b.buttonUrl !== undefined ? { buttonUrl: str(b.buttonUrl) } : {}),
        ...(b.button2Text !== undefined ? { button2Text: str(b.button2Text) } : {}),
        ...(b.button2Url !== undefined ? { button2Url: str(b.button2Url) } : {}),
        ...(b.background !== undefined ? { background: str(b.background) } : {}),
        ...(b.textColor !== undefined ? { textColor: str(b.textColor) } : {}),
        ...(b.textPosition !== undefined ? { textPosition: str(b.textPosition, "left") } : {}),
        ...(b.overlayOpacity !== undefined ? { overlayOpacity: num(b.overlayOpacity, 35) } : {}),
        ...(b.productMode !== undefined ? { productMode: str(b.productMode, "auto") } : {}),
        ...(b.productCount !== undefined ? { productCount: num(b.productCount, 4) } : {}),
        ...(b.productIds !== undefined ? { productIds: (b.productIds as number[]) ?? [] } : {}),
        ...(b.items !== undefined ? { items: b.items as never } : {}),
        ...(b.enabled !== undefined ? { enabled: bool(b.enabled) } : {}),
      });
      return NextResponse.json({ section: row });
    }
    case "section-reorder": {
      if (!Array.isArray(b.order)) return NextResponse.json({ error: "order[] required" }, { status: 400 });
      await reorderSections(b.order);
      return NextResponse.json({ ok: true });
    }
    case "badge-save": {
      const values = {
        icon: str(b.icon, "✨"),
        title: str(b.title, "Badge"),
        description: str(b.description),
        active: bool(b.active, true),
        sortOrder: num(b.sortOrder),
      };
      const [row] = b.id
        ? await db.update(trustBadges).set(values).where(eq(trustBadges.id, num(b.id))).returning()
        : await db.insert(trustBadges).values(values).returning();
      return NextResponse.json({ badge: row });
    }
    case "badge-delete": {
      await db.delete(trustBadges).where(eq(trustBadges.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "banner-save": {
      const values = {
        title: str(b.title),
        subtitle: str(b.subtitle),
        imageDesktop: str(b.imageDesktop),
        imageMobile: str(b.imageMobile),
        buttonText: str(b.buttonText),
        buttonUrl: str(b.buttonUrl),
        background: str(b.background),
        textColor: str(b.textColor),
        active: bool(b.active, true),
        sortOrder: num(b.sortOrder),
        startsAt: b.startsAt ? new Date(str(b.startsAt)) : null,
        endsAt: b.endsAt ? new Date(str(b.endsAt)) : null,
      };
      const [row] = b.id
        ? await db.update(banners).set(values).where(eq(banners.id, num(b.id))).returning()
        : await db.insert(banners).values(values).returning();
      return NextResponse.json({ banner: row });
    }
    case "banner-delete": {
      await db.delete(banners).where(eq(banners.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "category-save": {
      const name = str(b.name, "Category");
      const values = {
        name,
        slug: str(b.slug) || slugify(name),
        group: str(b.group, "Skincare"),
        parentSlug: str(b.parentSlug),
        tagline: str(b.tagline),
        description: str(b.description),
        image: str(b.image, "🌸"),
        imageUrl: str(b.imageUrl),
        seoTitle: str(b.seoTitle),
        seoDescription: str(b.seoDescription),
        active: bool(b.active, true),
        sortOrder: num(b.sortOrder),
      };
      const [row] = b.id
        ? await db.update(categories).set(values).where(eq(categories.id, num(b.id))).returning()
        : await db.insert(categories).values(values).returning();
      return NextResponse.json({ category: row });
    }
    case "category-delete": {
      await db.update(categories).set({ active: false }).where(eq(categories.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "nav-save": {
      const values = {
        label: str(b.label, "Link"),
        url: str(b.url, "/"),
        location: str(b.location, "header"),
        column: str(b.column, "quick"),
        sortOrder: num(b.sortOrder),
        active: bool(b.active, true),
      };
      const [row] = b.id
        ? await db.update(navigationItems).set(values).where(eq(navigationItems.id, num(b.id))).returning()
        : await db.insert(navigationItems).values(values).returning();
      return NextResponse.json({ nav: row });
    }
    case "nav-delete": {
      await db.delete(navigationItems).where(eq(navigationItems.id, num(b.id)));
      return NextResponse.json({ ok: true });
    }
    case "sections-list": {
      const rows = await db.select().from(homepageSections).orderBy(homepageSections.sortOrder);
      return NextResponse.json({ sections: rows });
    }
    default:
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }
}

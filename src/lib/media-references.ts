import { db } from "@/db";
import { productImages, products, type MediaItem } from "@/db/schema";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

/**
 * Media reference tracking (P2-9).
 *
 * A media row is referenced in two different ways:
 *
 *  1. Structurally, by `product_images.media_id` (and by `product_images.url`, which stores
 *     the public address of the asset — legacy rows can carry the URL without the FK).
 *  2. Textually, by any column that stores the asset URL as a string: banner images,
 *     homepage section images and rich text, category/collection images, brand logos kept in
 *     `store_settings`, variant images, product descriptions, translations, …
 *
 * Deleting an asset therefore has to look at both, otherwise the deletion "succeeds" while the
 * storefront keeps rendering `/api/media/<id>` and every visitor sees a broken image.
 */

export type ProductImageReference = {
  imageId: number;
  productId: number;
  productName: string;
  productSlug: string;
  url: string;
  imageType: string;
  isPrimary: boolean;
  /** Whether the row was found through the media_id FK or through its stored URL. */
  matchedBy: "mediaId" | "url";
};

export type TextReference = {
  table: string;
  column: string;
  rowId: string;
  label: string;
};

export type MediaReferences = {
  productImages: ProductImageReference[];
  textReferences: TextReference[];
  /** Every string that addresses this asset from a stored value. */
  needles: string[];
};

/**
 * Columns that may hold an asset URL (or rich text embedding one).
 * Hard-coded: the values are interpolated into SQL, so they must never come from user input.
 */
const TEXT_SOURCES: { table: string; idColumn: string; labelColumn: string; columns: string[] }[] = [
  { table: "banners", idColumn: "id", labelColumn: "title", columns: ["image_desktop", "image_mobile", "background"] },
  { table: "categories", idColumn: "id", labelColumn: "name", columns: ["image", "image_url", "description"] },
  { table: "collections", idColumn: "id", labelColumn: "name", columns: ["image", "banner", "description"] },
  {
    table: "homepage_sections",
    idColumn: "id",
    labelColumn: "label",
    columns: ["body", "image_url", "image_mobile_url", "image_tablet_url", "background", "settings::text"],
  },
  { table: "homepage_versions", idColumn: "id", labelColumn: "status", columns: ["sections::text"] },
  { table: "navigation_items", idColumn: "id", labelColumn: "label", columns: ["image"] },
  { table: "products", idColumn: "id", labelColumn: "name", columns: ["description", "how_to_use", "short_description"] },
  { table: "product_variants", idColumn: "id", labelColumn: "label", columns: ["image_url"] },
  { table: "store_settings", idColumn: "key", labelColumn: "key", columns: ["value::text"] },
  { table: "translations", idColumn: "id", labelColumn: "key", columns: ["value"] },
  { table: "trust_badges", idColumn: "id", labelColumn: "title", columns: ["description", "icon"] },
];

/**
 * Local assets are always served through `/api/media/<id>`. The trailing `([^0-9]|$)` keeps
 * id 12 from matching the URL of id 123.
 */
export function localMediaPattern(id: number) {
  return `/api/media/${id}([^0-9]|$)`;
}

/** Absolute provider URL, only meaningful for non-local providers. */
export function remoteMediaNeedle(row: Pick<MediaItem, "provider" | "url">) {
  return row.provider === "local" ? "" : row.url ?? "";
}

export function mediaNeedles(row: Pick<MediaItem, "id" | "provider" | "url">) {
  const needles = [`/api/media/${row.id}`];
  const remote = remoteMediaNeedle(row);
  if (remote) needles.push(remote);
  return needles;
}

/** product_images rows that point at this asset, by FK or by stored URL. */
export function productImageReferencePredicate(row: Pick<MediaItem, "id" | "provider" | "url">): SQL {
  const conditions: SQL[] = [
    eq(productImages.mediaId, row.id),
    sql`${productImages.url} ~ ${localMediaPattern(row.id)}`,
  ];
  const remote = remoteMediaNeedle(row);
  if (remote) conditions.push(sql`position(${remote} in ${productImages.url}) > 0`);
  return or(...conditions) as SQL;
}

export async function findProductImageReferences(
  row: Pick<MediaItem, "id" | "provider" | "url">,
): Promise<ProductImageReference[]> {
  const rows = await db
    .select({
      imageId: productImages.id,
      productId: productImages.productId,
      productName: products.name,
      productSlug: products.slug,
      url: productImages.url,
      imageType: productImages.imageType,
      isPrimary: productImages.isPrimary,
      mediaId: productImages.mediaId,
    })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(productImageReferencePredicate(row))
    .orderBy(productImages.id);

  return rows.map((r) => ({
    imageId: r.imageId,
    productId: r.productId,
    productName: r.productName,
    productSlug: r.productSlug,
    url: r.url,
    imageType: r.imageType,
    isPrimary: r.isPrimary,
    matchedBy: r.mediaId === row.id ? "mediaId" : "url",
  }));
}

/** Textual references: any stored string that still addresses this asset. */
export async function findTextReferences(row: Pick<MediaItem, "id" | "provider" | "url">): Promise<TextReference[]> {
  const pattern = localMediaPattern(row.id);
  const remote = remoteMediaNeedle(row);

  const selects: SQL[] = [];
  for (const source of TEXT_SOURCES) {
    for (const column of source.columns) {
      const value = sql`coalesce(${sql.raw(column)}, '')`;
      selects.push(sql`select ${source.table}::text as source_table, ${column}::text as source_column,
        ${sql.raw(source.idColumn)}::text as row_id, coalesce(${sql.raw(source.labelColumn)}, '')::text as label
        from ${sql.raw(source.table)}
        where ${value} ~ ${pattern} or (${remote} <> '' and position(${remote} in ${value}) > 0)`);
    }
  }

  const union = selects.reduce((acc, part) => sql`${acc} union all ${part}`);
  const result = await db.execute(
    sql<{ source_table: string; source_column: string; row_id: string; label: string }>`
      select * from (${union}) as media_text_references
      order by source_table, source_column, row_id
      limit 500`,
  );

  const rows = (result.rows ?? []) as { source_table: string; source_column: string; row_id: string; label: string }[];
  return rows.map((r) => ({
    table: String(r.source_table),
    column: String(r.source_column).replace("::text", ""),
    rowId: String(r.row_id),
    label: String(r.label),
  }));
}

export async function findMediaReferences(row: MediaItem): Promise<MediaReferences> {
  const [productImageRefs, textRefs] = await Promise.all([
    findProductImageReferences(row),
    findTextReferences(row),
  ]);
  return { productImages: productImageRefs, textReferences: textRefs, needles: mediaNeedles(row) };
}

/** Distinct products affected by a set of product-image references. */
export function referencedProducts(refs: ProductImageReference[]) {
  const byProduct = new Map<number, { id: number; name: string; slug: string; images: number }>();
  for (const ref of refs) {
    const entry = byProduct.get(ref.productId) ?? { id: ref.productId, name: ref.productName, slug: ref.productSlug, images: 0 };
    entry.images += 1;
    byProduct.set(ref.productId, entry);
  }
  return [...byProduct.values()].sort((a, b) => a.id - b.id);
}

/** Human-readable summary of textual references, e.g. "banners.image_desktop (row 3)". */
export function summarizeTextReferences(refs: TextReference[], limit = 6) {
  const seen = new Map<string, number>();
  for (const ref of refs) {
    const key = `${ref.table}.${ref.column}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const parts = [...seen.entries()].map(([key, count]) => (count > 1 ? `${key} ×${count}` : key));
  const shown = parts.slice(0, limit);
  if (parts.length > shown.length) shown.push(`+${parts.length - shown.length} more`);
  return shown;
}

/** Ids of the given products that would be left without any image. */
export async function productsWithoutImages(tx: Pick<typeof db, "select">, productIds: number[]) {
  if (!productIds.length) return [] as number[];
  const rows = await tx
    .select({ productId: productImages.productId, remaining: sql<number>`count(*)::int` })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .groupBy(productImages.productId);
  const remaining = new Map(rows.map((r) => [r.productId, r.remaining]));
  return productIds.filter((id) => (remaining.get(id) ?? 0) === 0);
}

/**
 * Keeps exactly one main image per product after slots were removed: if a product lost its
 * primary image, the first remaining slot (by sort order) is promoted.
 */
export async function repairPrimaryImages(tx: Pick<typeof db, "select" | "update">, productIds: number[]) {
  const repaired: number[] = [];
  for (const productId of productIds) {
    const [primary] = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(and(eq(productImages.productId, productId), eq(productImages.isPrimary, true)))
      .limit(1);
    if (primary) continue;
    const [candidate] = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(productImages.sortOrder, productImages.id)
      .limit(1);
    if (!candidate) continue;
    await tx.update(productImages).set({ isPrimary: true, imageType: "main" }).where(eq(productImages.id, candidate.id));
    repaired.push(productId);
  }
  return repaired;
}

import { allCategories, productsWithImages } from "@/lib/queries";
import ProductForm from "@/components/admin/ProductForm";
import { EMPTY_DRAFT } from "@/lib/product-draft";
import { storageWarning } from "@/lib/storage";
import { getSettingsMap } from "@/lib/settings";
import { uploadLimitsFrom } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [cats, existing, settings] = await Promise.all([allCategories(false), productsWithImages(true), getSettingsMap()]);
  const last = existing[0];
  const suggestedSku = `SVJ-${String(existing.length + 1).padStart(4, "0")}`;

  return (
    <ProductForm
      mode="new"
      storageWarning={storageWarning()}
      uploadLimits={uploadLimitsFrom(settings.security)}
      categories={cats.filter((c) => c.active).map((c) => ({ name: c.name, slug: c.slug }))}
      initial={{
        ...EMPTY_DRAFT,
        sku: suggestedSku,
        categorySlug: cats[0]?.slug ?? "serums",
        tags: last ? "" : "",
      }}
    />
  );
}

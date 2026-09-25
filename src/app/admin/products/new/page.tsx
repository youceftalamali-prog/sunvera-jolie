import { allCategories, productsWithImages } from "@/lib/queries";
import ProductForm, { EMPTY_DRAFT } from "@/components/admin/ProductForm";
import { storageWarning } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [cats, existing] = await Promise.all([allCategories(false), productsWithImages(true)]);
  const last = existing[0];
  const suggestedSku = `SVJ-${String(existing.length + 1).padStart(4, "0")}`;

  return (
    <ProductForm
      mode="new"
      storageWarning={storageWarning()}
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

export type ShopImage = {
  id: number;
  url: string;
  alt: string;
  imageType: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type ShopProduct = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  brand: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  benefits: string;
  ingredients: string;
  howToUse: string;
  warnings: string;
  size: string;
  volume: string;
  skinType: string;
  hairType: string;
  productType: string;
  tags: string;
  price: number;
  comparePrice: number;
  stock: number;
  lowStockThreshold: number;
  rating: number;
  reviewsCount: number;
  emoji: string;
  tone: string;
  bestSeller: boolean;
  newArrival: boolean;
  featured: boolean;
  status: string;
  seoTitle: string;
  seoDescription: string;
  images: ShopImage[];
};

export type CartLine = {
  productId: number;
  slug: string;
  name: string;
  price: number;
  emoji: string;
  tone: string;
  size: string;
  variant: string;
  image?: string;
  qty: number;
};

 
export function toShopProduct(p: any, images: any[] = []): ShopProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    brand: p.brand,
    categorySlug: p.categorySlug,
    shortDescription: p.shortDescription,
    description: p.description ?? "",
    benefits: p.benefits ?? "",
    ingredients: p.ingredients ?? "",
    howToUse: p.howToUse ?? "",
    warnings: p.warnings ?? "",
    size: p.size,
    volume: p.volume ?? "",
    skinType: p.skinType,
    hairType: p.hairType,
    productType: p.productType,
    tags: p.tags,
    price: p.price,
    comparePrice: p.comparePrice,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold ?? 10,
    rating: p.rating,
    reviewsCount: p.reviewsCount,
    emoji: p.emoji,
    tone: p.tone,
    bestSeller: p.bestSeller,
    newArrival: p.newArrival,
    featured: p.featured,
    status: p.status ?? "published",
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    images: (images ?? []).map((i) => ({
      id: i.id,
      url: i.url ?? "",
      alt: i.alt ?? "",
      imageType: i.imageType ?? "gallery",
      sortOrder: i.sortOrder ?? 0,
      isPrimary: Boolean(i.isPrimary),
    })),
  };
}

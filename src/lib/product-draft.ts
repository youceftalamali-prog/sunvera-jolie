import type { ManagedImage } from "@/components/admin/ImageManager";

/**
 * Product editor draft shape + defaults.
 *
 * This lives in a plain (non-"use client") module on purpose: server pages such as
 * /admin/products/new spread EMPTY_DRAFT into the form's `initial` prop, and a value
 * imported from a client module into a server component resolves to a client reference,
 * not to the object — which silently produced an empty draft.
 */

export type VariantRow = {
  label: string;
  sku: string;
  price: number;
  comparePrice: number;
  stock: number;
  imageUrl: string;
};

export type ProductDraft = {
  id?: number;
  name: string;
  slug: string;
  sku: string;
  barcode: string;
  brand: string;
  categorySlug: string;
  subcategorySlug: string;
  productType: string;
  status: string;
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  price: number;
  comparePrice: number;
  costPrice: number;
  currency: string;
  stock: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  allowBackorders: boolean;
  size: string;
  volume: string;
  emoji: string;
  tone: string;
  skinType: string;
  hairType: string;
  routineStep: string;
  shortDescription: string;
  description: string;
  benefits: string;
  ingredients: string;
  howToUse: string;
  warnings: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  canonicalUrl: string;
  images: ManagedImage[];
  variants: VariantRow[];
};

export const EMPTY_DRAFT: ProductDraft = {
  name: "",
  slug: "",
  sku: "",
  barcode: "",
  brand: "SunVera Jolie",
  categorySlug: "serums",
  subcategorySlug: "",
  productType: "Serum",
  status: "draft",
  featured: false,
  bestSeller: false,
  newArrival: true,
  price: 0,
  comparePrice: 0,
  costPrice: 0,
  currency: "DZD",
  stock: 20,
  lowStockThreshold: 10,
  trackInventory: true,
  allowBackorders: false,
  size: "50ml",
  volume: "50 ml",
  emoji: "🧴",
  tone: "beige",
  skinType: "All skin types",
  hairType: "",
  routineStep: "Treat",
  shortDescription: "",
  description: "",
  benefits: "",
  ingredients: "",
  howToUse: "",
  warnings: "For external use only. Avoid contact with eyes. Patch test before first use.",
  tags: "",
  seoTitle: "",
  seoDescription: "",
  seoKeywords: "",
  canonicalUrl: "",
  images: [],
  variants: [],
};

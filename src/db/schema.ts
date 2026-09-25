import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ----------------------- Locations (Algeria) ----------------------- */

export const wilayas = pgTable("wilayas", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameAr: text("name_ar").notNull().default(""),
  nameFr: text("name_fr").notNull(),
  nameEn: text("name_en").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const communes = pgTable(
  "communes",
  {
    id: serial("id").primaryKey(),
    wilayaCode: text("wilaya_code").notNull(),
    nameAr: text("name_ar").notNull().default(""),
    nameFr: text("name_fr").notNull(),
    nameEn: text("name_en").notNull().default(""),
    active: boolean("active").notNull().default(true),
    deliveryFee: integer("delivery_fee"),
  },
  (t) => [index("communes_wilaya_idx").on(t.wilayaCode)],
);

export const shippingRates = pgTable("shipping_rates", {
  id: serial("id").primaryKey(),
  wilayaCode: text("wilaya_code").notNull().unique(),
  fee: integer("fee").notNull().default(700),
  stopDeskFee: integer("stop_desk_fee").notNull().default(0),
  etaDays: text("eta_days").notNull().default("2-4"),
  homeDelivery: boolean("home_delivery").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

/* ------------------------------ Catalog ---------------------------- */

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  group: text("group").notNull().default("Skincare"),
  parentSlug: text("parent_slug").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  image: text("image").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  seoTitle: text("seo_title").notNull().default(""),
  seoDescription: text("seo_description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sku: text("sku").notNull().default(""),
    barcode: text("barcode").notNull().default(""),
    brand: text("brand").notNull().default("SunVera Jolie"),
    categorySlug: text("category_slug").notNull(),
    subcategorySlug: text("subcategory_slug").notNull().default(""),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    benefits: text("benefits").notNull().default(""),
    ingredients: text("ingredients").notNull().default(""),
    howToUse: text("how_to_use").notNull().default(""),
    warnings: text("warnings").notNull().default(""),
    size: text("size").notNull().default("50ml"),
    volume: text("volume").notNull().default(""),
    skinType: text("skin_type").notNull().default("All skin types"),
    hairType: text("hair_type").notNull().default(""),
    productType: text("product_type").notNull().default(""),
    routineStep: text("routine_step").notNull().default(""),
    tags: text("tags").notNull().default(""),
    price: integer("price").notNull(),
    comparePrice: integer("compare_price").notNull().default(0),
    costPrice: integer("cost_price").notNull().default(0),
    currency: text("currency").notNull().default("DZD"),
    stock: integer("stock").notNull().default(30),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
    trackInventory: boolean("track_inventory").notNull().default(true),
    allowBackorders: boolean("allow_backorders").notNull().default(false),
    rating: real("rating").notNull().default(4.8),
    reviewsCount: integer("reviews_count").notNull().default(0),
    tone: text("tone").notNull().default("beige"),
    emoji: text("emoji").notNull().default("🧴"),
    bestSeller: boolean("best_seller").notNull().default(false),
    newArrival: boolean("new_arrival").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    status: text("status").notNull().default("published"), // draft | published | archived
    active: boolean("active").notNull().default(true),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    seoKeywords: text("seo_keywords").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_category_idx").on(t.categorySlug),
    uniqueIndex("products_sku_unique_idx").on(sql`lower(btrim(${t.sku}))`).where(sql`btrim(${t.sku}) <> ''`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sku: text("sku").notNull().default(""),
    price: integer("price").notNull().default(0),
    comparePrice: integer("compare_price").notNull().default(0),
    priceDelta: integer("price_delta").notNull().default(0),
    stock: integer("stock").notNull().default(20),
    imageUrl: text("image_url").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("product_variants_sku_unique_idx")
      .on(sql`lower(btrim(${t.sku}))`)
      .where(sql`btrim(${t.sku}) <> ''`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull().default(""),
    mediaId: integer("media_id").references(() => media.id, { onDelete: "set null" }),
    alt: text("alt").notNull().default(""),
    imageType: text("image_type").notNull().default("gallery"), // main|gallery|lifestyle|detail|ingredient|howto|size|beforeafter
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    title: text("title").notNull().default(""),
    caption: text("caption").notNull().default(""),
    focalX: integer("focal_x").notNull().default(50),
    focalY: integer("focal_y").notNull().default(50),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

/* ------------------------------ Media ------------------------------ */

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  storageKey: text("storage_key").notNull().default(""),
  provider: text("provider").notNull().default("local"),
  filename: text("filename").notNull().default(""),
  alt: text("alt").notNull().default(""),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  size: integer("size").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  folder: text("folder").notNull().default("other"),
  title: text("title").notNull().default(""),
  caption: text("caption").notNull().default(""),
  focalX: integer("focal_x").notNull().default(50),
  focalY: integer("focal_y").notNull().default(50),
  source: text("source").notNull().default("upload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------ CMS -------------------------------- */

export const homepageSections = pgTable("homepage_sections", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  imageMobileUrl: text("image_mobile_url").notNull().default(""),
  imageTabletUrl: text("image_tablet_url").notNull().default(""),
  buttonText: text("button_text").notNull().default(""),
  buttonUrl: text("button_url").notNull().default(""),
  button2Text: text("button2_text").notNull().default(""),
  button2Url: text("button2_url").notNull().default(""),
  background: text("background").notNull().default(""),
  textColor: text("text_color").notNull().default(""),
  textPosition: text("text_position").notNull().default("left"),
  overlayOpacity: integer("overlay_opacity").notNull().default(35),
  productMode: text("product_mode").notNull().default("auto"), // auto | manual
  productCount: integer("product_count").notNull().default(4),
  productIds: jsonb("product_ids").$type<number[]>().notNull().default([]),
  items: jsonb("items")
    .$type<{ icon?: string; title: string; text?: string; url?: string; image?: string }[]>()
    .notNull()
    .default([]),
  type: text("type").notNull().default("image_text"),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  imageDesktop: text("image_desktop").notNull().default(""),
  imageMobile: text("image_mobile").notNull().default(""),
  buttonText: text("button_text").notNull().default(""),
  buttonUrl: text("button_url").notNull().default(""),
  background: text("background").notNull().default(""),
  textColor: text("text_color").notNull().default(""),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const trustBadges = pgTable("trust_badges", {
  id: serial("id").primaryKey(),
  icon: text("icon").notNull().default("✨"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const navigationItems = pgTable("navigation_items", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  location: text("location").notNull().default("header"), // header | footer | mobile
  column: text("column").notNull().default(""),
  parentId: integer("parent_id"),
  mega: boolean("mega").notNull().default(false),
  image: text("image").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const themeSettings = pgTable("theme_settings", {
  id: integer("id").primaryKey().default(1),
  primary: text("primary").notNull().default("#c9a45c"),
  secondary: text("secondary").notNull().default("#e3cdbb"),
  accent: text("accent").notNull().default("#c9a45c"),
  background: text("background").notNull().default("#fdfbf7"),
  surface: text("surface").notNull().default("#ffffff"),
  textColor: text("text_color").notNull().default("#3a2b22"),
  mutedColor: text("muted_color").notNull().default("#6b5749"),
  buttonBg: text("button_bg").notNull().default("#3a2b22"),
  buttonText: text("button_text").notNull().default("#fdfbf7"),
  borderColor: text("border_color").notNull().default("#e8ddcd"),
  headingFont: text("heading_font").notNull().default("serif"),
  bodyFont: text("body_font").notNull().default("sans"),
  buttonFont: text("button_font").notNull().default("sans"),
});

export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/* --------------------------- Collections ---------------------------- */

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  image: text("image").notNull().default(""),
  banner: text("banner").notNull().default(""),
  seoTitle: text("seo_title").notNull().default(""),
  seoDescription: text("seo_description").notNull().default(""),
  type: text("type").notNull().default("manual"), // manual | automatic
  rules: jsonb("rules").notNull().default({}),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const collectionProducts = pgTable(
  "collection_products",
  {
    id: serial("id").primaryKey(),
    collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("collection_products_unique_idx").on(t.collectionId, t.productId)],
);

/* ------------------------ Homepage versions ------------------------- */

export const homepageVersions = pgTable("homepage_versions", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft | published | archived
  sections: jsonb("sections").notNull().default([]),
  changes: text("changes").notNull().default(""),
  createdBy: text("created_by").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  publishedAt: timestamp("published_at"),
});

/* --------------------------- Translations --------------------------- */

export const translations = pgTable(
  "translations",
  {
    id: serial("id").primaryKey(),
    locale: text("locale").notNull().default("en"), // en | fr | ar
    key: text("key").notNull(),
    value: text("value").notNull().default(""),
  },
  (t) => [uniqueIndex("translations_locale_key_idx").on(t.locale, t.key)],
);

/* ------------------------------ People ----------------------------- */

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  wilaya: text("wilaya").notNull(),
  commune: text("commune").notNull().default(""),
  street: text("street").notNull().default(""),
});

/* ------------------------------ Orders ----------------------------- */

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  wilayaCode: text("wilaya_code").notNull().default(""),
  wilaya: text("wilaya").notNull(),
  commune: text("commune").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  adminNotes: text("admin_notes").notNull().default(""),
  subtotal: integer("subtotal").notNull(),
  shipping: integer("shipping").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull(),
  couponCode: text("coupon_code").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default("cod"),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("direct"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [
    index("orders_phone_idx").on(t.phone),
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  variant: text("variant").notNull().default(""),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
});

/* --------------------------- Engagement ---------------------------- */

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  verified: boolean("verified").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wishlists = pgTable("wishlists", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
},
  (t) => [uniqueIndex("wishlists_customer_product_idx").on(t.customerId, t.productId)],
);

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("percent"),
  value: integer("value").notNull().default(0),
  minSubtotal: integer("min_subtotal").notNull().default(0),
  active: boolean("active").notNull().default(true),
  usedCount: integer("used_count").notNull().default(0),
});

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  subject: text("subject").notNull().default(""),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  payload: jsonb("payload"),
  source: text("source").notNull().default("direct"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type MediaItem = typeof media.$inferSelect;
export type HomepageSection = typeof homepageSections.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type TrustBadge = typeof trustBadges.$inferSelect;
export type ThemeSettings = typeof themeSettings.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionProduct = typeof collectionProducts.$inferSelect;
export type HomepageVersion = typeof homepageVersions.$inferSelect;
export type Translation = typeof translations.$inferSelect;
export type NavigationItem = typeof navigationItems.$inferSelect;

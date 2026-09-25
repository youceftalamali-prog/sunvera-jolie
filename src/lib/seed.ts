import { db } from "@/db";
import {
  banners,
  categories,
  communes,
  coupons,
  homepageSections,
  media,
  navigationItems,
  productImages,
  productVariants,
  products,
  reviews,
  shippingRates,
  storeSettings,
  themeSettings,
  trustBadges,
  wilayas,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { WILAYA_SEED } from "@/lib/algeria-data";
import { DEFAULTS } from "@/lib/settings";
import { slugify } from "@/lib/format";

const CATS: [string, string, string, string, string][] = [
  ["Skincare", "skincare", "Skincare", "Daily rituals for luminous skin", "🌿"],
  ["Face Care", "face-care", "Skincare", "Targeted care for every concern", "🌸"],
  ["Serums", "serums", "Skincare", "Concentrated active treatments", "💧"],
  ["Cleansers", "cleansers", "Skincare", "Gentle, balanced cleansing", "🫧"],
  ["Moisturizers", "moisturizers", "Skincare", "Lasting comfort and glow", "🤍"],
  ["Masks", "masks", "Skincare", "Ten minutes to radiance", "🧖‍♀️"],
  ["Eye Care", "eye-care", "Skincare", "Bright, rested-looking eyes", "👁️"],
  ["Sun Care", "sun-care", "Skincare", "Everyday invisible protection", "☀️"],
  ["Lip Care", "lip-care", "Beauty", "Soft, nourished lips", "💋"],
  ["Hair Care", "hair-care", "Hair Care", "Strength, shine and softness", "💇‍♀️"],
  ["Body Care", "body-care", "Body Care", "Silk-soft skin, head to toe", "🧴"],
  ["Cosmetics", "cosmetics", "Beauty", "Effortless everyday beauty", "✨"],
];

type P = [
  string, string, number, number, string, string, string, string, string, string, string,
  string, string, string, string, string, string[], string, string, number, number, number,
];

const P: P[] = [
  ["Vitamin C Brightening Serum","serums",4200,5400,"30ml","Serum","Treat","🍊","gold","All skin types","","15% stabilised vitamin C for visible radiance.","A silky, fast-absorbing serum built around 15% stabilised vitamin C and ferulic acid for visibly brighter, more even skin.","Visibly brighter tone|Softens dark spots|Antioxidant protection|Non-sticky finish","Aqua, Sodium Ascorbyl Phosphate 15%, Ferulic Acid, Vitamin E, Glycerin","Apply 3-4 drops every morning before moisturiser and sunscreen.",["vitamin c","brightening","glow","dark spots"],"", "", 4.9,127,42],
  ["Niacinamide 10% + Zinc Serum","serums",3200,3900,"30ml","Serum","Treat","🔹","beige","Oily & combination","","Refines pores and balances excess shine.","A lightweight water serum combining 10% niacinamide with 1% zinc PCA to refine pores, balance oil and calm redness.","Minimises pores|Balances oil|Evens tone|Calms redness","Aqua, Niacinamide 10%, Zinc PCA 1%, Panthenol","Apply a few drops morning and evening after cleansing.",["niacinamide","pores","oily skin"],"","",4.8,96,55],
  ["Hyaluronic Acid Hydra Serum","serums",3600,4400,"30ml","Serum","Treat","💧","ivory","Dry & dehydrated","","Multi-weight hyaluronic acid for deep hydration.","Three molecular weights of hyaluronic acid plus B5 flood thirsty skin with moisture and plump the look of fine lines.","Deep lasting hydration|Plumps fine lines|Weightless|Layers under anything","Aqua, Sodium Hyaluronate (3 weights), Panthenol, Trehalose","Apply to slightly damp skin morning and night, seal with moisturiser.",["hyaluronic acid","hydration","dry skin"],"","",4.9,143,61],
  ["Gentle Foaming Cleanser","cleansers",2400,0,"150ml","Cleanser","Cleanse","🫧","ivory","All skin types","","Soap-free foam that never strips.","A pH-balanced foaming gel that lifts makeup, sunscreen and pollution while leaving the barrier calm.","Removes makeup & SPF|pH balanced|No tight feeling","Aqua, Coco-Glucoside, Glycerin, Panthenol","Massage onto damp skin morning and evening, rinse.",["cleanser","foam","gentle"],"","",4.7,88,70],
  ["Rose Hydrating Toner","face-care",2600,3100,"200ml","Toner","Tone","🌹","nude","All skin types","","Alcohol-free rose water mist.","A refreshing alcohol-free toner with damask rose water and glycerin that rebalances and preps skin for serums.","Instantly refreshes|Preps for serums|Alcohol free","Rosa Damascena Water, Glycerin, Panthenol","Sweep over clean skin or press in with palms.",["toner","rose","hydrating"],"new","",4.6,54,48],
  ["Ceramide Repair Moisturizer","moisturizers",3900,4800,"50ml","Moisturizer","Moisturize","🤍","beige","Dry & sensitive","","Barrier cream with ceramides and squalane.","A cushiony cream that rebuilds a compromised moisture barrier with ceramides NP, squalane and cholesterol.","Restores the barrier|24h comfort|Rich but breathable","Aqua, Squalane, Ceramide NP, Cholesterol, Shea Butter","Apply morning and evening as the last skincare step.",["moisturizer","ceramide","barrier"],"","best",4.9,112,39],
  ["Oil-Free Gel Moisturizer","moisturizers",3100,0,"50ml","Moisturizer","Moisturize","💠","ivory","Oily & acne-prone","","Weightless gel hydration, zero shine.","A cooling water-gel that hydrates without oils — ideal for oily skin that still needs moisture.","Matte finish|Non-comedogenic|Cooling texture","Aqua, Glycerin, Sodium Hyaluronate, Niacinamide","Smooth over face and neck morning and night.",["gel","oil free","oily skin"],"new","",4.6,41,52],
  ["Clay Purifying Face Mask","masks",2900,3500,"75ml","Mask","Treat","🧖‍♀️","nude","Oily & combination","","Kaolin and charcoal detox in 10 minutes.","Kaolin, bentonite and charcoal draw out congestion while aloe keeps skin comfortable.","Decongests pores|Absorbs excess oil|Smoother texture","Kaolin, Bentonite, Charcoal, Aloe Barbadensis","Apply to clean skin, leave 10 minutes, rinse 1-2× weekly.",["mask","clay","detox"],"","",4.7,63,44],
  ["Overnight Glow Sleeping Mask","masks",4400,5200,"60ml","Mask","Treat","🌙","gold","All skin types","","Wake up with rested, glowing skin.","A jelly-textured overnight mask with peptides and niacinamide that works while you sleep.","Overnight radiance|Smooths texture|Peptide support","Aqua, Glycerin, Niacinamide, Peptide Complex","Apply as the final evening step 2-3 nights a week.",["sleeping mask","glow","overnight"],"new","",4.8,37,33],
  ["Caffeine Eye Contour Cream","eye-care",3400,4100,"15ml","Eye Cream","Treat","👁️","beige","All skin types","","De-puffs and brightens tired eyes.","A cooling eye cream with 5% caffeine and peptides that visibly reduces puffiness and dark circles.","Reduces puffiness|Brightens under-eyes|Cooling applicator","Aqua, Caffeine 5%, Peptide Complex, Squalane","Tap a rice-grain amount around the orbital bone.",["eye cream","caffeine","dark circles"],"","best",4.7,74,46],
  ["Invisible Daily Sunscreen SPF 50","sun-care",4600,5500,"50ml","Sunscreen","Protect","☀️","ivory","All skin types","","No white cast, no greasy film.","A modern broad-spectrum SPF 50 fluid that disappears on every skin tone and sits beautifully under makeup.","SPF 50|No white cast|Matte finish","Aqua, UV Filter Blend, Glycerin, Niacinamide","Apply two finger-lengths as the last morning step.",["spf","sunscreen","daily"],"","best",4.9,156,58],
  ["Argan Repair Hair Oil","hair-care",3300,3900,"100ml","Hair Oil","Treat","🪔","gold","","Dry & damaged","Pure argan blend for shine without weight.","Cold-pressed Moroccan argan oil with jojoba and vitamin E tames frizz and seals split ends.","Instant shine|Tames frizz|Seals split ends","Argania Spinosa Oil, Simmondsia Chinensis Oil, Tocopherol","Warm 2-3 drops and glide through mid-lengths and ends.",["hair oil","argan","frizz"],"","best",4.8,101,50],
  ["Keratin Strength Shampoo","hair-care",2800,0,"300ml","Shampoo","Cleanse","🧴","beige","","Weak & brittle","Sulfate-free cleansing with keratin.","A sulfate-free shampoo with hydrolysed keratin and biotin that cleanses gently while reinforcing fragile lengths.","Sulfate free|Strengthens strands|Colour safe","Aqua, Coco-Betaine, Hydrolyzed Keratin, Biotin","Massage into wet scalp, lather, rinse.",["shampoo","keratin","sulfate free"],"","",4.6,67,64],
  ["Silk Smooth Conditioner","hair-care",2900,3400,"300ml","Conditioner","Moisturize","🎀","nude","","All hair types","Silk softness in 60 seconds.","A creamy conditioner with silk amino acids and shea that makes combing effortless.","Easy detangling|Silky softness|No heavy residue","Aqua, Cetearyl Alcohol, Silk Amino Acids, Shea Butter","Apply to mid-lengths and ends, leave 1-2 minutes, rinse.",["conditioner","soft","detangle"],"","",4.7,58,60],
  ["Intense Repair Hair Mask","hair-care",3700,4500,"250ml","Hair Mask","Treat","💆‍♀️","gold","","Dry & damaged","Weekly deep treatment for damaged hair.","A rich weekly mask with shea butter, keratin and avocado oil that restores elasticity and softness.","Deep repair|Restores elasticity|Reduces breakage","Aqua, Shea Butter, Hydrolyzed Keratin, Avocado Oil","Apply to towel-dried hair 5-10 minutes weekly.",["hair mask","repair","deep treatment"],"new","",4.8,49,37],
  ["Leave-in Heat Protect Spray","hair-care",2600,0,"200ml","Leave-in","Protect","💨","ivory","","All hair types","Thermal shield up to 220°C.","A featherweight mist that protects hair from heat styling while detangling and adding soft shine.","Heat protection 220°C|Detangles|Weightless","Aqua, Hydrolyzed Wheat Protein, Panthenol","Mist evenly on damp or dry hair before styling.",["leave-in","heat protection"],"","",4.5,33,55],
  ["Shea Nourishing Body Butter","body-care",3100,3800,"200ml","Body Cream","Moisturize","🧈","beige","Dry skin","","48-hour comfort with 20% shea.","A whipped body butter with 20% unrefined shea and cocoa butter that melts into skin.","48h moisture|Rich yet absorbing|Soothes rough patches","Shea Butter 20%, Cocoa Butter, Glycerin, Vitamin E","Massage into clean skin after showering.",["body butter","shea","nourishing"],"","best",4.9,84,47],
  ["Coffee Body Scrub","body-care",2500,3000,"200g","Scrub","Cleanse","☕","nude","All skin types","","Polishes skin to a soft glow.","Arabica coffee grounds, brown sugar and coconut oil buff away dull surface cells.","Smoother skin|Boosts circulation|Natural exfoliants","Coffea Arabica Seed Powder, Sucrose, Coconut Oil","Massage on damp skin 2× a week, rinse.",["scrub","coffee","exfoliate"],"","",4.6,45,40],
  ["Silk Hand & Nail Cream","body-care",1900,0,"75ml","Hand Cream","Moisturize","🤲","ivory","All skin types","","Fast-absorbing, never greasy.","A refined hand cream with shea, allantoin and biotin that restores dry hands and conditions cuticles.","Absorbs instantly|Strengthens nails|Pocket size","Aqua, Shea Butter, Glycerin, Allantoin, Biotin","Apply throughout the day and after washing hands.",["hand cream","nails","travel"],"","",4.7,52,75],
  ["Rose Tinted Lip Balm","lip-care",1400,1800,"8g","Lip Balm","Moisturize","💋","nude","All skin types","","A wash of colour with real care.","A buttery balm with a sheer rose tint, shea and vitamin E that keeps lips soft and gently flushed.","Sheer natural tint|Long comfort|No waxy feel","Ricinus Communis Oil, Shea Butter, Tocopherol, Mica","Glide over lips whenever needed.",["lip balm","tinted","rose"],"","best",4.8,91,90],
  ["Overnight Lip Treatment Mask","lip-care",1900,2400,"15g","Lip Mask","Treat","🌜","gold","Dry lips","","Repairs chapped lips while you sleep.","A thick balm with ceramides and murumuru butter that heals dry, flaking lips overnight.","Overnight repair|Seals moisture|Soothes cracks","Shea Butter, Murumuru Butter, Ceramide NP","Apply a thick layer before bed.",["lip mask","overnight","repair"],"new","",4.7,29,58],
  ["Luminous Skin Tint SPF 20","cosmetics",4900,5900,"30ml","Complexion","Protect","🎨","beige","All skin types","","Skin-like coverage with a soft glow.","A breathable tint that evens tone while letting skin look like skin, with SPF 20.","Natural finish|Buildable coverage|SPF 20","Aqua, Sodium Hyaluronate, Glycerin, UV Filters","Blend a small amount over moisturiser.",["skin tint","makeup","glow"],"new","",4.6,38,35],
  ["Volumising Lash Mascara","cosmetics",2700,0,"10ml","Eyes","Treat","👀","nude","Sensitive eyes","","Clean volume, zero clumps.","A conditioning mascara with panthenol and a tapered brush for full, defined lashes.","Buildable volume|No flaking|Easy to remove","Aqua, Carnauba Wax, Panthenol, Iron Oxides","Sweep from root to tip, build a second coat.",["mascara","lashes","volume"],"","",4.5,44,48],
  ["Micellar Cleansing Water","face-care",2200,2700,"400ml","Cleanser","Cleanse","💦","ivory","All skin types","","First-step makeup removal, no rinse needed.","Micelles lift makeup, sunscreen and impurities in one sweep without rubbing.","Removes stubborn makeup|Fragrance free|Eye-safe","Aqua, Poloxamer 184, Glycerin, Panthenol","Soak a cotton pad, press over the face, then sweep.",["micellar","makeup remover"],"","",4.7,71,66],
];

const IMAGE_TYPES = ["main", "gallery", "lifestyle", "detail", "ingredient", "howto"];

let done = false;

export async function ensureSeed() {
  if (done) return;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(products);
  if (row && row.n > 0) {
    done = true;
    return;
  }

  /* Locations — all 58 wilayas + communes */
  await db.insert(wilayas).values(
    WILAYA_SEED.map((w, i) => ({
      code: w.code,
      nameAr: w.nameAr,
      nameFr: w.nameFr,
      nameEn: w.nameEn,
      sortOrder: i,
    })),
  );
  await db.insert(shippingRates).values(
    WILAYA_SEED.map((w) => ({ wilayaCode: w.code, fee: w.fee, etaDays: w.eta })),
  );
  await db.insert(communes).values(
    WILAYA_SEED.flatMap((w) =>
      w.communes.map((c) => ({
        wilayaCode: w.code,
        nameAr: c.nameAr,
        nameFr: c.nameFr,
        nameEn: c.nameEn,
      })),
    ),
  );

  /* Categories */
  await db.insert(categories).values(
    CATS.map(([name, slug, group, tagline, emoji], i) => ({
      name,
      slug,
      group,
      tagline,
      image: emoji,
      seoTitle: `${name} | SunVera Jolie`,
      seoDescription: tagline,
      sortOrder: i,
    })),
  );

  /* Products */
  const inserted = await db
    .insert(products)
    .values(
      P.map((r) => {
          const name = r[0], cat = r[1], price = r[2], compare = r[3], size = r[4], type = r[5];
          const step = r[6], emoji = r[7], tone = r[8], skin = r[9], hair = r[10], short = r[11];
          const desc = r[12], benefits = r[13], ingredients = r[14], how = r[15], tags = r[16];
          const fresh = r[17] as string, best = r[18] as string;
          const rating = r[19] as number, reviewCount = r[20] as number, stock = r[21] as number;
          const benefitList = benefits.split("|");
          return {
            name, slug: slugify(name), sku: "SVJ-" + slugify(name).slice(0, 12).toUpperCase(),
            brand: "SunVera Jolie", categorySlug: cat, shortDescription: short,
            description: `<p>${desc}</p><h3>Why you will love it</h3><ul>${benefitList.map((x) => `<li>${x}</li>`).join("")}</ul>`,
            benefits: benefitList.join("\n"), ingredients, howToUse: how,
            warnings: "For external use only. Avoid contact with eyes. Patch test before first use. Not a medical treatment.",
            size, volume: size, skinType: skin || "All skin types", hairType: hair,
            productType: type, routineStep: step, tags: tags.join(", "),
            price, comparePrice: compare, costPrice: Math.round(price * 0.45), stock, rating,
            reviewsCount: reviewCount, tone, emoji,
            bestSeller: best === "best", newArrival: fresh === "new",
            featured: best === "best" || fresh === "new", status: "published",
            seoTitle: `${name} | SunVera Jolie`, seoDescription: short, seoKeywords: tags.join(", "),
          };
        }),
    )
    .returning({ id: products.id, name: products.name, size: products.size, price: products.price });

  /* Variants + images (6 slots per product, uploadable in admin) */
  await db.insert(productVariants).values(
    inserted.flatMap((p) => [
      { productId: p.id, label: p.size, sku: `${p.id}-STD`, price: p.price, priceDelta: 0, stock: 30, sortOrder: 0 },
      {
        productId: p.id,
        label: "Value size",
        sku: `${p.id}-XL`,
        price: Math.round(p.price * 1.6),
        priceDelta: Math.round(p.price * 0.6),
        stock: 12,
        sortOrder: 1,
      },
    ]),
  );
  await db.insert(productImages).values(
    inserted.flatMap((p) =>
      IMAGE_TYPES.map((type, i) => ({
        productId: p.id,
        url: "",
        alt: `${p.name}${i === 0 ? "" : ` — ${type} view`}`,
        imageType: i === 0 ? "main" : type,
        sortOrder: i,
        isPrimary: i === 0,
      })),
    ),
  );

  /* Reviews */
  const NAMES = ["Amina B.", "Lina K.", "Sarah M.", "Nesrine T.", "Yasmine D.", "Hadjer S.", "Meriem A.", "Khadidja L."];
  const BODIES = [
    "Beautiful product and fast delivery. The texture feels expensive.",
    "I've been using it for three weeks and my skin looks so much brighter.",
    "Packaging is gorgeous and it actually works. Ordering again.",
    "Arrived in two days to Alger, paid on delivery. Very smooth experience.",
    "Light, not greasy, and a little goes a long way.",
    "My favourite step of my evening routine now.",
  ];
  await db.insert(reviews).values(
    inserted.flatMap((p, i) =>
      [0, 1, 2].map((k) => ({
        productId: p.id,
        customerName: NAMES[(i + k) % NAMES.length],
        rating: k === 2 ? 4 : 5,
        body: BODIES[(i + k) % BODIES.length],
        verified: true,
      })),
    ),
  );

  /* Homepage CMS */
  await db.insert(homepageSections).values([
    { key: "hero", label: "Hero", sortOrder: 0, title: "Timeless Beauty.\nEffortless Elegance.", subtitle: "Discover carefully selected beauty and personal care essentials designed to elevate your daily self-care ritual.", imageUrl: "/images/hero.jpg", buttonText: "Shop Now", buttonUrl: "/shop", button2Text: "Explore Best Sellers", button2Url: "/shop?sort=best-selling", textPosition: "left", overlayOpacity: 60 },
    { key: "trust_badges", label: "Trust Badges", sortOrder: 1, title: "Why shop with us", subtitle: "" },
    { key: "categories", label: "Categories", sortOrder: 2, title: "Shop by Category", subtitle: "Find your ritual by concern." },
    { key: "best_sellers", label: "Best Sellers", sortOrder: 3, title: "Our Best Sellers", subtitle: "The pieces our community reorders again and again.", productMode: "auto", productCount: 4, buttonUrl: "/shop?sort=best-selling" },
    { key: "promo_banner", label: "Promotional Banner", sortOrder: 4, title: "Your Daily Beauty Ritual", subtitle: "Small rituals. Beautiful results.", imageUrl: "/images/ritual.jpg", buttonText: "Explore Collection", buttonUrl: "/shop", overlayOpacity: 35, textPosition: "center" },
    { key: "new_arrivals", label: "New Arrivals", sortOrder: 5, title: "New Arrivals", subtitle: "Freshly added to the SunVera Jolie collection.", productMode: "auto", productCount: 4, buttonUrl: "/shop?sort=newest" },
    { key: "routine", label: "Beauty Routine", sortOrder: 6, title: "Build Your Beauty Routine", subtitle: "Five simple steps, morning and night.", background: "#f3ece2", items: [
      { icon: "🫧", title: "Step 1 — Cleanse", text: "Melt away the day", url: "/category/cleansers" },
      { icon: "🌹", title: "Step 2 — Tone", text: "Rebalance and refresh", url: "/category/face-care" },
      { icon: "💧", title: "Step 3 — Treat", text: "Target your concerns", url: "/category/serums" },
      { icon: "🤍", title: "Step 4 — Moisturize", text: "Seal in hydration", url: "/category/moisturizers" },
      { icon: "☀️", title: "Step 5 — Protect", text: "Every single morning", url: "/category/sun-care" },
    ] },
    { key: "skincare", label: "Skincare Essentials", sortOrder: 7, title: "Skincare Essentials", subtitle: "Formulas chosen for real, visible results.", items: [
      { title: "Vitamin C Serums", url: "/search?q=Vitamin C" }, { title: "Niacinamide", url: "/search?q=Niacinamide" },
      { title: "Hyaluronic Acid", url: "/search?q=Hyaluronic" }, { title: "Toners", url: "/search?q=Toner" },
      { title: "Cleansers", url: "/category/cleansers" }, { title: "Moisturizers", url: "/category/moisturizers" },
      { title: "Face Masks", url: "/category/masks" }, { title: "Eye Creams", url: "/category/eye-care" },
    ], buttonText: "Shop Skincare", buttonUrl: "/category/skincare" },
    { key: "hair_care", label: "Hair Care", sortOrder: 8, title: "Beautiful Hair Starts Here", subtitle: "Strength, softness and shine, wash after wash.", items: [
      { title: "Shampoo", url: "/search?q=Shampoo" }, { title: "Conditioner", url: "/search?q=Conditioner" },
      { title: "Hair Masks", url: "/search?q=Hair Mask" }, { title: "Hair Oils", url: "/search?q=Hair Oil" },
      { title: "Hair Serums", url: "/search?q=Serum" }, { title: "Leave-in Treatments", url: "/search?q=Leave-in" },
    ], buttonText: "Shop Hair Care", buttonUrl: "/category/hair-care" },
    { key: "featured", label: "Featured Products", sortOrder: 9, title: "Complete Your Routine", subtitle: "Loved together by our community.", productMode: "auto", productCount: 4 },
    { key: "testimonials", label: "Testimonials", sortOrder: 10, title: "Loved by 4,000+ customers", subtitle: "", items: [
      { title: "Amina B., Alger", text: "Beautiful products and the delivery was so fast. The packaging feels luxurious." },
      { title: "Lina K., Oran", text: "My skin has never looked better since I started the vitamin C serum." },
      { title: "Sarah M., Constantine", text: "Paying on delivery made it easy to trust. I've ordered three times already." },
    ] },
    { key: "newsletter", label: "Newsletter", sortOrder: 11, title: "Join the SunVera Jolie Beauty Club", subtitle: "New arrivals, exclusive offers and beauty inspiration.", buttonText: "Subscribe", buttonUrl: "" },
  ]);

  await db.insert(trustBadges).values([
    { icon: "🚚", title: "Fast Delivery", description: "1-4 days across Algeria", sortOrder: 0 },
    { icon: "💳", title: "Cash on Delivery", description: "Pay when you receive", sortOrder: 1 },
    { icon: "🔄", title: "Easy Returns", description: "14-day return window", sortOrder: 2 },
    { icon: "💎", title: "Premium Selection", description: "Curated beauty essentials", sortOrder: 3 },
    { icon: "🔒", title: "Secure Shopping", description: "Your data stays private", sortOrder: 4 },
  ]);

  await db.insert(navigationItems).values([
    ...([["Home", "/"], ["Shop", "/shop"], ["Skincare", "/category/skincare"], ["Hair Care", "/category/hair-care"], ["Body Care", "/category/body-care"], ["Best Sellers", "/shop?sort=best-selling"], ["New Arrivals", "/shop?sort=newest"], ["About Us", "/about"], ["Contact", "/contact"]] as [string, string][]).map(([label, url], i) => ({ label, url, location: "header", sortOrder: i })),
    ...([["Home", "/"], ["Shop", "/shop"], ["About Us", "/about"], ["Contact", "/contact"], ["FAQ", "/faq"]] as [string, string][]).map(([label, url], i) => ({ label, url, location: "footer", column: "quick", sortOrder: i })),
    ...([["Shipping Policy", "/legal/shipping-policy"], ["Returns & Refunds", "/legal/return-refund-policy"], ["Track Order", "/track"], ["Privacy Policy", "/legal/privacy-policy"], ["Terms & Conditions", "/legal/terms-conditions"]] as [string, string][]).map(([label, url], i) => ({ label, url, location: "footer", column: "care", sortOrder: i })),
    ...([["Skincare", "/category/skincare"], ["Hair Care", "/category/hair-care"], ["Body Care", "/category/body-care"], ["Beauty", "/category/cosmetics"]] as [string, string][]).map(([label, url], i) => ({ label, url, location: "footer", column: "categories", sortOrder: i })),
  ]);

  await db.insert(banners).values({
    title: "Your Daily Beauty Ritual",
    subtitle: "Small rituals. Beautiful results.",
    imageDesktop: "/images/ritual.jpg",
    imageMobile: "/images/ritual.jpg",
    buttonText: "Explore Collection",
    buttonUrl: "/shop",
    active: true,
    sortOrder: 0,
  });

  await db.insert(themeSettings).values({ id: 1 });

  await db.insert(storeSettings).values(
    (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).map((k) => ({ key: k as string, value: DEFAULTS[k] })),
  );

  await db.insert(media).values([
    { url: "/images/hero.jpg", filename: "hero.jpg", alt: "SunVera Jolie hero", folder: "homepage", provider: "seed", mimeType: "image/jpeg" },
    { url: "/images/ritual.jpg", filename: "ritual.jpg", alt: "Beauty ritual flat lay", folder: "banners", provider: "seed", mimeType: "image/jpeg" },
  ]);

  await db.insert(coupons).values([
    { code: "SAVE10", type: "percent", value: 10, minSubtotal: 0 },
    { code: "WELCOME10", type: "percent", value: 10, minSubtotal: 3000 },
    { code: "FIRSTORDER", type: "fixed", value: 800, minSubtotal: 4000 },
    { code: "FREESHIP", type: "free_shipping", value: 0, minSubtotal: 5000 },
  ]);

  done = true;
}

# SunVera Jolie — Homepage Redesign & Change Log

## Working rule
- Do NOT deploy to Cloud Run while the redesign is still being reviewed.
- Record every requested design change and every discovered problem here.
- Apply the accumulated changes together, then run typecheck/build, review the final homepage, and deploy once.
- Existing Cloud Run secrets and DATABASE_URL must not be changed as part of the visual redesign.

## Reference direction
Luxury beauty / editorial ecommerce.
- Palette: ivory, cream, champagne, warm beige, cocoa, restrained gold.
- Elegant serif display typography + clean uppercase sans-serif labels.
- Spacious layout, premium photography, soft shadows, subtle borders.
- Avoid generic emoji-heavy/card-grid styling where premium imagery can be used.
- Use real product/collection images uploaded through Admin/Cloudinary.

## Homepage order agreed so far
1. Header
2. Hero Carousel
3. The SunVera Ritual
4. Trust / Benefits
5. Shop by Category
6. Explore Our Collections
7. Our Best Sellers
8. New Arrivals
9. Remaining editorial/product sections
10. Testimonials
11. Newsletter/footer area

## 1. Header — agreed change
Current text logo:
- SUNVERA JOLIE
- TIMELESS ELEGANCE

Required:
- Use the uploaded SunVera Jolie logo image in the header in the same location as the current text logo.
- Hero logo upload should also be usable as the header logo fallback, so the logo does not need to be uploaded twice.
- Keep desktop/mobile support.
- Preserve navigation and account/search/wishlist/cart behavior.

Code change already made but NOT deployed:
- src/app/layout.tsx
- Commit: d878f1101c3b53b69890dfb8914bddfffeb88891

## 2. Hero Carousel — agreed design/function
- Up to 6 slides.
- Each slide can have a desktop image.
- Optional separate mobile image.
- User can upload each slide image from Admin.
- Autoplay ON.
- Default/selected interval can be 3/4/5/6 seconds.
- Fade or slide transition.
- Previous/next arrows and dots.
- Pause on hover.
- Slide title/subtitle/buttons editable.
- User wants the main brand logo OUT of the hero image area and used in the site header instead.
- The hero itself remains the large promotional image area.

Hero/Admin work already implemented earlier:
- src/components/HeroCarousel.tsx
- src/app/page.tsx
- src/app/api/admin/cms/route.ts
- src/app/admin/content/homepage/page.tsx

## 3. The SunVera Ritual — approved reference
Reference concept:
- Premium white/ivory panel immediately below the Hero.
- Heading:
  THE SUNVERA RITUAL
  Beauty Essentials for Every Moment
- Four image-backed cards:
  1. Skincare — Nourish & Glow
  2. Face Care — Refine Your Radiance
  3. Serums — Targeted Beauty Care
  4. Hair Care — Healthy, Beautiful Hair
- Each card has:
  - independently uploaded image
  - title
  - short description
  - Explore CTA
  - subtle hover zoom
- Four images must be independently selectable/uploadable from Admin.
- Mobile must remain responsive.

Code already implemented but NOT deployed:
- src/app/page.tsx
- src/app/admin/content/homepage/page.tsx
- Existing routine section was visually redesigned to this concept.

## 4. Trust / Benefits section
Current benefits:
- Fast Delivery
- Cash on Delivery
- Easy Returns
- Premium Selection
- Secure Shopping

Decision:
- Keep this information.
- It should sit AFTER The SunVera Ritual, not immediately under the Hero.
- Style should remain premium and understated rather than looking like a generic marketplace strip.

## 5. Shop by Category
Current section:
- Shop by Category
- Find your ritual by concern.
- Existing categories include:
  Skincare, Face Care, Serums, Cleansers, Moisturizers, Masks, Eye Care, Sun Care, Lip Care, Hair Care, Body Care, Cosmetics.

No complete redesign approved yet.
Keep under review after the Collections change.

## 6. Explore Our Collections — approved reference
Reference:
- Heading:
  EXPLORE OUR COLLECTIONS
- Subtitle:
  Curated beauty rituals, thoughtfully selected for you.
- Four large image-backed cards:
  1. THE GLOW COLLECTION
  2. HYDRATION ESSENTIALS
  3. HAIR RITUALS
  4. BODY & SELF-CARE
- Text appears ON TOP of each image, not in a separate text block.
- Image sits behind the text with a slight blur/softened treatment and dark/light overlay for readability.
- Each card supports:
  - independently uploaded image
  - editable title
  - editable short description
  - editable destination URL
- Destination can point directly to the relevant product collection/category.
- Hover interaction should remain subtle and luxurious.
- Desktop: four cards in one row.
- Mobile: responsive stacked/scrollable presentation.

Code already added but NOT deployed:
- src/lib/cms.ts
- src/app/page.tsx
- src/app/admin/content/homepage/page.tsx
- src/lib/seed.ts

Technical note:
- A self-initializing collections section was added in CMS loading so existing databases can receive the new section without requiring a manual seed rerun.
- Target order includes Collections after Shop by Category.

## 7. Our Best Sellers — approved reference
Approved visual reference: luxury ecommerce section with four large product cards.

Heading:
- CUSTOMER FAVORITES
- Our Best Sellers
- Subtitle: The most loved beauty essentials, chosen by our customers.
- VIEW ALL link at top right.

Each product card:
- Large real product image.
- BEST SELLER badge when applicable.
- Discount badge when applicable.
- Wishlist heart.
- Product type/category label.
- Product name.
- Short description.
- Star rating + review count.
- Current price + compare-at/old price.
- ADD TO CART.
- Quick View eye button.
- Premium white/ivory card with soft shadow and refined spacing.
- Carousel/previous-next controls for additional products.

Behavior:
- Clicking the product image opens that product's page directly.
- Clicking product name opens that product's page directly.
- No manual URL entry should be required for individual products; use the product slug/DB route automatically.
- Add to Cart stays as an action and must not navigate away.
- VIEW ALL opens the Best Sellers listing.

Existing implementation already supports direct image/name links through ProductCard.
Important discovered issue:
- Some current product cards display emoji/blank placeholders because product image URLs are empty/missing. This must be fixed before deployment by verifying product image uploads/Cloudinary and primary-image selection.

## 8. Images / Cloudinary — pending verification
Before deployment:
- Verify homepage card uploads save correctly.
- Verify uploaded URLs are persisted.
- Verify images survive page refresh.
- Verify product images are real Cloudinary/media URLs, not empty placeholders.
- Verify primary product image selection.
- Verify desktop/mobile image behavior.

## 9. Admin CMS — pending full review
Need to verify:
- Homepage section ordering.
- Enable/disable sections.
- Hero slides and uploads.
- Ritual card uploads and links.
- Collections card uploads and links.
- Trust badges.
- Product sections.
- Product image management.
- Theme settings.
- Logo upload.
- Homepage persistence after refresh.

## 10. Known infrastructure/build state
Already fixed:
- Local production build previously failed with DATABASE_URL required during build.
- DB initialization was made lazy.
- Root layout marked dynamic.
- Local build then succeeded completely.
- Cloud Run deployment was successful before the current unpublished redesign changes.

Current production/staging deployment that is LIVE in Cloud Run:
- Service: sunvera-jolie-staging
- Region: europe-west1
- URL: https://sunvera-jolie-staging-961746561943.europe-west1.run.app
- Last known deployed revision before current unpublished changes: sunvera-jolie-staging-00009-f7b

Do not deploy the current untested GitHub changes yet.

## 11. Final release checklist
Before the single deployment:
1. Finish homepage visual review.
2. Finish all requested section changes.
3. Fix product image placeholders.
4. Verify Admin uploads and persistence.
5. Verify collection/product links.
6. Run npm run typecheck.
7. Run npm run build.
8. Pull/inspect final branch state.
9. Deploy to Cloud Run once.
10. Test live homepage + Admin + product page + image uploads.

## 12. Per-section typography customization — newly requested
For every homepage section, Admin must allow independent typography controls so the font can be chosen to match the section image/content.

Controls:
- Heading font family.
- Body font family.
- Button font family.
- Heading size.
- Body size.
- Button size.
- Heading color.
- Body text color.
- Button background color.
- Button text color.
- Heading weight.
- Letter spacing.
- Optional subtle heading text shadow.
- Large font catalog covering luxury serif, modern sans, Arabic-friendly and universal fonts.
- Arabic-friendly choices include Cairo, Tajawal, Noto Sans Arabic, Noto Kufi Arabic, IBM Plex Sans Arabic, Readex Pro, Almarai, Amiri, Noto Serif Arabic and Scheherazade New.
- Luxury choices include Playfair Display, Cormorant Garamond, DM Serif Display, EB Garamond, Libre Baskerville, Lora, Cinzel, Prata and Bodoni Moda.
- Modern choices include Manrope, Montserrat, Poppins, Raleway, Inter, DM Sans and IBM Plex Sans.
- Each section stores its typography under homepageSections.settings.typography, so it does not require a new database table/column.
- Admin can reset a section to the SunVera default typography.

Implementation already added on staging branch (NOT deployed):
- src/lib/typography.ts — font catalog, defaults, normalization and safe CSS variables.
- src/app/admin/content/homepage/page.tsx — per-section typography controls.
- src/app/page.tsx — applies section typography to every homepage section.
- src/app/globals.css — section-scoped typography variables and font loading.

## 13. Promotional Banner / Editorial Beauty Story — redesign pending
This section is the one currently shown as:
- "Your Daily Beauty Ritual"
- "Small rituals. Beautiful results."
- "Explore Collection"

Decision:
- Redesign this section professionally before touching New Arrivals.
- Keep it as a strong editorial beauty-story banner between Best Sellers/Collections and New Arrivals.
- Do not treat it as a generic marketplace promo block.

Target design direction:
- Full-bleed, premium beauty image with a carefully controlled overlay.
- Desktop and mobile image can be different.
- Elegant editorial composition; text can be positioned left, center or right.
- Add an optional small eyebrow/label above the heading.
- Large luxury heading, supporting subtitle and one or two CTAs.
- CTA text/link must be editable.
- Overlay strength must be adjustable so text remains readable without hiding the image.
- Optional subtle gradient/blur overlay rather than a heavy dark wash.
- Section height and spacing should feel premium and balanced.
- Use the new per-section typography controls: independent font family, heading/body/button sizes, text/button colors, weight, letter spacing and optional text shadow.
- Support Arabic and English text equally.
- Keep links editable from Admin.

Admin fields planned:
- Desktop image upload.
- Mobile image upload.
- Eyebrow/label.
- Heading.
- Description.
- Primary button text + URL.
- Secondary button text + URL.
- Text position.
- Overlay/gradient strength.
- Background/section spacing.
- Per-section typography.

New Arrivals will be redesigned only after this promotional banner is finalized.

## 14. New Arrivals product-image interaction — newly requested
Approved enhancement for the New Arrivals section:
- Product cards should be able to rotate through the product's existing gallery images instead of showing only one static image.
- Supported display modes:
  1. Off / static primary image.
  2. Hover swap — show the next gallery image when the mouse enters the product image.
  3. Auto rotate — cycle through gallery images automatically every configurable few seconds.
  4. Hover + Auto rotate — autoplay while visible and provide immediate hover interaction.
- Configurable interval (for example 2–6 seconds).
- Pause autoplay while hovered when appropriate.
- Use the product's existing uploaded gallery images/Cloudinary URLs; no duplicate uploads are required.
- Smooth fade/transition between images.
- Keep the primary image as the first/default image.
- Mobile must have a touch-safe behavior because hover does not exist on phones.
- Image rotation must not change the product link: tapping/clicking the image still opens the same product page.
- Add these controls to the New Arrivals section's Admin configuration.
- Do not make Best Sellers identical: New Arrivals remains an editorial/discovery section.

## 15. Admin image source selector — newly requested
For homepage/image configuration screens, do not force the admin to upload a new file every time.

Every image field that supports an upload should offer two clear choices:
1. **Upload from computer** — choose a new local image and send it through the existing media uploader.
2. **Choose from Media Library** — open the existing shared Media Library/MediaPicker, search/filter images, preview them, and select an existing asset.

Apply this pattern to:
- Hero logo.
- Hero desktop/mobile slide images.
- The SunVera Ritual four card images.
- Explore Our Collections four card images.
- Promotional Banner desktop/mobile images.
- Any other homepage image field that currently has an upload control.

The selected Media Library asset should save its existing URL/reference without duplicating the physical file.

The Media Library picker should support:
- Search.
- Folder filtering.
- Preview.
- Pagination.
- Selecting an existing image.
- Optional upload of a new image from inside the picker.

UX label suggestion:
- "Upload from computer"
- "Choose from Media Library"

This should be implemented before the final single deployment.

## 16. Skincare Essentials / The Skin Edit — design direction pending approval
The section directly after "Build Your Beauty Routine" should feel different from Best Sellers and New Arrivals while staying within the SunVera Jolie luxury identity.

Proposed direction:
- Rename/display as an editorial section such as "THE SKIN EDIT" or "SKINCARE ESSENTIALS".
- Use a premium split layout rather than a standard product grid.
- One side: one large, tall lifestyle/product image with a soft editorial overlay.
- Other side: refined text block with eyebrow label, heading, short description, a small set of skincare concern/category links, and a "SHOP SKINCARE" CTA.
- Beneath/alongside the text, show 3–4 selected skincare products in a compact editorial product rail or 2x2 mini-grid.
- Product cards should be visually lighter than Best Sellers and New Arrivals so each homepage section has its own visual rhythm.
- Image and product selections should be Admin-controlled.
- Image source should support both "Upload from computer" and "Choose from Media Library".
- Destination links should be editable.
- Apply per-section typography controls already added: font family, font size, font color, button style, weight, letter spacing and optional shadow.
- Support Arabic and English content.
- Keep the section in the same ivory/beige/champagne/cocoa/gold palette, with generous whitespace and subtle borders/shadows.
- Avoid another full-width product grid.

Suggested content treatment:
- Eyebrow: "THE SKIN EDIT"
- Heading: "Skin that feels beautifully cared for."
- Description: a concise premium skincare message.
- Concern links: "Brightening", "Hydration", "Barrier Care", "Pores & Balance".
- CTA: "SHOP SKINCARE".

Do not implement the final visual layout until the user approves the direction or supplies a preferred reference image.

## 17. Skincare Essentials / The Skin Edit — APPROVED DESIGN
The user approved the generated reference image as the target design.

Approved visual structure:
- Two-column editorial composition.
- LEFT: large premium skincare lifestyle/product image with rounded corners.
- LEFT image contains editorial copy over the image:
  - small eyebrow: "SKINCARE ESSENTIALS"
  - large heading: "Healthy Radiant Skin"
  - short supporting description
  - primary CTA: "SHOP SKINCARE →"
- Bottom of the left image panel: a restrained benefits strip with 3 small benefit points/icons.
- RIGHT: light ivory editorial content area.
  - eyebrow: "SKINCARE ESSENTIALS"
  - main title: "The Skin Edit"
  - supporting description
  - 4 skincare concern/benefit items:
    Brightening, Hydration, Barrier Care, Pores & Balance
  - below that: 4 compact skincare product cards.
  - each product card can show NEW badge, wishlist, product image, product type, name, short description, rating/review count, price, Add to Cart, Quick View.
  - bottom controls: previous/next, carousel position indicator, and "VIEW ALL SKINCARE →".
- Overall palette: ivory, cream, soft beige, champagne/gold, cocoa.
- Typography: editorial luxury serif for large headings, clean sans-serif for supporting text and controls.
- Soft borders, gentle shadows, generous whitespace.
- Must remain visually distinct from Best Sellers and New Arrivals while maintaining the same SunVera Jolie identity.

Admin/editing requirements:
- Left main image: Upload from computer OR Choose from Media Library.
- Desktop/mobile image support.
- Eyebrow, heading, description and CTA text/link editable.
- Four concern items editable (label, description/icon/link).
- Four displayed skincare products should be selectable from existing catalog.
- "VIEW ALL SKINCARE" destination editable.
- Per-section typography controls apply.
- Arabic and English content supported.
- Product image click/name click should open the product page; Add to Cart and Quick View remain actions.

Do not replace this approved design with a generic two-column product grid; preserve the editorial composition shown in the reference.

## 18. Featured Products / Complete Your Routine — design direction pending approval
The section after Hair Care is the current "Complete Your Routine" / Featured Products section.

Decision:
- It should not look like Best Sellers, New Arrivals, Skin Edit, or a standard 4-card product grid.
- Keep the SunVera Jolie luxury identity but give this section a more "routine / curation" visual rhythm.

Proposed direction:
- Editorial "Complete Your Routine" composition with a refined routine/story heading.
- Use a horizontal numbered sequence (01, 02, 03, 04) or connected routine steps instead of another generic product grid.
- Each selected product sits in a compact elegant card with large image, minimal metadata, price and a subtle CTA.
- A thin champagne/gold connector line can visually connect the products as one routine.
- Add a small introductory copy block explaining that the products are curated to work together.
- Optional small lifestyle image or soft background texture to give the section its own identity.
- Include a "SHOP THE ROUTINE" or "COMPLETE YOUR ROUTINE" CTA and a "VIEW ALL" link.
- Products remain clickable to their own product pages; Add to Cart and Quick View remain separate actions.
- Admin should be able to choose the featured products manually from the catalog.
- Images should support both Upload from computer and Choose from Media Library where applicable.
- Apply the per-section typography controls already added.
- Support Arabic and English.
- Preserve ivory/beige/champagne/cocoa/gold visual identity, with generous whitespace and refined borders.
- Avoid another full-width 4-column product grid.

Do not implement the final visual layout until the user approves the concept/reference.

## 19. Featured Products / Complete Your Routine — APPROVED DESIGN
The user approved the generated reference image as the target design.

Approved visual structure:
- Full-width premium editorial section with warm ivory/cream background and soft beauty imagery.
- Top eyebrow: "COMPLETE YOUR ROUTINE".
- Large centered editorial heading:
  "A Beautiful Routine for Healthier, Glowing Skin"
- Supporting subtitle explaining the four curated essentials.
- Four connected routine stages:
  01 CLEANSE → 02 TREAT → 03 HYDRATE → 04 PROTECT.
- Each stage has:
  - numbered circle,
  - short stage description,
  - large product/lifestyle image,
  - product name,
  - rating/review count,
  - DZD price,
  - compact circular action/quick-view control.
- Thin champagne/gold connectors/arrows visually connect the four stages.
- Main CTA centered: "COMPLETE YOUR ROUTINE →".
- Secondary link: "VIEW ALL →".
- Bottom reassurance strip with three restrained trust points.
- Keep it visually distinct from Best Sellers, New Arrivals and The Skin Edit while preserving SunVera Jolie's ivory/beige/champagne/cocoa/gold identity.
- Use elegant serif for editorial headings and clean sans-serif for supporting text and controls.
- Apply per-section typography customization.
- Product images must use real catalog/Media Library images.
- Clicking product image/name must open that product's page; Quick View/Add to Cart remain actions.
- Admin should manually select the four products and edit the stage labels/descriptions, links, images and CTA.
- Do not turn this into a generic product grid.

## 20. Testimonials / The SunVera Love Story — APPROVED DESIGN
The user explicitly approved the luxury reference image and wants this visual direction preserved closely.

Approved visual structure:
- Full-width luxury beauty/lifestyle background using soft ivory, cream, warm beige and champagne tones.
- Elegant lifestyle imagery can frame both sides while the testimonial content remains highly readable.
- Top eyebrow: "TESTIMONIALS".
- Main heading: "The SunVera Love Story".
- Subtitle: "Real beauty rituals. Real customer experiences."
- Centerpiece: a large premium testimonial card with:
  - large decorative quotation mark,
  - customer testimonial text,
  - 5-star rating,
  - customer photo/avatar,
  - customer name,
  - city/country,
  - prominent "Verified Purchase" badge,
  - left/right carousel arrows.
- Beneath the main card: three smaller testimonial cards showing:
  - avatar,
  - 5-star rating,
  - short quote,
  - customer name,
  - city/country,
  - Verified Purchase badge.
- Carousel pagination dots.
- Primary CTA: "READ MORE REVIEWS →".
- Premium editorial spacing, subtle shadows, rounded/soft cards, refined champagne/gold accents.
- This section must NOT look like a plain 3-card review grid.
- The generated reference image is the approved visual target for this section.

Admin requirements:
- Add/edit/delete testimonials.
- Main and secondary testimonial selection.
- Customer name, city/country, review text, rating, verified flag.
- Optional customer/avatar image with "Upload from computer" or "Choose from Media Library".
- Optional background/lifestyle image with "Upload from computer" or "Choose from Media Library".
- Carousel autoplay toggle and interval.
- Per-section typography controls apply.
- Arabic and English supported.
- CTA text/link editable.

## 21. Footer — design direction pending approval
Current footer is a functional 5-column beige footer, but it is visually more generic than the approved luxury homepage sections.

Proposed luxury direction:
- Keep the SunVera Jolie identity: ivory/cream background, cocoa text, restrained champagne/gold accents.
- Create a stronger brand-led top area instead of a simple column grid.
- Left/center: larger SunVera Jolie logo and a concise brand statement.
- Include a compact trust/payment line for Cash on Delivery across Algeria.
- Keep navigation, categories and customer-care links but use more refined spacing and typography.
- Add a separate newsletter/beauty-club panel with elegant heading, short copy, email field and gold/cocoa CTA.
- Replace emoji social icons with clean minimal icon treatments.
- Add contact/WhatsApp information in a refined small line.
- Bottom row: copyright, legal links, payment/COD note.
- Optional decorative horizontal gold rule or subtle botanical/beauty texture, but avoid visual clutter.
- Footer should feel like the final luxury "brand signature" of the homepage, not another product section.
- Apply the per-section typography/color system where practical.
- Admin controls should continue to edit logo, links, newsletter text, social links and footer copy.
- Image background/decorative media, if added, should support Upload from computer and Choose from Media Library.

## 22. Footer + Beauty Club — APPROVED DESIGN
The user approved the generated footer reference and wants it followed closely.

Approved visual structure:
- TOP newsletter/Beauty Club banner with elegant luxury product/lifestyle image and soft floral/beauty background.
- Heading: "Join the SunVera Jolie Beauty Club".
- Supporting copy about new arrivals, exclusive offers and beauty inspiration.
- Premium email field + gold/champagne "SUBSCRIBE →" button.
- Small benefit highlights such as Exclusive Offers, New Arrivals, Beauty Tips and Special Discounts.
- MAIN FOOTER below:
  - Large SunVera Jolie logo/brand mark and "Timeless Elegance" tagline.
  - Concise brand statement.
  - Signature line: "Timeless Elegance. Beautifully Yours.".
  - Small trust highlights including Cash on Delivery, Secure Shopping and Original Products.
  - QUICK LINKS column.
  - CATEGORIES column.
  - CUSTOMER CARE column.
  - NEED HELP? column with WhatsApp, email and support hours/contact details.
  - FOLLOW US with clean circular social icons.
- Bottom legal bar:
  - Copyright.
  - Cash on Delivery / DZD note.
  - Privacy Policy, Terms & Conditions, Returns & Refunds.
  - Payment method icons if configured.
- Overall look: ivory/cream, soft beige, champagne/gold and cocoa; refined borders; light floral/lifestyle decoration; generous whitespace.
- Replace the current emoji-only social icons with clean icon treatment.
- Keep the final footer quieter than the homepage content while still clearly branded and premium.

Admin behavior:
- Keep existing editable footer copy, links, newsletter settings and social links.
- Newsletter image/background should support "Upload from computer" or "Choose from Media Library".
- Logo continues to use the brand asset system.
- Typography customization should respect the site/section typography system.

## 23. AI Design Assistant — APPROVED FEATURE
The user approved adding an AI design assistant to the Admin CMS.

Phase 1:
- Add an "AI Design Assistant" panel inside the Admin.
- Natural-language request box in Arabic/English.
- AI interprets requests and converts them into safe CMS/theme changes.
- Supported safe actions include section typography, colors, text, links, image selection, media library selection, section ordering, product selections, carousel timing and section presentation settings.
- Preferred flow: Understand request → show changes/preview summary → Apply Changes.
- AI should not directly edit arbitrary source code in this phase.
- Keep existing OpenAI integration and rate limiting; do not expose API keys.
- Log/return a structured change summary after Apply.
Phase 2 (after homepage/product-page redesign is stable):
- Optional developer mode for guarded code changes, with typecheck/build validation before applying.

## 24. Homepage redesign implementation status
The approved homepage redesign has now been implemented in the staging branch (not deployed):
- Hero logo removed from the hero image area; header remains responsible for the main brand logo.
- Luxury The SunVera Ritual cards.
- Trust/benefits styling retained and repositioned by CMS order.
- Shop by Category refined.
- Explore Our Collections image-backed cards with editable links.
- Luxury Best Sellers rail.
- Editorial New Arrivals with gallery image rotation support.
- Promotional Beauty Ritual banner redesigned.
- Complete Your Routine four-stage editorial routine.
- Approved The Skin Edit / Skincare Essentials layout.
- Hair Care editorial split layout.
- Approved The SunVera Love Story testimonial carousel.
- Approved Beauty Club newsletter + luxury footer.
- Per-section typography system with large English/Arabic font catalog.
- Homepage Media Library picker integrated into Admin image choices (with upload options retained).
- New Arrivals rotation settings exposed in Admin.
- AI Design Assistant added to Homepage CMS with preview/apply flow and safe CMS/theme actions.
- Product image links continue to open the correct product page; Add to Cart/Quick View remain actions.

Release gate:
- Do not deploy until Cloud Shell runs npm run typecheck and npm run build successfully on the latest branch.
- After successful build, deploy once to Cloud Run, test live homepage/Admin, then move directly to the product-page redesign.

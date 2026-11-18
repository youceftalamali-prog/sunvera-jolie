# SunVera Jolie CRM Preview deployment

This deployment is deliberately isolated from the production Worker and production database.

## Resources

- Git branch: `feat/sunvera-crm-foundation`
- Neon branch: `sunvera-crm-preview`
- Cloudflare Hyperdrive: `sunvera-crm-preview-hyperdrive`
- Hyperdrive ID: `318d8f2f5ceb4e76b0f63eab7791e717`
- Preview Worker: `sunvera-jolie-crm-preview`
- Preview hostname: Cloudflare `workers.dev` hostname for the Preview Worker

The workflow creates a temporary `wrangler.crm-preview.jsonc` during CI. It copies the checked-in `wrangler.jsonc`, changes the Worker name and HYPERDRIVE ID, removes production routes, and deploys only the separate Preview Worker. The checked-in production `wrangler.jsonc` is not edited.

## Required GitHub Actions secrets

Create these repository Actions secrets before triggering the deployment:

- `CRM_CLOUDFLARE_API_TOKEN`: create a dedicated account-owned token for CRM Preview at Manage Account > Account API Tokens. Set its scope to `Specified Workers`, select only `sunvera-jolie-crm-preview`, and choose the `Editor` role. This permits deploys and secret updates for this existing Worker without access to your other Workers. Store it in `CRM_CLOUDFLARE_API_TOKEN`; do not replace the existing `CLOUDFLARE_API_TOKEN`, which may be used by other deployments.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the Preview Hyperdrive.
- `CRM_PREVIEW_DATABASE_URL`: a direct, non-pooled PostgreSQL URL for the Neon branch `sunvera-crm-preview`. Use the `neondb_owner` role for Drizzle schema changes. The workflow checks that the URL host is exactly `ep-jolly-darkness-b2tcbdab.c-6.eu-central-1.aws.neon.tech` (the host displayed for `sunvera-crm-preview` in Neon) and rejects pooled URLs. Do not use a production URL.
- `CRM_PREVIEW_ADMIN_PASSWORD`: a Preview-only password, at least 12 characters and containing letters and digits. Do not reuse the production admin password.

The Worker runtime connects through the separately created Hyperdrive configuration using its `hyperdrive_user` role. The schema push uses the direct Neon owner connection only for the isolated Preview branch. The workflow generates a fresh random `AUTH_SECRET` for the Preview Worker on each deployment.

## Triggering the deployment

The workflow is intentionally gated. It runs only on a push to `feat/sunvera-crm-foundation` when the commit message contains:

```text
[deploy-crm-preview]
```

Ordinary pushes and pull-request checks do not deploy anything. Do not add the marker until all four GitHub Actions secrets are set and the Neon and Hyperdrive resources have been verified.

## Workflow actions

1. Validate that the Preview Hyperdrive ID differs from the production ID.
2. Validate the Preview PostgreSQL URL and Preview admin password.
3. Verify the Cloudflare account credentials.
4. Run `npm run db:push` with `DATABASE_URL` set only to `CRM_PREVIEW_DATABASE_URL`.
5. Run typecheck and lint.
6. Build the OpenNext Worker.
7. Generate a separate Wrangler config and deploy `sunvera-jolie-crm-preview` using the Preview Hyperdrive ID.
8. Set Preview-only `AUTH_SECRET` and `ADMIN_PASSWORD` Worker secrets.

No production branch, production Hyperdrive binding, production Worker, or production database URL is changed by this workflow.


## Verified setup status

- Dedicated Cloudflare CI token `CRM_CLOUDFLARE_API_TOKEN` has been added to GitHub Actions, scoped to `sunvera-jolie-crm-preview` with Individual Workers Editor.

- Cloudflare Hyperdrive Query caching: disabled for `sunvera-crm-preview-hyperdrive`.
- CRM Preview deployment re-run requested after refreshing the dedicated `CRM_PREVIEW_DATABASE_URL` GitHub Actions secret.
- Neon target: dedicated `sunvera-crm-preview` branch.
- Workflow validates the exact Neon host and `neondb_owner` role before applying schema changes.

## CRM customer and order context

The CRM lead list API now returns two deliberately separate order collections:

- `linkedOrders`: only orders explicitly related by `crm_leads.order_id` or matching `customer_id`.
- `phoneMatches`: potential order matches based on normalized phone number. These are displayed separately and are not linked or counted as confirmed purchases automatically; an administrator should verify the customer's identity first.

The CRM UI shows linked order history and potential phone matches in the lead detail panel.
- Phone matching canonicalizes Algerian local numbers (for example, `077...`) and international forms (`+21377...` or `0021377...`) to the same local digits. A phone match is still marked as a potential match and is never auto-linked.
 This is an internal store-data enhancement; it does not yet connect WhatsApp, Messenger, Instagram, Facebook Lead Ads, or other external messaging/webhook services.


CRM order-history Preview update is ready for deployment after successful CI checks. [deploy-crm-preview]


Redeploy CRM Preview after Algerian phone-number normalization update. [deploy-crm-preview]

## Latest Preview correction

- The phone-match query now searches the local Algerian format and its `213` / `00213` international digit forms. Results remain unlinked potential matches until manually verified.

## Manually confirm and link a phone-matched order

The CRM lead detail panel now provides a `Confirm & Link Order` action for each potential order match. The admin must confirm the order in the browser prompt. The API then verifies that the lead and order phones match after Algerian local/international normalization, checks that the order is not already assigned to a different lead, and records the relationship in `crm_lead_orders`. The action also writes an internal system entry to the lead timeline. The same order cannot be linked to two CRM leads, while one lead can have multiple confirmed orders. Linking does not modify order status, price, customer details, or order history.

The new `crm_lead_orders` table is created by the Preview workflow's Drizzle schema push against the isolated Neon CRM Preview database only.


Deploy CRM Preview with manual order confirmation and linking support. [deploy-crm-preview]


## Meta CRM inbound messaging webhooks (Preview)

Webhook endpoint:
`https://sunvera-jolie-crm-preview.youceftalamali.workers.dev/api/webhooks/meta`

Configure these as **Worker Secrets on the Preview Worker only** in Cloudflare Workers & Pages → `sunvera-jolie-crm-preview` → Settings → Variables and Secrets:

- `META_APP_SECRET`: the App Secret shown in the Meta app's App Settings → Basic.
- `META_WEBHOOK_VERIFY_TOKEN`: a strong random string that you create and also enter in Meta's Webhooks configuration.
- `META_INSTAGRAM_ACCOUNT_ID` (optional): the Instagram account/object ID if Meta sends the account's events in a Page-shaped webhook payload and you want to force classification as Instagram.

Do not commit these values, paste them into chat, or add them to the repository. The endpoint supports Meta's GET verification handshake and validates every POST using `X-Hub-Signature-256` and the raw request body before parsing it.

### Meta app setup

1. In Meta for Developers, use a Business app and add the WhatsApp, Messenger, and Instagram messaging products/use cases required for the accounts you will connect.
2. In Webhooks, set the callback URL above and enter the exact `META_WEBHOOK_VERIFY_TOKEN` value. Meta verifies the endpoint with a GET challenge request.
3. For WhatsApp, subscribe the app to the WhatsApp Business Account and the `messages` webhook field in the WhatsApp product configuration.
4. For Facebook Messenger, configure the Page webhook `messages` field and install/subscribe the app to the Facebook Page. Meta documents `pages_messaging` for message webhooks and Page access by a person with the Page's MESSAGING task.
5. For Instagram messaging, use an Instagram Professional account and configure its messaging webhook through the Instagram product. The permissions depend on the login/API path; the Facebook Login path commonly requires `instagram_basic`, `instagram_manage_messages`, and `pages_manage_metadata`, while Instagram Login uses the `instagram_business_*` permission family.
6. Test first with app-role accounts. For messages from ordinary customers, configure the app for Live mode and complete Meta App Review/Advanced Access for the permissions that apply to your use case.

### What the first release does

- Creates a CRM lead on the first inbound message, or attaches the channel identity to one unambiguous existing lead with the same normalized WhatsApp phone number.
- Stores inbound message text or a safe attachment placeholder in the lead timeline.
- Uses a channel/account/contact identity mapping so the same Messenger/Instagram/WhatsApp contact continues to reach the same lead.
- Deduplicates Meta retries using the provider message ID.
- Ignores delivery/read receipts, outbound echo events, and events that are not inbound messages.

This is inbound capture only. It does not send replies, download attachments, import historical conversations, or yet support outbound templates. Those capabilities require separate Page/WABA/Instagram tokens and their own permission and messaging-window checks. Phone-number matching across different people is not used to merge Messenger or Instagram identities automatically.

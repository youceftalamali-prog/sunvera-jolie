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

- `CLOUDFLARE_API_TOKEN`: create a Cloudflare API token using the `Edit Cloudflare Workers` permission preset, scoped to this Cloudflare account only. The workflow uses it for Worker deployment and Preview secrets. Cloudflare's GitHub Actions guide documents this preset and the two required CI secrets.
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

- Cloudflare Hyperdrive Query caching: disabled for `sunvera-crm-preview-hyperdrive`.
- CRM Preview deployment re-run requested after refreshing the dedicated `CRM_PREVIEW_DATABASE_URL` GitHub Actions secret.
- Neon target: dedicated `sunvera-crm-preview` branch.
- Workflow validates the exact Neon host and `neondb_owner` role before applying schema changes.

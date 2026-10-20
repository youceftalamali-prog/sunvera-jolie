# Cloudflare Workers Builds troubleshooting

The production Worker `sunvera-jolie` uses OpenNext and has a remote Hyperdrive binding named `HYPERDRIVE`.

## Workers Builds settings

- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx @opennextjs/cloudflare deploy`
- Root directory: `/`
- Production branch: `release/sunvera-jolie-unified`

Use the OpenNext deploy command in Workers Builds. It runs the adapter's deployment flow and handles remote cache population before invoking Wrangler. Do not replace it with a bare `npx wrangler deploy` for this setup unless the deployment flow has been intentionally redesigned and verified.

## Hyperdrive

The Worker configuration in `wrangler.jsonc` binds remote Hyperdrive to `HYPERDRIVE`. A deploy command that invokes local preview/bindings emulation can fail with the message that `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` is missing. This is not a request to add production database credentials as a build variable. Do not set a local connection string in production build variables; configure the adapter's deploy command to target the remote deployment flow.

## Post-deploy checks

After the first successful automatic build/deploy, verify the storefront home page, a product page, admin authentication, a database-backed operation, and Worker logs. Keep the previous working deployment available as the rollback target until these checks pass.

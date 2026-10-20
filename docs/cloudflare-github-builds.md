# Cloudflare Workers Builds

This repository's production Worker is `sunvera-jolie`.

## Production build settings

- GitHub repository: `youceftalamali-prog/sunvera-jolie`
- Production branch: `release/sunvera-jolie-unified`
- Root directory: `/`
- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx wrangler deploy`

The Worker configuration is maintained in `wrangler.jsonc`. The production database connection is provided by the `HYPERDRIVE` binding; do not copy database credentials into build variables. Runtime secrets such as `AUTH_SECRET`, `ADMIN_PASSWORD`, and any AI provider keys must be configured in the Worker environment as appropriate, not committed to Git.

A successful GitHub build/deploy must be followed by a smoke test of the storefront, admin authentication, product pages, and database-backed operations before treating the rollout as verified.

## Safety

Do not deploy from the local `migration/cloudflare` working tree. Use the production branch configured above, and keep preview builds disabled until preview bindings and secrets are validated.

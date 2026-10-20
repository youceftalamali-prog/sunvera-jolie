# Cloudflare Workers Builds troubleshooting

The production Worker `sunvera-jolie` uses OpenNext and has a remote Hyperdrive binding named `HYPERDRIVE`.

## Workers Builds settings

- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://postgres:postgres@127.0.0.1:5432/sunvera_build npx @opennextjs/cloudflare deploy`
- Root directory: `/`
- Production branch: `release/sunvera-jolie-unified`

OpenNext's documented deployment flow is to use its `deploy` command; it performs remote cache population and deploys through Wrangler. This repository's Cloudflare Builds log showed the OpenNext deploy path failing while Wrangler emulated Hyperdrive locally because no local connection string was defined. The inline placeholder above is only a build-process workaround to satisfy local binding emulation; it is not a real connection and must never be used for application database queries. The deployed Worker still uses the remote Hyperdrive binding configured in `wrangler.jsonc`.

Do not add a real production database URL to Workers Builds variables or commit database credentials. If the OpenNext deploy step tries to connect to the placeholder rather than just reading bindings, stop the rollout and use a supported workaround that avoids local emulation; do not replace it with real production credentials in this variable.

## Runtime secrets and bindings

The Worker configuration is maintained in `wrangler.jsonc`. Production database access is through the `HYPERDRIVE` binding. Runtime secrets such as `AUTH_SECRET`, `ADMIN_PASSWORD`, and any AI provider keys must be configured as Worker runtime secrets, not committed to Git and not assumed to be supplied by build variables.

## Post-deploy checks

After the first successful automatic build/deploy, verify the storefront home page, a product page, admin authentication, a database-backed operation, and Worker logs. Keep the previous working deployment available as the rollback target until these checks pass.

## Safety

Do not deploy from the local `migration/cloudflare` working tree. Use the configured production branch, and keep preview builds disabled until preview bindings and secrets are validated.

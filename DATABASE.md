# Database setup

All database consumers use the same `DATABASE_URL` environment variable:

- Application runtime: `src/db/index.ts`
- Drizzle CLI: `drizzle.config.ts`
- Local database check: `npm run db:check`
- Schema application: `npm run db:push`

Set `DATABASE_URL` in the local shell or an untracked `.env.local` file. Do not commit credentials.

## Local development

This project uses an external PostgreSQL service. The former `pg-start.mjs` embedded-PostgreSQL implementation was not backed by a declared dependency, so the script now validates connectivity instead of attempting to start a private database with hard-coded credentials.

Example with a local PostgreSQL database:

```bash
export DATABASE_URL='postgresql://postgres:<local-password>@127.0.0.1:5432/app_db'
npm ci
npm run db:check
npm run db:push
npm run dev
```

`db:seed` is informational because the application currently seeds through `ensureSeed()` on the first catalog query. Run `db:push` first; do not use destructive reset commands against production.

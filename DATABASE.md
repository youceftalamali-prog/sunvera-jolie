# Database setup

All database consumers use the same `DATABASE_URL` environment variable:

- Application runtime: `src/db/index.ts`
- Drizzle CLI: `drizzle.config.ts`
- Local database check: `npm run db:check`
- Schema application: `npm run db:push`

Set `DATABASE_URL` in the local shell or an untracked `.env.local` file. Do not commit credentials.

## Local development

This project uses an external PostgreSQL service. `pg-start.mjs` is a connectivity check; it does not start PostgreSQL and does not contain database credentials. Start PostgreSQL through your local service or container, set `DATABASE_URL`, then run:

```bash
export DATABASE_URL='postgresql://postgres:<local-password>@127.0.0.1:5432/app_db'
npm ci
npm run db:check
npm run db:push
npm run dev
```

There is intentionally no `db:seed` script. Seeding is part of the existing application behavior: `ensureSeed()` runs on the first catalog query after the schema exists. The CI smoke test calls the catalog endpoint to exercise that path. Do not use destructive reset commands against production.

import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Db = ReturnType<typeof drizzle>;

export const getDb = cache((): Db => {
  let connectionString: string | undefined;

  try {
    const { env } = getCloudflareContext();
    const bindings = env as unknown as {
      HYPERDRIVE?: { connectionString?: string };
    };
    connectionString = bindings.HYPERDRIVE?.connectionString;
  } catch {
    // Local development only.
  }

  // Production Workers must use Hyperdrive. Permit DATABASE_URL in CI so the
  // production-mode regression server can use its isolated ephemeral PostgreSQL service.
  if (!connectionString && (process.env.NODE_ENV !== "production" || process.env.CI === "true")) {
    connectionString = process.env.DATABASE_URL;
  }

  if (!connectionString) {
    throw new Error("HYPERDRIVE or DATABASE_URL is required");
  }

  // Keep the pool bounded to one connection. Do not set maxUses: 1: with
  // parallel queries on a request, that forces node-postgres to retire clients
  // immediately after one query, exercising the socket teardown path that
  // has produced unhandled CloudflareSocket rejections in Workers.
  return drizzle(new Pool({ connectionString, max: 1 }));
});

export const db = new Proxy({} as Db, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

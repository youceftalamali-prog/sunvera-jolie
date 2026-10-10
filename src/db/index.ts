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

  if (!connectionString && process.env.NODE_ENV !== "production") {
    connectionString = process.env.DATABASE_URL;
  }

  if (!connectionString) {
    throw new Error("HYPERDRIVE or DATABASE_URL is required");
  }

  return drizzle(new Pool({ connectionString, maxUses: 1 }));
});

export const db = new Proxy({} as Db, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

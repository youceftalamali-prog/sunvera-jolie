import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Start PostgreSQL separately, then run this check again.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const result = await client.query<{ database: string }>("select current_database() as database");
  console.log(`POSTGRES_READY database=${result.rows[0]?.database ?? "unknown"}`);
} catch (error) {
  console.error("Unable to connect to PostgreSQL using DATABASE_URL.");
  console.error(error instanceof Error ? error.message : "Unknown PostgreSQL connection error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

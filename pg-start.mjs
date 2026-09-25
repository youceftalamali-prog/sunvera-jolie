import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const pg = new EmbeddedPostgres({
  databaseDir: "./.pgdata",
  port: 5432,
  user: "postgres",
  password: "postgres",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (m) => process.stdout.write(`[pg] ${m}\n`),
  onError: (m) => process.stdout.write(`[pg:err] ${m?.message ?? m}\n`),
});

if (!existsSync("./.pgdata/PG_VERSION")) {
  await pg.initialise();
} else {
  console.log("[pg] existing cluster found, skipping initdb");
}
await pg.start();
try {
  await pg.createDatabase("app_db");
  console.log("[pg] database app_db created");
} catch (e) {
  console.log("[pg] createDatabase note:", e?.message ?? e);
}
console.log("PG_READY");
setInterval(() => {}, 1 << 30);

export const dynamic = "force-dynamic";

type StageResult = {
  ok: boolean;
  details?: Record<string, unknown>;
  error?: { name: string; message: string };
};

function safeError(error: unknown): { name: string; message: string } {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: rawMessage
      .replace(/postgres(?:ql)?:\/\/[^\s"'\x60]+/gi, "[redacted database URL]")
      .slice(0, 300),
  };
}

export async function GET() {
  const stages: Record<string, StageResult> = {};

  const runStage = async (
    name: string,
    operation: () => Promise<Record<string, unknown>>,
  ) => {
    try {
      stages[name] = { ok: true, details: await operation() };
    } catch (error) {
      stages[name] = { ok: false, error: safeError(error) };
    }
  };

  await runStage("cloudflare-module-import", async () => {
    const mod = await import("@opennextjs/cloudflare");
    return { getCloudflareContextType: typeof mod.getCloudflareContext };
  });

  await runStage("cloudflare-context", async () => {
    const mod = await import("@opennextjs/cloudflare");
    const { env } = mod.getCloudflareContext();
    const hyperdrive = (env as unknown as {
      HYPERDRIVE?: { connectionString?: string };
    }).HYPERDRIVE;
    return {
      hyperdriveBindingPresent: Boolean(hyperdrive),
      connectionStringPresent: typeof hyperdrive?.connectionString === "string",
    };
  });

  await runStage("pg-module-import", async () => {
    const mod = await import("pg");
    return { poolExportType: typeof mod.Pool };
  });

  await runStage("drizzle-module-import", async () => {
    const mod = await import("drizzle-orm/node-postgres");
    return { drizzleExportType: typeof mod.drizzle };
  });

  await runStage("database-module-import", async () => {
    const mod = await import("@/db");
    return { getDbExportType: typeof mod.getDb, dbExportType: typeof mod.db };
  });

  await runStage("database-query", async () => {
    const [{ db }, { sql }] = await Promise.all([
      import("@/db"),
      import("drizzle-orm"),
    ]);
    await db.execute(sql`select 1`);
    return { querySucceeded: true };
  });

  const ok = Object.values(stages).every((stage) => stage.ok);
  return Response.json({ ok, stages });
}

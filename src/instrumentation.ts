export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionSecrets } = await import("@/lib/auth");
    assertProductionSecrets();
  }
}

import { POST } from "../../src/app/api/admin/ai/master/route";

export default async function masterAIBackground(request: Request) {
  const body = await request.text();
  const targetUrl = new URL("/api/admin/ai/master", request.url);

  const headers = new Headers(request.headers);
  headers.delete("content-length");

  try {
    const response = await POST(
      new Request(targetUrl, {
        method: "POST",
        headers,
        body,
      }),
    );

    if (!response.ok) {
      console.error("[Master AI Background] Master route failed:", response.status, await response.text());
      return;
    }

    console.info("[Master AI Background] Master AI job completed successfully.");
  } catch (error) {
    console.error("[Master AI Background] Master AI job failed:", error);
    throw error;
  }
}

export const config = {
  background: true,
};

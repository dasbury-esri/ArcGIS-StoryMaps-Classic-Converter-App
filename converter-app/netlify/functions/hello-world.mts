import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  context.waitUntil(logRequest(req));

  return new Response("Hello, world!");
};

async function logRequest(req: Request) {
  await fetch("https://example.com/log", {
    method: "POST",
    body: JSON.stringify({ url: req.url, timestamp: Date.now() }),
    headers: { "Content-Type": "application/json" },
  });
}
import type { Context } from "@netlify/functions";

export default async (_req: Request, _context: Context) => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

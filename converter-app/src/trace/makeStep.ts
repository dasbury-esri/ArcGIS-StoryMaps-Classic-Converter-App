import { trace } from './TraceRecorder';

export function makeStep<TCtx, TOut>(opts: {
  id: string;
  type?: string;
  description?: string;
  run: (ctx: TCtx) => Promise<TOut> | TOut;
}) {
  const { id, type, run } = opts;
  return {
    id,
    type,
    description: opts.description,
    async run(ctx: TCtx): Promise<TOut> {
      try {
        trace.onEnter(id, { type, input: safeSnapshot(ctx), meta: opts.description ? { description: opts.description } : undefined });
        const result = await run(ctx);
        trace.onExit(id, { type, output: safeSnapshot(result), meta: undefined });
        return result;
      } catch (e) {
        trace.onExit(id, { type, output: { error: toErr(e) } });
        throw e;
      }
    }
  };
}

function safeSnapshot(obj: unknown): unknown {
  try {
    // Avoid huge payloads or circular refs
    const json = JSON.stringify(obj);
    if (json.length > 10000) return { truncated: true, approxBytes: json.length };
    return obj;
  } catch {
    return { snapshot: 'unserializable' };
  }
}

function toErr(e: unknown) {
  if (e instanceof Error) return { message: e.message, name: e.name };
  return { message: String(e) };
}

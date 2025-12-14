export type TraceEvent = {
  ts: number;
  event: 'enter' | 'exit';
  stepId: string;
  type?: string;
  input?: unknown;
  output?: unknown;
  meta?: Record<string, unknown>;
};

export type TraceSession = {
  sessionId: string;
  itemId?: string;
  startedAt: number;
  endedAt?: number;
  events: TraceEvent[];
};

class TraceRecorder {
  private current: TraceSession | null = null;

  startSession(itemId?: string): string {
    const ts = Date.now();
    const sessionId = `sess-${ts}-${Math.random().toString(36).slice(2, 8)}`;
    this.current = { sessionId, itemId, startedAt: ts, events: [] };
    return sessionId;
  }

  onEnter(stepId: string, payload?: { type?: string; input?: unknown; meta?: Record<string, unknown> }) {
    if (!this.current) return;
    this.current.events.push({ ts: Date.now(), event: 'enter', stepId, type: payload?.type, input: payload?.input, meta: payload?.meta });
  }

  onExit(stepId: string, payload?: { type?: string; output?: unknown; meta?: Record<string, unknown> }) {
    if (!this.current) return;
    this.current.events.push({ ts: Date.now(), event: 'exit', stepId, type: payload?.type, output: payload?.output, meta: payload?.meta });
  }

  endSession() {
    if (!this.current) return;
    this.current.endedAt = Date.now();
  }

  export(): TraceSession | null {
    return this.current ? { ...this.current, events: [...this.current.events] } : null;
  }

  reset() { this.current = null; }
}

export const trace = new TraceRecorder();

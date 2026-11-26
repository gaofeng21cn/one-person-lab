export type EventListener<TPayload> = (payload: TPayload) => void | Promise<void>;

export interface EventBusOptions<TEvents extends Record<string, unknown>> {
  onError?: (event: keyof TEvents, error: unknown) => void;
}

export class EventBus<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  private readonly listeners = new Map<keyof TEvents, Set<EventListener<unknown>>>();
  private readonly onError?: (event: keyof TEvents, error: unknown) => void;

  constructor(options: EventBusOptions<TEvents> = {}) {
    this.onError = options.onError;
  }

  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener as EventListener<unknown>);
    return () => {
      this.off(event, listener);
    };
  }

  once<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): () => void {
    const wrapped: EventListener<TEvents[K]> = (payload) => {
      this.off(event, wrapped);
      return listener(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    bucket.delete(listener as EventListener<unknown>);
    if (bucket.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return;
    const snapshot = [...bucket];
    for (const listener of snapshot) {
      try {
        const maybePromise = listener(payload);
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
          void (maybePromise as Promise<void>).catch((error) => {
            this.reportError(event, error);
          });
        }
      } catch (error) {
        this.reportError(event, error);
      }
    }
  }

  async emitAsync<K extends keyof TEvents>(event: K, payload: TEvents[K]): Promise<void> {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return;
    const snapshot = [...bucket];
    for (const listener of snapshot) {
      try {
        await listener(payload);
      } catch (error) {
        this.reportError(event, error);
      }
    }
  }

  listenerCount<K extends keyof TEvents>(event?: K): number {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const bucket of this.listeners.values()) {
      total += bucket.size;
    }
    return total;
  }

  clear(): void {
    this.listeners.clear();
  }

  private reportError<K extends keyof TEvents>(event: K, error: unknown): void {
    if (this.onError) {
      try {
        this.onError(event, error);
      } catch {
        // Error handler failure must never propagate to callers or sibling listeners.
      }
    }
  }
}

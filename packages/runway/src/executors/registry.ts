import { RunwayError } from '../errors.ts';
import type {
  ExecutorAdapter,
  ExecutorCapabilities,
  ExecutorHealthStatus,
} from './spi.ts';

export class ExecutorRegistry {
  readonly #adapters = new Map<string, ExecutorAdapter>();

  register(adapter: ExecutorAdapter): void {
    const id = adapter.capabilities.executor_id.trim();
    if (!id) {
      throw new RunwayError('INVALID_INPUT', 'Executor adapter must have a non-empty executor_id.');
    }
    this.#adapters.set(id, adapter);
  }

  unregister(executorId: string): boolean {
    return this.#adapters.delete(executorId);
  }

  has(executorId: string): boolean {
    return this.#adapters.has(executorId);
  }

  get(executorId: string): ExecutorAdapter {
    const adapter = this.#adapters.get(executorId);
    if (!adapter) {
      throw new RunwayError('EXECUTOR_NOT_FOUND', `Executor '${executorId}' is not registered.`, {
        executor_id: executorId,
      });
    }
    return adapter;
  }

  getOptional(executorId: string): ExecutorAdapter | undefined {
    return this.#adapters.get(executorId);
  }

  list(): ExecutorAdapter[] {
    return [...this.#adapters.values()];
  }

  listCapabilities(): ExecutorCapabilities[] {
    return [...this.#adapters.values()].map((a) => a.capabilities);
  }

  async healthCheckAll(): Promise<
    Record<string, ExecutorHealthStatus & { readonly capabilities: ExecutorCapabilities }>
  > {
    const out: Record<
      string,
      ExecutorHealthStatus & { readonly capabilities: ExecutorCapabilities }
    > = {};
    for (const [id, adapter] of this.#adapters.entries()) {
      try {
        const status = await adapter.healthCheck();
        out[id] = { ...status, capabilities: adapter.capabilities };
      } catch (error) {
        out[id] = {
          available: false,
          reason: error instanceof Error ? error.message : String(error),
          capabilities: adapter.capabilities,
        };
      }
    }
    return out;
  }
}

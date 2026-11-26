import { KernelError, isRecord, toErrorMessage } from './errors.ts';
import { EventBus } from './event-bus.ts';

export type PluginStatus =
  | 'registered'
  | 'initialized'
  | 'started'
  | 'failed'
  | 'disposed';

export interface PluginContext {
  readonly pluginId: string;
  readonly events: EventBus<Record<string, unknown>>;
  registerService<T>(token: string, instance: T): void;
  getService<T>(token: string): T;
  tryGetService<T>(token: string): T | undefined;
  onDispose(fn: () => void | Promise<void>): void;
}

export interface PluginDefinition {
  readonly id: string;
  readonly version?: string;
  readonly dependencies?: readonly string[];
  readonly optionalDependencies?: readonly string[];
  init?(ctx: PluginContext): void | Promise<void>;
  start?(ctx: PluginContext): void | Promise<void>;
  dispose?(ctx: PluginContext): void | Promise<void>;
}

export interface PluginRecord {
  readonly id: string;
  readonly version?: string;
  readonly status: PluginStatus;
  readonly error?: unknown;
}

interface InternalPluginEntry {
  readonly definition: PluginDefinition;
  status: PluginStatus;
  error?: unknown;
  readonly disposeHooks: Array<() => void | Promise<void>>;
  context?: PluginContext;
}

function isPluginDefinition(value: unknown): value is PluginDefinition {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0;
}

export class PluginLoader {
  readonly events: EventBus<Record<string, unknown>>;
  private readonly plugins = new Map<string, InternalPluginEntry>();
  private readonly services = new Map<string, unknown>();
  private resolvedOrderCache: string[] | null = null;

  constructor(events?: EventBus<Record<string, unknown>>) {
    this.events = events ?? new EventBus();
  }

  register(definition: PluginDefinition): this {
    const id = definition.id.trim();
    if (!id) {
      throw new KernelError('INVALID_INPUT', 'Plugin id must be a non-empty string.');
    }
    if (this.plugins.has(id)) {
      throw new KernelError('PLUGIN_DUPLICATE', `Plugin '${id}' is already registered.`, {
        plugin_id: id,
      });
    }
    const deps = definition.dependencies ?? [];
    if (deps.includes(id)) {
      throw new KernelError('PLUGIN_DEPENDENCY_CYCLE', `Plugin '${id}' cannot depend on itself.`, {
        cycle: [id, id],
      });
    }
    this.plugins.set(id, {
      definition: { ...definition, id },
      status: 'registered',
      disposeHooks: [],
    });
    this.resolvedOrderCache = null;
    return this;
  }

  async loadFromModule(specifier: string): Promise<PluginDefinition> {
    const mod = (await import(specifier)) as Record<string, unknown>;
    const candidate = mod.plugin ?? mod.default;
    const resolved = typeof candidate === 'function' ? await (candidate as () => unknown)() : candidate;
    if (!isPluginDefinition(resolved)) {
      throw new KernelError(
        'INVALID_INPUT',
        `Module '${specifier}' did not export a valid PluginDefinition ('plugin' or 'default').`,
        { specifier },
      );
    }
    this.register(resolved);
    return resolved;
  }

  resolveOrder(): string[] {
    const ids = [...this.plugins.keys()].sort();
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const id of ids) {
      inDegree.set(id, 0);
      dependents.set(id, []);
    }

    for (const id of ids) {
      const def = this.plugins.get(id)!.definition;
      const required = def.dependencies ?? [];
      const optional = def.optionalDependencies ?? [];
      for (const dep of required) {
        if (!this.plugins.has(dep)) {
          throw new KernelError(
            'PLUGIN_DEPENDENCY_MISSING',
            `Plugin '${id}' requires missing dependency '${dep}'.`,
            { plugin_id: id, missing_dependency: dep },
          );
        }
      }
      const combined = new Set<string>([
        ...required,
        ...optional.filter((dep) => this.plugins.has(dep)),
      ]);
      for (const dep of combined) {
        if (dep === id) {
          throw new KernelError('PLUGIN_DEPENDENCY_CYCLE', `Plugin '${id}' cannot depend on itself.`, {
            cycle: [id, id],
          });
        }
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        dependents.get(dep)!.push(id);
      }
    }

    const queue = ids.filter((id) => inDegree.get(id) === 0).sort();
    const ordered: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);
      for (const next of dependents.get(current) ?? []) {
        const remaining = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, remaining);
        if (remaining === 0) {
          queue.push(next);
          queue.sort();
        }
      }
    }

    if (ordered.length !== ids.length) {
      const cycle = this.findCycle(ids.filter((id) => !ordered.includes(id)));
      throw new KernelError(
        'PLUGIN_DEPENDENCY_CYCLE',
        `Circular plugin dependency detected: ${cycle.join(' -> ')}.`,
        { cycle },
      );
    }

    this.resolvedOrderCache = ordered;
    return [...ordered];
  }

  async initAll(options: { isolateErrors?: boolean } = {}): Promise<PluginRecord[]> {
    const order = this.resolveOrder();
    const isolate = options.isolateErrors ?? false;
    for (const id of order) {
      const entry = this.plugins.get(id)!;
      if (entry.status !== 'registered') continue;
      const failedDep = (entry.definition.dependencies ?? []).find(
        (dep) => this.plugins.get(dep)?.status === 'failed',
      );
      if (failedDep) {
        const err = new KernelError(
          'PLUGIN_LIFECYCLE_FAILED',
          `Skipping init for '${id}' because dependency '${failedDep}' failed.`,
          { plugin_id: id, failed_dependency: failedDep },
        );
        entry.status = 'failed';
        entry.error = err;
        if (!isolate) throw err;
        continue;
      }

      const ctx = this.createContext(id, entry);
      entry.context = ctx;
      try {
        await entry.definition.init?.(ctx);
        entry.status = 'initialized';
      } catch (error) {
        entry.status = 'failed';
        entry.error = error;
        if (!isolate) {
          throw new KernelError(
            'PLUGIN_LIFECYCLE_FAILED',
            `Plugin '${id}' failed during init: ${toErrorMessage(error)}`,
            { plugin_id: id, phase: 'init' },
            { cause: error },
          );
        }
      }
    }
    return this.listPlugins();
  }

  async startAll(options: { isolateErrors?: boolean } = {}): Promise<PluginRecord[]> {
    const hasRegistered = [...this.plugins.values()].some((entry) => entry.status === 'registered');
    if (hasRegistered) {
      await this.initAll(options);
    }
    const order = this.resolvedOrderCache ?? this.resolveOrder();
    const isolate = options.isolateErrors ?? false;
    for (const id of order) {
      const entry = this.plugins.get(id)!;
      if (entry.status !== 'initialized') continue;
      const failedDep = (entry.definition.dependencies ?? []).find(
        (dep) => this.plugins.get(dep)?.status === 'failed',
      );
      if (failedDep) {
        const err = new KernelError(
          'PLUGIN_LIFECYCLE_FAILED',
          `Skipping start for '${id}' because dependency '${failedDep}' failed.`,
          { plugin_id: id, failed_dependency: failedDep },
        );
        entry.status = 'failed';
        entry.error = err;
        if (!isolate) throw err;
        continue;
      }
      const ctx = entry.context ?? this.createContext(id, entry);
      entry.context = ctx;
      try {
        await entry.definition.start?.(ctx);
        entry.status = 'started';
      } catch (error) {
        entry.status = 'failed';
        entry.error = error;
        if (!isolate) {
          throw new KernelError(
            'PLUGIN_LIFECYCLE_FAILED',
            `Plugin '${id}' failed during start: ${toErrorMessage(error)}`,
            { plugin_id: id, phase: 'start' },
            { cause: error },
          );
        }
      }
    }
    return this.listPlugins();
  }

  async disposeAll(): Promise<{ errors: Array<{ plugin_id: string; error: unknown }> }> {
    let order: readonly string[];
    try {
      order = this.resolvedOrderCache ?? this.resolveOrder();
    } catch {
      order = [...this.plugins.keys()];
    }
    const reverseOrder = [...order].reverse();
    const errors: Array<{ plugin_id: string; error: unknown }> = [];

    for (const id of reverseOrder) {
      const entry = this.plugins.get(id)!;
      if (entry.status === 'disposed') continue;
      const hooks = [...entry.disposeHooks].reverse();
      for (const hook of hooks) {
        try {
          await hook();
        } catch (error) {
          errors.push({ plugin_id: id, error });
        }
      }
      if (entry.definition.dispose && entry.context) {
        try {
          await entry.definition.dispose(entry.context);
        } catch (error) {
          errors.push({ plugin_id: id, error });
        }
      }
      entry.status = 'disposed';
    }

    return { errors };
  }

  getService<T>(token: string): T {
    if (!this.services.has(token)) {
      throw new KernelError('INVALID_INPUT', `Service '${token}' is not registered.`, { token });
    }
    return this.services.get(token) as T;
  }

  tryGetService<T>(token: string): T | undefined {
    return this.services.get(token) as T | undefined;
  }

  getStatus(id: string): PluginStatus | undefined {
    return this.plugins.get(id)?.status;
  }

  listPlugins(): PluginRecord[] {
    return [...this.plugins.values()].map((entry) => ({
      id: entry.definition.id,
      version: entry.definition.version,
      status: entry.status,
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    }));
  }

  private createContext(pluginId: string, entry: InternalPluginEntry): PluginContext {
    return {
      pluginId,
      events: this.events,
      registerService: <T>(token: string, instance: T) => {
        if (this.services.has(token)) {
          throw new KernelError('PLUGIN_DUPLICATE', `Service '${token}' is already registered.`, {
            token,
            plugin_id: pluginId,
          });
        }
        this.services.set(token, instance);
      },
      getService: <T>(token: string) => this.getService<T>(token),
      tryGetService: <T>(token: string) => this.tryGetService<T>(token),
      onDispose: (fn: () => void | Promise<void>) => {
        entry.disposeHooks.push(fn);
      },
    };
  }

  private findCycle(unresolvedIds: string[]): string[] {
    const unresolved = new Set(unresolvedIds);
    const state = new Map<string, 'visiting' | 'visited'>();
    const stack: string[] = [];

    const dfs = (id: string): string[] | null => {
      state.set(id, 'visiting');
      stack.push(id);
      const def = this.plugins.get(id)?.definition;
      const deps = [
        ...(def?.dependencies ?? []),
        ...(def?.optionalDependencies ?? []).filter((d) => this.plugins.has(d)),
      ].filter((d) => unresolved.has(d));

      for (const dep of deps) {
        if (state.get(dep) === 'visiting') {
          return [...stack.slice(stack.indexOf(dep)), dep];
        }
        if (!state.has(dep)) {
          const found = dfs(dep);
          if (found) return found;
        }
      }
      stack.pop();
      state.set(id, 'visited');
      return null;
    };

    for (const id of unresolvedIds) {
      if (!state.has(id)) {
        const cycle = dfs(id);
        if (cycle) return cycle;
      }
    }
    return unresolvedIds;
  }
}

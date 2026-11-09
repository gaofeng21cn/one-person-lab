import path from 'node:path';

import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';
import { resolveOplStatePaths } from '../runtime-state-paths.ts';

function defaultTemporalWorkerPaths(): TemporalWorkerPaths {
  return { root: path.join(resolveOplStatePaths().state_dir, 'family-runtime') };
}

export function resolveTemporalWorkerForegroundPaths(): TemporalWorkerPaths { return defaultTemporalWorkerPaths(); }

export function temporalWorkerRootArgumentFromArgv(argv: string[]): string | null {
  const roots = argv.flatMap((arg, index) => {
    if (arg === '--family-runtime-root') return [argv[index + 1]];
    if (arg.startsWith('--family-runtime-root=')) return [arg.slice('--family-runtime-root='.length)];
    return [];
  });
  if (!roots.length) return null;
  const root = roots[0];
  if (!root?.trim() || root.startsWith('--') || roots.some((value) => value !== root)) {
    throw new Error('Temporal foreground worker requires one unambiguous family runtime root');
  }
  return root;
}

export function resolveTemporalWorkerForegroundPathsFromArgv(argv = process.argv): TemporalWorkerPaths {
  const root = temporalWorkerRootArgumentFromArgv(argv);
  return root === null ? defaultTemporalWorkerPaths() : { root: path.resolve(root) };
}

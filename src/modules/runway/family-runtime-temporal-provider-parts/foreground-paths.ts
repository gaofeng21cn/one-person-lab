import path from 'node:path';

import { familyRuntimePaths } from '../family-runtime-store.ts';
import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

export function resolveTemporalWorkerForegroundPaths(): TemporalWorkerPaths { return familyRuntimePaths(); }

export function resolveTemporalWorkerForegroundPathsFromArgv(argv = process.argv): TemporalWorkerPaths {
  const rootIndex = argv.indexOf('--family-runtime-root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : null;
  return root && root.trim().length > 0
    ? { root: path.resolve(root) }
    : familyRuntimePaths();
}

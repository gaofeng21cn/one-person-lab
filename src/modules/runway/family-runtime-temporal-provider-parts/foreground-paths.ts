import path from 'node:path';

import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';
import { resolveOplStatePaths } from '../runtime-state-paths.ts';

function defaultTemporalWorkerPaths(): TemporalWorkerPaths {
  return { root: path.join(resolveOplStatePaths().state_dir, 'family-runtime') };
}

export function resolveTemporalWorkerForegroundPaths(): TemporalWorkerPaths { return defaultTemporalWorkerPaths(); }

export function resolveTemporalWorkerForegroundPathsFromArgv(argv = process.argv): TemporalWorkerPaths {
  const rootIndex = argv.indexOf('--family-runtime-root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : null;
  return root && root.trim().length > 0
    ? { root: path.resolve(root) }
    : defaultTemporalWorkerPaths();
}

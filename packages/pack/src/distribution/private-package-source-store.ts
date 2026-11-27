import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import { isPrivatePackageSourceHandle } from './private-package-source-provider.ts';

export const defaultPrivateSourceId = 'github-packages:gaofeng21cn';
const sourceIdPattern = /^github-packages:([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)$/;

export function privatePackageSourceStoreFile(paths: { state_dir: string; home_dir: string }, allowLegacyDefault: boolean): string {
  const current = path.join(paths.state_dir, 'software-sources.json');
  if (allowLegacyDefault && !fs.existsSync(current)) {
    // v1 used the macOS layout even on other operating systems.
    const legacy = path.join(paths.home_dir, 'Library', 'Application Support', 'OPL', 'state', 'software-sources.json');
    if (fs.existsSync(legacy)) return legacy;
  }
  return current;
}

export function privateSourceOwner(id: string): string {
  const match = typeof id === 'string' && sourceIdPattern.exec(id);
  if (!match) throw new PackError('INVALID_INPUT', 'Expected a GitHub Packages source ID.');
  return match[1]!;
}

export interface SourceStore {
  surface_kind: 'opl_software_sources_store.v1';
  sources: Array<Record<string, unknown>>;
}

export function readPrivateSourceStore(file: string): SourceStore {
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (store?.surface_kind === 'opl_software_sources_store.v1' && Array.isArray(store.sources)
        && store.sources.every((row: unknown) => row && typeof row === 'object' && 'source_id' in row && typeof row.source_id === 'string')) {
      return store;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { surface_kind: 'opl_software_sources_store.v1', sources: [] };
  }
  throw new PackError('INVALID_INPUT', 'Private Package software source configuration is unreadable.');
}

export function selectedPrivateSource(store: SourceStore, sourceId: string): Record<string, unknown> | undefined {
  privateSourceOwner(sourceId);
  const matches = store.sources.filter(source => source.source_id === sourceId);
  if (matches.length > 1) throw new PackError('INVALID_INPUT', 'Private Package software source is ambiguous.');
  return matches[0];
}

export function selectedHandle(source: Record<string, unknown> | undefined): string | null {
  return source?.enabled === true && (source.provider_id === undefined || source.provider_id === 'github_packages')
    && isPrivatePackageSourceHandle(source.credential_handle) ? source.credential_handle : null;
}

export function readConfiguredPrivatePackageHandle(file: string, sourceId: string): string | null {
  const sources = readPrivateSourceStore(file).sources.filter(source => source.source_id === sourceId);
  return sources.length === 1 ? selectedHandle(sources[0]) : null;
}

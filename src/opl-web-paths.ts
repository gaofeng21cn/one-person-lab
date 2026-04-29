import {
  buildOplEntryUrl,
  normalizeBasePath,
  stripOplBasePath,
} from './opl-runtime-paths.ts';

export function normalizeOplWebBasePath(basePath?: string) {
  return normalizeBasePath(basePath);
}

export function buildOplWebEntryUrl(baseUrl: string, basePath = '') {
  return buildOplEntryUrl(baseUrl, basePath);
}

export function stripOplWebBasePath(pathname: string, basePath = '') {
  return stripOplBasePath(pathname, basePath);
}

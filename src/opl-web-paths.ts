import {
  buildFrontDeskEntryUrl,
  normalizeBasePath,
  stripFrontDeskBasePath,
} from './legacy-frontdesk-paths.ts';

export function normalizeOplWebBasePath(basePath?: string) {
  return normalizeBasePath(basePath);
}

export function buildOplWebEntryUrl(baseUrl: string, basePath = '') {
  return buildFrontDeskEntryUrl(baseUrl, basePath);
}

export function stripOplWebBasePath(pathname: string, basePath = '') {
  return stripFrontDeskBasePath(pathname, basePath);
}

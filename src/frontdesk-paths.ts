import {
  buildFrontDeskCompatEndpoints,
  type FrontDeskCompatEndpoints,
} from './frontdesk-paths/legacy.ts';
import {
  buildOplRuntimeEndpoints,
  type OplRuntimeEndpoints,
} from './frontdesk-paths/current.ts';
import { normalizeBasePath } from './frontdesk-paths/shared.ts';
export { normalizeBasePath } from './frontdesk-paths/shared.ts';

export type FrontDeskEndpoints = OplRuntimeEndpoints & FrontDeskCompatEndpoints;

export function buildFrontDeskEndpoints(basePath = ''): FrontDeskEndpoints {
  return {
    ...buildOplRuntimeEndpoints(basePath),
    ...buildFrontDeskCompatEndpoints(basePath),
  };
}

export function buildFrontDeskEntryUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/` : `${baseUrl}/`;
}

export function buildFrontDeskApiBaseUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/api` : `${baseUrl}/api`;
}

export function stripFrontDeskBasePath(pathname: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);

  if (!prefix) {
    return pathname;
  }

  if (pathname === prefix) {
    return '/';
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }

  return null;
}

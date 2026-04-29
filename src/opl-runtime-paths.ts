import {
  buildOplRuntimeEndpoints,
  type OplRuntimeEndpoints,
} from './opl-runtime-paths/current.ts';
import { normalizeBasePath } from './opl-runtime-paths/shared.ts';
export { normalizeBasePath } from './opl-runtime-paths/shared.ts';

export type OplEndpoints = OplRuntimeEndpoints;

export function buildOplEndpoints(basePath = ''): OplEndpoints {
  return buildOplRuntimeEndpoints(basePath);
}

export function buildOplEntryUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/` : `${baseUrl}/`;
}

export function buildOplApiBaseUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/api` : `${baseUrl}/api`;
}

export function stripOplBasePath(pathname: string, basePath = '') {
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

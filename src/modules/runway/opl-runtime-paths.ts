import {
  buildOplRuntimeEndpoints,
  type OplRuntimeEndpoints,
} from './opl-runtime-paths/current.ts';

export type OplEndpoints = OplRuntimeEndpoints;

export function buildOplEndpoints(basePath = ''): OplEndpoints {
  return buildOplRuntimeEndpoints(basePath);
}

import {
  buildOplRuntimeEndpoints,
  type OplRuntimeEndpoints,
} from '../../kernel/opl-runtime-endpoints.ts';

export type OplEndpoints = OplRuntimeEndpoints;

export function buildOplEndpoints(basePath = ''): OplEndpoints {
  return buildOplRuntimeEndpoints(basePath);
}

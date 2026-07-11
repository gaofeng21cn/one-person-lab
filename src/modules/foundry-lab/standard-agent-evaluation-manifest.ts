import path from 'node:path';

import standardAgentEvaluationManifestSchema from '../../../contracts/opl-framework/standard-agent-evaluation-manifest.schema.json' with { type: 'json' };
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

type JsonRecord = Record<string, unknown>;

export type StandardAgentEvaluationRepairRoute = JsonRecord & {
  route_ref: string;
  route_mode: 'repo_developer_direct_fix' | 'fork_pull_request' | 'observe_only';
  route_status: string;
  repo_ref: string;
  issue_ref: string;
  blocker_ref: string;
  owner_route_ref: string;
  repo_developer_match_required: boolean;
  candidate_fix_ref: string;
  repo_worktree_ref: string;
  branch_ref: string;
  pr_ref: string;
  acceptance_evidence_ref: string;
  follow_up_queue_item_ref: string;
};

const ROUTE_STRING_FIELDS = [
  'route_ref',
  'route_mode',
  'route_status',
  'repo_ref',
  'issue_ref',
  'blocker_ref',
  'owner_route_ref',
  'candidate_fix_ref',
  'repo_worktree_ref',
  'branch_ref',
  'pr_ref',
  'acceptance_evidence_ref',
  'follow_up_queue_item_ref',
] as const;

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function invalidManifest(manifestRef: string, reason: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Invalid standard-agent evaluation manifest: ${reason}`,
    { manifest_ref: manifestRef, ...details },
  );
}

export function validateStandardAgentEvaluationManifest(
  value: unknown,
  manifestRef = '<in-memory>',
) {
  assertJsonSchemaPayload({
    schemaId: 'opl.standard_agent_evaluation_manifest.v1',
    schema: standardAgentEvaluationManifestSchema,
    sourceRef: manifestRef,
  }, value);
  if (!isRecord(value)) {
    invalidManifest(manifestRef, 'root must be an object');
  }
  if (value.surface_kind !== 'opl_standard_agent_evaluation_manifest') {
    invalidManifest(manifestRef, 'surface_kind is unsupported');
  }
  if (value.version !== 'opl-standard-agent-evaluation-manifest.v1') {
    invalidManifest(manifestRef, 'version is unsupported');
  }
  if (!nonEmptyString(value.domain_id)) {
    invalidManifest(manifestRef, 'domain_id is required');
  }
  if (!isRecord(value.developer_mode)) {
    invalidManifest(manifestRef, 'developer_mode is required');
  }

  const repairRoutes = recordList(value.developer_mode.repair_routes);
  const closeoutDrills = recordList(value.developer_mode.closeout_drills);
  if (!Array.isArray(value.developer_mode.repair_routes)
    || repairRoutes.length !== value.developer_mode.repair_routes.length) {
    invalidManifest(manifestRef, 'developer_mode.repair_routes must contain objects only');
  }
  if (!Array.isArray(value.developer_mode.closeout_drills)
    || closeoutDrills.length !== value.developer_mode.closeout_drills.length) {
    invalidManifest(manifestRef, 'developer_mode.closeout_drills must contain objects only');
  }

  repairRoutes.forEach((route, index) => {
    const missing = ROUTE_STRING_FIELDS.filter((field) => !nonEmptyString(route[field]));
    if (missing.length > 0 || typeof route.repo_developer_match_required !== 'boolean') {
      invalidManifest(manifestRef, 'repair route is incomplete', {
        route_index: index,
        missing_fields: missing,
      });
    }
    if (!['repo_developer_direct_fix', 'fork_pull_request', 'observe_only']
      .includes(route.route_mode as string)) {
      invalidManifest(manifestRef, 'repair route mode is unsupported', {
        route_index: index,
        route_mode: route.route_mode,
      });
    }
  });

  closeoutDrills.forEach((drill, index) => {
    if (!isRecord(drill.developer_mode_projection)
      || !isRecord(drill.repo_permission)
      || !(Array.isArray(drill.patrol_observation_refs)
        || isRecord(drill.patrol_observation_refs))) {
      invalidManifest(manifestRef, 'closeout drill input is incomplete', { drill_index: index });
    }
  });

  return {
    surface_kind: value.surface_kind,
    version: value.version,
    domain_id: value.domain_id,
    manifest_ref: manifestRef,
    repair_routes: repairRoutes as StandardAgentEvaluationRepairRoute[],
    closeout_drills: closeoutDrills,
  };
}

export function loadStandardAgentEvaluationManifest(manifestPath: string) {
  const absolutePath = path.resolve(manifestPath);
  return validateStandardAgentEvaluationManifest(
    readJsonPayloadFile(absolutePath),
    absolutePath,
  );
}

export function loadStandardAgentEvaluationManifests(manifestPaths: string[]) {
  return manifestPaths.map(loadStandardAgentEvaluationManifest);
}

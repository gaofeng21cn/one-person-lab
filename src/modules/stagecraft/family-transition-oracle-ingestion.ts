import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import type {
  FamilyTransitionGuardDefinition,
  FamilyTransitionMatrixCase,
  FamilyTransitionSpec,
} from './family-transition-runner.ts';

type JsonRecord = Record<string, unknown>;

export type GrantTransitionOracle = {
  surface_kind: 'mag_grant_transition_oracle';
  version?: string;
  oracle_id: string;
  target_domain_id: string;
  owner: string;
  state?: string;
  runner_owner?: string;
  runner_contract_ref?: string;
  transition_table_status?: string;
  oracle_fixture_status?: string;
  stage_control_plane_ref?: string;
  action_catalog_ref?: string;
  authority_boundary: JsonRecord;
  transition_table: Array<{
    transition_id: string;
    from_stage_id: string;
    to_stage_id: string;
    guard_id: string;
    owner_action: string;
    return_shape: string;
    receipt_requirement: string;
    blocked_shape?: string;
  }>;
  oracle_fixtures: Array<{
    fixture_id: string;
    source_stage_id: string;
    input_state?: JsonRecord;
    expected_transition_id: string;
  }>;
  validation?: JsonRecord;
};

const DEFAULT_AUTHORITY_BOUNDARY = {
  opl: 'transition_runner_transport_projection_only',
  domain: 'truth_quality_artifact_gate_owner',
};

function requireOracleString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required grant transition oracle string field: ${field}`);
  }
  return text;
}

function requireOracleRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required grant transition oracle object field: ${field}`);
  }
  return value;
}

function requireOracleRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Missing required grant transition oracle list field: ${field}`);
  }
  return value.map((entry, index) => requireOracleRecord(entry, `${field}[${index}]`));
}

export function normalizeGrantTransitionOracle(value: unknown): GrantTransitionOracle {
  const oracle = requireOracleRecord(value, 'grant_transition_oracle');
  const transitionTable = requireOracleRecordList(oracle.transition_table, 'grant_transition_oracle.transition_table')
    .map((entry, index) => ({
      transition_id: requireOracleString(entry.transition_id, `grant_transition_oracle.transition_table[${index}].transition_id`),
      from_stage_id: requireOracleString(entry.from_stage_id, `grant_transition_oracle.transition_table[${index}].from_stage_id`),
      to_stage_id: requireOracleString(entry.to_stage_id, `grant_transition_oracle.transition_table[${index}].to_stage_id`),
      guard_id: requireOracleString(entry.guard_id, `grant_transition_oracle.transition_table[${index}].guard_id`),
      owner_action: requireOracleString(entry.owner_action, `grant_transition_oracle.transition_table[${index}].owner_action`),
      return_shape: requireOracleString(entry.return_shape, `grant_transition_oracle.transition_table[${index}].return_shape`),
      receipt_requirement: requireOracleString(entry.receipt_requirement, `grant_transition_oracle.transition_table[${index}].receipt_requirement`),
      blocked_shape: optionalString(entry.blocked_shape) ?? undefined,
    }));
  const transitionIds = new Set(transitionTable.map((entry) => entry.transition_id));
  const oracleFixtures = requireOracleRecordList(oracle.oracle_fixtures, 'grant_transition_oracle.oracle_fixtures')
    .map((entry, index) => {
      const expectedTransitionId = requireOracleString(
        entry.expected_transition_id,
        `grant_transition_oracle.oracle_fixtures[${index}].expected_transition_id`,
      );
      if (!transitionIds.has(expectedTransitionId)) {
        throw new Error(`grant_transition_oracle.oracle_fixtures[${index}].expected_transition_id is not declared in transition_table.`);
      }
      return {
        fixture_id: requireOracleString(entry.fixture_id, `grant_transition_oracle.oracle_fixtures[${index}].fixture_id`),
        source_stage_id: requireOracleString(entry.source_stage_id, `grant_transition_oracle.oracle_fixtures[${index}].source_stage_id`),
        input_state: isRecord(entry.input_state) ? entry.input_state : undefined,
        expected_transition_id: expectedTransitionId,
      };
    });

  return {
    surface_kind: 'mag_grant_transition_oracle',
    version: optionalString(oracle.version) ?? undefined,
    oracle_id: requireOracleString(oracle.oracle_id, 'grant_transition_oracle.oracle_id'),
    target_domain_id: requireOracleString(oracle.target_domain_id, 'grant_transition_oracle.target_domain_id'),
    owner: requireOracleString(oracle.owner, 'grant_transition_oracle.owner'),
    state: optionalString(oracle.state) ?? undefined,
    runner_owner: optionalString(oracle.runner_owner) ?? undefined,
    runner_contract_ref: optionalString(oracle.runner_contract_ref) ?? undefined,
    transition_table_status: optionalString(oracle.transition_table_status) ?? undefined,
    oracle_fixture_status: optionalString(oracle.oracle_fixture_status) ?? undefined,
    stage_control_plane_ref: optionalString(oracle.stage_control_plane_ref) ?? undefined,
    action_catalog_ref: optionalString(oracle.action_catalog_ref) ?? undefined,
    authority_boundary: requireOracleRecord(oracle.authority_boundary, 'grant_transition_oracle.authority_boundary'),
    transition_table: transitionTable,
    oracle_fixtures: oracleFixtures,
    validation: isRecord(oracle.validation) ? oracle.validation : undefined,
  };
}

export function adaptGrantTransitionOracleToFamilyTransitionSpec(value: unknown): FamilyTransitionSpec {
  const oracle = normalizeGrantTransitionOracle(value);
  const guards: Record<string, FamilyTransitionGuardDefinition> = {};
  for (const transition of oracle.transition_table) {
    guards[transition.guard_id] = {
      description: `MAG-owned guard for transition ${transition.transition_id}.`,
      owner: oracle.owner,
      source_ref: `${oracle.oracle_id}:guard:${transition.guard_id}`,
      authority_boundary: oracle.authority_boundary,
    };
  }

  return {
    surface_kind: 'family_transition_spec',
    version: 'family-transition-runner.v1',
    spec_id: oracle.oracle_id,
    target_domain_id: oracle.target_domain_id,
    owner: oracle.owner,
    authority_boundary: {
      ...DEFAULT_AUTHORITY_BOUNDARY,
      ...oracle.authority_boundary,
      oracle_surface_kind: oracle.surface_kind,
      oracle_version: oracle.version ?? null,
      oracle_state: oracle.state ?? null,
      runner_owner: oracle.runner_owner ?? null,
      runner_contract_ref: oracle.runner_contract_ref ?? null,
      transition_table_status: oracle.transition_table_status ?? null,
      oracle_fixture_status: oracle.oracle_fixture_status ?? null,
    },
    guards,
    transitions: oracle.transition_table.map((transition) => {
      const transitionMetadata = {
        owner_action: transition.owner_action,
        return_shape: transition.return_shape,
        receipt_requirement: transition.receipt_requirement,
        blocked_shape: transition.blocked_shape ?? null,
      };
      const typedBlocker = transition.return_shape === 'typed_blocker'
        ? {
            blocker_code: transition.receipt_requirement,
            owner: oracle.owner,
            refs: [
              `mag-transition:${transition.transition_id}`,
              `mag-transition-guard:${transition.guard_id}`,
            ],
            metadata: transitionMetadata,
          }
        : null;
      const humanGate = transition.receipt_requirement === 'human_gate_receipt'
        ? {
            gate_ref: `mag-human-gate:${transition.transition_id}`,
            owner: oracle.owner,
            reason: 'mag_transition_requires_human_gate_receipt',
            resume_refs: [
              `mag-transition:${transition.transition_id}`,
              `mag-action:${transition.owner_action}`,
            ],
            metadata: transitionMetadata,
          }
        : null;
      return {
        transition_id: transition.transition_id,
        current_state: transition.from_stage_id,
        event: 'domain_tick',
        required_guards: [transition.guard_id],
        next_state: transition.to_stage_id,
        next_work_unit: {
          work_unit_ref: `mag-work-unit:${transition.to_stage_id}`,
          action_refs: [transition.owner_action],
          metadata: transitionMetadata,
        },
        owner_route: {
          owner: oracle.owner,
          route_ref: `mag-transition:${transition.transition_id}`,
          action_refs: [transition.owner_action],
          metadata: transitionMetadata,
        },
        human_gate: humanGate,
        typed_blocker: typedBlocker,
        receipt: {
          receipt_refs: [`mag-transition-receipt:${transition.receipt_requirement}`],
          metadata: transitionMetadata,
        },
        projection: {
          route_node_refs: [
            `mag-stage:${transition.from_stage_id}`,
            `mag-stage:${transition.to_stage_id}`,
          ],
          owner_action: transition.owner_action,
          return_shape: transition.return_shape,
          receipt_requirement: transition.receipt_requirement,
        },
        authority_boundary: oracle.authority_boundary,
      };
    }),
  };
}

export function buildGrantTransitionOracleMatrixCases(value: unknown): FamilyTransitionMatrixCase[] {
  const oracle = normalizeGrantTransitionOracle(value);
  const transitionById = new Map(oracle.transition_table.map((entry) => [entry.transition_id, entry]));
  return oracle.oracle_fixtures.map((fixture) => {
    const transition = transitionById.get(fixture.expected_transition_id);
    if (!transition) {
      throw new Error(`Unknown expected transition id in oracle fixture: ${fixture.expected_transition_id}`);
    }
    return {
      case_id: fixture.fixture_id,
      domain_id: oracle.target_domain_id,
      current_state: fixture.source_stage_id,
      event: 'domain_tick',
      guards: {
        [transition.guard_id]: true,
      },
      context: {
        oracle_id: oracle.oracle_id,
        expected_transition_id: fixture.expected_transition_id,
        input_state: fixture.input_state ?? {},
      },
    };
  });
}

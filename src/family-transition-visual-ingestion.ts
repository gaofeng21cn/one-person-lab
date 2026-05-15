import type {
  FamilyTransitionGuardDefinition,
  FamilyTransitionMatrixCase,
  FamilyTransitionSpec,
} from './family-transition-runner.ts';

type JsonRecord = Record<string, unknown>;

export type VisualTransitionSpec = {
  surface_kind: 'visual_transition_spec';
  spec_id: string;
  owner: string;
  status?: string;
  transition_model?: string;
  source_contract?: string;
  covered_family_stage_kinds: string[];
  transition_table: Array<{
    transition_id: string;
    from_stage: string;
    to_stage: string;
    required_guard_refs: string[];
    owner_action: string;
  }>;
  guard_contract: JsonRecord;
  oracle_fixture: {
    fixture_id: string;
    fixture_model?: string;
    covered_families: string[];
    expected_return_shapes: string[];
    forbidden_oracle_fields: string[];
  };
  runner_boundary: JsonRecord;
  repository_boundary: JsonRecord;
};

const DEFAULT_AUTHORITY_BOUNDARY = {
  opl: 'transition_runner_transport_projection_only',
  domain: 'visual_truth_review_export_artifact_owner',
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireVisualString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required visual transition spec string field: ${field}`);
  }
  return text;
}

function requireVisualRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`Missing required visual transition spec object field: ${field}`);
  }
  return value;
}

function requireVisualRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Missing required visual transition spec list field: ${field}`);
  }
  return value.map((entry, index) => requireVisualRecord(entry, `${field}[${index}]`));
}

function readVisualStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Missing required visual transition spec string list field: ${field}`);
  }
  return value.map((entry, index) =>
    requireVisualString(entry, `${field}[${index}]`)
  );
}

function visualTransitionAuthorityBoundary(spec: VisualTransitionSpec) {
  return {
    ...DEFAULT_AUTHORITY_BOUNDARY,
    visual_transition_surface_kind: spec.surface_kind,
    visual_transition_status: spec.status ?? null,
    visual_transition_model: spec.transition_model ?? null,
    source_contract: spec.source_contract ?? null,
    oracle_fixture_id: spec.oracle_fixture.fixture_id,
    visual_export_verdict_owner: spec.owner,
    artifact_authority_owner: spec.owner,
    runner_boundary: spec.runner_boundary,
    repository_boundary: spec.repository_boundary,
    opl_can_execute_transition_spec: spec.runner_boundary.opl_can_execute_transition_spec === true,
    opl_can_retry_or_dead_letter: spec.runner_boundary.opl_can_retry_or_dead_letter === true,
    opl_can_store_transition_metadata: spec.runner_boundary.opl_can_store_transition_metadata === true,
    opl_can_declare_visual_ready: false,
    opl_can_declare_exportable: false,
    opl_can_mutate_artifacts: false,
  };
}

export function normalizeVisualTransitionSpec(value: unknown): VisualTransitionSpec {
  const spec = requireVisualRecord(value, 'visual_transition_spec');
  const surfaceKind = requireVisualString(spec.surface_kind, 'visual_transition_spec.surface_kind');
  if (surfaceKind !== 'visual_transition_spec') {
    throw new Error('visual_transition_spec.surface_kind must be visual_transition_spec.');
  }
  const transitionTable = requireVisualRecordList(
    spec.transition_table,
    'visual_transition_spec.transition_table',
  ).map((entry, index) => ({
    transition_id: requireVisualString(
      entry.transition_id,
      `visual_transition_spec.transition_table[${index}].transition_id`,
    ),
    from_stage: requireVisualString(
      entry.from_stage,
      `visual_transition_spec.transition_table[${index}].from_stage`,
    ),
    to_stage: requireVisualString(
      entry.to_stage,
      `visual_transition_spec.transition_table[${index}].to_stage`,
    ),
    required_guard_refs: readVisualStringList(
      entry.required_guard_refs,
      `visual_transition_spec.transition_table[${index}].required_guard_refs`,
    ),
    owner_action: requireVisualString(
      entry.owner_action,
      `visual_transition_spec.transition_table[${index}].owner_action`,
    ),
  }));
  if (transitionTable.length === 0) {
    throw new Error('visual_transition_spec.transition_table must contain at least one transition.');
  }
  const oracleFixture = requireVisualRecord(spec.oracle_fixture, 'visual_transition_spec.oracle_fixture');

  return {
    surface_kind: 'visual_transition_spec',
    spec_id: requireVisualString(spec.spec_id, 'visual_transition_spec.spec_id'),
    owner: requireVisualString(spec.owner, 'visual_transition_spec.owner'),
    status: optionalString(spec.status) ?? undefined,
    transition_model: optionalString(spec.transition_model) ?? undefined,
    source_contract: optionalString(spec.source_contract) ?? undefined,
    covered_family_stage_kinds: readVisualStringList(
      spec.covered_family_stage_kinds,
      'visual_transition_spec.covered_family_stage_kinds',
    ),
    transition_table: transitionTable,
    guard_contract: requireVisualRecord(spec.guard_contract, 'visual_transition_spec.guard_contract'),
    oracle_fixture: {
      fixture_id: requireVisualString(
        oracleFixture.fixture_id,
        'visual_transition_spec.oracle_fixture.fixture_id',
      ),
      fixture_model: optionalString(oracleFixture.fixture_model) ?? undefined,
      covered_families: readVisualStringList(
        oracleFixture.covered_families,
        'visual_transition_spec.oracle_fixture.covered_families',
      ),
      expected_return_shapes: readVisualStringList(
        oracleFixture.expected_return_shapes,
        'visual_transition_spec.oracle_fixture.expected_return_shapes',
      ),
      forbidden_oracle_fields: readVisualStringList(
        oracleFixture.forbidden_oracle_fields,
        'visual_transition_spec.oracle_fixture.forbidden_oracle_fields',
      ),
    },
    runner_boundary: requireVisualRecord(spec.runner_boundary, 'visual_transition_spec.runner_boundary'),
    repository_boundary: requireVisualRecord(
      spec.repository_boundary,
      'visual_transition_spec.repository_boundary',
    ),
  };
}

export function adaptVisualTransitionSpecToFamilyTransitionSpec(value: unknown, targetDomainId: string): FamilyTransitionSpec {
  const spec = normalizeVisualTransitionSpec(value);
  const boundary = visualTransitionAuthorityBoundary(spec);
  const guards: Record<string, FamilyTransitionGuardDefinition> = {};
  for (const transition of spec.transition_table) {
    for (const guardRef of transition.required_guard_refs) {
      guards[guardRef] = {
        description: `RCA-owned guard ref ${guardRef} for transition ${transition.transition_id}.`,
        owner: spec.owner,
        source_ref: `${spec.spec_id}:guard:${guardRef}`,
        authority_boundary: boundary,
      };
    }
  }

  return {
    surface_kind: 'family_transition_spec',
    version: 'family-transition-runner.v1',
    spec_id: spec.spec_id,
    target_domain_id: targetDomainId,
    owner: spec.owner,
    authority_boundary: boundary,
    guards,
    transitions: spec.transition_table.map((transition) => {
      const metadata = {
        owner_action: transition.owner_action,
        visual_transition_spec_id: spec.spec_id,
        visual_transition_status: spec.status ?? null,
        oracle_fixture_id: spec.oracle_fixture.fixture_id,
        covered_family_stage_kinds: spec.covered_family_stage_kinds,
        required_guard_refs: transition.required_guard_refs,
      };
      return {
        transition_id: transition.transition_id,
        current_state: transition.from_stage,
        event: 'domain_tick',
        required_guards: transition.required_guard_refs,
        next_state: transition.to_stage,
        next_work_unit: {
          work_unit_ref: `rca-work-unit:${transition.to_stage}`,
          action_refs: [transition.owner_action],
          metadata,
        },
        owner_route: {
          owner: spec.owner,
          route_ref: `rca-visual-transition:${transition.transition_id}`,
          action_refs: [transition.owner_action],
          metadata,
        },
        receipt: {
          receipt_refs: [
            `rca-domain-owner-receipt:${transition.transition_id}`,
            `rca-oracle-fixture:${spec.oracle_fixture.fixture_id}`,
          ],
          metadata,
        },
        projection: {
          route_node_refs: [
            `rca-stage:${transition.from_stage}`,
            `rca-stage:${transition.to_stage}`,
          ],
          owner_action: transition.owner_action,
          expected_return_shapes: spec.oracle_fixture.expected_return_shapes,
          forbidden_oracle_fields: spec.oracle_fixture.forbidden_oracle_fields,
          visual_ready_claimed: false,
          exportable_claimed: false,
        },
        authority_boundary: boundary,
      };
    }),
  };
}

export function buildVisualTransitionMatrixCases(value: unknown, targetDomainId: string): FamilyTransitionMatrixCase[] {
  const spec = normalizeVisualTransitionSpec(value);
  return spec.transition_table.map((transition) => ({
    case_id: `${spec.oracle_fixture.fixture_id}:${transition.transition_id}`,
    domain_id: targetDomainId,
    current_state: transition.from_stage,
    event: 'domain_tick',
    guards: Object.fromEntries(transition.required_guard_refs.map((guardRef) => [guardRef, true])),
    context: {
      visual_transition_spec_id: spec.spec_id,
      oracle_fixture_id: spec.oracle_fixture.fixture_id,
      expected_transition_id: transition.transition_id,
      owner_action: transition.owner_action,
      source_contract: spec.source_contract ?? null,
    },
  }));
}

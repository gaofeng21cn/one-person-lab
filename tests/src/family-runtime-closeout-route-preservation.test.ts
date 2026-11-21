import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseCloseoutFromCodexMessages } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts';
import { WorkItemFileBoundaryError } from '../../src/authority/workspace/index.ts';
import {
  normalizeTypedStageCloseoutPacket,
  STAGE_QUALITY_CYCLE_PLACEMENT_FOLD_FINDING,
  validateCloseoutPacketForAttempt,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import {
  MECHANICAL_REPAIR_DOMAIN_OUTPUT_DOMAIN_ID,
  MECHANICAL_REPAIR_ROOT_IDENTITY_VERSION,
  repairDomainOutputDomainIdAgainstAttempt,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-mechanical-authority.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/authority/workspace/execution-scope.ts';
import { buildRawArtifactProgressCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner.ts';

const DECISION = {
  decision_kind: 'advance',
  target_stage_id: 'design-basis-admission',
  evidence_refs: ['opl://evidence/route-1'],
};

function typedPacket(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_route_fixture',
    closeout_refs: ['opl://stage-attempts/sat_route_fixture/artifacts/decision.json'],
    consumed_refs: ['opl://stage-packets/mission-intake'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'ibd_evidence',
    domain_ready_verdict: null,
    route_impact: { stage_route_decision: DECISION },
    ...overrides,
  };
}

function rawArtifact() {
  return {
    output_ref: 'file:///tmp/raw-executor-output.txt',
    metadata_ref: 'file:///tmp/raw-executor-output.metadata.json',
    sha256: 'a'.repeat(64),
    size_bytes: 4096,
  };
}

function progressEnvelope() {
  return buildRawArtifactProgressCloseoutPacket({
    attempt: { stage_attempt_id: 'sat_route_fixture', domain_id: 'ibd_evidence' },
    stagePacketRef: 'opl://stage-packets/mission-intake',
    rawArtifact: rawArtifact(),
    normalizationFindings: ['typed_closeout_not_required_raw_artifact_advanced'],
  });
}

test('a fenced typed closeout surrounded by prose is selectable', () => {
  const packet = typedPacket();
  const messages = [
    'I finished the mission-intake work and wrote the decision file.\n',
    `\`\`\`json\n${JSON.stringify(packet, null, 2)}\n\`\`\`\n`,
    'Let me know if you want me to continue.',
  ];
  const parsed = parseCloseoutFromCodexMessages(messages);
  assert.ok(parsed, 'fenced closeout must be selectable');
  assert.equal(parsed.surface_kind, 'stage_attempt_closeout_packet');
  assert.deepEqual(
    (parsed.route_impact as Record<string, unknown>).stage_route_decision,
    DECISION,
  );
});

test('a bare typed closeout is still selectable without a fence', () => {
  const parsed = parseCloseoutFromCodexMessages([JSON.stringify(typedPacket())]);
  assert.ok(parsed);
  assert.deepEqual(
    (parsed.route_impact as Record<string, unknown>).stage_route_decision,
    DECISION,
  );
});

test('a fenced block holding non-JSON is not guessed at', () => {
  const messages = [
    'Here is the plan, not a closeout.\n',
    '```json\n{ "surface_kind": "stage_attempt_closeout_packet", \n```\n',
  ];
  assert.equal(parseCloseoutFromCodexMessages(messages), null);
});

// The framework progress envelope is controller-owned transport. It may not carry
// domain routing semantics: `verifyFrameworkRawProgressEnvelope` matches its route
// impact against an exact canonical field set, so any injected route field turns a
// recoverable transport defect into an authority-boundary hard stop.
test('the framework progress envelope keeps its canonical route impact shape', () => {
  const envelope = progressEnvelope();
  const routeImpact = envelope.route_impact as Record<string, unknown>;
  assert.equal(routeImpact.framework_generated_envelope, true);
  assert.equal(routeImpact.next_stage_may_start, true);
  assert.deepEqual(routeImpact.normalization_findings, ['typed_closeout_not_required_raw_artifact_advanced']);
  assert.equal(envelope.authority_boundary.opl, 'raw_executor_output_progress_envelope_only');
  assert.deepEqual(
    Object.keys(routeImpact).sort(),
    [
      'artifact_metadata_refs',
      'consumable_artifact_refs',
      'framework_generated_envelope',
      'negative_or_partial_output_counts_as_progress',
      'next_stage_may_start',
      'normalization_findings',
      'quality_debt_refs',
      'route_back_may_target_any_declared_stage',
      'route_back_selection_owner',
      'transition_outcome',
    ],
  );
  assert.equal('stage_route_decision' in routeImpact, false);
  assert.equal('stage_route_recommendation' in routeImpact, false);
});

test('the progress envelope records why a typed closeout was not used', () => {
  const envelope = buildRawArtifactProgressCloseoutPacket({
    attempt: { stage_attempt_id: 'sat_route_fixture', domain_id: 'ibd_evidence' },
    stagePacketRef: 'opl://stage-packets/mission-intake',
    rawArtifact: rawArtifact(),
    normalizationFindings: [
      'typed_closeout_stage_attempt_id_mismatch',
      'closeout_identity_verification_raw_executor_output_semantic_authority_violation',
      'typed_closeout_not_required_raw_artifact_advanced',
    ],
  });
  assert.deepEqual(
    (envelope.route_impact as Record<string, unknown>).normalization_findings,
    [
      'typed_closeout_stage_attempt_id_mismatch',
      'closeout_identity_verification_raw_executor_output_semantic_authority_violation',
      'typed_closeout_not_required_raw_artifact_advanced',
    ],
  );
});

// A mistyped opaque id is a transport defect, but it must still be rejected rather
// than silently re-bound: the same check is what stops a stale closeout recovered
// from a previous Attempt's session from being adopted by the current one.
test('a mistyped stage_attempt_id is rejected instead of re-bound', () => {
  const attempt = { stage_attempt_id: 'sat_cb3e45cb4753d21c13fd0074' };
  const result = validateCloseoutPacketForAttempt({
    closeoutPacket: normalizeTypedStageCloseoutPacket(typedPacket({
      stage_attempt_id: 'sat_cb3e45cb475d21c13fd0074',
    })),
    attempt,
  });
  assert.equal(result.closeoutPacket, null);
  assert.equal(result.rejection?.reason, 'stage_attempt_id_mismatch');
  assert.equal(result.rejection?.stage_attempt_id, 'sat_cb3e45cb475d21c13fd0074');
});

test('an exactly matching stage_attempt_id passes the identity-echo check', () => {
  const attempt = { stage_attempt_id: 'sat_route_fixture' };
  const result = validateCloseoutPacketForAttempt({
    closeoutPacket: normalizeTypedStageCloseoutPacket(typedPacket()),
    attempt,
  });
  // The echo check is only the first gate; the packet below carries no execution
  // scope, so a later gate may still reject it. What matters here is that the
  // matching id is not the reason.
  assert.notEqual(result.rejection?.reason, 'stage_attempt_id_mismatch');
});

test('closeout_ref_metadata still rejects unsupported domain fields', () => {
  assert.throws(
    () => normalizeTypedStageCloseoutPacket(typedPacket({
      closeout_refs: [{
        ref: 'opl://stage-attempts/sat_route_fixture/artifacts/decision.json',
        ref_kind: 'artifact',
        sha256: 'b'.repeat(64),
        artifact_type: 'knowledge',
      }],
    })),
    /unsupported field/,
  );
});

// A model that places its stage_quality_cycle at the closeout top level wrote
// the right content in the wrong position. The fold is a mechanical transport
// repair: the cycle moves to route_impact.stage_quality_cycle and the finding
// marker keeps the placement defect visible as auditable quality debt.
test('a top-level stage_quality_cycle is folded into route_impact with a normalization finding', () => {
  const cycle = { outcome: 'pass', findings: [] };
  const packet = normalizeTypedStageCloseoutPacket(typedPacket({
    stage_quality_cycle: cycle,
  }));
  const routeImpact = packet.route_impact as Record<string, unknown>;
  assert.deepEqual(routeImpact.stage_quality_cycle, cycle);
  assert.deepEqual(routeImpact.stage_route_decision, DECISION);
  assert.deepEqual(routeImpact.normalization_findings, [STAGE_QUALITY_CYCLE_PLACEMENT_FOLD_FINDING]);
  assert.equal('stage_quality_cycle' in packet, false);
});

test('the fold preserves prior normalization findings and creates route_impact when absent', () => {
  const packet = normalizeTypedStageCloseoutPacket(typedPacket({
    route_impact: undefined,
    stage_quality_cycle: { outcome: 'repair_required', findings: [] },
  }));
  const routeImpact = packet.route_impact as Record<string, unknown>;
  assert.deepEqual(
    (routeImpact.stage_quality_cycle as Record<string, unknown>).outcome,
    'repair_required',
  );
  assert.deepEqual(routeImpact.normalization_findings, [STAGE_QUALITY_CYCLE_PLACEMENT_FOLD_FINDING]);
});

test('an identical duplicate stage_quality_cycle is not a fold and records no finding', () => {
  const cycle = { outcome: 'pass', findings: [{ finding_id: 'f1' }] };
  const packet = normalizeTypedStageCloseoutPacket(typedPacket({
    route_impact: { stage_quality_cycle: cycle },
    stage_quality_cycle: { findings: [{ finding_id: 'f1' }], outcome: 'pass' },
  }));
  const routeImpact = packet.route_impact as Record<string, unknown>;
  assert.deepEqual(routeImpact.stage_quality_cycle, cycle);
  assert.equal(routeImpact.normalization_findings, undefined);
});

test('a conflicting duplicate stage_quality_cycle fails closed', () => {
  assert.throws(
    () => normalizeTypedStageCloseoutPacket(typedPacket({
      route_impact: { stage_quality_cycle: { outcome: 'pass' } },
      stage_quality_cycle: { outcome: 'repair_required' },
    })),
    /conflicting content/,
  );
});

// Mechanical authority repairs (B layer). domain_output.domain_id is a
// framework-owned identity whose only authority is the Attempt row: a
// model-invented value is rebound, never negotiated.
test('a model-invented domain_output.domain_id is rebound to the attempt domain with a finding', () => {
  const packet = normalizeTypedStageCloseoutPacket(typedPacket({
    closeout_refs: [
      'opl://stage-attempts/sat_route_fixture/artifacts/decision.json',
      'file:///tmp/domain-output.json',
    ],
    domain_output: {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'software_development_orchestration',
      output_ref: 'file:///tmp/domain-output.json',
    },
  }));
  assert.equal(packet.domain_output?.domain_id, 'software_development_orchestration');
  const repaired = repairDomainOutputDomainIdAgainstAttempt({
    packet,
    attemptDomainId: 'agent_engineering',
  });
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.packet.domain_output?.domain_id, 'agent_engineering');
  assert.deepEqual(
    (repaired.packet.route_impact as Record<string, unknown>).normalization_findings,
    [MECHANICAL_REPAIR_DOMAIN_OUTPUT_DOMAIN_ID],
  );
  // An already-correct or absent domain_output is left untouched.
  assert.equal(
    repairDomainOutputDomainIdAgainstAttempt({
      packet: repaired.packet,
      attemptDomainId: 'agent_engineering',
    }).repaired,
    false,
  );
  assert.equal(
    repairDomainOutputDomainIdAgainstAttempt({ packet: normalizeTypedStageCloseoutPacket(typedPacket()), attemptDomainId: 'agent_engineering' }).repaired,
    false,
  );
});

// A separator-mis-typed root-identity version token is uniquely determined by
// the supported constants, and the retried validation re-verifies the frozen
// scope_digest — the framework's own cryptographic identity arbitrates.
test('a mis-typed root identity version token is repaired and digest-verified', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08f-scope-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'work-items', 'study-a');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  try {
    const scope = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:f08f',
      workspaceBindingId: 'binding:f08f',
      domainId: 'agent_engineering',
      workspaceRoot,
      canonicalWorkItemRoot,
      payload: { study_id: 'study-a' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    const mistyped = structuredClone(scope) as Record<string, unknown>;
    (mistyped.canonical_work_item_root_identity as Record<string, unknown>).version
      = (scope.canonical_work_item_root_identity!.version as string).replace(/-/g, '_');
    const packet = normalizeTypedStageCloseoutPacket(typedPacket({
      execution_scope: mistyped,
      scope_digest: scope.scope_digest,
    }));
    assert.equal(
      (packet.execution_scope as Record<string, unknown>)
        && ((packet.execution_scope as Record<string, unknown>).canonical_work_item_root_identity as Record<string, unknown>).version,
      scope.canonical_work_item_root_identity!.version,
    );
    assert.deepEqual(
      (packet.route_impact as Record<string, unknown>).normalization_findings,
      [MECHANICAL_REPAIR_ROOT_IDENTITY_VERSION],
    );
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('a version token outside the separator class, or a digest the frozen scope disproves, stays fail-closed', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08f-scope-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'work-items', 'study-a');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  try {
    const scope = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:f08f',
      workspaceBindingId: 'binding:f08f',
      domainId: 'agent_engineering',
      workspaceRoot,
      canonicalWorkItemRoot,
      payload: { study_id: 'study-a' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    const wrongAlphabet = structuredClone(scope) as Record<string, unknown>;
    (wrongAlphabet.canonical_work_item_root_identity as Record<string, unknown>).version = 'opl.work.item.root.identity.v1';
    assert.throws(
      () => normalizeTypedStageCloseoutPacket(typedPacket({
        execution_scope: wrongAlphabet,
        scope_digest: scope.scope_digest,
      })),
      (err: unknown) => err instanceof WorkItemFileBoundaryError
        && err.failureCode === 'work_item_file_boundary_root_invalid',
    );
    // Separator class matches, but the declared digest was computed over the
    // misspelled bytes: the frozen scope disproves the repair, original error.
    const forgedDigest = structuredClone(scope) as Record<string, unknown>;
    (forgedDigest.canonical_work_item_root_identity as Record<string, unknown>).version
      = (scope.canonical_work_item_root_identity!.version as string).replace(/-/g, '_');
    forgedDigest.scope_digest = `sha256:${'0'.repeat(64)}`;
    assert.throws(
      () => normalizeTypedStageCloseoutPacket(typedPacket({
        execution_scope: forgedDigest,
        scope_digest: `sha256:${'0'.repeat(64)}`,
      })),
      (err: unknown) => err instanceof WorkItemFileBoundaryError
        && err.failureCode === 'work_item_file_boundary_root_invalid',
    );
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

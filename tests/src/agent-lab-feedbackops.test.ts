import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDeliveryFeedbackEvent,
  buildFeedbackOpsReadModel,
  buildFeedbackOpsReconcileReceipt,
  buildSelfEvolutionWorkOrderCandidate,
  readFeedbackOpsEvents,
  submitDeliveryFeedbackEvent,
} from '../../src/modules/foundry-lab/agent-lab-feedbackops.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { resolveOplStatePaths } from '../../src/modules/runway/runtime-state-paths.ts';
import { contractsDir } from './cli/helpers.ts';

function asRecord(value: unknown): Record<string, any> {
  assert.equal(Boolean(value) && typeof value === 'object' && !Array.isArray(value), true);
  return value as Record<string, any>;
}

test('FeedbackOps captures explicit delivery feedback as refs-only idempotent events', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-feedbackops-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;

  try {
    const paths = resolveOplStatePaths();
    const first = submitDeliveryFeedbackEvent({
      targetAgentId: 'mas',
      deliveryRef: 'paper:obesity/current-package',
      feedbackRef: 'user-feedback:obesity/high-quality-sci',
      feedbackKind: 'quality_gap',
      developerWorkOrderCandidateRef: 'developer-work-order-candidate-ref:mas/obesity-feedbackops',
      idempotencyKey: 'feedbackops-test-key',
    }, paths);
    const duplicate = submitDeliveryFeedbackEvent({
      targetAgentId: 'mas',
      deliveryRef: 'paper:obesity/current-package',
      feedbackRef: 'user-feedback:obesity/high-quality-sci',
      feedbackKind: 'quality_gap',
      idempotencyKey: 'feedbackops-test-key',
    }, paths);

    assert.equal(first.status, 'captured');
    assert.equal(duplicate.status, 'duplicate_idempotent_event');
    assert.equal(readFeedbackOpsEvents(paths).length, 1);
    const event = asRecord(first.event);
    const boundary = asRecord(event.authority_boundary);
    assert.equal(boundary.can_write_target_domain_truth, false);
    assert.equal(boundary.can_create_owner_receipt, false);
    assert.equal(event.accepted_feedback_profiles[0], 'target_agent_feedback_external_suite');
    assert.equal(fs.existsSync(paths.agent_lab_feedbackops_event_ledger_file), true);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('FeedbackOps read model gates execution on explicit developer-mode direct route', () => {
  const suiteReady = buildDeliveryFeedbackEvent({
    targetAgentId: 'mas',
    deliveryRef: 'paper:obesity/current-package',
    feedbackRef: 'user-feedback:obesity/missing-refs',
    idempotencyKey: 'suite-ready',
  });
  const queued = buildDeliveryFeedbackEvent({
    targetAgentId: 'rca',
    deliveryRef: 'deck:case-review/current',
    feedbackRef: 'user-feedback:rca/style-gap',
    developerWorkOrderCandidateRef: 'developer-work-order-candidate-ref:rca/style-gap',
    idempotencyKey: 'queued',
  });
  const terminal = buildDeliveryFeedbackEvent({
    targetAgentId: 'oma',
    deliveryRef: 'agent-lab:feedbackops',
    feedbackRef: 'user-feedback:oma/trigger-gap',
    blockerRef: 'typed-blocker-ref:oma/owner-required',
    idempotencyKey: 'terminal',
  });

  const withoutDirectRoute = buildFeedbackOpsReadModel({
    events: [suiteReady, queued, terminal],
    developerMode: { status: 'ready', allowed_route: 'observe-only' },
  });
  assert.equal(withoutDirectRoute.status_buckets.suite_ready.length, 1);
  assert.match(withoutDirectRoute.status_buckets.suite_ready[0], /^feedback-work-order:mas\/feedback_event_/);
  assert.equal(withoutDirectRoute.summary.queued_requires_developer_mode_count, 1);
  assert.equal(withoutDirectRoute.summary.executable_count, 0);
  assert.equal(withoutDirectRoute.summary.completed_or_blocker_count, 1);

  const directRoute = buildFeedbackOpsReadModel({
    events: [queued],
    developerMode: { effective_state: 'active_direct', allowed_route: 'direct_repo_fix' },
  });
  assert.equal(directRoute.summary.executable_count, 1);
  assert.equal(directRoute.work_order_status_items[0].execution_surface, 'opl work-order execute');
  assert.equal(directRoute.work_order_status_items[0].runnable, true);
  assert.equal(directRoute.app_projection.creates_runner_or_queue, false);
  assert.equal(directRoute.authority_boundary.can_create_typed_blocker, false);

  const receipt = buildFeedbackOpsReconcileReceipt({
    developerMode: { effective_state: 'active_direct', allowed_route: 'direct_repo_fix' },
  });
  assert.equal(receipt.status, 'reconciled_refs_only');
  assert.equal(receipt.execution_owner, 'opl_work_order_execute_when_developer_mode_allows');
});

test('FeedbackOps carries capability-map evidence for self-evolution work orders', () => {
  const event = buildDeliveryFeedbackEvent({
    targetAgentId: 'rca',
    deliveryRef: 'deck:case-review/current',
    feedbackRef: 'user-feedback:rca/visual-density',
    feedbackKind: 'quality_gap',
    failureTokens: ['ppt_visual_density', 'ppt_visual_review'],
    failureEvidenceRefs: ['visual-review-ref:rca/case-review/screenshot-qa'],
    capabilityHitRefs: ['capability-hit-ref:rca/rca-ppt-reviewer'],
    canonicalTargetPaths: ['agent/professional_skills/rca-ppt-reviewer/SKILL.md'],
    requiredVerificationRefs: ['npm:test:rca-capability-routing'],
    forbiddenSurfaces: ['owner_receipt_body', 'visual_export_verdict'],
    ownerCloseoutBoundaryRef: 'owner-closeout-boundary-ref:rca/visual-owner',
    developerWorkOrderCandidateRef: 'developer-work-order-candidate-ref:rca/visual-density',
    idempotencyKey: 'feedbackops-self-evolution',
  });

  assert.equal(
    event.failure_token_registry_ref,
    'contracts/opl-framework/agent-lab-failure-token-registry.json',
  );
  assert.equal(
    event.self_evolution_work_order_schema_ref,
    'contracts/opl-framework/self-evolution-work-order.schema.json',
  );
  assert.deepEqual(event.failure_tokens, ['ppt_visual_density', 'ppt_visual_review']);
  assert.deepEqual(event.required_verification_refs, ['npm:test:rca-capability-routing']);
  assert.deepEqual(event.forbidden_surfaces, ['owner_receipt_body', 'visual_export_verdict']);

  const readModel = buildFeedbackOpsReadModel({
    events: [event],
    developerMode: { effective_state: 'active_direct', allowed_route: 'direct_repo_fix' },
  });
  const item = readModel.work_order_status_items[0];
  assert.equal(item.status, 'executable');
  assert.deepEqual(item.failure_tokens, ['ppt_visual_density', 'ppt_visual_review']);
  assert.deepEqual(item.capability_hit_refs, ['capability-hit-ref:rca/rca-ppt-reviewer']);
  assert.deepEqual(item.canonical_target_paths, ['agent/professional_skills/rca-ppt-reviewer/SKILL.md']);
  assert.deepEqual(item.required_verification_refs, ['npm:test:rca-capability-routing']);
  assert.equal(item.owner_closeout_boundary_ref, 'owner-closeout-boundary-ref:rca/visual-owner');
  assert.equal(asRecord(item.authority_boundary).can_create_owner_receipt, false);
});

test('Self-evolution work order candidate binds failure evidence to capability hits and owner closeout', () => {
  const workOrder = buildSelfEvolutionWorkOrderCandidate({
    targetAgentId: 'mas',
    feedbackRef: 'user-feedback:mas/figure-quality',
    failureEvidenceRefs: ['reviewer-evidence-ref:mas/figure-quality'],
    failureTokens: ['figure_quality', 'source_data_traceability'],
    capabilityHits: [
      {
        capabilityId: 'medical-figure-design',
        canonicalTargetPaths: ['skills/medical-figure-design/SKILL.md'],
        requiredVerificationRefs: ['mas-scholar-skills:scripts/verify.sh'],
        forbiddenSurfaces: ['paper_truth', 'publication_readiness', 'owner_receipt_body'],
        owner: 'mas-scholar-skills',
        ownerCloseoutBoundaryRef: 'owner-closeout-boundary-ref:mas-scholar-skills/medical-figure-design',
      },
    ],
  });

  assert.equal(workOrder.surface_kind, 'opl_self_evolution_work_order_candidate');
  assert.equal(workOrder.failure_token_registry_ref, 'contracts/opl-framework/agent-lab-failure-token-registry.json');
  assert.deepEqual(workOrder.failure_evidence_refs, ['reviewer-evidence-ref:mas/figure-quality']);
  assert.deepEqual(workOrder.failure_tokens, ['figure_quality', 'source_data_traceability']);
  assert.deepEqual(workOrder.canonical_target_paths, ['skills/medical-figure-design/SKILL.md']);
  assert.deepEqual(workOrder.required_verification_refs, ['mas-scholar-skills:scripts/verify.sh']);
  assert.deepEqual(workOrder.forbidden_surfaces, ['paper_truth', 'publication_readiness', 'owner_receipt_body']);
  assert.equal(workOrder.capability_hits[0].owner_closeout_boundary.owner, 'mas-scholar-skills');
  assert.equal(workOrder.owner_closeout_boundary.target_owner_acceptance_required, true);
  assert.equal(workOrder.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(workOrder.authority_boundary.can_create_typed_blocker, false);
  assert.equal(workOrder.authority_boundary.can_claim_production_ready, false);
});

test('Self-evolution non-live fixtures route MAS and RCA feedback tokens to capability owners', () => {
  const masWorkOrder = buildSelfEvolutionWorkOrderCandidate({
    targetAgentId: 'mas',
    feedbackRef: 'user-feedback:mas/figure-quality',
    failureEvidenceRefs: ['reviewer-evidence-ref:mas/figure-quality'],
    failureTokens: ['figure_quality'],
    capabilityHits: [
      {
        capabilityId: 'medical-figure-design',
        canonicalTargetPaths: ['external_repo:mas-scholar-skills/skills/medical-figure-design/SKILL.md'],
        requiredVerificationRefs: ['external_repo:mas-scholar-skills/scripts/verify.sh'],
        forbiddenSurfaces: ['paper_truth', 'publication_readiness', 'owner_receipt_body'],
        owner: 'mas-scholar-skills',
      },
    ],
  });
  const rcaWorkOrder = buildSelfEvolutionWorkOrderCandidate({
    targetAgentId: 'rca',
    feedbackRef: 'user-feedback:rca/ppt-visual-density',
    failureEvidenceRefs: ['visual-review-ref:rca/contact-sheet-density'],
    failureTokens: ['ppt_visual_density'],
    capabilityHits: [
      {
        capabilityId: 'rca-ppt-visual-director',
        canonicalTargetPaths: ['agent/professional_skills/rca-ppt-visual-director/SKILL.md'],
        requiredVerificationRefs: ['tests/rca-ppt-three-route-agent-lab-suite.test.ts'],
        forbiddenSurfaces: ['visual_truth_artifacts', 'owner_receipts', 'export_verdicts'],
        owner: 'redcube-ai',
      },
    ],
  });

  assert.deepEqual(masWorkOrder.failure_tokens, ['figure_quality']);
  assert.deepEqual(masWorkOrder.canonical_target_paths, [
    'external_repo:mas-scholar-skills/skills/medical-figure-design/SKILL.md',
  ]);
  assert.equal(masWorkOrder.capability_hits[0].owner_closeout_boundary.owner, 'mas-scholar-skills');
  assert.deepEqual(rcaWorkOrder.failure_tokens, ['ppt_visual_density']);
  assert.deepEqual(rcaWorkOrder.canonical_target_paths, [
    'agent/professional_skills/rca-ppt-visual-director/SKILL.md',
  ]);
  assert.equal(rcaWorkOrder.capability_hits[0].owner_closeout_boundary.owner, 'redcube-ai');
});

test('FeedbackOps contract declares universal trigger and no-authority boundary', () => {
  const contract = parseJsonText(fs.readFileSync(
    path.join(contractsDir, 'agent-lab-contract.json'),
    'utf8',
  )) as any;
  const domainFeedbackSurface = contract.domain_feedback_self_evolution_surface;
  assert.equal(domainFeedbackSurface.trigger_policy.contract_can_trigger, false);
  assert.equal(domainFeedbackSurface.trigger_policy.developer_work_order_execution_surface, 'opl work-order execute');
  assert.equal(domainFeedbackSurface.statuses.includes('suite_missing'), true);
  assert.equal(domainFeedbackSurface.statuses.includes('suite_stale'), true);
  assert.equal(domainFeedbackSurface.authority_boundary.can_write_domain_truth, false);

  const surface = contract.feedbackops_delivery_feedback_surface;

  assert.equal(surface.surface_kind, 'opl_feedbackops_read_model');
  assert.equal(surface.refs_only, true);
  assert.equal(surface.trigger_policy.feedback_capture_requires_developer_mode, false);
  assert.equal(surface.trigger_policy.developer_mode_required_for_execution, true);
  assert.equal(surface.accepted_feedback_profiles.includes('target_agent_feedback_external_suite'), true);
  assert.equal(surface.statuses.includes('queued_requires_developer_mode'), true);
  assert.equal(surface.authority_boundary.can_create_second_runner_or_queue, false);
  assert.equal(surface.authority_boundary.can_write_target_domain_truth, false);
  assert.equal(surface.authority_boundary.can_authorize_target_domain_quality_or_export, false);
  assert.equal(surface.authority_boundary.can_create_owner_receipt, false);

  const workOrderSurface = contract.self_evolution_work_order_surface;
  assert.equal(workOrderSurface.surface_kind, 'opl_self_evolution_work_order_candidate');
  assert.equal(
    workOrderSurface.failure_token_registry_ref,
    'contracts/opl-framework/agent-lab-failure-token-registry.json',
  );
  assert.ok(workOrderSurface.required_fields.includes('failure_evidence_refs'));
  assert.ok(workOrderSurface.required_fields.includes('capability_hits'));
  assert.ok(workOrderSurface.required_fields.includes('required_verification_refs'));
  assert.ok(workOrderSurface.required_fields.includes('forbidden_surfaces'));
  assert.ok(workOrderSurface.required_fields.includes('owner_closeout_boundary'));
  assert.equal(workOrderSurface.owner_closeout_boundary.oma_can_write_owner_receipt_body, false);
  assert.equal(workOrderSurface.owner_closeout_boundary.agent_lab_can_create_typed_blocker, false);
  assert.equal(workOrderSurface.authority_boundary.can_create_owner_receipt, false);
});

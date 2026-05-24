import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  frameworkStatusFromAttentionCounts,
  splitOperatorAttentionCounts,
} from '../../../../src/framework-readiness-attention-counts.ts';

test('framework readiness status treats blocked refs-only attention separately from operator-actionable work', () => {
  assert.equal(
    frameworkStatusFromAttentionCounts({
      hardBlockerCount: 0,
      openTailCount: 0,
      operatorActionableAttentionCount: 0,
      domainBlockedAttentionCount: 7,
      semanticAttentionGateCount: 0,
    }),
    'framework_control_plane_available_with_blocked_refs_only_attention',
  );
  assert.equal(
    frameworkStatusFromAttentionCounts({
      hardBlockerCount: 0,
      openTailCount: 0,
      operatorActionableAttentionCount: 3,
      domainBlockedAttentionCount: 7,
      semanticAttentionGateCount: 0,
    }),
    'framework_control_plane_available_with_operator_attention',
  );
  assert.equal(
    frameworkStatusFromAttentionCounts({
      hardBlockerCount: 0,
      openTailCount: 0,
      operatorActionableAttentionCount: 0,
      domainBlockedAttentionCount: 0,
      semanticAttentionGateCount: 0,
    }),
    'framework_control_plane_available',
  );
});

test('framework readiness attention counts preserve payload-free safe actions within the same operator attention set', () => {
  const counts = splitOperatorAttentionCounts({
    openTailCount: 0,
    evidenceEnvelopeOpenCount: 2,
    evidenceEnvelopeBlockedCount: 5,
    domainDispatchAttentionCount: 11,
    stageSourceScopeMissingWorkorderCount: 0,
    stageRuntimeEventMissingWorkorderCount: 0,
    operatorPayloadRequiredAttentionCount: 1,
  });

  assert.equal(counts.operatorActionableAttentionCount, 2);
  assert.equal(counts.operatorPayloadRequiredAttentionCount, 1);
  assert.equal(counts.operatorPayloadFreeAttentionCount, 1);
  assert.equal(counts.domainBlockedAttentionCount, 16);
  assert.equal(
    counts.payloadRequirementSemantics,
    'operator_actionable_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
  );
});

test('framework readiness separates operator-actionable and domain-blocked attention tails', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-attention-semantics-'));
  try {
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;
    const summary = readiness.summary;
    const attentionSummary = readiness.attention_first_payload.summary;

    assert.equal(
      attentionSummary.operator_actionable_attention_tail_count,
      summary.operator_actionable_attention_tail_count,
    );
    assert.equal(
      attentionSummary.domain_blocked_attention_tail_count,
      summary.domain_blocked_attention_tail_count,
    );
    assert.equal(
      summary.total_operator_attention_tail_count,
      summary.operator_actionable_attention_tail_count
        + summary.domain_blocked_attention_tail_count,
    );
    assert.equal(
      attentionSummary.operator_payload_required_attention_tail_count,
      summary.operator_payload_required_attention_tail_count,
    );
    assert.equal(
      attentionSummary.operator_payload_free_attention_tail_count,
      summary.operator_payload_free_attention_tail_count,
    );
    assert.equal(
      readiness.evidence_worklist.open_safe_action_payload_required_item_count
        + readiness.evidence_worklist.open_safe_action_payload_free_item_count,
      readiness.evidence_worklist.open_safe_action_item_count,
    );
    if (
      readiness.evidence_worklist.open_safe_action_item_count
        === summary.operator_actionable_attention_tail_count
    ) {
      assert.equal(
        summary.operator_payload_required_attention_tail_count,
        readiness.evidence_worklist.open_safe_action_payload_required_item_count,
      );
      assert.equal(
        summary.operator_payload_free_attention_tail_count,
        readiness.evidence_worklist.open_safe_action_payload_free_item_count,
      );
    }
    assert.equal(
      summary.operator_actionable_attention_tail_count,
      summary.operator_payload_required_attention_tail_count
        + summary.operator_payload_free_attention_tail_count,
    );
    assert.equal(
      summary.operator_actionable_attention_tail_count,
      summary.open_tail_count
        + summary.evidence_envelope_open_count
        + summary.stage_source_scope_missing_workorder_count
        + summary.stage_runtime_event_missing_workorder_count,
    );
    assert.equal(
      summary.domain_blocked_attention_tail_count,
      summary.evidence_envelope_blocked_count
        + summary.domain_dispatch_attention_count,
    );
    assert.equal(
      attentionSummary.attention_tail_semantics,
      'operator_actionable_plus_domain_blocked_refs_only_no_ready_claim',
    );
    assert.equal(summary.attention_tail_semantics, attentionSummary.attention_tail_semantics);
    assert.equal(
      attentionSummary.attention_payload_requirement_semantics,
      'operator_actionable_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
    );
    assert.equal(
      summary.attention_payload_requirement_semantics,
      attentionSummary.attention_payload_requirement_semantics,
    );
    if (
      summary.framework_kernel_hard_blocker_count === 0
      && summary.open_tail_count === 0
      && summary.operator_actionable_attention_tail_count === 0
      && summary.domain_blocked_attention_tail_count > 0
    ) {
      assert.equal(
        readiness.status,
        'framework_control_plane_available_with_blocked_refs_only_attention',
      );
      assert.equal(
        readiness.attention_first_payload.status,
        'framework_control_plane_available_with_blocked_refs_only_attention',
      );
      assert.notEqual(readiness.status, 'framework_control_plane_available_with_operator_attention');
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

import net from 'node:net';

import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  frameworkStatusFromAttentionCounts,
  splitOperatorAttentionCounts,
} from '../../../../src/modules/console/framework-readiness-attention-counts.ts';
import {
  domainBlockedTypedBlockerAttention,
} from '../../../../src/modules/console/framework-readiness-typed-blocker-attention.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

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

test('framework readiness typed blocker attention uses union unique refs across envelope and next-action sources', () => {
  const attention = domainBlockedTypedBlockerAttention({
    worklistSummary: {},
    evidenceEnvelopeSummary: {
      typed_blocker_ref_count: 2,
    },
    evidenceEnvelopeProjection: {
      envelopes: [
        { typed_blocker_refs: ['typed-blocker://shared', 'typed-blocker://envelope-only'] },
      ],
    },
    nextActionLedger: {
      summary: {
        typed_blocker_ref_count: 2,
        unique_typed_blocker_ref_count: 2,
        typed_blocker_group_count: 2,
      },
      typed_blocker_groups: [
        { typed_blocker_ref: 'typed-blocker://shared' },
        { typed_blocker_ref: 'typed-blocker://next-action-only' },
      ],
    },
  });

  assert.equal(attention.typedBlockerRefCount, 4);
  assert.equal(attention.uniqueTypedBlockerRefCount, 3);
  assert.equal(attention.typedBlockerGroupCount, 4);
  assert.equal(
    attention.groupingSemantics,
    'domain_owned_typed_blocker_refs_union_grouped_for_attention_only_raw_tail_counts_preserved',
  );
  assert.equal(
    attention.nextActionGroupingSemantics,
    'domain_blocked_attention_refs_grouped_for_attention_only_raw_tail_counts_preserved',
  );
});

test('framework readiness separates operator-actionable and domain-blocked attention tails', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-attention-semantics-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-attention-family-'));
  try {
    const { workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
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
      attentionSummary.domain_blocked_typed_blocker_ref_count,
      summary.domain_blocked_typed_blocker_ref_count,
    );
    assert.equal(
      attentionSummary.domain_blocked_unique_typed_blocker_ref_count,
      summary.domain_blocked_unique_typed_blocker_ref_count,
    );
    assert.equal(
      attentionSummary.domain_blocked_typed_blocker_group_count,
      summary.domain_blocked_typed_blocker_group_count,
    );
    assert.equal(
      summary.domain_blocked_typed_blocker_ref_count >= summary.domain_blocked_unique_typed_blocker_ref_count,
      true,
    );
    assert.equal(
      summary.domain_blocked_typed_blocker_group_count >= summary.domain_blocked_unique_typed_blocker_ref_count,
      true,
    );
    assert.equal(
      summary.domain_blocked_attention_grouping_semantics,
      attentionSummary.domain_blocked_attention_grouping_semantics,
    );
    assert.equal(
      [
        'domain_owned_typed_blocker_refs_union_grouped_for_attention_only_raw_tail_counts_preserved',
        'domain_blocked_attention_refs_grouped_for_attention_only_raw_tail_counts_preserved',
      ].includes(summary.domain_blocked_attention_grouping_semantics),
      true,
    );
    assert.equal(
      readiness.evidence_worklist.next_action_typed_blocker_attention_semantics,
      'domain_owned_typed_blocker_refs_grouped_for_attention_only_raw_tail_counts_preserved',
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
        + summary.stage_runtime_event_missing_workorder_count
        + readiness.developer_mode_live_closeout_evidence.attention_count,
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
      const nextSafeActions = readiness.attention_first_payload.next_safe_actions;
      assert.equal(
        readiness.status,
        'framework_control_plane_available_with_blocked_refs_only_attention',
      );
      assert.equal(
        readiness.attention_first_payload.status,
        'framework_control_plane_available_with_blocked_refs_only_attention',
      );
      assert.notEqual(readiness.status, 'framework_control_plane_available_with_operator_attention');
      assert.deepEqual(
        nextSafeActions.map((action: { action_id: string }) => action.action_id),
        ['review_blocked_refs_only_attention'],
      );
      assert.equal(nextSafeActions[0].action_kind, 'blocked_refs_only_attention_review');
      assert.equal(nextSafeActions[0].authority, 'refs_only_review');
      assert.equal(nextSafeActions[0].can_submit_record_to_safe_action_shell, false);
      assert.equal(nextSafeActions[0].can_create_owner_receipt, false);
      assert.equal(nextSafeActions[0].can_close_domain_ready, false);
      assert.equal(nextSafeActions[0].can_claim_production_ready, false);
      assert.equal(
        nextSafeActions.some((action: { action_kind?: string }) =>
          action.action_kind === 'domain_dispatch_evidence_group_workorder'
        ),
        false,
      );
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

test('framework readiness keeps mutation-guarded provider SLO tail out of operator-actionable attention', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-provider-slo-guard-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-provider-slo-guard-family-'));
  const server = net.createServer((socket) => socket.end());
  try {
    const { workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
    const stateRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state');
    fs.mkdirSync(path.join(stateRoot, 'family-runtime'), { recursive: true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      HOME: homeRoot,
      OPL_STATE_DIR: '',
      NODE_TEST_CONTEXT: '',
      JEST_WORKER_ID: '',
      VITEST_WORKER_ID: '',
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-framework-provider-slo-guard',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-framework-provider-slo-guard',
    }).framework_readiness;

    const summary = readiness.summary;
    const attentionSummary = readiness.attention_first_payload.summary;

    assert.equal(summary.provider_slo_guarded_open_tail_count > 0, true);
    assert.equal(
      summary.app_live_evidence_tail_guarded_by_provider_worker_mutation_count,
      summary.provider_slo_guarded_open_tail_count,
    );
    assert.equal(
      summary.app_live_evidence_tail_raw_open_count,
      summary.app_live_evidence_tail_open_count
        + summary.app_live_evidence_tail_guarded_by_provider_worker_mutation_count,
    );
    assert.equal(summary.app_live_evidence_tail_open_count, 0);
    assert.equal(
      attentionSummary.app_live_evidence_tail_open_count,
      summary.app_live_evidence_tail_open_count,
    );
    assert.equal(
      attentionSummary.app_live_evidence_tail_guarded_by_provider_worker_mutation_count,
      summary.app_live_evidence_tail_guarded_by_provider_worker_mutation_count,
    );
    const expectedOperatorActionableCount =
      summary.agent_structural_evidence_tail_open_count
      + summary.app_live_evidence_tail_open_count
      + summary.stage_receipt_freshness_tail_open_count
      + summary.evidence_envelope_open_count
      + summary.stage_source_scope_missing_workorder_count
      + summary.stage_runtime_event_missing_workorder_count
      + readiness.developer_mode_live_closeout_evidence.attention_count;
    assert.equal(
      summary.operator_actionable_attention_tail_count,
      expectedOperatorActionableCount,
    );
    assert.equal(
      summary.operator_payload_free_attention_tail_count,
      Math.max(
        summary.operator_actionable_attention_tail_count
          - summary.operator_payload_required_attention_tail_count,
        0,
      ),
    );
    assert.equal(
      readiness.app_operator_production_tail
        .app_operator_production_evidence_tail_guarded_by_provider_worker_mutation_count,
      summary.provider_slo_guarded_open_tail_count,
    );
    assert.equal(
      readiness.app_operator_production_tail
        .app_operator_production_evidence_tail_operator_actionable_open_item_count,
      0,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});

import {
  countValue as numberValue,
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

function developerModeCloseoutPayloadTemplate(missingRouteKinds: string[]) {
  const includesForkPr = missingRouteKinds.includes('fork-PR');
  const includesDirectFix = missingRouteKinds.includes('direct-fix');
  const scaleoutOnly = missingRouteKinds.length === 0;
  return {
    target_repo_id: '<target-repo-id>',
    route_decision: missingRouteKinds[0] ?? '<direct-fix|fork-PR>',
    route_eligibility: '<eligible_direct_fix|eligible_fork_pr>',
    patrol_observation_ref: '<patrol-observation-ref>',
    diff_ref: '<diff-ref>',
    verification_refs: ['<test-result-ref>'],
    no_forbidden_write_ref: '<no-forbidden-write-ref>',
    commit_ref: includesDirectFix || scaleoutOnly ? '<git-commit-ref-or-null-for-fork-pr>' : null,
    fork_repo_ref: includesForkPr || scaleoutOnly ? '<github-fork-ref-or-null-for-direct-fix>' : null,
    pr_review_ref: includesForkPr || scaleoutOnly ? '<github-pr-review-ref-or-null-for-direct-fix>' : null,
    owner_acceptance_ref: includesForkPr || scaleoutOnly
      ? '<github-pr-owner-acceptance-ref>'
      : '<external-owner-ref>',
    route_repetition_refs: ['<developer-mode-route-repetition-ref>'],
    foundry_activation_transaction_refs: [
      '<foundry-activation-transaction-ref>',
    ],
    app_patrol_mount_refs: ['<app-patrol-mount-ref>'],
  };
}

function developerModeCloseoutPayloadRefHints() {
  return {
    route_decision_should_match: ['direct-fix', 'fork-PR'],
    direct_fix_refs_should_cover: [
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'commit_ref',
      'external_owner_acceptance_ref',
    ],
    fork_pr_refs_should_cover: [
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'fork_repo_ref',
      'pr_review_ref',
      'github_pr_owner_acceptance_ref',
    ],
    fork_pr_ref_policy:
      'fork_repo_ref_must_be_resolvable_github_repo_url_or_url_backed_github_fork_ref_and_pr_review_ref_and_owner_acceptance_ref_must_be_github_pull_request_url_or_url_backed_github_pr_refs',
    fork_repo_ref_accepted_prefixes: [
      'https://github.com/',
      'git@github.com:',
      'github-fork-ref:https://github.com/',
      'github-fork-ref:git@github.com:',
    ],
    pr_review_ref_accepted_prefixes: [
      'https://github.com/',
      'github-pr-review-ref:https://github.com/',
      'github-pr-ref:https://github.com/',
    ],
    fork_pr_ref_rejected_prefixes: [
      'fixture://',
      'repo-contract-fixture-ref:',
    ],
    owner_acceptance_ref_policy:
      'direct_fix_accepts_external_owner_ref_fork_pr_requires_github_pr_owner_acceptance_ref_no_owner_receipt_ref',
    scaleout_ref_policy:
      'base direct-fix and fork-PR receipts close live route evidence; route repetition can be explicit or derived from verified ledger receipts, Foundry activation must reference an immutable activation transaction, and App patrol mounting remains an explicit follow-through ref',
  };
}

function developerModeCloseoutRequiredReturnShapes(missingRouteKinds: string[]) {
  const shapes = ['developer_mode_closeout_verified_receipt_ref'];
  if (missingRouteKinds.includes('direct-fix')) {
    shapes.push('developer_mode_direct_fix_closeout_receipt_ref');
    shapes.push('external_owner_acceptance_ref');
  }
  if (missingRouteKinds.includes('fork-PR')) {
    shapes.push('developer_mode_fork_pr_closeout_receipt_ref');
    shapes.push('github_pr_owner_acceptance_ref');
  }
  return [...new Set(shapes)];
}

function developerModeCloseoutPayloadWorkorder(missingRouteKinds: string[]) {
  return {
    surface_kind: 'opl_developer_mode_live_closeout_payload_workorder',
    workorder_policy:
      'operator_must_record_real_direct_fix_or_fork_pr_closeout_refs_empty_template_blocks',
    payload_owner: 'developer_mode_operator_or_external_repo_owner',
    accepted_payload_path_policy:
      'real_developer_mode_closeout_refs_only_no_owner_receipt_no_domain_truth',
    accepted_payload_paths: {
      direct_fix_path: {
        route_decision: 'direct-fix',
        required_operator_payload_refs: [
          'target_repo_id',
          'route_eligibility',
          'patrol_observation_ref',
          'diff_ref',
          'verification_refs',
          'no_forbidden_write_ref',
          'commit_ref',
          'owner_acceptance_ref',
        ],
        owner_acceptance_ref_must_be_external: true,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      fork_pr_path: {
        route_decision: 'fork-PR',
        required_operator_payload_refs: [
          'target_repo_id',
          'route_eligibility',
          'patrol_observation_ref',
          'diff_ref',
          'verification_refs',
          'no_forbidden_write_ref',
          'fork_repo_ref',
          'pr_review_ref',
          'owner_acceptance_ref',
        ],
        live_github_fork_ref_required: true,
        live_github_pr_review_ref_required: true,
        live_github_pr_owner_acceptance_ref_required: true,
        rejected_fixture_ref_prefixes: [
          'fixture://',
          'repo-contract-fixture-ref:',
        ],
        owner_acceptance_ref_must_be_external: true,
        owner_acceptance_ref_must_be_github_pr_backed: true,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    missing_live_ledger_route_kinds: missingRouteKinds,
    required_operator_payload_refs: [
      'target_repo_id',
      'route_decision',
      'route_eligibility',
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'commit_ref_or_fork_pr_refs',
      'owner_acceptance_ref',
    ],
    optional_scaleout_payload_refs: [
      'route_repetition_refs',
      'foundry_activation_transaction_refs',
      'app_patrol_mount_refs',
    ],
    foundry_activation_transaction_ref_policy:
      'immutable_foundry_activation_transaction_ref_required',
    foundry_activation_status_command_ref:
      'opl foundry status --run-id <run_id>',
    required_return_shapes:
      developerModeCloseoutRequiredReturnShapes(missingRouteKinds),
    payload_template: developerModeCloseoutPayloadTemplate(missingRouteKinds),
    payload_ref_hints: developerModeCloseoutPayloadRefHints(),
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_modify_managed_runtime: false,
      can_close_domain_ready: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_developer_mode_live_route: false,
    },
  };
}

export function developerModeLiveCloseoutEvidenceSummary(evidence: JsonRecord) {
  const summary = record(evidence.summary);
  const verifiedDirectFixLedgerReceiptRefCount =
    numberValue(summary.verified_direct_fix_ledger_receipt_ref_count);
  const verifiedForkPrLedgerReceiptRefCount =
    numberValue(summary.verified_fork_pr_ledger_receipt_ref_count);
  const missingLiveLedgerRouteKinds = [
    verifiedDirectFixLedgerReceiptRefCount > 0 ? null : 'direct-fix',
    verifiedForkPrLedgerReceiptRefCount > 0 ? null : 'fork-PR',
  ].filter((entry): entry is string => Boolean(entry));
  const pendingVerifyReceiptRefCount =
    numberValue(summary.pending_verify_receipt_ref_count);
  const scaleoutFollowthrough = record(evidence.scaleout_followthrough);
  const scaleoutOpenGateCount =
    numberValue(summary.scaleout_followthrough_open_gate_count)
    || numberValue(scaleoutFollowthrough.open_gate_count);
  const attentionCount = pendingVerifyReceiptRefCount > 0
    ? pendingVerifyReceiptRefCount
    : missingLiveLedgerRouteKinds.length + scaleoutOpenGateCount;
  return {
    status: stringValue(evidence.status),
    ledger_evidence_status: stringValue(evidence.ledger_evidence_status),
    drill_count: numberValue(summary.drill_count),
    direct_fix_drill_count: numberValue(summary.direct_fix_drill_count),
    fork_pr_drill_count: numberValue(summary.fork_pr_drill_count),
    closeout_ready_count: numberValue(summary.closeout_ready_count),
    live_external_owner_acceptance_count:
      numberValue(summary.live_external_owner_acceptance_count),
    live_ledger_closeout_ready_count:
      numberValue(summary.live_ledger_closeout_ready_count),
    ledger_receipt_ref_count: numberValue(summary.ledger_receipt_ref_count),
    ledger_recorded_receipt_ref_count:
      numberValue(summary.ledger_recorded_receipt_ref_count),
    ledger_verified_receipt_ref_count:
      numberValue(summary.ledger_verified_receipt_ref_count),
    pending_verify_receipt_ref_count: pendingVerifyReceiptRefCount,
    verified_direct_fix_ledger_receipt_ref_count:
      verifiedDirectFixLedgerReceiptRefCount,
    verified_fork_pr_ledger_receipt_ref_count:
      verifiedForkPrLedgerReceiptRefCount,
    route_repetition_ref_count:
      numberValue(summary.route_repetition_ref_count),
    foundry_activation_transaction_ref_count:
      numberValue(summary.foundry_activation_transaction_ref_count),
    app_patrol_mount_ref_count:
      numberValue(summary.app_patrol_mount_ref_count),
    scaleout_followthrough_open_gate_count: scaleoutOpenGateCount,
    scaleout_followthrough: scaleoutFollowthrough,
    repo_contract_fixture_drill_count:
      numberValue(summary.repo_contract_fixture_drill_count),
    repo_contract_fixture_not_live_repo_count:
      numberValue(summary.repo_contract_fixture_not_live_repo_count),
    external_owner_acceptance_missing_count:
      numberValue(summary.external_owner_acceptance_missing_count),
    fixture_drill_external_owner_acceptance_missing_count:
      numberValue(summary.fixture_drill_external_owner_acceptance_missing_count),
    fixture_drill_owner_acceptance_open_count:
      numberValue(summary.fixture_drill_owner_acceptance_open_count),
    external_owner_closeout_refs_ready_count:
      numberValue(summary.external_owner_closeout_refs_ready_count),
    forbidden_owner_receipt_write_count:
      numberValue(summary.forbidden_owner_receipt_write_count),
    missing_live_ledger_route_kinds: missingLiveLedgerRouteKinds,
    missing_live_ledger_route_count: missingLiveLedgerRouteKinds.length,
    attention_count: attentionCount,
    live_route_closeout_refs_ready:
      stringValue(evidence.status) === 'closeout_refs_ready',
  };
}

export function buildDeveloperModeLiveCloseoutEvidenceAttention(operatorProjection: JsonRecord) {
  const evidence = record(operatorProjection.developer_mode_live_closeout_evidence);
  if (Object.keys(evidence).length === 0) {
    return {
      surface_kind: 'opl_app_drilldown_developer_mode_live_closeout_evidence_attention',
      owner: 'one-person-lab',
      target_surface: 'opl_developer_mode_live_closeout',
      status: 'not_observed',
      ledger_evidence_status: null,
      developer_mode_live_route_closeout_refs_ready: false,
      attention_required: false,
      attention_count: 0,
      missing_live_ledger_route_count: 0,
      missing_live_ledger_route_kinds: [],
      scaleout_payload_required: false,
      ledger_receipt_ref_count: 0,
      ledger_recorded_receipt_ref_count: 0,
      ledger_verified_receipt_ref_count: 0,
      pending_verify_receipt_ref_count: 0,
      pending_verify_receipt_refs: [],
      verified_direct_fix_ledger_receipt_ref_count: 0,
      verified_fork_pr_ledger_receipt_ref_count: 0,
      route_repetition_ref_count: 0,
      foundry_activation_transaction_ref_count: 0,
      app_patrol_mount_ref_count: 0,
      scaleout_followthrough_open_gate_count: 0,
      scaleout_followthrough: {},
      external_owner_acceptance_missing_count: 0,
      fixture_drill_external_owner_acceptance_missing_count: 0,
      fixture_drill_owner_acceptance_open_count: 0,
      repo_contract_fixture_not_live_repo_count: 0,
      forbidden_owner_receipt_write_count: 0,
      required_closeout_ref_groups: [],
      required_return_shapes: [],
      receipt_verification_required: false,
      verification_command_ref: null,
      record_command_ref: null,
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: false,
      payload_owner: 'developer_mode_operator_or_external_repo_owner',
      payload_template: null,
      payload_ref_hints: null,
      payload_workorder: null,
      payload_template_policy: null,
      scaleout_payload_policy:
        'route_repetition_risk_tier_and_app_patrol_refs_are_followthrough_evidence_not_owner_receipts_or_ready_verdicts',
      empty_payload_template_is_success_evidence: false,
      drill_sample_count: 0,
      full_detail_section: 'developer_mode_live_closeout_evidence',
      authority_boundary: {
        ...record(operatorProjection.authority_boundary),
        refs_only: true,
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_mutate_artifact_body: false,
        can_authorize_quality_or_export: false,
        can_create_owner_receipt: false,
        can_write_owner_receipt: false,
        can_modify_managed_runtime: false,
        can_close_domain_ready: false,
        can_claim_release_ready: false,
        can_claim_production_ready: false,
        can_close_developer_mode_live_route: false,
      },
    };
  }
  const summary = developerModeLiveCloseoutEvidenceSummary(evidence);
  const pendingVerifyReceiptRefs = stringList(evidence.pending_verify_receipt_refs);
  const missingRouteKinds = stringList(summary.missing_live_ledger_route_kinds);
  const scaleoutOpenGateCount = numberValue(summary.scaleout_followthrough_open_gate_count);
  const canRecord = missingRouteKinds.length > 0 || scaleoutOpenGateCount > 0;
  const firstPendingVerifyReceiptRef = pendingVerifyReceiptRefs[0] ?? null;
  const verifyArgs = firstPendingVerifyReceiptRef
    ? [
        'runtime',
        'developer-mode-closeout',
        'verify',
        '--receipt-ref',
        firstPendingVerifyReceiptRef,
      ]
    : null;
  const recordArgs = ['runtime', 'developer-mode-closeout', 'record', '--payload', '<json>'];
  return {
    surface_kind: 'opl_app_drilldown_developer_mode_live_closeout_evidence_attention',
    owner: 'one-person-lab',
    target_surface: 'opl_developer_mode_live_closeout',
    status: summary.status ?? 'closeout_refs_incomplete',
    ledger_evidence_status: summary.ledger_evidence_status,
    developer_mode_live_route_closeout_refs_ready:
      summary.live_route_closeout_refs_ready,
    attention_required: summary.attention_count > 0,
    attention_count: summary.attention_count,
    missing_live_ledger_route_count: summary.missing_live_ledger_route_count,
    missing_live_ledger_route_kinds: missingRouteKinds,
    scaleout_payload_required: scaleoutOpenGateCount > 0,
    ledger_receipt_ref_count: summary.ledger_receipt_ref_count,
    ledger_recorded_receipt_ref_count:
      summary.ledger_recorded_receipt_ref_count,
    ledger_verified_receipt_ref_count:
      summary.ledger_verified_receipt_ref_count,
    pending_verify_receipt_ref_count:
      summary.pending_verify_receipt_ref_count,
    pending_verify_receipt_refs: pendingVerifyReceiptRefs,
    verified_direct_fix_ledger_receipt_ref_count:
      summary.verified_direct_fix_ledger_receipt_ref_count,
    verified_fork_pr_ledger_receipt_ref_count:
      summary.verified_fork_pr_ledger_receipt_ref_count,
    route_repetition_ref_count: summary.route_repetition_ref_count,
    foundry_activation_transaction_ref_count:
      summary.foundry_activation_transaction_ref_count,
    app_patrol_mount_ref_count: summary.app_patrol_mount_ref_count,
    scaleout_followthrough_open_gate_count:
      summary.scaleout_followthrough_open_gate_count,
    scaleout_followthrough: summary.scaleout_followthrough,
    external_owner_acceptance_missing_count:
      summary.external_owner_acceptance_missing_count,
    fixture_drill_external_owner_acceptance_missing_count:
      summary.fixture_drill_external_owner_acceptance_missing_count,
    fixture_drill_owner_acceptance_open_count:
      summary.fixture_drill_owner_acceptance_open_count,
    repo_contract_fixture_not_live_repo_count:
      summary.repo_contract_fixture_not_live_repo_count,
    forbidden_owner_receipt_write_count:
      summary.forbidden_owner_receipt_write_count,
    required_closeout_ref_groups: stringList(evidence.required_closeout_ref_groups),
    required_return_shapes:
      developerModeCloseoutRequiredReturnShapes(missingRouteKinds),
    receipt_verification_required: pendingVerifyReceiptRefs.length > 0,
    verification_command_ref: verifyArgs ? commandRef(verifyArgs) : null,
    record_command_ref: canRecord ? commandRef(recordArgs) : null,
    route_requires_domain_or_app_payload: canRecord,
    can_close_without_domain_or_app_payload: pendingVerifyReceiptRefs.length > 0,
    payload_owner: 'developer_mode_operator_or_external_repo_owner',
    payload_template: canRecord
      ? developerModeCloseoutPayloadTemplate(missingRouteKinds)
      : null,
    payload_ref_hints: canRecord ? developerModeCloseoutPayloadRefHints() : null,
    payload_workorder: canRecord
      ? developerModeCloseoutPayloadWorkorder(missingRouteKinds)
      : null,
    payload_template_policy: canRecord
      ? 'template_is_empty_by_design_replace_with_real_developer_mode_closeout_refs_before_submit'
      : null,
    scaleout_payload_policy:
      'route_repetition_risk_tier_and_app_patrol_refs_are_followthrough_evidence_not_owner_receipts_or_ready_verdicts',
    empty_payload_template_is_success_evidence: false,
    drill_sample_count: Math.min(recordList(evidence.drills).length, 3),
    full_detail_section: 'developer_mode_live_closeout_evidence',
    authority_boundary: {
      ...record(operatorProjection.authority_boundary),
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_modify_managed_runtime: false,
      can_close_domain_ready: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_developer_mode_live_route: false,
    },
  };
}

export function developerModeLiveCloseoutEvidenceNextStep(evidence: JsonRecord) {
  const missingRouteKinds = stringList(evidence.missing_live_ledger_route_kinds);
  const pendingVerifyReceiptRefs = stringList(evidence.pending_verify_receipt_refs);
  return {
    step_kind: 'developer_mode_live_closeout_evidence',
    owner: stringValue(evidence.owner) ?? 'one-person-lab',
    target_surface:
      stringValue(evidence.target_surface) ?? 'opl_developer_mode_live_closeout',
    status: stringValue(evidence.status),
    ledger_evidence_status: stringValue(evidence.ledger_evidence_status),
    developer_mode_live_route_closeout_refs_ready:
      evidence.developer_mode_live_route_closeout_refs_ready === true,
    attention_count: numberValue(evidence.attention_count),
    missing_live_ledger_route_count:
      numberValue(evidence.missing_live_ledger_route_count),
    missing_live_ledger_route_kinds: missingRouteKinds,
    scaleout_payload_required: evidence.scaleout_payload_required === true,
    pending_verify_receipt_ref_count:
      numberValue(evidence.pending_verify_receipt_ref_count),
    pending_verify_receipt_refs: pendingVerifyReceiptRefs,
    verified_direct_fix_ledger_receipt_ref_count:
      numberValue(evidence.verified_direct_fix_ledger_receipt_ref_count),
    verified_fork_pr_ledger_receipt_ref_count:
      numberValue(evidence.verified_fork_pr_ledger_receipt_ref_count),
    route_repetition_ref_count:
      numberValue(evidence.route_repetition_ref_count),
    foundry_activation_transaction_ref_count:
      numberValue(evidence.foundry_activation_transaction_ref_count),
    app_patrol_mount_ref_count:
      numberValue(evidence.app_patrol_mount_ref_count),
    scaleout_followthrough_open_gate_count:
      numberValue(evidence.scaleout_followthrough_open_gate_count),
    scaleout_followthrough: record(evidence.scaleout_followthrough),
    required_closeout_ref_groups: stringList(evidence.required_closeout_ref_groups),
    required_return_shapes: stringList(evidence.required_return_shapes),
    payload_owner:
      stringValue(evidence.payload_owner) ?? 'developer_mode_operator_or_external_repo_owner',
    receipt_verification_required: evidence.receipt_verification_required === true,
    verification_command_ref: stringValue(evidence.verification_command_ref),
    record_command_ref: stringValue(evidence.record_command_ref),
    route_requires_domain_or_app_payload:
      evidence.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload:
      evidence.can_close_without_domain_or_app_payload === true,
    payload_template: record(evidence.payload_template),
    payload_ref_hints: record(evidence.payload_ref_hints),
    payload_workorder: record(evidence.payload_workorder),
    payload_template_policy: stringValue(evidence.payload_template_policy),
    scaleout_payload_policy: stringValue(evidence.scaleout_payload_policy),
    empty_payload_template_is_success_evidence: false,
    full_detail_section: 'developer_mode_live_closeout_evidence',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_modify_managed_runtime: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_developer_mode_live_route: false,
  };
}

export function frameworkDeveloperModeLiveCloseoutNextSafeAction(evidence: JsonRecord) {
  return {
    ...developerModeLiveCloseoutEvidenceNextStep(evidence),
    action_id: 'review_developer_mode_live_closeout_evidence',
    action_kind: 'developer_mode_live_closeout_evidence_review',
    evidence_closure_gate:
      'developer_mode_direct_fix_and_fork_pr_external_owner_acceptance_gate',
    full_detail_section:
      'attention_first_payload.evidence_after_contract.developer_mode_live_closeout_evidence',
    authority: 'operator_attention_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

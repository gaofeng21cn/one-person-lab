import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonRecord } from './runtime-tray-snapshot-types.ts';
import { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';
import { listManagedInstallUpdateReceipts } from './managed-install-update-ledger.ts';
import { listOmaAppLivePathReceipts } from './oma-app-live-path-ledger.ts';
import { listOmaProductionConsumptionReceipts } from './oma-production-consumption-ledger.ts';
import { buildOplModules } from './system-installation/modules.ts';

const OMA_DOMAIN_ID = 'opl-meta-agent';
const OMA_PROJECT = 'opl-meta-agent';
const OMA_WORKSPACE_ENV = 'OPL_META_AGENT_REPO_DIR';
const OMA_RELATIVE_CONTRACT_REFS = {
  registration: 'contracts/opl_domain_manifest_registration.json',
  appWorkbenchProjection: 'contracts/app_workbench_projection.json',
  scaleoutEvidence: 'contracts/real_target_agent_scaleout_evidence.json',
} as const;

const PATCH_LOOP_REF_FIELDS = [
  'blocked_suite_result_ref',
  'developer_patch_work_order_ref',
  'patch_traceability_matrix_ref',
  'failure_evidence_refs',
  'root_cause_refs',
  'targeted_fix_refs',
  'predicted_impact_refs',
  'next_run_falsification_refs',
  'target_repo_verification_refs',
  'target_runtime_read_model_consumption_ref',
  'workspace_environment_proof_ref',
  'no_forbidden_write_proof_ref',
  'target_owner_receipt_or_typed_blocker_ref',
  'patch_absorption_ref',
  'worktree_cleanup_ref',
  'agent_lab_re_evaluation_ref',
] as const;

const SELF_EVOLUTION_OPERATOR_QUESTIONS = [
  'failure_evidence',
  'root_cause',
  'targeted_fix',
  'predicted_impact',
  'next_run_falsification',
  'owner_receipt_or_typed_blocker',
] as const;

const PRODUCTION_CONSUMPTION_GATE_IDS = [
  'managed_install_update_refs',
  'app_live_path_refs',
  'owner_receipt_or_typed_blocker_scaleout_refs',
  'long_soak_refs',
] as const;

type OplModuleInspection = ReturnType<typeof buildOplModules>['modules']['modules'][number];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function workspaceCandidates(seed: string) {
  const candidates = [seed, path.dirname(seed)];
  let current = path.resolve(seed);
  while (current !== path.dirname(current)) {
    if (path.basename(current) === '.worktrees') {
      candidates.push(path.dirname(path.dirname(current)));
    }
    current = path.dirname(current);
  }
  return candidates;
}

function inspectOmaModule(): OplModuleInspection | null {
  return buildOplModules().modules.modules.find((module) =>
    module.module_id === 'oplmetaagent'
  ) ?? null;
}

function managedInstallUpdateBlockers(module: OplModuleInspection | null) {
  const blockers: string[] = [];
  if (!module) {
    return ['module_inspection_unavailable'];
  }
  if (module.install_origin === 'sibling_workspace' || module.install_origin === 'env_override') {
    blockers.push('developer_checkout_visible_not_app_managed');
  }
  if (module.install_origin === 'invalid_checkout' || module.health_status === 'invalid_checkout') {
    blockers.push('invalid_checkout');
  }
  if (module.health_status === 'dirty' || module.git?.dirty) {
    blockers.push('dirty_checkout');
  }
  const syncStatus = module.git?.sync_status;
  if (syncStatus === 'ahead' || syncStatus === 'diverged' || syncStatus === 'no_upstream' || syncStatus === 'unknown') {
    blockers.push(`${syncStatus}_checkout`);
  }
  return uniqueStringList(blockers);
}

function managedInstallUpdateFollowthrough(observedRefs: string[]) {
  const module = inspectOmaModule();
  const blockers = managedInstallUpdateBlockers(module);
  const refsObserved = observedRefs.length > 0;
  const manualRequired = !refsObserved && blockers.length > 0;
  const status = refsObserved
    ? 'refs_observed'
    : manualRequired
      ? 'manual_required'
      : 'startup_maintenance_required';
  const reason = refsObserved
    ? 'managed_install_update_receipt_observed'
    : blockers[0] ?? (module?.install_origin === 'missing' ? 'module_missing' : 'startup_health_and_skill_refresh');
  return {
    surface_kind: 'opl_meta_agent_managed_install_update_followthrough',
    status,
    reason,
    blockers,
    module,
    next_safe_action: {
      action_id: manualRequired
        ? 'review_oplmetaagent_developer_checkout_before_startup_maintenance'
        : 'run_opl_system_startup_maintenance',
      command: manualRequired
        ? 'opl modules'
        : 'opl system startup-maintenance',
      after_manual_resolution_command: 'opl system startup-maintenance',
      route_owner: 'one-person-lab',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_production_ready: false,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function defaultOmaRepoDir() {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const roots = [
    process.env[OMA_WORKSPACE_ENV],
    process.env.OPL_FAMILY_WORKSPACE_ROOT
      ? path.join(process.env.OPL_FAMILY_WORKSPACE_ROOT, OMA_PROJECT)
      : null,
    ...workspaceCandidates(process.cwd()).map((candidate) => path.join(candidate, OMA_PROJECT)),
    ...workspaceCandidates(sourceRoot).map((candidate) => path.join(candidate, OMA_PROJECT)),
  ].filter((entry): entry is string => Boolean(entry));
  return roots.find((candidate) => (
    fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.registration))
    && fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection))
    && fs.existsSync(path.join(candidate, OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence))
  )) ?? null;
}

function readJson(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  try {
    return {
      ref: relativePath,
      absolute_path: absolutePath,
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown,
      error: null,
    };
  } catch (error) {
    return {
      ref: relativePath,
      absolute_path: absolutePath,
      status: fs.existsSync(absolutePath) ? 'invalid_json' : 'missing',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function refsFromSectionFields(fields: unknown, role: string) {
  return stringList(fields).map((ref) => ({
    ref,
    role,
    status: 'projected_ref',
  }));
}

function appSectionRefs(section: JsonRecord) {
  return [
    ...refsFromSectionFields(section.projection_fields, 'projection_field'),
    ...(optionalString(section.write_boundary)
      ? [{
          ref: optionalString(section.write_boundary)!,
          role: 'write_boundary',
          status: 'refs_only',
        }]
      : []),
  ];
}

function scaleoutTargetRefs(scaleoutEvidence: JsonRecord) {
  const closeout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  return recordList(closeout.target_agents).map((target) => ({
    ref: optionalString(target.target_agent_delivery_receipt_ref)
      ?? optionalString(target.domain_id)
      ?? 'target-agent-delivery-receipt',
    status: optionalString(closeout.status) ?? optionalString(scaleoutEvidence.evidence_status) ?? 'observed',
    receipt_ref: optionalString(target.target_agent_delivery_receipt_ref),
    typed_blocker_ref: stringList(target.typed_blocker_refs)[0] ?? null,
    owner_receipt_ref: stringList(target.target_agent_owner_receipt_refs)[0] ?? null,
    domain_id: optionalString(target.domain_id),
  }));
}

function targetHasAnyRef(target: JsonRecord, field: string) {
  return stringList(target[field]).length > 0;
}

function countTargetsByRef(targets: JsonRecord[], field: string) {
  return targets.filter((target) => targetHasAnyRef(target, field)).length;
}

function countTargetsWithOwnerReceiptOrBlocker(targets: JsonRecord[]) {
  return targets.filter((target) =>
    targetHasAnyRef(target, 'target_agent_owner_receipt_refs')
    || targetHasAnyRef(target, 'typed_blocker_refs')
  ).length;
}

function countBooleanClaims(targets: JsonRecord[], field: string) {
  return targets.filter((target) => target[field] === true).length;
}

function uniqueStringList(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsFromRecords(records: JsonRecord[], keys: string[]) {
  return uniqueStringList(records.flatMap((entry) =>
    keys.flatMap((key) => stringList(entry[key]))
  ));
}

function managedInstallUpdateLedgerRefs() {
  return listManagedInstallUpdateReceipts({ module_id: 'oplmetaagent', repo_name: OMA_PROJECT })
    .filter((receipt) =>
      receipt.install_origin_after === 'managed_root'
      && receipt.module_action_status === 'completed'
      && receipt.skill_sync_status === 'completed'
      && receipt.health_check_status === 'completed'
    )
    .map((receipt) => receipt.receipt_ref);
}

function omaAppLivePathLedgerRefs() {
  return uniqueStringList(listOmaAppLivePathReceipts().flatMap((receipt) => [
    receipt.receipt_ref,
    ...receipt.app_live_path_refs,
    ...receipt.operator_evidence_refs,
  ]));
}

function omaProductionConsumptionLedgerRefs() {
  const receipts = listOmaProductionConsumptionReceipts();
  return {
    receiptRefs: uniqueStringList(receipts.map((receipt) => receipt.receipt_ref)),
    longSoakRefs: uniqueStringList(receipts.flatMap((receipt) => receipt.long_soak_refs)),
    operatorEvidenceRefs: uniqueStringList(receipts.flatMap((receipt) => receipt.operator_evidence_refs)),
    typedBlockerRefs: uniqueStringList(receipts.flatMap((receipt) => receipt.typed_blocker_refs)),
  };
}

function productionConsumptionGate(input: {
  gateId: typeof PRODUCTION_CONSUMPTION_GATE_IDS[number];
  status: string;
  requiredRefsAnyOf: string[];
  observedRefs?: string[];
  observedTargetCount?: number;
  targetCount?: number;
  currentContractStatus?: string | null;
  followthrough?: JsonRecord;
}) {
  return {
    gate_id: input.gateId,
    status: input.status,
    required_refs_any_of: input.requiredRefsAnyOf,
    observed_ref_count: input.observedRefs?.length ?? 0,
    observed_refs: input.observedRefs ?? [],
    observed_target_count: input.observedTargetCount ?? null,
    target_count: input.targetCount ?? null,
    current_contract_status: input.currentContractStatus ?? null,
    ...(input.followthrough ? {
      managed_install_update_followthrough: input.followthrough,
      manual_required: input.followthrough.status === 'manual_required',
      manual_required_reason: optionalString(input.followthrough.reason),
      manual_required_blockers: stringList(input.followthrough.blockers),
      next_safe_action: record(input.followthrough.next_safe_action),
    } : {}),
    full_detail_section: 'opl_meta_agent_workbench_refs',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function buildProductionConsumptionFollowthrough(payloads: {
  status: string;
  registration: JsonRecord;
  appProjection: JsonRecord;
  scaleoutEvidence: JsonRecord;
}) {
  if (payloads.status !== 'resolved') {
    return {
      surface_kind: 'opl_meta_agent_production_consumption_followthrough',
      status: 'oma_contracts_not_bound_production_followthrough_unavailable',
      owner: 'one-person-lab',
      target_agent: OMA_DOMAIN_ID,
      required_gate_ids: [...PRODUCTION_CONSUMPTION_GATE_IDS],
      gate_items: [],
      summary: {
        structural_consumption_ready: false,
        gate_count: PRODUCTION_CONSUMPTION_GATE_IDS.length,
        open_gate_count: 0,
        production_consumption_ready: false,
        domain_ready_claim_count: 0,
        quality_verdict_claim_count: 0,
        default_promotion_claim_count: 0,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const registration = payloads.registration;
  const appProjection = payloads.appProjection;
  const scaleoutEvidence = payloads.scaleoutEvidence;
  const drilldownReceipt = record(appProjection.drilldown_readiness_receipt);
  const scaleoutCloseout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  const scaleoutTargets = recordList(scaleoutCloseout.target_agents);
  const managedInstallUpdateRefs = refsFromRecords([
    registration,
    record(registration.discovery_receipt),
    appProjection,
    drilldownReceipt,
    scaleoutEvidence,
  ], [
    'managed_install_update_refs',
    'module_install_update_refs',
    'install_update_receipt_refs',
    'managed_module_update_receipt_refs',
  ]);
  const managedInstallUpdateLedgerReceiptRefs = managedInstallUpdateLedgerRefs();
  const managedInstallUpdateObservedRefs = uniqueStringList([
    ...managedInstallUpdateRefs,
    ...managedInstallUpdateLedgerReceiptRefs,
  ]);
  const managedInstallFollowthrough =
    managedInstallUpdateFollowthrough(managedInstallUpdateObservedRefs);
  const appLivePathRefs = refsFromRecords([
    appProjection,
    drilldownReceipt,
  ], [
    'app_live_path_refs',
    'app_workbench_live_consumption_refs',
    'live_rendering_refs',
    'live_user_path_refs',
  ]);
  const appLivePathLedgerRefs = omaAppLivePathLedgerRefs();
  const appLivePathObservedRefs = uniqueStringList([
    ...appLivePathRefs,
    ...appLivePathLedgerRefs,
  ]);
  const ownerOrBlockerTargetCount = countTargetsWithOwnerReceiptOrBlocker(scaleoutTargets);
  const ownerOrBlockerRefs = uniqueStringList(scaleoutTargets.flatMap((target) => [
    ...stringList(target.target_agent_owner_receipt_refs),
    ...stringList(target.typed_blocker_refs),
  ]));
  const longSoakRefs = refsFromRecords([
    scaleoutEvidence,
    scaleoutCloseout,
    ...scaleoutTargets,
  ], [
    'long_soak_refs',
    'operator_long_soak_refs',
    'production_soak_refs',
    'app_live_soak_refs',
    'agent_lab_rerun_long_soak_refs',
  ]);
  const productionConsumptionLedgerRefs = omaProductionConsumptionLedgerRefs();
  const longSoakObservedRefs = uniqueStringList([
    ...longSoakRefs,
    ...productionConsumptionLedgerRefs.longSoakRefs,
  ]);
  const typedBlockerRefs = productionConsumptionLedgerRefs.typedBlockerRefs;
  const liveRenderingStatus = optionalString(drilldownReceipt.live_rendering_status);
  const gates = [
    productionConsumptionGate({
      gateId: 'managed_install_update_refs',
      status: managedInstallUpdateObservedRefs.length > 0
        ? 'refs_observed'
        : optionalString(managedInstallFollowthrough.status) === 'manual_required'
          ? 'manual_required_before_managed_install_update_refs'
          : 'missing_managed_install_update_refs',
      requiredRefsAnyOf: [
        'managed_install_update_refs',
        'module_install_update_receipt_refs',
        'managed_module_update_receipt_refs',
        'opl_managed_module_install_update_receipt',
      ],
      observedRefs: managedInstallUpdateObservedRefs,
      followthrough: managedInstallFollowthrough,
    }),
    productionConsumptionGate({
      gateId: 'app_live_path_refs',
      status: appLivePathObservedRefs.length > 0
        && (liveRenderingStatus !== 'not_claimed_by_contract' || appLivePathLedgerRefs.length > 0)
        ? 'refs_observed'
        : 'missing_app_live_path_refs',
      requiredRefsAnyOf: [
        'app_live_path_refs',
        'app_workbench_live_consumption_refs',
        'live_rendering_refs',
        'live_user_path_refs',
        'opl_oma_app_live_path_receipt',
      ],
      observedRefs: appLivePathObservedRefs,
      currentContractStatus: liveRenderingStatus,
    }),
    productionConsumptionGate({
      gateId: 'owner_receipt_or_typed_blocker_scaleout_refs',
      status: scaleoutTargets.length > 0 && ownerOrBlockerTargetCount === scaleoutTargets.length
        ? 'refs_observed'
        : 'missing_owner_receipt_or_typed_blocker_scaleout_refs',
      requiredRefsAnyOf: [
        'target_agent_owner_receipt_refs',
        'typed_blocker_refs',
        'target_patch_rerun_receipt_refs',
        'agent_lab_re_evaluation_refs',
      ],
      observedRefs: ownerOrBlockerRefs,
      observedTargetCount: ownerOrBlockerTargetCount,
      targetCount: scaleoutTargets.length,
    }),
    productionConsumptionGate({
      gateId: 'long_soak_refs',
      status: longSoakObservedRefs.length > 0 ? 'refs_observed' : 'missing_long_soak_refs',
      requiredRefsAnyOf: [
        'long_soak_refs',
        'operator_long_soak_refs',
        'production_soak_refs',
        'agent_lab_rerun_long_soak_refs',
        'opl_oma_production_consumption_receipt',
      ],
      observedRefs: longSoakObservedRefs,
    }),
  ];
  const openGates = gates.filter((gate) => gate.status !== 'refs_observed');

  return {
    surface_kind: 'opl_meta_agent_production_consumption_followthrough',
    status: openGates.length > 0
      ? 'structural_consumption_ready_production_consumption_followthrough_required'
      : 'production_consumption_refs_projected',
    owner: 'one-person-lab',
    target_agent: OMA_DOMAIN_ID,
    target_repo: OMA_PROJECT,
    required_gate_ids: [...PRODUCTION_CONSUMPTION_GATE_IDS],
    gate_items: gates,
    summary: {
      structural_consumption_ready: true,
      gate_count: gates.length,
      open_gate_count: openGates.length,
      open_gate_ids: openGates.map((gate) => gate.gate_id),
      managed_install_update_ref_count: managedInstallUpdateObservedRefs.length,
      app_live_path_ref_count: appLivePathObservedRefs.length,
      owner_receipt_or_typed_blocker_seed_target_count: ownerOrBlockerTargetCount,
      scaleout_target_count: scaleoutTargets.length,
      long_soak_ref_count: longSoakObservedRefs.length,
      production_consumption_ledger_receipt_ref_count:
        productionConsumptionLedgerRefs.receiptRefs.length,
      production_consumption_operator_evidence_ref_count:
        productionConsumptionLedgerRefs.operatorEvidenceRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      blocked_by_typed_blocker_refs: typedBlockerRefs.length > 0,
      production_consumption_ready: openGates.length === 0,
      domain_ready_claim_count: 0,
      quality_verdict_claim_count: 0,
      default_promotion_claim_count: 0,
    },
    typed_blocker_refs: typedBlockerRefs,
    blocked_by_typed_blocker_refs: typedBlockerRefs.length > 0,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function evidenceAfterContractStatus(targets: JsonRecord[]) {
  if (targets.length === 0) {
    return 'not_observed';
  }
  const ownerOrBlockerCount = countTargetsWithOwnerReceiptOrBlocker(targets);
  const agentLabCount = countTargetsByRef(targets, 'agent_lab_result_refs');
  const noForbiddenWriteCount = countTargetsByRef(targets, 'no_forbidden_write_proof_refs');
  const cleanupCount = countTargetsByRef(targets, 'cleanup_closeout_refs');
  return ownerOrBlockerCount === targets.length
    && agentLabCount === targets.length
    && noForbiddenWriteCount === targets.length
    && cleanupCount === targets.length
    ? 'target_owner_receipt_or_typed_blocker_refs_projected'
    : 'target_evidence_refs_incomplete';
}

function firstString(values: unknown) {
  return stringList(values)[0] ?? null;
}

function refListOrFallback(value: unknown, fallback: string) {
  const refs = stringList(value);
  return refs.length > 0 ? refs : [fallback];
}

function patchLoopCloseoutTargetRefs(scaleoutEvidence: JsonRecord) {
  const closeout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  return recordList(closeout.target_agents).map((target) => {
    const domainId = optionalString(target.domain_id) ?? 'target-agent';
    const ownerReceiptOrBlocker = firstString(target.target_agent_owner_receipt_refs)
      ?? firstString(target.typed_blocker_refs)
      ?? `typed-blocker:opl-meta-agent/${domainId}/owner-receipt-or-blocker-missing`;
    const cleanupRef = firstString(target.cleanup_closeout_refs)
      ?? `worktree-cleanup:${domainId}/not-recorded`;
    const agentLabResultRef = firstString(target.agent_lab_result_refs)
      ?? `agent-lab-run-result:opl-meta-agent/${domainId}/not-recorded`;
    const noForbiddenWriteRef = firstString(target.no_forbidden_write_proof_refs)
      ?? `no-forbidden-write:${domainId}/not-recorded`;

    return {
      domain_id: domainId,
      status: ownerReceiptOrBlocker.startsWith('typed-blocker:')
        ? 'owner_typed_blocker_recorded'
        : 'owner_receipt_recorded',
      refs: {
        blocked_suite_result_ref: agentLabResultRef,
        developer_patch_work_order_ref: optionalString(target.developer_patch_work_order_ref)
          ?? `developer-patch-work-order:opl-meta-agent/${domainId}/agent-evidence`,
        patch_traceability_matrix_ref: optionalString(target.patch_traceability_matrix_ref)
          ?? `patch-traceability:opl-meta-agent/${domainId}/agent-evidence`,
        failure_evidence_refs: refListOrFallback(
          target.failure_evidence_refs,
          `typed-blocker:opl-meta-agent/${domainId}/failure-evidence-ref-missing`,
        ),
        root_cause_refs: refListOrFallback(
          target.root_cause_refs,
          `typed-blocker:opl-meta-agent/${domainId}/root-cause-ref-missing`,
        ),
        targeted_fix_refs: refListOrFallback(
          target.targeted_fix_refs,
          `typed-blocker:opl-meta-agent/${domainId}/targeted-fix-ref-missing`,
        ),
        predicted_impact_refs: refListOrFallback(
          target.predicted_impact_refs,
          `typed-blocker:opl-meta-agent/${domainId}/predicted-impact-ref-missing`,
        ),
        next_run_falsification_refs: refListOrFallback(
          target.next_run_falsification_refs,
          `typed-blocker:opl-meta-agent/${domainId}/next-run-falsification-ref-missing`,
        ),
        target_repo_verification_refs: stringList(target.target_repo_verification_refs).length > 0
          ? stringList(target.target_repo_verification_refs)
          : [`target-verification:${domainId}/agent-evidence`],
        target_runtime_read_model_consumption_ref:
          optionalString(target.target_runtime_read_model_consumption_ref)
            ?? `target-runtime-read-model:${domainId}/agent-evidence`,
        workspace_environment_proof_ref: optionalString(target.workspace_environment_proof_ref)
          ?? `workspace-environment-proof:${domainId}/agent-evidence`,
        no_forbidden_write_proof_ref: noForbiddenWriteRef,
        target_owner_receipt_or_typed_blocker_ref: ownerReceiptOrBlocker,
        patch_absorption_ref: optionalString(target.patch_absorption_ref)
          ?? `patch-absorption:${domainId}/agent-evidence`,
        worktree_cleanup_ref: cleanupRef,
        agent_lab_re_evaluation_ref: optionalString(target.agent_lab_re_evaluation_ref)
          ?? agentLabResultRef,
      },
    };
  });
}

function flattenPatchLoopRefs(targets: ReturnType<typeof patchLoopCloseoutTargetRefs>) {
  const refs = targets.flatMap((target) =>
    Object.entries(target.refs).flatMap(([role, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((ref) => ({
        ref,
        role,
        domain_id: target.domain_id,
        status: target.status,
      }));
    })
  );
  const seen = new Set<string>();
  return refs.filter((entry) => {
    const key = `${entry.domain_id}:${entry.role}:${entry.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function refsArray(value: unknown) {
  return Array.isArray(value) ? stringList(value) : stringList([value]);
}

function targetSixQuestionReady(target: ReturnType<typeof patchLoopCloseoutTargetRefs>[number]) {
  return refsArray(target.refs.failure_evidence_refs).length > 0
    && refsArray(target.refs.root_cause_refs).length > 0
    && refsArray(target.refs.targeted_fix_refs).length > 0
    && refsArray(target.refs.predicted_impact_refs).length > 0
    && refsArray(target.refs.next_run_falsification_refs).length > 0
    && Boolean(optionalString(target.refs.target_owner_receipt_or_typed_blocker_ref));
}

function buildSelfEvolutionCockpit(targets: ReturnType<typeof patchLoopCloseoutTargetRefs>) {
  const rows = targets.map((target) => ({
    domain_id: target.domain_id,
    status: target.status,
    six_question_ready: targetSixQuestionReady(target),
    failure_evidence_refs: refsArray(target.refs.failure_evidence_refs),
    root_cause_refs: refsArray(target.refs.root_cause_refs),
    targeted_fix_refs: refsArray(target.refs.targeted_fix_refs),
    predicted_impact_refs: refsArray(target.refs.predicted_impact_refs),
    next_run_falsification_refs: refsArray(target.refs.next_run_falsification_refs),
    owner_receipt_or_typed_blocker_ref:
      optionalString(target.refs.target_owner_receipt_or_typed_blocker_ref),
    blocked_suite_result_ref: optionalString(target.refs.blocked_suite_result_ref),
    developer_patch_work_order_ref: optionalString(target.refs.developer_patch_work_order_ref),
    patch_traceability_matrix_ref: optionalString(target.refs.patch_traceability_matrix_ref),
    target_repo_verification_refs: refsArray(target.refs.target_repo_verification_refs),
    target_runtime_read_model_consumption_ref:
      optionalString(target.refs.target_runtime_read_model_consumption_ref),
    workspace_environment_proof_ref: optionalString(target.refs.workspace_environment_proof_ref),
    no_forbidden_write_proof_ref: optionalString(target.refs.no_forbidden_write_proof_ref),
    patch_absorption_ref: optionalString(target.refs.patch_absorption_ref),
    worktree_cleanup_ref: optionalString(target.refs.worktree_cleanup_ref),
    agent_lab_re_evaluation_ref: optionalString(target.refs.agent_lab_re_evaluation_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  }));

  return {
    surface_kind: 'opl_meta_agent_self_evolution_cockpit_read_model',
    status: rows.length > 0 ? 'refs_only_operator_cockpit_projected' : 'not_observed',
    operator_questions: [...SELF_EVOLUTION_OPERATOR_QUESTIONS],
    targets: rows,
    summary: {
      target_count: rows.length,
      six_question_ready_count: rows.filter((row) => row.six_question_ready).length,
      owner_receipt_or_typed_blocker_count:
        rows.filter((row) => Boolean(row.owner_receipt_or_typed_blocker_ref)).length,
      domain_ready_claim_count: 0,
      quality_verdict_claim_count: 0,
      default_promotion_claim_count: 0,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function sectionById(appProjection: JsonRecord, sectionId: string) {
  return recordList(appProjection.workbench_sections).find((section) =>
    optionalString(section.section_id) === sectionId
  ) ?? {};
}

function buildOmaSections(payloads: {
  registration: JsonRecord;
  appProjection: JsonRecord;
  scaleoutEvidence: JsonRecord;
}) {
  const registration = payloads.registration;
  const appProjection = payloads.appProjection;
  const scaleoutEvidence = payloads.scaleoutEvidence;
  const registrationDomainManifest = record(registration.domain_manifest);
  const implementedReceiptSurfaces = record(scaleoutEvidence.implemented_receipt_surfaces);
  const discoveryReceipt = record(registration.discovery_receipt);
  const drilldownReceipt = record(appProjection.drilldown_readiness_receipt);
  const scaleoutCloseout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  const patchLoopTargets = patchLoopCloseoutTargetRefs(scaleoutEvidence);
  const selfEvolutionCockpit = buildSelfEvolutionCockpit(patchLoopTargets);

  return {
    target_brief: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'target_brief')),
        {
          ref: optionalString(registrationDomainManifest.domain_descriptor_ref)
            ?? 'contracts/domain_descriptor.json',
          status: optionalString(discoveryReceipt.status) ?? optionalString(registration.registration_status),
          blocker_ref: stringList(discoveryReceipt.blocked_claims)[0] ?? null,
          receipt_ref: optionalString(discoveryReceipt.receipt_ref),
        },
      ],
    },
    candidate_package: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'candidate_package')),
        {
          package_ref: optionalString(registrationDomainManifest.pack_compiler_input_ref)
            ?? 'contracts/pack_compiler_input.json',
          status: 'candidate_refs_projected',
          blocker_ref: 'blocked-claim:default-agent-promotion-not-authorized',
          receipt_ref: optionalString(discoveryReceipt.receipt_ref),
        },
      ],
    },
    agent_lab_results: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'agent_lab_results')),
        {
          evidence_ref: optionalString(implementedReceiptSurfaces.scaleout_evidence_ledger_surface_kind)
            ?? 'opl_meta_agent_real_target_agent_scaleout_evidence_ledger',
          result_status: optionalString(scaleoutEvidence.evidence_status),
          typed_blocker_ref: recordList(scaleoutCloseout.target_agents).length === 0
            ? 'typed-blocker:opl-meta-agent/no-real-target-scaleout'
            : null,
          receipt_ref: stringList(implementedReceiptSurfaces.default_output_refs)[1] ?? null,
        },
      ],
    },
    developer_work_order: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'developer_work_order')),
        {
          work_order_ref: 'developer-patch-work-order:opl-meta-agent/target-agent-improvement',
          status: 'refs_only_operator_projection',
          blocker_ref: stringList(drilldownReceipt.blocker_ref_fields)[0] ?? null,
          owner_receipt_ref: stringList(drilldownReceipt.receipt_ref_fields)[0] ?? null,
        },
      ],
    },
    mechanism_proposal: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'mechanism_patch_proposal')),
        {
          proposal_ref: 'mechanism-patch-proposal:opl-meta-agent/target-agent-improvement',
          review_status: 'owner_review_required_before_apply',
          typed_blocker_ref: 'typed-blocker:default-promotion-not-authorized',
          receipt_ref: optionalString(drilldownReceipt.receipt_ref),
        },
      ],
    },
    scaleout_evidence: {
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'scaleout_evidence')),
        ...scaleoutTargetRefs(scaleoutEvidence),
      ],
    },
    trajectory_learning: {
      surface_kind: 'opl_meta_agent_trajectory_learning_app_workbench_section',
      status: 'refs_only_proposal_projection_ready',
      refs: [
        ...appSectionRefs(sectionById(appProjection, 'trajectory_learning')),
        {
          contract_ref: optionalString(record(appProjection.source_refs).trajectory_learning_contract_ref)
            ?? 'contracts/trajectory_learning_contract.json',
          status: 'owner_review_required_before_apply',
          receipt_ref: stringList(drilldownReceipt.receipt_ref_fields).find((field) =>
            field === 'trajectory_atomization_receipt_ref'
          ) ?? null,
          blocker_ref: stringList(drilldownReceipt.blocker_ref_fields).find((field) =>
            field === 'owner_review_receipt_or_typed_blocker_ref'
          ) ?? null,
        },
      ],
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    patch_loop_closeout: {
      surface_kind: 'opl_meta_agent_patch_loop_closeout_read_model',
      status: patchLoopTargets.length > 0 ? 'refs_only_patch_loop_refs_projected' : 'not_observed',
      required_ref_fields: [...PATCH_LOOP_REF_FIELDS],
      ahe_patch_loop_ref_fields: [
        'failure_evidence_refs',
        'root_cause_refs',
        'targeted_fix_refs',
        'predicted_impact_refs',
        'next_run_falsification_refs',
      ],
      targets: patchLoopTargets,
      refs: flattenPatchLoopRefs(patchLoopTargets),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    self_evolution_cockpit: selfEvolutionCockpit,
  };
}

export function refsOnlyAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_target_domain_truth: false,
    can_write_target_domain_memory_body: false,
    can_mutate_target_domain_artifact_body: false,
    can_authorize_target_domain_quality_or_export: false,
    can_authorize_domain_ready: false,
    can_claim_quality_verdict: false,
    can_promote_default_agent_without_gate: false,
  };
}

export function buildOplMetaAgentRegistryExtension(options: { repoDir?: string | null } = {}) {
  const repoDir = options.repoDir ?? defaultOmaRepoDir();
  if (!repoDir) {
    return {
      surface_kind: 'opl_meta_agent_registry_extension',
      project_id: OMA_DOMAIN_ID,
      project: OMA_PROJECT,
      status: 'not_bound',
      repo_dir: null,
      contract_refs: OMA_RELATIVE_CONTRACT_REFS,
      summary: {
        consumed_contract_count: 0,
        resolved_contract_count: 0,
        app_workbench_section_count: 0,
        scaleout_target_count: 0,
        scaleout_status: null,
        evidence_after_contract_status: 'not_observed',
        scaleout_owner_receipt_target_count: 0,
        scaleout_typed_blocker_target_count: 0,
        scaleout_owner_receipt_or_typed_blocker_target_count: 0,
        scaleout_agent_lab_result_target_count: 0,
        scaleout_no_forbidden_write_target_count: 0,
        scaleout_cleanup_closeout_target_count: 0,
        scaleout_domain_ready_claim_count: 0,
        scaleout_default_promotion_claim_count: 0,
        patch_loop_ref_count: 0,
        patch_loop_target_count: 0,
        patch_loop_closed_count: 0,
        self_evolution_cockpit_target_count: 0,
        self_evolution_cockpit_six_question_ready_count: 0,
        discovery_receipt_status: null,
        app_drilldown_receipt_status: null,
        production_consumption_followthrough_open_gate_count: 0,
        production_consumption_ready: false,
        claims_domain_ready: false,
        claims_quality_verdict: false,
        claims_default_promotion: false,
      },
      production_consumption_followthrough: buildProductionConsumptionFollowthrough({
        status: 'not_bound',
        registration: {},
        appProjection: {},
        scaleoutEvidence: {},
      }),
      authority_boundary: refsOnlyAuthorityBoundary(),
      source_refs: [],
    };
  }

  const registrationFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.registration);
  const appProjectionFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection);
  const scaleoutEvidenceFile = readJson(repoDir, OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence);
  const files = [registrationFile, appProjectionFile, scaleoutEvidenceFile];
  const registration = record(registrationFile.payload);
  const appProjection = record(appProjectionFile.payload);
  const scaleoutEvidence = record(scaleoutEvidenceFile.payload);
  const resolvedCount = files.filter((file) => file.status === 'resolved').length;
  const status = resolvedCount === files.length ? 'resolved' : 'blocked';
  const omaSections = buildOmaSections({ registration, appProjection, scaleoutEvidence });
  const scaleoutCloseout = record(scaleoutEvidence.multi_target_scaleout_closeout);
  const scaleoutTargets = recordList(scaleoutCloseout.target_agents);
  const patchLoopCloseout = record(omaSections.patch_loop_closeout);
  const patchLoopTargets = recordList(patchLoopCloseout.targets);
  const selfEvolutionCockpit = record(omaSections.self_evolution_cockpit);
  const selfEvolutionCockpitSummary = record(selfEvolutionCockpit.summary);
  const productionConsumptionFollowthrough = buildProductionConsumptionFollowthrough({
    status,
    registration,
    appProjection,
    scaleoutEvidence,
  });
  const productionConsumptionSummary = record(productionConsumptionFollowthrough.summary);

  return {
    surface_kind: 'opl_meta_agent_registry_extension',
    project_id: OMA_DOMAIN_ID,
    project: OMA_PROJECT,
    status,
    repo_dir: repoDir,
    contract_refs: OMA_RELATIVE_CONTRACT_REFS,
    registration: status === 'resolved' ? registration : null,
    app_workbench_projection: status === 'resolved' ? appProjection : null,
    real_target_agent_scaleout_evidence: status === 'resolved' ? scaleoutEvidence : null,
    oma_sections: omaSections,
    production_consumption_followthrough: productionConsumptionFollowthrough,
    summary: {
      consumed_contract_count: files.length,
      resolved_contract_count: resolvedCount,
      app_workbench_section_count: recordList(appProjection.workbench_sections).length,
      scaleout_target_count: scaleoutTargets.length,
      scaleout_status: optionalString(scaleoutCloseout.status) ?? optionalString(scaleoutEvidence.evidence_status),
      evidence_after_contract_status: evidenceAfterContractStatus(scaleoutTargets),
      scaleout_owner_receipt_target_count: countTargetsByRef(scaleoutTargets, 'target_agent_owner_receipt_refs'),
      scaleout_typed_blocker_target_count: countTargetsByRef(scaleoutTargets, 'typed_blocker_refs'),
      scaleout_owner_receipt_or_typed_blocker_target_count:
        countTargetsWithOwnerReceiptOrBlocker(scaleoutTargets),
      scaleout_agent_lab_result_target_count: countTargetsByRef(scaleoutTargets, 'agent_lab_result_refs'),
      scaleout_no_forbidden_write_target_count:
        countTargetsByRef(scaleoutTargets, 'no_forbidden_write_proof_refs'),
      scaleout_cleanup_closeout_target_count: countTargetsByRef(scaleoutTargets, 'cleanup_closeout_refs'),
      scaleout_domain_ready_claim_count: countBooleanClaims(scaleoutTargets, 'domain_ready_claimed'),
      scaleout_default_promotion_claim_count:
        countBooleanClaims(scaleoutTargets, 'default_promotion_claimed'),
      patch_loop_ref_count: recordList(patchLoopCloseout.refs).length,
      patch_loop_target_count: patchLoopTargets.length,
      patch_loop_closed_count: patchLoopTargets.filter((target) =>
        optionalString(target.status) === 'owner_receipt_recorded'
        || optionalString(target.status) === 'owner_typed_blocker_recorded'
      ).length,
      self_evolution_cockpit_target_count:
        typeof selfEvolutionCockpitSummary.target_count === 'number'
          ? selfEvolutionCockpitSummary.target_count
          : recordList(selfEvolutionCockpit.targets).length,
      self_evolution_cockpit_six_question_ready_count:
        typeof selfEvolutionCockpitSummary.six_question_ready_count === 'number'
          ? selfEvolutionCockpitSummary.six_question_ready_count
          : recordList(selfEvolutionCockpit.targets).filter((target) =>
            target.six_question_ready === true
          ).length,
      discovery_receipt_status: optionalString(record(registration.discovery_receipt).status),
      app_drilldown_receipt_status: optionalString(record(appProjection.drilldown_readiness_receipt).status),
      production_consumption_followthrough_open_gate_count:
        typeof productionConsumptionSummary.open_gate_count === 'number'
          ? productionConsumptionSummary.open_gate_count
          : 0,
      production_consumption_ready:
        productionConsumptionSummary.production_consumption_ready === true,
      claims_domain_ready: false,
      claims_quality_verdict: false,
      claims_default_promotion: false,
    },
    files: files.map(({ payload: _payload, ...file }) => file),
    authority_boundary: refsOnlyAuthorityBoundary(),
    source_refs: uniqueByRef([
      sourceRef('/opl_meta_agent_registry', 'opl_meta_agent_registry_extension'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.registration}`, 'oma_domain_manifest_registration'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.appWorkbenchProjection}`, 'oma_app_workbench_projection'),
      sourceRef(`${repoDir}/${OMA_RELATIVE_CONTRACT_REFS.scaleoutEvidence}`, 'oma_real_target_agent_scaleout_evidence'),
    ]),
  };
}

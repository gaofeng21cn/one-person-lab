import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import { writeJson } from '../agent-lab-work-order-execution-parts/io.ts';

const OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS = [
  'target_owner_route',
  'source_morphology',
  'generated_surface_consumption',
  'private_residue_decision',
  'no_forbidden_write_proof',
  'owner_answer_shape',
] as const;

export function assertExecutableWorkOrder(workOrder: JsonRecord): void {
  if (stringValue(workOrder.status) !== 'ready_for_target_agent_source_patch') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute requires a source patch work order.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        status: stringValue(workOrder.status),
      },
    );
  }
  if (stringValue(workOrder.executor_lease_ref)?.startsWith('executor-lease:codex-cli/') !== true) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute requires a Codex CLI executor lease ref.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        executor_lease_ref: stringValue(workOrder.executor_lease_ref),
      },
    );
  }
  const boundary = isRecord(workOrder.authority_boundary) ? workOrder.authority_boundary : {};
  if (boundary.can_write_target_domain_truth !== false || boundary.can_authorize_target_domain_quality_or_export !== false) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL work-order execute refuses work orders that can write target truth or quality/export verdicts.',
      {
        work_order_id: stringValue(workOrder.work_order_id),
        authority_boundary: boundary,
      },
    );
  }
}

export function missingOmaTargetAgentWorkOrderGuardFields(workOrder: JsonRecord): string[] {
  const machineCloseoutRefs = isRecord(workOrder.machine_closeout_refs) ? workOrder.machine_closeout_refs : {};
  const noForbiddenWriteProof = isRecord(workOrder.no_forbidden_write_proof)
    ? workOrder.no_forbidden_write_proof
    : {};
  const missing: string[] = [];
  if (stringList(workOrder.owner_route_refs).length === 0) {
    missing.push('target_owner_route');
  }
  if (!isRecord(workOrder.source_morphology_proof) && !stringValue(workOrder.source_morphology_proof_ref)) {
    missing.push('source_morphology');
  }
  if (!stringValue(machineCloseoutRefs.target_runtime_read_model_consumption_ref)) {
    missing.push('generated_surface_consumption');
  }
  if (!stringValue(workOrder.private_residue_decision_ref)) {
    missing.push('private_residue_decision');
  }
  if (
    noForbiddenWriteProof.required !== true
    || noForbiddenWriteProof.can_write_target_domain_truth !== false
    || noForbiddenWriteProof.can_write_target_domain_memory_body !== false
    || noForbiddenWriteProof.can_mutate_target_domain_artifact_body !== false
    || noForbiddenWriteProof.can_authorize_target_domain_quality_or_export !== false
    || stringList(noForbiddenWriteProof.proof_refs).length === 0
  ) {
    missing.push('no_forbidden_write_proof');
  }
  if (!stringValue(machineCloseoutRefs.target_owner_receipt_or_typed_blocker_ref)) {
    missing.push('owner_answer_shape');
  }
  return OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS.filter((field) => missing.includes(field));
}

function omaTargetAgentNoExecutorLaunchProof() {
  return {
    codex_process_started: false,
    target_worktree_opened: false,
    absorption_attempted: false,
    cleanup_needed: false,
    reason: 'oma_target_agent_work_order_guard_missing',
  };
}

function writeOmaTargetAgentWorkOrderGuardBlocker(input: {
  workOrderId: string;
  outputDir: string;
  missingFields: string[];
}): string {
  const typedBlockerPath = path.join(input.outputDir, 'typed-blocker.json');
  const noExecutorLaunchProof = omaTargetAgentNoExecutorLaunchProof();
  writeJson(typedBlockerPath, {
    surface_kind: 'opl_work_order_typed_blocker',
    version: 'opl.work-order-execution.typed-blocker.v1',
    blocker_kind: 'oma_target_agent_work_order_guard_missing',
    status: 'developer_work_order_required',
    executor_launch_preflight: 'hard_stopped_before_executor_launch',
    work_order_id: input.workOrderId,
    missing_guard_fields: input.missingFields,
    required_guard_fields: OMA_TARGET_AGENT_WORK_ORDER_GUARD_FIELDS,
    no_executor_launch_proof: noExecutorLaunchProof,
    developer_work_order_required: true,
    can_sign_target_owner_receipt: false,
    can_create_target_typed_blocker: false,
    can_write_target_truth: false,
    required_next_shape: 'developer_work_order',
    guard_policy_ref:
      'contracts/opl-framework/standard-agent-landing-acceptance-contract.json#oma_target_agent_work_order_guard',
  });
  return typedBlockerPath;
}

export function assertOmaTargetAgentWorkOrderGuard(input: {
  workOrder: JsonRecord;
  workOrderId: string;
  outputDir: string;
}): void {
  const missingFields = missingOmaTargetAgentWorkOrderGuardFields(input.workOrder);
  if (missingFields.length === 0) {
    return;
  }
  const typedBlockerPath = writeOmaTargetAgentWorkOrderGuardBlocker({
    workOrderId: input.workOrderId,
    outputDir: input.outputDir,
    missingFields,
  });
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'OMA target-agent work order guard requires target owner route, source morphology, generated surface consumption, private residue decision, no-forbidden-write proof, and owner answer shape before execution.',
    {
      work_order_id: input.workOrderId,
      blocker_kind: 'oma_target_agent_work_order_guard_missing',
      executor_launch_preflight: 'hard_stopped_before_executor_launch',
      missing_guard_fields: missingFields,
      typed_blocker_path: typedBlockerPath,
      no_executor_launch_proof: omaTargetAgentNoExecutorLaunchProof(),
      developer_work_order_required: true,
      can_sign_target_owner_receipt: false,
      can_create_target_typed_blocker: false,
      can_write_target_truth: false,
    },
  );
}

import { isRecord } from '../../kernel/contract-validation.ts';
import { record, stringValue, type JsonRecord } from '../../kernel/json-record.ts';

function stringList(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function refFromAffordance(value: unknown) {
  if (typeof value === 'string') {
    return stringValue(value);
  }
  const affordance = record(value);
  return stringValue(affordance.affordance_ref)
    ?? stringValue(affordance.tool_ref)
    ?? stringValue(affordance.ref)
    ?? stringValue(affordance.id);
}

function affordanceRefs(value: unknown) {
  if (typeof value === 'string') {
    return stringList(value);
  }
  if (Array.isArray(value)) {
    return [...new Set(value.map(refFromAffordance).filter((entry): entry is string => Boolean(entry)))];
  }
  const ref = refFromAffordance(value);
  return ref ? [ref] : [];
}

function refsFromRecord(source: JsonRecord, keys: string[]) {
  return [...new Set(keys.flatMap((key) => stringList(source[key])))];
}

export function cognitiveKernelBoundary() {
  return {
    surface_kind: 'opl_cognitive_kernel_boundary_projection',
    contract_ref: 'contracts/opl-framework/cognitive-computation-kernel.json',
    envelope_semantics: 'stage_goal_context_authority_boundary_available_affordances_quality_gate',
    stage_strategy_owner: 'selected_executor',
    tool_affordance_policy: 'available_affordances_not_workflow_script',
    closeout_policy: 'actual_tool_evidence_artifact_owner_answer_or_typed_blocker_refs_only',
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_read_memory_body: false,
      can_authorize_quality_verdict: false,
      can_create_owner_answer: false,
      can_create_typed_blocker: false,
      tool_affordance_can_override_stage_goal: false,
      tool_affordance_can_define_mandatory_sequence: false,
      route_can_generate_stage_strategy: false,
    },
  };
}

export function buildStageAttemptLaunchEnvelope(input: {
  stageAttemptId: string;
  domainId: string;
  stageId: string;
  workspaceLocator: JsonRecord;
  sourceFingerprint?: string | null;
}) {
  const workspaceLocator = input.workspaceLocator;
  const boundary = cognitiveKernelBoundary();
  const availableAffordances = Array.isArray(workspaceLocator.available_affordances)
    ? workspaceLocator.available_affordances.filter(isRecord)
    : [];
  return {
    surface_kind: 'opl_stage_attempt_launch_envelope',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    source_fingerprint: input.sourceFingerprint ?? null,
    envelope_semantics: boundary.envelope_semantics,
    stage_goal: stringValue(workspaceLocator.stage_goal)
      ?? stringValue(workspaceLocator.goal)
      ?? `${input.domainId}/${input.stageId}`,
    context_refs: refsFromRecord(workspaceLocator, [
      'context_refs',
      'source_refs',
      'knowledge_refs',
      'memory_refs',
      'stage_packet_refs',
      'stage_packet_ref',
    ]),
    authority_boundary: {
      ...boundary.authority_boundary,
      ...Object.fromEntries(
        Object.entries(record(workspaceLocator.authority_boundary)).filter(([, value]) => value === false),
      ),
    },
    available_affordances: availableAffordances,
    available_affordance_refs: affordanceRefs(workspaceLocator.available_affordances),
    tool_affordance_policy: 'available_affordances_not_mandatory_sequence_not_workflow_script',
    quality_gate: record(workspaceLocator.quality_gate),
    quality_gate_refs: refsFromRecord(workspaceLocator, [
      'quality_gate_refs',
      'rubric_refs',
      'quality_gate_ref',
      'rubric_ref',
    ]),
    cognitive_kernel_boundary: boundary,
  };
}

export function buildStageAttemptCloseoutRefsOnlyContract(input: {
  stageAttemptId: string;
  domainId: string;
  stageId: string;
  closeoutRefs: string[];
  consumedRefs: string[];
  writebackReceiptRefs: string[];
  routeImpact: JsonRecord;
}) {
  const boundary = cognitiveKernelBoundary();
  const routeImpact = input.routeImpact;
  return {
    surface_kind: 'opl_stage_attempt_closeout_refs_only_contract',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    closeout_policy: boundary.closeout_policy,
    actual_tool_refs: refsFromRecord(routeImpact, ['tool_refs', 'tools_used_refs', 'actual_tool_refs']),
    actual_evidence_refs: [
      ...new Set([
        ...input.consumedRefs,
        ...refsFromRecord(routeImpact, ['evidence_refs', 'actual_evidence_refs']),
      ]),
    ],
    actual_artifact_refs: [
      ...new Set([
        ...input.writebackReceiptRefs,
        ...refsFromRecord(routeImpact, ['artifact_refs', 'actual_artifact_refs']),
      ]),
    ],
    owner_answer_refs: refsFromRecord(routeImpact, [
      'owner_answer_refs',
      'owner_receipt_refs',
      'domain_owner_receipt_refs',
    ]),
    typed_blocker_refs: refsFromRecord(routeImpact, [
      'typed_blocker_refs',
      'domain_typed_blocker_refs',
    ]),
    closeout_refs: input.closeoutRefs,
    authority_boundary: boundary.authority_boundary,
  };
}

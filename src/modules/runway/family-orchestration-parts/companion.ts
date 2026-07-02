import type {
  BuildFamilyOrchestrationCompanionInput,
  BuildFamilyOrchestrationTemplateInput,
} from '../family-orchestration.ts';
import {
  isRecord,
  normalizeRefs,
  optionalString,
  requireString,
  stableId,
  type JsonRecord,
} from './shared.ts';

type FamilyOrchestrationTemplateBuilder = (
  input: BuildFamilyOrchestrationTemplateInput,
) => JsonRecord;

interface ResolvedFamilyOrchestrationCompanionContext {
  eventTime: string;
  surfaceKind: string;
  surfaceId: string;
  eventName: string;
  sourceSurface: string;
  sessionId: string;
  checkpointId: string;
  lineageId: string;
  envelopeId: string;
  correlationId: string;
  activeRunId: string | null;
  programId: string;
  humanGates: JsonRecord[];
  payload: JsonRecord;
}

function resolveProgramId(execution: unknown, fallback = 'opl_family_program') {
  if (isRecord(execution)) {
    for (const key of ['program_id', 'runtime_program_id', 'program']) {
      const value = optionalString(execution[key]);
      if (value) {
        return value;
      }
    }
  }
  return fallback;
}

function resolveActiveRunId(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function resolveFamilyOrchestrationCompanionContext(
  input: BuildFamilyOrchestrationCompanionInput,
): ResolvedFamilyOrchestrationCompanionContext {
  const eventTime = optionalString(input.event_time) ?? new Date().toISOString();
  const surfaceKind = requireString(input.surface_kind, 'surface_kind');
  const surfaceId = requireString(input.surface_id, 'surface_id');
  const eventName = requireString(input.event_name, 'event_name');
  const sourceSurface = requireString(input.source_surface, 'source_surface');
  const sessionId = optionalString(input.session_id) ?? stableId('session', input.study_id, input.quest_id, eventName);
  const checkpointId = optionalString(input.checkpoint_id)
    ?? stableId('checkpoint', input.study_id, input.quest_id, input.runtime_decision, input.runtime_reason, eventName);
  const lineageId = stableId('lineage', sessionId, checkpointId);

  return {
    eventTime,
    surfaceKind,
    surfaceId,
    eventName,
    sourceSurface,
    sessionId,
    checkpointId,
    lineageId,
    envelopeId: stableId('evt', surfaceId, eventName, eventTime, sessionId, checkpointId),
    correlationId: stableId('corr', sessionId, eventName, checkpointId),
    activeRunId: resolveActiveRunId(input.active_run_id),
    programId: optionalString(input.program_id) ?? resolveProgramId(null),
    humanGates: Array.isArray(input.human_gates)
      ? input.human_gates.filter((gate): gate is JsonRecord => isRecord(gate)).map((gate) => ({ ...gate }))
      : [],
    payload: buildFamilyOrchestrationCompanionPayload(input),
  };
}

function buildFamilyOrchestrationCompanionPayload(
  input: BuildFamilyOrchestrationCompanionInput,
): JsonRecord {
  const payload: JsonRecord = isRecord(input.payload) ? { ...input.payload } : {};
  if (optionalString(input.runtime_decision)) {
    payload.runtime_decision = optionalString(input.runtime_decision);
  }
  if (optionalString(input.runtime_reason)) {
    payload.runtime_reason = optionalString(input.runtime_reason);
  }
  return payload;
}

function buildFamilyEventEnvelope(
  input: BuildFamilyOrchestrationCompanionInput,
  context: ResolvedFamilyOrchestrationCompanionContext,
): JsonRecord {
  const eventEnvelope: JsonRecord = {
    version: 'family-event-envelope.v1',
    envelope_id: context.envelopeId,
    event_name: context.eventName,
    event_time: context.eventTime,
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    producer: {
      surface_kind: context.surfaceKind,
      surface_id: context.surfaceId,
    },
    session: {
      session_id: context.sessionId,
      source_surface: context.sourceSurface,
      ...(context.activeRunId ? { active_run_id: context.activeRunId } : {}),
      ...(context.programId ? { program_id: context.programId } : {}),
      ...(optionalString(input.study_id) ? { study_id: optionalString(input.study_id)! } : {}),
      ...(optionalString(input.quest_id) ? { quest_id: optionalString(input.quest_id)! } : {}),
    },
    correlation: {
      correlation_id: context.correlationId,
      checkpoint_id: context.checkpointId,
      checkpoint_lineage_id: context.lineageId,
      ...(optionalString(input.action_graph_id) ? { action_graph_id: optionalString(input.action_graph_id)! } : {}),
      ...(optionalString(input.node_id) ? { node_id: optionalString(input.node_id)! } : {}),
      ...(optionalString(input.gate_id) ? { gate_id: optionalString(input.gate_id)! } : {}),
      ...(optionalString(input.parent_envelope_id) ? { parent_envelope_id: optionalString(input.parent_envelope_id)! } : {}),
      ...(optionalString(input.parent_session_id) ? { parent_session_id: optionalString(input.parent_session_id)! } : {}),
    },
    payload: context.payload,
  };

  const auditRefs = normalizeRefs(input.audit_refs, 'audit_refs');
  if (auditRefs.length > 0) {
    eventEnvelope.audit_refs = auditRefs;
  }
  if (context.humanGates.length > 0) {
    const firstGate = context.humanGates[0];
    eventEnvelope.human_gate_hint = {
      gate_id: optionalString(firstGate.gate_id),
      status: optionalString(firstGate.status) ?? 'requested',
      ...(isRecord(firstGate.request_surface) ? { review_surface: { ...firstGate.request_surface } } : {}),
    };
  }

  return eventEnvelope;
}

function buildFamilyCheckpointLineage(
  input: BuildFamilyOrchestrationCompanionInput,
  context: ResolvedFamilyOrchestrationCompanionContext,
): JsonRecord {
  const stateRefs = normalizeRefs(input.state_refs, 'state_refs');
  if (stateRefs.length === 0) {
    stateRefs.push({
      role: 'status',
      ref_kind: 'repo_path',
      ref: context.surfaceId,
      label: 'surface_status',
    });
  }

  const checkpointLineage: JsonRecord = {
    version: 'family-checkpoint-lineage.v1',
    lineage_id: context.lineageId,
    checkpoint_id: context.checkpointId,
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    session: {
      session_id: context.sessionId,
      ...(context.activeRunId ? { active_run_id: context.activeRunId } : {}),
      ...(context.programId ? { program_id: context.programId } : {}),
    },
    producer: {
      event_envelope_id: context.envelopeId,
      ...(optionalString(input.action_graph_id) ? { action_graph_id: optionalString(input.action_graph_id)! } : {}),
      ...(optionalString(input.node_id) ? { node_id: optionalString(input.node_id)! } : {}),
      ...(optionalString(input.gate_id) ? { gate_id: optionalString(input.gate_id)! } : {}),
    },
    state_refs: stateRefs,
    resume_contract: {
      resume_mode: optionalString(input.resume_mode) ?? 'resume_from_checkpoint',
      resume_handle: optionalString(input.resume_handle) ?? `${context.surfaceKind}:${context.checkpointId}`,
      human_gate_required: Boolean(input.human_gate_required),
    },
    integrity: {
      status: 'complete',
      recorded_at: context.eventTime,
      summary: optionalString(input.checkpoint_label)
        ?? optionalString(input.runtime_reason)
        ?? 'runtime checkpoint captured',
    },
  };

  const parent: JsonRecord = {};
  for (const [key, value] of [
    ['parent_lineage_id', input.parent_lineage_id],
    ['parent_checkpoint_id', input.parent_checkpoint_id],
    ['resume_from_lineage_id', input.resume_from_lineage_id],
  ] as const) {
    const text = optionalString(value);
    if (text) {
      parent[key] = text;
    }
  }
  if (Object.keys(parent).length > 0) {
    checkpointLineage.parent = parent;
  }

  const restorationEvidence = normalizeRefs(input.restoration_evidence, 'restoration_evidence');
  if (restorationEvidence.length > 0) {
    checkpointLineage.restoration_evidence = restorationEvidence;
  }
  return checkpointLineage;
}

export function buildFamilyOrchestrationCompanionFromTemplate(
  input: BuildFamilyOrchestrationCompanionInput,
  buildFamilyOrchestrationTemplate: FamilyOrchestrationTemplateBuilder,
) {
  const context = resolveFamilyOrchestrationCompanionContext(input);
  const eventEnvelope = buildFamilyEventEnvelope(input, context);
  const checkpointLineage = buildFamilyCheckpointLineage(input, context);

  const template = buildFamilyOrchestrationTemplate({
    action_graph: isRecord(input.action_graph) ? input.action_graph : {},
    human_gates: context.humanGates,
    resume_surface_kind: optionalString(input.resume_surface_kind) ?? context.surfaceKind,
    session_locator_field: optionalString(input.session_locator_field) ?? 'event_envelope.session.session_id',
    checkpoint_locator_field: optionalString(input.checkpoint_locator_field) ?? 'checkpoint_lineage.checkpoint_id',
    action_graph_ref: input.action_graph_ref ?? null,
    event_envelope_surface: input.event_envelope_surface ?? null,
    checkpoint_lineage_surface: input.checkpoint_lineage_surface ?? null,
    intake_evidence_companion: isRecord(input.intake_evidence_companion)
      ? { ...input.intake_evidence_companion }
      : null,
    project_profile_companion: isRecord(input.project_profile_companion)
      ? { ...input.project_profile_companion }
      : null,
  });
  const intakeEvidenceCompanion = isRecord(template.intake_evidence_companion)
    ? { ...template.intake_evidence_companion }
    : null;
  const projectProfileCompanion = isRecord(template.project_profile_companion)
    ? { ...template.project_profile_companion }
    : null;

  return {
    ...template,
    human_gates: context.humanGates,
    family_human_gates: context.humanGates,
    event_envelope: eventEnvelope,
    family_event_envelope: eventEnvelope,
    checkpoint_lineage: checkpointLineage,
    family_checkpoint_lineage: checkpointLineage,
    ...(intakeEvidenceCompanion
      ? {
        intake_evidence_companion: intakeEvidenceCompanion,
        family_intake_evidence_companion: intakeEvidenceCompanion,
      }
      : {}),
    ...(projectProfileCompanion
      ? {
        project_profile_companion: projectProfileCompanion,
        family_project_profile_companion: projectProfileCompanion,
      }
      : {}),
  };
}

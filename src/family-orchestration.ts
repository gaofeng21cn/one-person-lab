import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export interface FamilyReference {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

export interface BuildFamilyHumanGateInput {
  gate_id: string;
  gate_kind: string;
  requested_at: string;
  request_surface_kind: string;
  request_surface_id: string;
  evidence_refs: FamilyReference[];
  decision_options: string[];
  status?: string;
  decision?: JsonRecord | null;
  target_domain_id?: string;
  command?: string | null;
}

export interface BuildFamilyOrchestrationCompanionInput {
  surface_kind: string;
  surface_id: string;
  event_name: string;
  source_surface: string;
  session_id?: string | null;
  program_id?: string | null;
  study_id?: string | null;
  quest_id?: string | null;
  active_run_id?: string | null;
  runtime_decision?: string | null;
  runtime_reason?: string | null;
  payload?: JsonRecord | null;
  event_time?: string | null;
  checkpoint_id?: string | null;
  checkpoint_label?: string | null;
  audit_refs?: FamilyReference[] | null;
  state_refs?: FamilyReference[] | null;
  restoration_evidence?: FamilyReference[] | null;
  action_graph_id?: string | null;
  action_graph_ref?: FamilyReference | null;
  action_graph?: JsonRecord | null;
  node_id?: string | null;
  gate_id?: string | null;
  resume_mode?: string | null;
  resume_handle?: string | null;
  resume_surface_kind?: string | null;
  session_locator_field?: string | null;
  checkpoint_locator_field?: string | null;
  human_gate_required?: boolean;
  parent_envelope_id?: string | null;
  parent_session_id?: string | null;
  parent_lineage_id?: string | null;
  parent_checkpoint_id?: string | null;
  resume_from_lineage_id?: string | null;
  human_gates?: JsonRecord[] | null;
  target_domain_id?: string | null;
  event_envelope_surface?: FamilyReference | null;
  checkpoint_lineage_surface?: FamilyReference | null;
  intake_evidence_companion?: JsonRecord | null;
  project_profile_companion?: JsonRecord | null;
}

export interface BuildFamilyOrchestrationTemplateInput {
  action_graph: JsonRecord;
  human_gates?: JsonRecord[] | null;
  resume_surface_kind: string;
  session_locator_field: string;
  checkpoint_locator_field: string;
  action_graph_ref?: FamilyReference | null;
  event_envelope_surface?: FamilyReference | null;
  checkpoint_lineage_surface?: FamilyReference | null;
  intake_evidence_companion?: JsonRecord | null;
  project_profile_companion?: JsonRecord | null;
}

export interface BuildFamilyHumanGatePreviewInput {
  gate_id: string;
  title?: string | null;
  status?: string | null;
  review_surface?: FamilyReference | null;
}

export interface FamilyActionGraphNodeInput {
  node_id: string;
  node_kind: string;
  title: string;
  surface_kind?: string;
  produces_checkpoint?: boolean;
}

export interface FamilyActionGraphEdgeInput {
  from: string;
  to: string;
  on: string;
}

export interface FamilyActionGraphHumanGateInput {
  gate_id: string;
  trigger_nodes: string[];
  blocking: boolean;
}

export interface BuildExplicitCheckpointPolicyInput {
  checkpoint_nodes: string[];
}

export interface BuildFamilyActionGraphInput {
  graph_id: string;
  target_domain_id: string;
  graph_kind: string;
  graph_version: string;
  nodes: FamilyActionGraphNodeInput[];
  edges: FamilyActionGraphEdgeInput[];
  entry_nodes: string[];
  exit_nodes: string[];
  human_gates?: FamilyActionGraphHumanGateInput[] | null;
  checkpoint_policy?: JsonRecord | null;
}

export interface BuildFamilyProductEntryOrchestrationInput {
  graph_id: string;
  target_domain_id: string;
  graph_kind: string;
  graph_version: string;
  nodes: FamilyActionGraphNodeInput[];
  edges: FamilyActionGraphEdgeInput[];
  entry_nodes: string[];
  exit_nodes: string[];
  human_gates?: FamilyActionGraphHumanGateInput[] | null;
  checkpoint_nodes?: string[] | null;
  checkpoint_policy?: JsonRecord | null;
  human_gate_previews?: BuildFamilyHumanGatePreviewInput[] | null;
  resume_surface_kind: string;
  session_locator_field: string;
  checkpoint_locator_field: string;
  action_graph_ref?: FamilyReference | null;
  event_envelope_surface?: FamilyReference | null;
  checkpoint_lineage_surface?: FamilyReference | null;
  intake_evidence_companion?: JsonRecord | null;
  project_profile_companion?: JsonRecord | null;
}

export interface BuildFamilyFrontdeskProductEntryOrchestrationInput {
  graph_id: string;
  target_domain_id: string;
  graph_kind: string;
  graph_version: string;
  frontdesk_node_id?: string | null;
  frontdesk_title: string;
  frontdesk_surface_kind: string;
  direct_node_id?: string | null;
  direct_title: string;
  direct_surface_kind: string;
  direct_transition_event?: string | null;
  federated_node_id?: string | null;
  federated_title?: string | null;
  federated_surface_kind?: string | null;
  federated_transition_event?: string | null;
  progress_node_id?: string | null;
  progress_title: string;
  progress_surface_kind: string;
  direct_progress_event?: string | null;
  federated_progress_event?: string | null;
  review_gate_id: string;
  review_gate_title?: string | null;
  review_gate_status?: string | null;
  review_surface?: FamilyReference | null;
  resume_surface_kind: string;
  session_locator_field: string;
  checkpoint_locator_field: string;
  action_graph_ref?: FamilyReference | null;
  event_envelope_surface?: FamilyReference | null;
  checkpoint_lineage_surface?: FamilyReference | null;
  intake_evidence_companion?: JsonRecord | null;
  project_profile_companion?: JsonRecord | null;
}

export interface BuildFamilyIntakeAuditInput {
  summary: string;
  verdict?: string | null;
  audited_at?: string | null;
  summary_ref?: FamilyReference | null;
}

export interface BuildFamilyTrustRankedEvidenceRefInput {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
  trust_rank: number;
  trust_note?: string | null;
  supports?: string[] | null;
}

export interface BuildFamilyGroundingScopeInput {
  scope_kind: string;
  summary: string;
  scope_refs: FamilyReference[];
}

export interface BuildFamilyIntakeEvidenceCompanionInput {
  target_domain_id?: string | null;
  intake_audit: BuildFamilyIntakeAuditInput;
  trust_ranked_evidence_refs: BuildFamilyTrustRankedEvidenceRefInput[];
  grounding_scope: BuildFamilyGroundingScopeInput;
  human_gate_refs?: FamilyReference[] | null;
  checkpoint_lineage_refs?: FamilyReference[] | null;
}

export interface BuildFamilyProjectProfileSummaryInput {
  profile_id: string;
  project_kind: string;
  template_family: string;
  template_id: string;
  selection_mode: string;
  summary: string;
  summary_ref?: FamilyReference | null;
}

export interface BuildFamilyProjectProfileCompanionInput {
  target_domain_id?: string | null;
  project_profile: BuildFamilyProjectProfileSummaryInput;
  preference_signals: string[];
  grounding_refs: FamilyReference[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`family orchestration 缺少字符串字段: ${field}`);
  }
  return text;
}

function normalizeRef(value: unknown, field: string): FamilyReference | null {
  if (!isRecord(value)) {
    return null;
  }
  const refKind = optionalString(value.ref_kind);
  const ref = optionalString(value.ref);
  if (!refKind || !ref) {
    throw new Error(`family orchestration reference 缺少字段: ${field}`);
  }
  return {
    ref_kind: refKind,
    ref,
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

function normalizeRefs(values: unknown, field: string) {
  if (!Array.isArray(values)) {
    return [] as FamilyReference[];
  }
  return values
    .map((value, index) => normalizeRef(value, `${field}[${index}]`))
    .filter((value): value is FamilyReference => Boolean(value));
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`family orchestration 缺少布尔字段: ${field}`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`family orchestration 缺少正整数字段: ${field}`);
  }
  return Number(value);
}

function readStringList(values: unknown, field: string) {
  if (!Array.isArray(values)) {
    throw new Error(`family orchestration 缺少数组字段: ${field}`);
  }
  return values.map((value, index) => requireString(value, `${field}[${index}]`));
}

function optionalStringList(values: unknown, field: string) {
  if (values === null || values === undefined) {
    return [] as string[];
  }
  return readStringList(values, field);
}

function stableId(prefix: string, ...parts: unknown[]) {
  const source = parts.map((part) => String(part ?? '').trim()).join('|');
  const digest = createHash('sha1').update(source).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}

export function resolveProgramId(execution: unknown, fallback = 'opl_family_program') {
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

export function resolveActiveRunId(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

export function buildFamilyHumanGate(input: BuildFamilyHumanGateInput) {
  const evidenceRefs = normalizeRefs(input.evidence_refs, 'evidence_refs');
  const decisionOptions = Array.isArray(input.decision_options)
    ? input.decision_options.map((entry, index) => requireString(entry, `decision_options[${index}]`))
    : ['acknowledge'];
  const gate: JsonRecord = {
    version: 'family-human-gate.v1',
    gate_id: requireString(input.gate_id, 'gate_id'),
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    gate_kind: requireString(input.gate_kind, 'gate_kind'),
    requested_at: requireString(input.requested_at, 'requested_at'),
    status: optionalString(input.status) ?? 'requested',
    request_surface: {
      surface_kind: requireString(input.request_surface_kind, 'request_surface_kind'),
      surface_id: requireString(input.request_surface_id, 'request_surface_id'),
      ...(optionalString(input.command) ? { command: optionalString(input.command)! } : {}),
    },
    evidence_refs: evidenceRefs.length > 0
      ? evidenceRefs
      : [{ ref_kind: 'repo_path', ref: requireString(input.request_surface_id, 'request_surface_id'), label: 'request_surface' }],
    decision_options: decisionOptions,
  };
  if (isRecord(input.decision)) {
    gate.decision = { ...input.decision };
  }
  return gate;
}

export function buildFamilyActionGraphNode(input: FamilyActionGraphNodeInput) {
  return {
    node_id: requireString(input.node_id, 'node_id'),
    node_kind: requireString(input.node_kind, 'node_kind'),
    title: requireString(input.title, 'title'),
    ...(optionalString(input.surface_kind) ? { surface_kind: optionalString(input.surface_kind)! } : {}),
    ...(typeof input.produces_checkpoint === 'boolean'
      ? { produces_checkpoint: requireBoolean(input.produces_checkpoint, 'produces_checkpoint') }
      : {}),
  };
}

export function buildFamilyActionGraphEdge(input: FamilyActionGraphEdgeInput) {
  return {
    from: requireString(input.from, 'from'),
    to: requireString(input.to, 'to'),
    on: requireString(input.on, 'on'),
  };
}

export function buildFamilyActionGraphHumanGate(input: FamilyActionGraphHumanGateInput) {
  return {
    gate_id: requireString(input.gate_id, 'gate_id'),
    trigger_nodes: readStringList(input.trigger_nodes, 'trigger_nodes'),
    blocking: requireBoolean(input.blocking, 'blocking'),
  };
}

export function buildFamilyHumanGatePreview(input: BuildFamilyHumanGatePreviewInput) {
  const reviewSurface = normalizeRef(input.review_surface, 'review_surface');
  return {
    gate_id: requireString(input.gate_id, 'gate_id'),
    ...(optionalString(input.title) ? { title: optionalString(input.title)! } : {}),
    ...(optionalString(input.status) ? { status: optionalString(input.status)! } : {}),
    ...(reviewSurface ? { review_surface: reviewSurface } : {}),
  };
}

export function buildFamilyIntakeEvidenceCompanion(input: BuildFamilyIntakeEvidenceCompanionInput) {
  const intakeAudit = isRecord(input.intake_audit) ? input.intake_audit : null;
  if (!intakeAudit) {
    throw new Error('family orchestration 缺少 mapping 字段: intake_audit');
  }

  const trustRankedEvidenceRefs = Array.isArray(input.trust_ranked_evidence_refs)
    ? input.trust_ranked_evidence_refs
      .map((entry, index) => {
        if (!isRecord(entry)) {
          throw new Error(`family orchestration 缺少 mapping 字段: trust_ranked_evidence_refs[${index}]`);
        }
        const normalizedRef = normalizeRef(entry, `trust_ranked_evidence_refs[${index}]`);
        if (!normalizedRef) {
          throw new Error(`family orchestration reference 缺少字段: trust_ranked_evidence_refs[${index}]`);
        }
        const supports = optionalStringList(entry.supports, `trust_ranked_evidence_refs[${index}].supports`);
        return {
          ...normalizedRef,
          trust_rank: requirePositiveInteger(entry.trust_rank, `trust_ranked_evidence_refs[${index}].trust_rank`),
          ...(optionalString(entry.trust_note)
            ? { trust_note: optionalString(entry.trust_note)! }
            : {}),
          ...(supports.length > 0 ? { supports } : {}),
        };
      })
      .sort((left, right) => left.trust_rank - right.trust_rank || left.ref.localeCompare(right.ref))
    : [];
  if (trustRankedEvidenceRefs.length === 0) {
    throw new Error('family orchestration 缺少数组字段: trust_ranked_evidence_refs');
  }

  const groundingScope = isRecord(input.grounding_scope) ? input.grounding_scope : null;
  if (!groundingScope) {
    throw new Error('family orchestration 缺少 mapping 字段: grounding_scope');
  }
  const scopeRefs = normalizeRefs(groundingScope.scope_refs, 'grounding_scope.scope_refs');
  if (scopeRefs.length === 0) {
    throw new Error('family orchestration 缺少数组字段: grounding_scope.scope_refs');
  }

  const humanGateRefs = normalizeRefs(input.human_gate_refs, 'human_gate_refs');
  const checkpointLineageRefs = normalizeRefs(input.checkpoint_lineage_refs, 'checkpoint_lineage_refs');
  const intakeAuditSummaryRef = normalizeRef(intakeAudit.summary_ref, 'intake_audit.summary_ref');

  return {
    version: 'family-intake-evidence-companion.v1',
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    intake_audit: {
      summary: requireString(intakeAudit.summary, 'intake_audit.summary'),
      ...(optionalString(intakeAudit.verdict) ? { verdict: optionalString(intakeAudit.verdict)! } : {}),
      ...(optionalString(intakeAudit.audited_at) ? { audited_at: optionalString(intakeAudit.audited_at)! } : {}),
      ...(intakeAuditSummaryRef ? { summary_ref: intakeAuditSummaryRef } : {}),
    },
    trust_ranked_evidence_refs: trustRankedEvidenceRefs,
    grounding_scope: {
      scope_kind: requireString(groundingScope.scope_kind, 'grounding_scope.scope_kind'),
      summary: requireString(groundingScope.summary, 'grounding_scope.summary'),
      scope_refs: scopeRefs,
    },
    ...(humanGateRefs.length > 0 ? { human_gate_refs: humanGateRefs } : {}),
    ...(checkpointLineageRefs.length > 0 ? { checkpoint_lineage_refs: checkpointLineageRefs } : {}),
  };
}

export function buildFamilyProjectProfileCompanion(input: BuildFamilyProjectProfileCompanionInput) {
  const projectProfile = isRecord(input.project_profile) ? input.project_profile : null;
  if (!projectProfile) {
    throw new Error('family orchestration 缺少 mapping 字段: project_profile');
  }
  const preferenceSignals = readStringList(input.preference_signals, 'preference_signals');
  const groundingRefs = normalizeRefs(input.grounding_refs, 'grounding_refs');
  if (groundingRefs.length === 0) {
    throw new Error('family orchestration 缺少数组字段: grounding_refs');
  }
  const projectProfileSummaryRef = normalizeRef(projectProfile.summary_ref, 'project_profile.summary_ref');

  return {
    version: 'family-project-profile-companion.v1',
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    project_profile: {
      profile_id: requireString(projectProfile.profile_id, 'project_profile.profile_id'),
      project_kind: requireString(projectProfile.project_kind, 'project_profile.project_kind'),
      template_family: requireString(projectProfile.template_family, 'project_profile.template_family'),
      template_id: requireString(projectProfile.template_id, 'project_profile.template_id'),
      selection_mode: requireString(projectProfile.selection_mode, 'project_profile.selection_mode'),
      summary: requireString(projectProfile.summary, 'project_profile.summary'),
      ...(projectProfileSummaryRef ? { summary_ref: projectProfileSummaryRef } : {}),
    },
    preference_signals: preferenceSignals,
    grounding_refs: groundingRefs,
  };
}

export function buildExplicitCheckpointPolicy(input: BuildExplicitCheckpointPolicyInput) {
  return {
    mode: 'explicit_nodes',
    checkpoint_nodes: readStringList(input.checkpoint_nodes, 'checkpoint_nodes'),
  };
}

export function buildFamilyActionGraph(input: BuildFamilyActionGraphInput) {
  const nodes = input.nodes.map((node) => buildFamilyActionGraphNode(node));
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = input.edges.map((edge) => buildFamilyActionGraphEdge(edge));
  const entryNodes = readStringList(input.entry_nodes, 'entry_nodes');
  const exitNodes = readStringList(input.exit_nodes, 'exit_nodes');
  const humanGates = Array.isArray(input.human_gates)
    ? input.human_gates.map((gate) => buildFamilyActionGraphHumanGate(gate))
    : [];
  const checkpointPolicy = isRecord(input.checkpoint_policy)
    ? { ...input.checkpoint_policy }
    : buildExplicitCheckpointPolicy({
        checkpoint_nodes: nodes
          .filter((node) => node.produces_checkpoint)
          .map((node) => node.node_id),
      });

  for (const nodeId of [...entryNodes, ...exitNodes]) {
    if (!nodeIds.has(nodeId)) {
      throw new Error(`family action graph references unknown node_id: ${nodeId}`);
    }
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`family action graph edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
  }
  for (const gate of humanGates) {
    for (const nodeId of gate.trigger_nodes) {
      if (!nodeIds.has(nodeId)) {
        throw new Error(`family action graph gate references unknown node_id: ${nodeId}`);
      }
    }
  }

  return {
    version: 'family-action-graph.v1',
    graph_id: requireString(input.graph_id, 'graph_id'),
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    graph_kind: requireString(input.graph_kind, 'graph_kind'),
    graph_version: requireString(input.graph_version, 'graph_version'),
    nodes,
    edges,
    entry_nodes: entryNodes,
    exit_nodes: exitNodes,
    human_gates: humanGates,
    checkpoint_policy: checkpointPolicy,
  };
}

export function buildFamilyOrchestrationTemplate(input: BuildFamilyOrchestrationTemplateInput) {
  const actionGraph = isRecord(input.action_graph) ? { ...input.action_graph } : null;
  if (!actionGraph) {
    throw new Error('family orchestration 缺少 mapping 字段: action_graph');
  }
  const humanGates = Array.isArray(input.human_gates)
    ? input.human_gates.filter((gate): gate is JsonRecord => isRecord(gate)).map((gate) => ({ ...gate }))
    : [];
  const actionGraphRef = normalizeRef(input.action_graph_ref, 'action_graph_ref')
    ?? { ref_kind: 'json_pointer', ref: '/family_orchestration/action_graph', label: 'family action graph' };
  const eventEnvelopeSurface = normalizeRef(input.event_envelope_surface, 'event_envelope_surface');
  const checkpointLineageSurface = normalizeRef(input.checkpoint_lineage_surface, 'checkpoint_lineage_surface');
  const intakeEvidenceCompanion = isRecord(input.intake_evidence_companion)
    ? { ...input.intake_evidence_companion }
    : null;
  const projectProfileCompanion = isRecord(input.project_profile_companion)
    ? { ...input.project_profile_companion }
    : null;

  return {
    action_graph_ref: actionGraphRef,
    action_graph: actionGraph,
    human_gates: humanGates,
    resume_contract: {
      surface_kind: requireString(input.resume_surface_kind, 'resume_surface_kind'),
      session_locator_field: requireString(input.session_locator_field, 'session_locator_field'),
      checkpoint_locator_field: requireString(input.checkpoint_locator_field, 'checkpoint_locator_field'),
    },
    ...(eventEnvelopeSurface ? { event_envelope_surface: eventEnvelopeSurface } : {}),
    ...(checkpointLineageSurface ? { checkpoint_lineage_surface: checkpointLineageSurface } : {}),
    ...(intakeEvidenceCompanion ? { intake_evidence_companion: intakeEvidenceCompanion } : {}),
    ...(projectProfileCompanion ? { project_profile_companion: projectProfileCompanion } : {}),
  };
}

export function buildFamilyProductEntryOrchestration(input: BuildFamilyProductEntryOrchestrationInput) {
  const checkpointPolicy = Array.isArray(input.checkpoint_nodes)
    ? buildExplicitCheckpointPolicy({
        checkpoint_nodes: input.checkpoint_nodes,
      })
    : (isRecord(input.checkpoint_policy) ? { ...input.checkpoint_policy } : null);

  const humanGatePreviews = Array.isArray(input.human_gate_previews)
    ? input.human_gate_previews.map((preview) => buildFamilyHumanGatePreview(preview))
    : [];

  return buildFamilyOrchestrationTemplate({
    action_graph: buildFamilyActionGraph({
      graph_id: input.graph_id,
      target_domain_id: input.target_domain_id,
      graph_kind: input.graph_kind,
      graph_version: input.graph_version,
      nodes: input.nodes,
      edges: input.edges,
      entry_nodes: input.entry_nodes,
      exit_nodes: input.exit_nodes,
      human_gates: input.human_gates,
      ...(checkpointPolicy ? { checkpoint_policy: checkpointPolicy } : {}),
    }),
    human_gates: humanGatePreviews,
    resume_surface_kind: input.resume_surface_kind,
    session_locator_field: input.session_locator_field,
    checkpoint_locator_field: input.checkpoint_locator_field,
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
}

export function buildFamilyFrontdeskProductEntryOrchestration(
  input: BuildFamilyFrontdeskProductEntryOrchestrationInput,
) {
  const frontdeskNodeId = optionalString(input.frontdesk_node_id) ?? 'step:open_frontdesk';
  const directNodeId = optionalString(input.direct_node_id) ?? 'step:continue_current_loop';
  const federatedNodeId = optionalString(input.federated_node_id) ?? 'step:opl_bridge_handoff';
  const progressNodeId = optionalString(input.progress_node_id) ?? 'step:inspect_current_progress';
  const directTransitionEvent = optionalString(input.direct_transition_event) ?? 'start_direct';
  const federatedTransitionEvent = optionalString(input.federated_transition_event) ?? 'enter_via_opl_bridge';
  const directProgressEvent = optionalString(input.direct_progress_event) ?? 'session_started';
  const federatedProgressEvent = optionalString(input.federated_progress_event) ?? 'handoff_completed';
  const federatedTitle = optionalString(input.federated_title);
  const federatedSurfaceKind = optionalString(input.federated_surface_kind);

  if (Boolean(federatedTitle) !== Boolean(federatedSurfaceKind)) {
    throw new Error('family orchestration federated step requires both title and surface_kind');
  }

  const nodes: FamilyActionGraphNodeInput[] = [
    {
      node_id: frontdeskNodeId,
      node_kind: 'frontdoor',
      title: input.frontdesk_title,
      surface_kind: input.frontdesk_surface_kind,
    },
    {
      node_id: directNodeId,
      node_kind: 'direct_entry',
      title: input.direct_title,
      surface_kind: input.direct_surface_kind,
      produces_checkpoint: true,
    },
  ];
  const edges: FamilyActionGraphEdgeInput[] = [
    {
      from: frontdeskNodeId,
      to: directNodeId,
      on: directTransitionEvent,
    },
  ];
  const checkpointNodes = [directNodeId];

  if (federatedTitle && federatedSurfaceKind) {
    nodes.push({
      node_id: federatedNodeId,
      node_kind: 'federated_entry',
      title: federatedTitle,
      surface_kind: federatedSurfaceKind,
      produces_checkpoint: true,
    });
    edges.push({
      from: frontdeskNodeId,
      to: federatedNodeId,
      on: federatedTransitionEvent,
    });
    checkpointNodes.push(federatedNodeId);
  }

  nodes.push({
    node_id: progressNodeId,
    node_kind: 'progress_read',
    title: input.progress_title,
    surface_kind: input.progress_surface_kind,
    produces_checkpoint: true,
  });
  edges.push({
    from: directNodeId,
    to: progressNodeId,
    on: directProgressEvent,
  });
  if (federatedTitle && federatedSurfaceKind) {
    edges.push({
      from: federatedNodeId,
      to: progressNodeId,
      on: federatedProgressEvent,
    });
  }
  checkpointNodes.push(progressNodeId);

  return buildFamilyProductEntryOrchestration({
    graph_id: input.graph_id,
    target_domain_id: input.target_domain_id,
    graph_kind: input.graph_kind,
    graph_version: input.graph_version,
    nodes,
    edges,
    entry_nodes: [frontdeskNodeId],
    exit_nodes: [progressNodeId],
    human_gates: [
      {
        gate_id: input.review_gate_id,
        trigger_nodes: [progressNodeId],
        blocking: true,
      },
    ],
    checkpoint_nodes: checkpointNodes,
    human_gate_previews: [
      {
        gate_id: input.review_gate_id,
        ...(optionalString(input.review_gate_title) ? { title: optionalString(input.review_gate_title)! } : {}),
        status: optionalString(input.review_gate_status) ?? 'requested',
        ...(input.review_surface ? { review_surface: input.review_surface } : {}),
      },
    ],
    resume_surface_kind: input.resume_surface_kind,
    session_locator_field: input.session_locator_field,
    checkpoint_locator_field: input.checkpoint_locator_field,
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
}

export function buildFamilyOrchestrationCompanion(input: BuildFamilyOrchestrationCompanionInput) {
  const eventTime = optionalString(input.event_time) ?? new Date().toISOString();
  const surfaceKind = requireString(input.surface_kind, 'surface_kind');
  const surfaceId = requireString(input.surface_id, 'surface_id');
  const eventName = requireString(input.event_name, 'event_name');
  const sourceSurface = requireString(input.source_surface, 'source_surface');
  const sessionId = optionalString(input.session_id) ?? stableId('session', input.study_id, input.quest_id, eventName);
  const checkpointId = optionalString(input.checkpoint_id)
    ?? stableId('checkpoint', input.study_id, input.quest_id, input.runtime_decision, input.runtime_reason, eventName);
  const lineageId = stableId('lineage', sessionId, checkpointId);
  const envelopeId = stableId('evt', surfaceId, eventName, eventTime, sessionId, checkpointId);
  const correlationId = stableId('corr', sessionId, eventName, checkpointId);
  const activeRunId = resolveActiveRunId(input.active_run_id);
  const programId = optionalString(input.program_id) ?? resolveProgramId(null);
  const humanGates = Array.isArray(input.human_gates)
    ? input.human_gates.filter((gate): gate is JsonRecord => isRecord(gate)).map((gate) => ({ ...gate }))
    : [];
  const payload: JsonRecord = isRecord(input.payload) ? { ...input.payload } : {};
  if (optionalString(input.runtime_decision)) {
    payload.runtime_decision = optionalString(input.runtime_decision);
  }
  if (optionalString(input.runtime_reason)) {
    payload.runtime_reason = optionalString(input.runtime_reason);
  }

  const eventEnvelope: JsonRecord = {
    version: 'family-event-envelope.v1',
    envelope_id: envelopeId,
    event_name: eventName,
    event_time: eventTime,
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    producer: {
      surface_kind: surfaceKind,
      surface_id: surfaceId,
    },
    session: {
      session_id: sessionId,
      source_surface: sourceSurface,
      ...(activeRunId ? { active_run_id: activeRunId } : {}),
      ...(programId ? { program_id: programId } : {}),
      ...(optionalString(input.study_id) ? { study_id: optionalString(input.study_id)! } : {}),
      ...(optionalString(input.quest_id) ? { quest_id: optionalString(input.quest_id)! } : {}),
    },
    correlation: {
      correlation_id: correlationId,
      checkpoint_id: checkpointId,
      checkpoint_lineage_id: lineageId,
      ...(optionalString(input.action_graph_id) ? { action_graph_id: optionalString(input.action_graph_id)! } : {}),
      ...(optionalString(input.node_id) ? { node_id: optionalString(input.node_id)! } : {}),
      ...(optionalString(input.gate_id) ? { gate_id: optionalString(input.gate_id)! } : {}),
      ...(optionalString(input.parent_envelope_id) ? { parent_envelope_id: optionalString(input.parent_envelope_id)! } : {}),
      ...(optionalString(input.parent_session_id) ? { parent_session_id: optionalString(input.parent_session_id)! } : {}),
    },
    payload,
  };

  const auditRefs = normalizeRefs(input.audit_refs, 'audit_refs');
  if (auditRefs.length > 0) {
    eventEnvelope.audit_refs = auditRefs;
  }
  if (humanGates.length > 0) {
    const firstGate = humanGates[0];
    eventEnvelope.human_gate_hint = {
      gate_id: optionalString(firstGate.gate_id),
      status: optionalString(firstGate.status) ?? 'requested',
      ...(isRecord(firstGate.request_surface) ? { review_surface: { ...firstGate.request_surface } } : {}),
    };
  }

  const stateRefs = normalizeRefs(input.state_refs, 'state_refs');
  if (stateRefs.length === 0) {
    stateRefs.push({
      role: 'status',
      ref_kind: 'repo_path',
      ref: surfaceId,
      label: 'surface_status',
    });
  }
  const restorationEvidence = normalizeRefs(input.restoration_evidence, 'restoration_evidence');
  const checkpointLineage: JsonRecord = {
    version: 'family-checkpoint-lineage.v1',
    lineage_id: lineageId,
    checkpoint_id: checkpointId,
    target_domain_id: optionalString(input.target_domain_id) ?? 'unknown_domain',
    session: {
      session_id: sessionId,
      ...(activeRunId ? { active_run_id: activeRunId } : {}),
      ...(programId ? { program_id: programId } : {}),
    },
    producer: {
      event_envelope_id: envelopeId,
      ...(optionalString(input.action_graph_id) ? { action_graph_id: optionalString(input.action_graph_id)! } : {}),
      ...(optionalString(input.node_id) ? { node_id: optionalString(input.node_id)! } : {}),
      ...(optionalString(input.gate_id) ? { gate_id: optionalString(input.gate_id)! } : {}),
    },
    state_refs: stateRefs,
    resume_contract: {
      resume_mode: optionalString(input.resume_mode) ?? 'resume_from_checkpoint',
      resume_handle: optionalString(input.resume_handle) ?? `${surfaceKind}:${checkpointId}`,
      human_gate_required: Boolean(input.human_gate_required),
    },
    integrity: {
      status: 'complete',
      recorded_at: eventTime,
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
  if (restorationEvidence.length > 0) {
    checkpointLineage.restoration_evidence = restorationEvidence;
  }

  const template = buildFamilyOrchestrationTemplate({
    action_graph: isRecord(input.action_graph) ? input.action_graph : {},
    human_gates: humanGates,
    resume_surface_kind: optionalString(input.resume_surface_kind) ?? surfaceKind,
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
    human_gates: humanGates,
    family_human_gates: humanGates,
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

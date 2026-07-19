import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export const REVIEW_EVIDENCE_PROFILES = ['epistemic_provenance'] as const;
export const REVIEW_EVIDENCE_TRUST_MODELS = ['trusted_local_workspace'] as const;
export const REVIEW_SCOPE_KINDS = ['content', 'reference', 'display', 'package'] as const;
export const EVIDENCE_NODE_KINDS = ['artifact', 'claim', 'provenance'] as const;
export const EVIDENCE_NODE_ROLES = [
  'source_data',
  'context',
  'analysis_code',
  'analysis_parameters',
  'analysis_result',
  'claim',
  'reference_source',
  'citation_linkage',
  'limitation',
  'reproduction_instruction',
  'visual_content',
  'layout',
  'render_template',
  'package_content',
  'package_wrapper',
  'governance_metadata',
  'review_receipt',
] as const;
export const EVIDENCE_DEPENDENCY_RELATIONS = [
  'derived_from',
  'interprets',
  'supports',
  'cites',
  'renders',
  'packages',
  'reproduces',
] as const;
export const SEMANTIC_CHANGE_CLASSES = [
  'data',
  'context',
  'analysis_code',
  'analysis_parameters',
  'analysis_result',
  'claim',
  'reference_source',
  'citation_linkage',
  'limitation',
  'visual_content',
  'layout',
  'render_template',
  'package_composition',
  'package_wrapper',
  'governance_metadata',
  'review_receipt',
  'locator_only',
] as const;

export type ReviewEvidenceProfile = typeof REVIEW_EVIDENCE_PROFILES[number];
export type ReviewEvidenceTrustModel = typeof REVIEW_EVIDENCE_TRUST_MODELS[number];
export type ReviewScopeKind = typeof REVIEW_SCOPE_KINDS[number];
export type EvidenceNodeKind = typeof EVIDENCE_NODE_KINDS[number];
export type EvidenceNodeRole = typeof EVIDENCE_NODE_ROLES[number];
export type EvidenceDependencyRelation = typeof EVIDENCE_DEPENDENCY_RELATIONS[number];
export type SemanticChangeClass = typeof SEMANTIC_CHANGE_CLASSES[number];

export type EpistemicEvidenceNode = {
  node_ref: string;
  node_kind: EvidenceNodeKind;
  role: EvidenceNodeRole;
  locator?: {
    ref: string;
    sha256?: string | null;
  } | null;
};

export type EpistemicEvidenceEdge = {
  source_ref: string;
  dependent_ref: string;
  relation: EvidenceDependencyRelation;
};

export type EpistemicReviewScope = {
  surface_kind: 'opl_epistemic_review_scope';
  version: 'opl-epistemic-review-scope.v2';
  scope_id: string;
  scope_kind: ReviewScopeKind;
  evidence_profile: 'epistemic_provenance';
  trust_model: 'trusted_local_workspace';
  reviewed_node_refs: string[];
  nodes: EpistemicEvidenceNode[];
  dependency_edges: EpistemicEvidenceEdge[];
  authority_boundary: {
    hash_is_locator_or_stale_hint_only: true;
    hash_is_content_authority: false;
    release_integrity_is_separate: true;
    framework_can_issue_domain_verdict: false;
  };
};

export type EpistemicEvidenceChange = {
  node_ref: string;
  change_class: SemanticChangeClass;
  semantic_changed: boolean;
  locator_sha256_before?: string | null;
  locator_sha256_after?: string | null;
};

const NON_EPISTEMIC_ROLES = new Set<EvidenceNodeRole>([
  'governance_metadata',
  'review_receipt',
]);

const SCOPE_FORBIDDEN_ROLES: Record<ReviewScopeKind, ReadonlySet<EvidenceNodeRole>> = {
  content: new Set([
    'visual_content', 'layout', 'render_template', 'package_content', 'package_wrapper',
    'governance_metadata', 'review_receipt',
  ]),
  reference: new Set([
    'source_data', 'analysis_code', 'analysis_parameters', 'visual_content', 'layout',
    'render_template', 'package_content', 'package_wrapper', 'governance_metadata', 'review_receipt',
  ]),
  display: new Set(['package_content', 'package_wrapper', 'governance_metadata', 'review_receipt']),
  package: NON_EPISTEMIC_ROLES,
};

const CHANGE_CLASS_ROLES: Record<SemanticChangeClass, ReadonlySet<EvidenceNodeRole>> = {
  data: new Set(['source_data']),
  context: new Set(['context']),
  analysis_code: new Set(['analysis_code']),
  analysis_parameters: new Set(['analysis_parameters']),
  analysis_result: new Set(['analysis_result']),
  claim: new Set(['claim']),
  reference_source: new Set(['reference_source']),
  citation_linkage: new Set(['citation_linkage']),
  limitation: new Set(['limitation']),
  visual_content: new Set(['visual_content']),
  layout: new Set(['layout']),
  render_template: new Set(['render_template']),
  package_composition: new Set(['package_content']),
  package_wrapper: new Set(['package_wrapper']),
  governance_metadata: new Set(['governance_metadata']),
  review_receipt: new Set(['review_receipt']),
  locator_only: new Set(EVIDENCE_NODE_ROLES),
};

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} is not supported.`, {
      field,
      value: value ?? null,
      allowed,
    });
  }
  return value as T[number];
}

function record(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an object.`, { field });
  }
  return value as Record<string, unknown>;
}

function normalizeNode(value: unknown, index: number): EpistemicEvidenceNode {
  const input = record(value, `nodes[${index}]`);
  const locator = input.locator === undefined || input.locator === null
    ? null
    : record(input.locator, `nodes[${index}].locator`);
  const locatorSha256 = locator?.sha256;
  if (
    locatorSha256 !== undefined
    && locatorSha256 !== null
    && (typeof locatorSha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(locatorSha256))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `nodes[${index}].locator.sha256 must be a canonical optional SHA-256 locator.`,
    );
  }
  return {
    node_ref: requiredText(input.node_ref, `nodes[${index}].node_ref`),
    node_kind: enumValue(input.node_kind, EVIDENCE_NODE_KINDS, `nodes[${index}].node_kind`),
    role: enumValue(input.role, EVIDENCE_NODE_ROLES, `nodes[${index}].role`),
    ...(locator ? {
      locator: {
        ref: requiredText(locator.ref, `nodes[${index}].locator.ref`),
        sha256: typeof locatorSha256 === 'string' ? locatorSha256 : null,
      },
    } : {}),
  };
}

function normalizeEdge(value: unknown, index: number): EpistemicEvidenceEdge {
  const input = record(value, `dependency_edges[${index}]`);
  return {
    source_ref: requiredText(input.source_ref, `dependency_edges[${index}].source_ref`),
    dependent_ref: requiredText(input.dependent_ref, `dependency_edges[${index}].dependent_ref`),
    relation: enumValue(
      input.relation,
      EVIDENCE_DEPENDENCY_RELATIONS,
      `dependency_edges[${index}].relation`,
    ),
  };
}

function requiredUniqueRefs(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} requires at least one ref.`, { field });
  }
  const refs = value.map((entry, index) => requiredText(entry, `${field}[${index}]`));
  if (new Set(refs).size !== refs.length) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must not contain duplicate refs.`, { field });
  }
  return refs;
}

function requireAcyclicGraph(nodes: EpistemicEvidenceNode[], edges: EpistemicEvidenceEdge[]) {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source_ref, [...(outgoing.get(edge.source_ref) ?? []), edge.dependent_ref]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeRef: string) => {
    if (visiting.has(nodeRef)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Epistemic evidence dependency graph must be acyclic.',
        { cycle_at_ref: nodeRef },
      );
    }
    if (visited.has(nodeRef)) return;
    visiting.add(nodeRef);
    for (const dependentRef of outgoing.get(nodeRef) ?? []) visit(dependentRef);
    visiting.delete(nodeRef);
    visited.add(nodeRef);
  };
  for (const node of nodes) visit(node.node_ref);
}

export function normalizeEpistemicReviewScope(value: unknown): EpistemicReviewScope {
  const input = record(value, 'review_scope');
  if (
    input.surface_kind !== 'opl_epistemic_review_scope'
    || input.version !== 'opl-epistemic-review-scope.v2'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review currentness requires the generic OPL epistemic review scope v2.',
      { surface_kind: input.surface_kind ?? null, version: input.version ?? null },
    );
  }
  const scopeKind = enumValue(input.scope_kind, REVIEW_SCOPE_KINDS, 'scope_kind');
  if (
    input.evidence_profile !== 'epistemic_provenance'
    || input.trust_model !== 'trusted_local_workspace'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Content review evidence must use epistemic provenance in a trusted local workspace.',
      {
        evidence_profile: input.evidence_profile ?? null,
        trust_model: input.trust_model ?? null,
        release_integrity_must_use_separate_contract: true,
      },
    );
  }
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review scope requires evidence nodes.');
  }
  const nodes = input.nodes.map(normalizeNode);
  const nodeRefs = nodes.map((node) => node.node_ref);
  if (new Set(nodeRefs).size !== nodeRefs.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review scope node refs must be unique.');
  }
  const nodeByRef = new Map(nodes.map((node) => [node.node_ref, node]));
  const reviewedNodeRefs = requiredUniqueRefs(input.reviewed_node_refs, 'reviewed_node_refs');
  const missingReviewedRefs = reviewedNodeRefs.filter((nodeRef) => !nodeByRef.has(nodeRef));
  if (missingReviewedRefs.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Every reviewed node ref must exist in the evidence graph.',
      { missing_reviewed_node_refs: missingReviewedRefs },
    );
  }
  const edges = Array.isArray(input.dependency_edges)
    ? input.dependency_edges.map(normalizeEdge)
    : [];
  const danglingEdges = edges.filter((edge) => (
    !nodeByRef.has(edge.source_ref) || !nodeByRef.has(edge.dependent_ref)
  ));
  if (danglingEdges.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Every evidence dependency edge must connect declared nodes.',
      { dangling_edges: danglingEdges },
    );
  }
  if (edges.some((edge) => edge.source_ref === edge.dependent_ref)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Evidence dependency edges cannot be self-referential.');
  }
  requireAcyclicGraph(nodes, edges);
  const forbiddenRoles = nodes
    .filter((node) => SCOPE_FORBIDDEN_ROLES[scopeKind].has(node.role))
    .map((node) => ({ node_ref: node.node_ref, role: node.role }));
  if (forbiddenRoles.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review scope contains artifact roles outside its semantic domain.',
      { scope_kind: scopeKind, forbidden_nodes: forbiddenRoles },
    );
  }
  const authority = record(input.authority_boundary, 'authority_boundary');
  if (
    authority.hash_is_locator_or_stale_hint_only !== true
    || authority.hash_is_content_authority !== false
    || authority.release_integrity_is_separate !== true
    || authority.framework_can_issue_domain_verdict !== false
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Epistemic review scope authority boundary cannot promote hashes or Framework transport to domain truth.',
    );
  }
  return {
    surface_kind: 'opl_epistemic_review_scope',
    version: 'opl-epistemic-review-scope.v2',
    scope_id: requiredText(input.scope_id, 'scope_id'),
    scope_kind: scopeKind,
    evidence_profile: 'epistemic_provenance',
    trust_model: 'trusted_local_workspace',
    reviewed_node_refs: reviewedNodeRefs,
    nodes,
    dependency_edges: edges,
    authority_boundary: {
      hash_is_locator_or_stale_hint_only: true,
      hash_is_content_authority: false,
      release_integrity_is_separate: true,
      framework_can_issue_domain_verdict: false,
    },
  };
}

function dependencyClosure(scope: EpistemicReviewScope) {
  const sourcesByDependent = new Map<string, string[]>();
  for (const edge of scope.dependency_edges) {
    sourcesByDependent.set(edge.dependent_ref, [
      ...(sourcesByDependent.get(edge.dependent_ref) ?? []),
      edge.source_ref,
    ]);
  }
  const closure = new Set(scope.reviewed_node_refs);
  const pending = [...scope.reviewed_node_refs];
  while (pending.length > 0) {
    const dependentRef = pending.pop()!;
    for (const sourceRef of sourcesByDependent.get(dependentRef) ?? []) {
      if (closure.has(sourceRef)) continue;
      closure.add(sourceRef);
      pending.push(sourceRef);
    }
  }
  return closure;
}

function normalizeChange(value: unknown, index: number): EpistemicEvidenceChange {
  const input = record(value, `changes[${index}]`);
  if (typeof input.semantic_changed !== 'boolean') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `changes[${index}].semantic_changed must be boolean.`,
    );
  }
  return {
    node_ref: requiredText(input.node_ref, `changes[${index}].node_ref`),
    change_class: enumValue(input.change_class, SEMANTIC_CHANGE_CLASSES, `changes[${index}].change_class`),
    semantic_changed: input.semantic_changed,
    locator_sha256_before: typeof input.locator_sha256_before === 'string'
      ? input.locator_sha256_before
      : null,
    locator_sha256_after: typeof input.locator_sha256_after === 'string'
      ? input.locator_sha256_after
      : null,
  };
}

export function evaluateEpistemicReviewCurrentness(input: {
  scope: unknown;
  changes: unknown;
}) {
  const scope = normalizeEpistemicReviewScope(input.scope);
  if (!Array.isArray(input.changes)) {
    throw new FrameworkContractError('contract_shape_invalid', 'changes must be an array.');
  }
  const changes = input.changes.map(normalizeChange);
  const nodeByRef = new Map(scope.nodes.map((node) => [node.node_ref, node]));
  const closure = dependencyClosure(scope);
  const invalidatingChanges: EpistemicEvidenceChange[] = [];
  const ignoredChanges: Array<EpistemicEvidenceChange & { reason: string }> = [];
  for (const change of changes) {
    const node = nodeByRef.get(change.node_ref);
    if (!node) {
      ignoredChanges.push({ ...change, reason: 'outside_declared_evidence_graph' });
      continue;
    }
    if (!CHANGE_CLASS_ROLES[change.change_class].has(node.role)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Semantic change class does not match the declared evidence node role.',
        { node_ref: change.node_ref, node_role: node.role, change_class: change.change_class },
      );
    }
    if (!change.semantic_changed || change.change_class === 'locator_only') {
      ignoredChanges.push({ ...change, reason: 'locator_or_non_semantic_change_only' });
      continue;
    }
    if (NON_EPISTEMIC_ROLES.has(node.role)) {
      ignoredChanges.push({ ...change, reason: 'governance_or_review_metadata_is_not_content_evidence' });
      continue;
    }
    if (!closure.has(change.node_ref)) {
      ignoredChanges.push({ ...change, reason: 'outside_reviewed_dependency_closure' });
      continue;
    }
    invalidatingChanges.push(change);
  }
  return {
    surface_kind: 'opl_epistemic_review_currentness_evaluation' as const,
    version: 'opl-epistemic-review-currentness-evaluation.v2' as const,
    scope_id: scope.scope_id,
    scope_kind: scope.scope_kind,
    status: invalidatingChanges.length > 0 ? 'stale' as const : 'current' as const,
    invalidating_changes: invalidatingChanges,
    ignored_changes: ignoredChanges,
    reviewed_dependency_refs: [...closure].sort(),
    authority_boundary: scope.authority_boundary,
  };
}

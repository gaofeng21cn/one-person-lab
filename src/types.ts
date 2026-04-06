export interface WorkstreamContract {
  workstream_id: string;
  label: string;
  status: string;
  description: string;
  domain_id: string;
  entry_mode: string;
  primary_families: string[];
  top_level_intents: string[];
  notes: string;
}

export interface DomainContract {
  domain_id: string;
  label: string;
  project: string;
  role: string;
  gateway_surface: string;
  harness_surface: string;
  standalone_allowed: boolean;
  owned_workstreams: string[];
  non_opl_families: string[];
  canonical_truth_owner: string[];
}

export interface RoutingSpecialCase {
  family: string;
  direct_workstream?: string;
  domain_id: string;
  auto_workstream?: string | null;
  notes: string;
}

export interface RoutingVocabularyContract {
  version: string;
  intent_id: string[];
  workstream_id: string[];
  domain_id: string[];
  request_kind: string[];
  target_kind: string[];
  delivery_kind: string[];
  review_kind: string[];
  entry_mode: string[];
  routing_rules: string[];
  special_cases: RoutingSpecialCase[];
}

export interface TaskTopologyWorkstream {
  workstream_id: string;
  label: string;
  boundary_state: string;
  registry_state: string;
  routing_state: string;
  current_domain_id: string | null;
  entry_surface: string | null;
  formal_domain_required: boolean;
  delivery_objects: string[];
  typical_tasks: string[];
  reuse_dependencies: string[];
  family_boundary_notes: Array<{
    family_id: string;
    relation: string;
  }>;
  notes: string;
}

export interface TaskTopologyContract {
  version: string;
  scope: string;
  description: string;
  non_goals: string[];
  topology_rules: string[];
  shared_foundation_reuse: string[];
  workstreams: TaskTopologyWorkstream[];
}

export interface WorkstreamsRegistry {
  version: string;
  workstreams: WorkstreamContract[];
}

export interface DomainsRegistry {
  version: string;
  domains: DomainContract[];
}

export interface GatewayContracts {
  contractsDir: string;
  workstreams: WorkstreamsRegistry;
  domains: DomainsRegistry;
  routingVocabulary: RoutingVocabularyContract;
  taskTopology: TaskTopologyContract;
}

export interface ResolveRequestInput {
  intent: string;
  target: string;
  goal: string;
  preferredFamily?: string;
  requestKind?: string;
}

export type ResolutionResult =
  | {
      status: 'routed';
      request_kind: string;
      workstream_id: string;
      domain_id: string;
      entry_surface: 'domain_gateway';
      recommended_family: string | null;
      confidence: 'medium' | 'high';
      reason: string;
      routing_evidence: string[];
    }
  | {
      status: 'domain_boundary';
      request_kind: string;
      domain_id: string;
      workstream_id: null;
      recommended_family: string | null;
      reason: string;
      routing_evidence: string[];
    }
  | {
      status: 'unknown_domain';
      request_kind: string;
      candidate_workstream_id: string;
      reason: string;
      routing_evidence: string[];
    }
  | {
      status: 'ambiguous';
      request_kind: string;
      candidate_workstream_ids: string[];
      candidate_domain_ids: string[];
      reason: string;
      routing_evidence: string[];
    };

export interface BoundaryExplanation {
  request_summary: string;
  resolved_domain: string | null;
  resolved_workstream_id: string | null;
  candidate_workstream_id?: string;
  candidate_workstream_ids?: string[];
  reason: string;
  rejected_domains: Array<{
    domain_id: string;
    reason: string;
  }>;
}

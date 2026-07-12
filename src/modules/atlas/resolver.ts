import { findDomainOrThrow, findWorkstreamOrThrow } from '../charter/index.ts';
import {
  assertStandardAgentDescriptorIdentity,
  readStandardAgentDescriptorInterface,
  type StandardAgentInterface,
} from '../../kernel/standard-agent-interface.ts';
import { readPackageManagedStandardAgentDescriptor } from '../connect/standard-agent-interface-discovery.ts';
import type {
  BoundaryExplanation,
  DomainContract,
  FrameworkContracts,
  ResolveRequestInput,
  ResolutionResult,
  WorkstreamContract,
} from '../../kernel/types.ts';

function normalizedSignal(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') ?? '';
}

function requestKind(input: ResolveRequestInput): string {
  return input.requestKind ?? 'discover';
}

function explicitSignals(input: ResolveRequestInput) {
  return [...new Set([
    normalizedSignal(input.preferredFamily),
    normalizedSignal(input.intent),
    normalizedSignal(input.target),
    normalizedSignal(input.requestKind),
  ].filter(Boolean))];
}

function normalizedSet(values: readonly string[]) {
  return new Set(values.map(normalizedSignal).filter(Boolean));
}

function domainIdentitySignals(domain: DomainContract) {
  return normalizedSet([
    domain.domain_id,
    domain.project,
    domain.label,
    domain.independent_domain_agent.agent_id,
    domain.single_app_skill.skill_id,
    domain.single_app_skill.plugin_name,
  ]);
}

function domainStandardInterface(domain: DomainContract): StandardAgentInterface | null {
  const configuredRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim();
  const packageManaged = readPackageManagedStandardAgentDescriptor([
    domain.independent_domain_agent.agent_id,
    domain.project,
    domain.single_app_skill.skill_id,
  ]);
  if (packageManaged) {
    return assertStandardAgentDescriptorIdentity(packageManaged, {
      project: domain.project,
      domain_id: domain.domain_id,
    }).interface;
  }
  if (configuredRoot) {
    const descriptor = readStandardAgentDescriptorInterface(`${configuredRoot}/${domain.project}`);
    if (descriptor) {
      return assertStandardAgentDescriptorIdentity(descriptor, {
        project: domain.project,
        domain_id: domain.domain_id,
      }).interface;
    }
  }
  return null;
}

function workstreamSignals(workstream: WorkstreamContract) {
  return normalizedSet([
    workstream.workstream_id,
    ...workstream.primary_families,
    ...workstream.top_level_intents,
  ]);
}

function matchingWorkstreams(
  signals: string[],
  goal: string,
  contracts: FrameworkContracts,
  domainInterfaces: Map<string, StandardAgentInterface | null>,
) {
  return contracts.workstreams.workstreams.filter((workstream) => {
    if (workstream.status !== 'active') return false;
    const accepted = workstreamSignals(workstream);
    const domainRouting = domainInterfaces.get(workstream.domain_id)?.routing;
    for (const signal of [
      ...(domainRouting?.workstream_ids ?? []),
      ...(domainRouting?.intent_signals ?? []),
    ]) accepted.add(normalizedSignal(signal));
    const normalizedGoal = `_${normalizedSignal(goal)}_`;
    const declaredGoalSignals = domainRouting?.intent_signals.map(normalizedSignal) ?? [];
    return signals.some((signal) => accepted.has(signal))
      || declaredGoalSignals.some((signal) => signal && normalizedGoal.includes(`_${signal}_`));
  });
}

function selectedWorkstream(
  input: ResolveRequestInput,
  workstream: WorkstreamContract,
  evidence: string[],
): ResolutionResult {
  return {
    status: 'selected_domain_agent_entry',
    request_kind: requestKind(input),
    workstream_id: workstream.workstream_id,
    domain_id: workstream.domain_id,
    entry_surface: 'domain_agent_entry',
    recommended_family: input.preferredFamily ?? workstream.primary_families[0] ?? null,
    confidence: 'high',
    reason: `The normalized routing signal selects admitted workstream ${workstream.workstream_id}.`,
    selection_evidence: evidence,
  };
}

export function resolveRequestSurface(
  input: ResolveRequestInput,
  contracts: FrameworkContracts,
): ResolutionResult {
  const signals = explicitSignals(input);
  const domainInterfaces = new Map(contracts.domains.domains.map((domain) => [
    domain.domain_id,
    domainStandardInterface(domain),
  ]));
  const workstreamMatches = matchingWorkstreams(signals, input.goal, contracts, domainInterfaces);

  if (workstreamMatches.length === 1) {
    const workstream = workstreamMatches[0];
    return selectedWorkstream(input, workstream, [
      `normalized_signal=${signals.find((signal) => {
        const accepted = workstreamSignals(workstream);
        const routing = domainInterfaces.get(workstream.domain_id)?.routing;
        for (const candidate of [...(routing?.workstream_ids ?? []), ...(routing?.intent_signals ?? [])]) {
          accepted.add(normalizedSignal(candidate));
        }
        return accepted.has(signal);
      })}`,
      `workstream=${workstream.workstream_id}`,
      `domain=${workstream.domain_id}`,
    ]);
  }

  if (workstreamMatches.length > 1) {
    return {
      status: 'ambiguous_task',
      request_kind: requestKind(input),
      candidate_workstreams: workstreamMatches.map((entry) => entry.workstream_id),
      candidate_domains: [...new Set(workstreamMatches.map((entry) => entry.domain_id))],
      reason: 'Multiple admitted workstreams match the explicit normalized routing signals.',
      selection_evidence: signals.map((signal) => `normalized_signal=${signal}`),
      required_clarification: ['Select one admitted workstream or one Standard Agent explicitly.'],
    };
  }

  const domainMatches = contracts.domains.domains.filter((domain) => {
    const identities = domainIdentitySignals(domain);
    for (const alias of domainInterfaces.get(domain.domain_id)?.routing.explicit_aliases ?? []) {
      identities.add(normalizedSignal(alias));
    }
    return signals.some((signal) => identities.has(signal));
  });
  if (domainMatches.length === 1) {
    const domain = domainMatches[0];
    const activeOwnedWorkstreams = domain.owned_workstreams
      .map((workstreamId) => contracts.workstreams.workstreams.find((entry) =>
        entry.workstream_id === workstreamId && entry.status === 'active'
      ))
      .filter((entry): entry is WorkstreamContract => Boolean(entry));
    if (activeOwnedWorkstreams.length === 1) {
      return selectedWorkstream(input, activeOwnedWorkstreams[0], [
        `explicit_domain=${domain.domain_id}`,
        `agent_id=${domain.independent_domain_agent.agent_id}`,
        `workstream=${activeOwnedWorkstreams[0].workstream_id}`,
      ]);
    }
    return {
      status: 'domain_boundary',
      request_kind: requestKind(input),
      domain_id: domain.domain_id,
      workstream_id: null,
      recommended_family: input.preferredFamily ?? null,
      reason: `The explicit signal selects domain ${domain.domain_id}, but no single active workstream can be inferred.`,
      selection_evidence: [`explicit_domain=${domain.domain_id}`, 'single_workstream_inference=withheld'],
    };
  }

  const preferredFamily = normalizedSignal(input.preferredFamily);
  if (preferredFamily) {
    const familyOwners = contracts.domains.domains.filter((domain) =>
      normalizedSet(domain.non_opl_families).has(preferredFamily)
    );
    if (familyOwners.length === 1) {
      return {
        status: 'domain_boundary',
        request_kind: requestKind(input),
        domain_id: familyOwners[0].domain_id,
        workstream_id: null,
        recommended_family: input.preferredFamily ?? null,
        reason: `The requested family is owned by ${familyOwners[0].domain_id} but is not an admitted workstream alias.`,
        selection_evidence: [
          `preferred_family=${preferredFamily}`,
          `family_owner=${familyOwners[0].domain_id}`,
          'workstream_auto_mapping=withheld',
        ],
      };
    }
  }

  const unadmittedWorkstream = contracts.taskTopology.workstreams.find((workstream) => {
    if (workstream.selection_state === 'domain_agent_entry_ready') return false;
    const accepted = normalizedSet([workstream.workstream_id, ...workstream.typical_tasks]);
    return signals.some((signal) => accepted.has(signal));
  });
  if (unadmittedWorkstream) {
    return {
      status: 'unknown_domain',
      request_kind: requestKind(input),
      candidate_workstream_id: unadmittedWorkstream.workstream_id,
      reason: `${unadmittedWorkstream.workstream_id} is recognized by the task topology but has no active admitted workstream owner.`,
      selection_evidence: [
        `candidate_workstream=${unadmittedWorkstream.workstream_id}`,
        'active_workstream_owner=missing',
      ],
    };
  }

  return {
    status: 'ambiguous_task',
    request_kind: requestKind(input),
    candidate_workstreams: [],
    candidate_domains: [],
    reason: 'No explicit normalized routing signal selects an admitted workstream or Standard Agent.',
    selection_evidence: signals.length > 0
      ? signals.map((signal) => `unmatched_normalized_signal=${signal}`)
      : ['normalized_routing_signal=missing'],
    required_clarification: [
      'Select a Standard Agent, admitted workstream, primary family, or top-level intent.',
    ],
  };
}

export function explainDomainBoundary(
  input: ResolveRequestInput,
  contracts: FrameworkContracts,
): BoundaryExplanation {
  const resolution = resolveRequestSurface(input, contracts);
  const base = {
    request_summary: input.goal,
    boundary_status: resolution.status,
    boundary_evidence: resolution.selection_evidence,
  } as const;

  switch (resolution.status) {
    case 'selected_domain_agent_entry': {
      const domain = findDomainOrThrow(contracts, resolution.domain_id);
      const workstream = findWorkstreamOrThrow(contracts, resolution.workstream_id);
      return {
        ...base,
        resolved_domain: domain.domain_id,
        resolved_workstream_id: workstream.workstream_id,
        reason: `${workstream.label} is the admitted workstream selected by the explicit routing signal; ${domain.label} owns its domain truth and authority.`,
        rejected_domains: contracts.domains.domains
          .filter((entry) => entry.domain_id !== domain.domain_id)
          .map((entry) => ({
            domain_id: entry.domain_id,
            reason: 'No explicit normalized routing signal selected this domain.',
          })),
      };
    }
    case 'domain_boundary': {
      const domain = findDomainOrThrow(contracts, resolution.domain_id);
      return {
        ...base,
        resolved_domain: domain.domain_id,
        resolved_workstream_id: null,
        reason: `${domain.label} owns the selected family or domain boundary, but OPL cannot infer one active workstream.`,
        rejected_domains: contracts.domains.domains
          .filter((entry) => entry.domain_id !== domain.domain_id)
          .map((entry) => ({
            domain_id: entry.domain_id,
            reason: 'This domain does not declare ownership of the selected explicit family boundary.',
          })),
      };
    }
    case 'unknown_domain':
      return {
        ...base,
        resolved_domain: null,
        resolved_workstream_id: null,
        candidate_workstream_id: resolution.candidate_workstream_id,
        reason: `${resolution.candidate_workstream_id} has no active admitted domain owner.`,
        rejected_domains: contracts.domains.domains.map((entry) => ({
          domain_id: entry.domain_id,
          reason: 'The domain registry does not assign this candidate workstream to the domain.',
        })),
      };
    case 'ambiguous_task':
      return {
        ...base,
        resolved_domain: null,
        resolved_workstream_id: null,
        candidate_workstreams: resolution.candidate_workstreams,
        candidate_domains: resolution.candidate_domains,
        reason: 'OPL stops before inventing domain semantics when normalized routing signals are absent or ambiguous.',
        required_clarification: resolution.required_clarification,
        rejected_domains: contracts.domains.domains.map((entry) => ({
          domain_id: entry.domain_id,
          reason: 'No unique explicit normalized routing signal selected this domain.',
        })),
      };
  }
}

export function describeWorkstreamBoundary(
  contracts: FrameworkContracts,
  workstreamId: string,
) {
  return findWorkstreamOrThrow(contracts, workstreamId);
}

export function describeDomainBoundary(
  contracts: FrameworkContracts,
  domainId: string,
) {
  return findDomainOrThrow(contracts, domainId);
}

export { resolveRequestSurface as selectDomainAgentEntry };

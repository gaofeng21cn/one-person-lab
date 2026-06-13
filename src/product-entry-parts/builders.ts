import { findDomainOrThrow } from '../contracts.ts';
import { buildHandoffBundle } from '../handoff-bundle.ts';
import type {
  BoundaryExplanation,
  DomainAgentSelectionInput,
  FrameworkContracts,
  ResolutionResult,
} from '../types.ts';
import type { ProductEntryCliInput, ProductEntryMode } from './types.ts';

export function buildDomainAgentSelectionInput(
  input: ProductEntryCliInput,
): DomainAgentSelectionInput {
  return {
    intent: input.intent,
    target: input.target,
    goal: input.goal,
    preferredFamily: input.preferredFamily,
    requestKind: input.requestKind,
  };
}

export function buildContractsContext(contracts: FrameworkContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

export function buildPromptHeader(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  resolution: ResolutionResult,
  boundary: BoundaryExplanation,
  contracts: FrameworkContracts,
) {
  const domainId = 'domain_id' in resolution ? resolution.domain_id : null;
  const domain =
    domainId && resolution.status !== 'ambiguous_task'
      ? findDomainOrThrow(contracts, domainId)
      : null;

  const lines = [
    'You are continuing a session that started from the One Person Lab (OPL) Product Entry.',
    '',
    'OPL stage-selection contract:',
    `- mode: ${mode}`,
    '- executor_backend: codex',
    `- goal: ${input.goal}`,
    `- intent: ${input.intent}`,
    `- target: ${input.target}`,
    `- request_kind: ${input.requestKind ?? 'product_entry'}`,
    `- stage_selection_status: ${resolution.status}`,
    `- boundary_status: ${boundary.boundary_status}`,
    `- workspace_locator: ${input.workspacePath ?? 'not_provided'}`,
  ];

  if ('workstream_id' in resolution && resolution.workstream_id) {
    lines.push(`- resolved_workstream_id: ${resolution.workstream_id}`);
  }

  if ('candidate_workstream_id' in resolution) {
    lines.push(`- candidate_workstream_id: ${resolution.candidate_workstream_id}`);
  }

  if (domain) {
    lines.push(`- resolved_domain_id: ${domain.domain_id}`);
    lines.push(`- resolved_domain_project: ${domain.project}`);
    lines.push(`- independent_domain_agent: ${domain.independent_domain_agent.agent_id}`);
    lines.push(`- single_app_skill: ${domain.single_app_skill.skill_id}`);
    lines.push(`- domain_truth_owner: ${domain.domain_truth_owner.join(', ')}`);
    lines.push(`- opl_projection_role: ${domain.opl_projection_role.join(', ')}`);
  }

  if ('recommended_family' in resolution && resolution.recommended_family) {
    lines.push(`- recommended_family: ${resolution.recommended_family}`);
  }

  if (input.skills.length > 0) {
    lines.push(`- requested_skills: ${input.skills.join(', ')}`);
  }

  lines.push(`- selection_reason: ${resolution.reason}`);
  lines.push(`- boundary_reason: ${boundary.reason}`);
  lines.push(`- selection_evidence: ${resolution.selection_evidence.join(' | ')}`);
  lines.push(`- boundary_evidence: ${boundary.boundary_evidence.join(' | ')}`);
  lines.push('');
  lines.push('Hard boundary rules:');
  lines.push(
    '- Respect the OPL stage-selection result. Do not claim that OPL itself owns domain runtime truth or domain publication truth.',
  );
  lines.push(
    '- If a domain-agent entry is selected, continue within that domain boundary. If it is unknown or ambiguous, help the user clarify without inventing admission or handoff readiness.',
  );
  lines.push('- Runtime substrate follows the Codex-default OPL Product Entry path.');
  lines.push('');
  lines.push('User request:');
  lines.push(input.goal);
  lines.push('');

  if (mode === 'ask') {
    lines.push('Task: answer the user directly, practically, and within the selected domain boundary above.');
  } else {
    lines.push(
      'Task: acknowledge the OPL handoff briefly, then continue the conversation as the active session for this request.',
    );
  }

  return lines.join('\n');
}

export function buildProductEntrySessionPrompt(contracts: FrameworkContracts) {
  const domainLines = contracts.domains.domains.map((domain) => {
    const workstreams = domain.owned_workstreams.join(', ');
    return `- ${domain.domain_id}: ${domain.independent_domain_agent.agent_id} app skill ${domain.single_app_skill.skill_id} -> workstreams: ${workstreams}`;
  });
  const workstreamLines = contracts.workstreams.workstreams.map((workstream) => {
    const families = workstream.primary_families.join(', ');
    return `- ${workstream.workstream_id}: ${workstream.label} -> primary families: ${families}`;
  });

  return [
    'You are the One Person Lab (OPL) Product Entry.',
    'Your role is to be the default natural-language entry for OPL and select stage entries to the correct domain or family boundary.',
    '',
    'Current admitted domains:',
    ...domainLines,
    '',
    'Current admitted workstreams:',
    ...workstreamLines,
    '',
    'Hard boundary rules:',
    '- OPL is a stage-led, Agent executor-based family framework shell. It is not the runtime truth owner of any domain.',
    '- Keep work inside admitted domain boundaries and family boundaries. Do not invent admission or hosted readiness.',
    '- Codex CLI is the default concrete executor for this product-entry session.',
    '',
    'Task:',
    '- Greet briefly and keep momentum.',
    '- Clarify only when required.',
    '- If the task maps to an admitted domain or family, continue with that boundary explicitly.',
    '- If it does not, explain the boundary honestly and help the user refine the request.',
  ].join('\n');
}

function buildHandoffBundleInput(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  stageSelection: ResolutionResult,
  boundary: BoundaryExplanation,
) {
  return {
    mode,
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    stageSelection,
    boundary,
  };
}

export function buildProductEntryHandoffBundle(
  contracts: FrameworkContracts,
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  stageSelection: ResolutionResult,
  boundary: BoundaryExplanation,
  sessionId?: string,
) {
  return buildHandoffBundle(contracts, {
    ...buildHandoffBundleInput(mode, input, stageSelection, boundary),
    sessionId,
  });
}

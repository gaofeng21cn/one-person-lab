import { findDomainOrThrow } from '../contracts.ts';
import { buildHandoffBundle } from '../handoff-bundle.ts';
import type {
  BoundaryExplanation,
  GatewayContracts,
  ResolutionResult,
  ResolveRequestInput,
} from '../types.ts';
import type {
  ProductEntryCliInput,
  ProductEntryExecutor,
  ProductEntryMode,
} from './types.ts';

export function appendHermesOptions(
  args: string[],
  input: Pick<ProductEntryCliInput, 'model' | 'provider' | 'skills'>,
) {
  if (input.model) {
    args.push('--model', input.model);
  }

  if (input.provider) {
    args.push('--provider', input.provider);
  }

  if (input.skills.length > 0) {
    args.push('--skills', input.skills.join(','));
  }

  args.push('--source', 'opl-product-entry');
  return args;
}

export function buildResolveRequestInput(input: ProductEntryCliInput): ResolveRequestInput {
  return {
    intent: input.intent,
    target: input.target,
    goal: input.goal,
    preferredFamily: input.preferredFamily,
    requestKind: input.requestKind,
  };
}

export function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

export function resolveProductEntryExecutor(input: ProductEntryCliInput): ProductEntryExecutor {
  return input.executor ?? 'codex';
}

export function buildPromptHeader(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  resolution: ResolutionResult,
  boundary: BoundaryExplanation,
  contracts: GatewayContracts,
) {
  const domainId = 'domain_id' in resolution ? resolution.domain_id : null;
  const domain =
    domainId && resolution.status !== 'ambiguous_task'
      ? findDomainOrThrow(contracts, domainId)
      : null;

  const lines = [
    'You are continuing a session that started from the One Person Lab (OPL) Product Entry.',
    '',
    'OPL routing contract:',
    `- mode: ${mode}`,
    `- requested_executor: ${resolveProductEntryExecutor(input)}`,
    `- goal: ${input.goal}`,
    `- intent: ${input.intent}`,
    `- target: ${input.target}`,
    `- request_kind: ${input.requestKind ?? 'product_entry'}`,
    `- routing_status: ${resolution.status}`,
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
    lines.push(`- domain_gateway_surface: ${domain.gateway_surface}`);
    lines.push(`- domain_harness_surface: ${domain.harness_surface}`);
  }

  if ('recommended_family' in resolution && resolution.recommended_family) {
    lines.push(`- recommended_family: ${resolution.recommended_family}`);
  }

  if (input.skills.length > 0) {
    lines.push(`- requested_skills: ${input.skills.join(', ')}`);
  }

  lines.push(`- routing_reason: ${resolution.reason}`);
  lines.push(`- boundary_reason: ${boundary.reason}`);
  lines.push(`- routing_evidence: ${resolution.routing_evidence.join(' | ')}`);
  lines.push(`- boundary_evidence: ${boundary.boundary_evidence.join(' | ')}`);
  lines.push('');
  lines.push('Hard boundary rules:');
  lines.push(
    '- Respect the OPL routing result. Do not claim that OPL itself owns domain runtime truth or domain publication truth.',
  );
  lines.push(
    '- If the request is routed, continue within that domain boundary. If it is unknown or ambiguous, help the user clarify without inventing admission or handoff readiness.',
  );
  lines.push(
    '- Runtime substrate follows the requested executor; Hermes is used only when explicitly selected.',
  );
  lines.push('');
  lines.push('User request:');
  lines.push(input.goal);
  lines.push('');

  if (mode === 'ask') {
    lines.push('Task: answer the user directly, practically, and within the routing boundary above.');
  } else {
    lines.push(
      'Task: acknowledge the OPL handoff briefly, then continue the conversation as the active session for this request.',
    );
  }

  return lines.join('\n');
}

export function buildAskArgs(
  input: ProductEntryCliInput,
  prompt: string,
) {
  return appendHermesOptions(['chat', '--query', prompt, '--quiet'], input);
}

export function buildChatSeedArgs(
  input: ProductEntryCliInput,
  prompt: string,
) {
  return appendHermesOptions(['chat', '--query', prompt, '--quiet'], input);
}

export function buildProductEntryFrontdoorPrompt(contracts: GatewayContracts) {
  const domainLines = contracts.domains.domains.map((domain) => {
    const workstreams = domain.owned_workstreams.join(', ');
    return `- ${domain.domain_id}: ${domain.gateway_surface} -> workstreams: ${workstreams}`;
  });
  const workstreamLines = contracts.workstreams.workstreams.map((workstream) => {
    const families = workstream.primary_families.join(', ');
    return `- ${workstream.workstream_id}: ${workstream.label} -> primary families: ${families}`;
  });

  return [
    'You are the One Person Lab (OPL) Product Entry.',
    'Your role is to be the default natural-language entry for OPL and route requests to the correct domain or family boundary.',
    '',
    'Current admitted domains:',
    ...domainLines,
    '',
    'Current admitted workstreams:',
    ...workstreamLines,
    '',
    'Hard boundary rules:',
    '- OPL is a gateway and federation shell. It is not the runtime truth owner of any domain.',
    '- Keep work inside admitted domain boundaries and family boundaries. Do not invent admission or hosted readiness.',
    '- Codex is the default runtime substrate for this product-entry session.',
    '- Hermes remains available only when explicitly requested.',
    '',
    'Task:',
    '- Greet briefly and keep momentum.',
    '- Clarify only when required.',
    '- If the task maps to an admitted domain or family, continue with that boundary explicitly.',
    '- If it does not, explain the boundary honestly and help the user refine the request.',
  ].join('\n');
}

export function buildHandoffBundleInput(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  routing: ResolutionResult,
  boundary: BoundaryExplanation,
) {
  return {
    mode,
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    routing,
    boundary,
  };
}

export function buildProductEntryHandoffBundle(
  contracts: GatewayContracts,
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  routing: ResolutionResult,
  boundary: BoundaryExplanation,
  sessionId?: string,
) {
  return buildHandoffBundle(contracts, {
    ...buildHandoffBundleInput(mode, input, routing, boundary),
    sessionId,
  });
}

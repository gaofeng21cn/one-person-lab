import {
  buildAgentProfileCatalog,
  buildAgentProfileConformance,
  buildAgentProfileInspect,
  buildAgentProfileSelection,
  buildProfileCapabilityPlan,
  PROFILE_PATTERN_PACKET_OPTIONS,
  PROFILE_REFERENCE_SOURCE_OPTIONS,
} from '../../../../modules/pack/index.ts';
import {
  parseRegisteredCommandOptions,
  type CommandSpec,
} from '../../modules/support.ts';

function optionStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}
function aliasOptions(flags: readonly string[], summary: string) {
  return flags.map((flag) => ({
    name: flag.slice(2),
    flag,
    value_kind: 'string' as const,
    summary,
    multiple: true,
  }));
}

function aliasedOptionStrings(
  options: Record<string, unknown>,
  flags: readonly string[],
) {
  return flags.flatMap((flag) => optionStrings(options[flag.slice(2)]));
}

export function buildProfileCommandSpecs(): Record<string, CommandSpec> {
  const selectSpec: CommandSpec = {
    usage: 'opl profiles select --intent <intent text> [--intent-signal <canonical-signal>] [--reference-source <source-ref>] [--pattern-packet <packet-ref>]',
    summary: 'Return a refs-only profile-selection receipt; canonical intent signals match catalog triggers exactly, while reference sources remain the design source.',
    examples: [
      'opl profiles select --intent "colorectal surgery risk decision support with guideline evidence" --json',
      'opl profiles select --intent "workshop scheduling agent" --reference-source paper-ref:uploaded-framework --json',
    ],
    group: 'profiles',
    registry: {
      command_id: 'profiles select',
      parser_adapter: 'node_util_parse_args',
      options: [
        {
          name: 'intent',
          flag: '--intent',
          value_kind: 'string',
          summary: 'Target agent intent text.',
          required: true,
        },
        {
          name: 'intent-signal',
          flag: '--intent-signal',
          value_kind: 'string',
          summary: 'Canonical profile trigger signal.',
          multiple: true,
        },
        ...aliasOptions(PROFILE_REFERENCE_SOURCE_OPTIONS, 'Reference design source ref.'),
        ...aliasOptions(PROFILE_PATTERN_PACKET_OPTIONS, 'Reference design pattern packet ref.'),
      ],
      json_output_schema_ref: 'opl-cli-schema:profile-selection-receipt.v1',
      authority_boundary: {
        owner: 'OPL Foundry Kernel',
        surface: 'refs_only_profile_selection',
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    handler: (args) => {
      const options = parseRegisteredCommandOptions('profiles select', args, selectSpec);
      const selectionArgs = ['--intent', String(options.intent)];
      optionStrings(options['intent-signal'])
        .forEach((value) => selectionArgs.push('--intent-signal', value));
      aliasedOptionStrings(options, PROFILE_REFERENCE_SOURCE_OPTIONS)
        .forEach((value) => selectionArgs.push('--reference-source', value));
      aliasedOptionStrings(options, PROFILE_PATTERN_PACKET_OPTIONS)
        .forEach((value) => selectionArgs.push('--pattern-packet', value));
      return buildAgentProfileSelection(selectionArgs);
    },
  };

  const capabilityPlanSpec: CommandSpec = {
    usage: 'opl profiles capability-plan --selection-file <path> [--catalog-repo <owner-repo>] [--current-owner-delta-file <path>] [--capability-ref <exact-ref>]',
    summary: 'Resolve exact capability refs from a profile-selection receipt against explicitly supplied owner catalogs and return conditional dependency, environment, descriptor, and pack-lock action refs without executing them.',
    examples: [
      'opl profiles capability-plan --selection-file profile-selection.json --catalog-repo /path/to/agent-repo --json',
      'opl profiles capability-plan --selection-file profile-selection.json --catalog-repo /path/to/mas-scholar-skills --capability-ref medical-figure-design --json',
    ],
    group: 'profiles',
    registry: {
      command_id: 'profiles capability-plan',
      parser_adapter: 'node_util_parse_args',
      options: [
        {
          name: 'selection-file',
          flag: '--selection-file',
          value_kind: 'string',
          summary: 'Profile-selection receipt JSON path.',
          required: true,
        },
        {
          name: 'catalog-repo',
          flag: '--catalog-repo',
          value_kind: 'string',
          summary: 'Explicit owner repo containing a supported capability contract.',
          multiple: true,
        },
        {
          name: 'current-owner-delta-file',
          flag: '--current-owner-delta-file',
          value_kind: 'string',
          summary: 'Optional current-owner-delta JSON path for route-required hard-boundary resolution.',
        },
        {
          name: 'capability-ref',
          flag: '--capability-ref',
          value_kind: 'string',
          summary: 'Additional exact capability ref.',
          multiple: true,
        },
      ],
      json_output_schema_ref: 'opl-cli-schema:profile-capability-plan.v1',
      authority_boundary: {
        owner: 'OPL Foundry Kernel',
        surface: 'refs_only_profile_capability_plan',
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    handler: (args) => {
      const options = parseRegisteredCommandOptions(
        'profiles capability-plan',
        args,
        capabilityPlanSpec,
      );
      return buildProfileCapabilityPlan({
        selectionFile: String(options['selection-file']),
        catalogRepos: optionStrings(options['catalog-repo']),
        currentOwnerDeltaFile: typeof options['current-owner-delta-file'] === 'string'
          ? options['current-owner-delta-file']
          : null,
        capabilityRefs: optionStrings(options['capability-ref']),
      });
    },
  };
  return {
    'profiles list': {
      usage: 'opl profiles list',
      summary: 'List OPL-owned cross-cutting Foundry Agent profiles; catalog entries are lower-bound conformance guardrails and refs-only shapes, not target-agent design sources or readiness claims.',
      examples: ['opl profiles list --json'],
      group: 'profiles',
      handler: () => buildAgentProfileCatalog(),
    },
    'profiles inspect': {
      usage: 'opl profiles inspect [profile_id]',
      summary: 'Inspect one lower-bound OPL Foundry Agent profile and its stage, capability, evidence, and authority-boundary refs.',
      examples: [
        'opl profiles inspect evidence_grounded_decision_agent_profile.v1 --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileInspect(args),
    },
    'profiles select': selectSpec,
    'profiles capability-plan': capabilityPlanSpec,
    'profiles conformance': {
      usage: 'opl profiles conformance --repo-dir <agent_repo> [--profile <profile_id>]',
      summary: 'Check target-agent lower-bound profile structure and typed source-derived object provenance; this does not validate design quality or readiness.',
      examples: [
        'opl profiles conformance --repo-dir /tmp/colorectal-risk-agent --profile evidence_grounded_decision_agent_profile.v1 --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileConformance(args),
    },
  };
}

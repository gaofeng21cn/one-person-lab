import {
  buildAgentProfileCatalog,
  buildAgentProfileConformance,
  buildAgentProfileInspect,
  buildAgentProfileSelection,
} from '../../../../modules/foundry-lab/agent-profile-spine.ts';
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
        {
          name: 'reference-source',
          flag: '--reference-source',
          value_kind: 'string',
          summary: 'Reference design source ref.',
          multiple: true,
        },
        {
          name: 'pattern-packet',
          flag: '--pattern-packet',
          value_kind: 'string',
          summary: 'Reference design pattern packet ref.',
          multiple: true,
        },
      ],
      json_output_schema_ref: 'opl-cli-schema:profile-selection-receipt.v1',
      authority_boundary: {
        owner: 'OPL Foundry Lab',
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
      for (const [name, flag] of [
        ['intent-signal', '--intent-signal'],
        ['reference-source', '--reference-source'],
        ['pattern-packet', '--pattern-packet'],
      ] as const) {
        optionStrings(options[name]).forEach((value) => selectionArgs.push(flag, value));
      }
      return buildAgentProfileSelection(selectionArgs);
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

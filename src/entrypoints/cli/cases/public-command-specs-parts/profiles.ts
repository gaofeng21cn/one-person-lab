import {
  buildAgentProfileCatalog,
  buildAgentProfileConformance,
  buildAgentProfileInspect,
  buildAgentProfileSelection,
} from '../../../../modules/foundry-lab/agent-profile-spine.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildProfileCommandSpecs(): Record<string, CommandSpec> {
  return {
    'profiles list': {
      usage: 'opl profiles list',
      summary: 'List OPL-owned cross-cutting Foundry Agent profiles that OMA and Agent Lab may select without claiming domain readiness.',
      examples: ['opl profiles list --json'],
      group: 'profiles',
      handler: () => buildAgentProfileCatalog(),
    },
    'profiles inspect': {
      usage: 'opl profiles inspect [profile_id]',
      summary: 'Inspect one OPL Foundry Agent profile and its required stage, capability, evidence, and authority-boundary refs.',
      examples: [
        'opl profiles inspect evidence_grounded_decision_agent_profile.v1 --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileInspect(args),
    },
    'profiles select': {
      usage: 'opl profiles select --intent <intent text> [--reference-source <source-ref>] [--pattern-packet <packet-ref>]',
      summary: 'Return a refs-only profile-selection receipt for a target-agent intent; unmatched reference-backed intents route to source-derived design instead of a fixed template.',
      examples: [
        'opl profiles select --intent "colorectal surgery risk decision support with guideline evidence" --json',
        'opl profiles select --intent "workshop scheduling agent" --reference-source paper-ref:uploaded-framework --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileSelection(args),
    },
    'profiles conformance': {
      usage: 'opl profiles conformance --repo-dir <agent_repo> [--profile <profile_id>]',
      summary: 'Check whether a target OPL agent repo structurally declares the selected profile in its capability map and stage control plane.',
      examples: [
        'opl profiles conformance --repo-dir /tmp/colorectal-risk-agent --profile evidence_grounded_decision_agent_profile.v1 --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileConformance(args),
    },
  };
}

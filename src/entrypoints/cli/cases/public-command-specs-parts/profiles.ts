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
    'profiles select': {
      usage: 'opl profiles select --intent <intent text> [--reference-source <source-ref>] [--pattern-packet <packet-ref>]',
      summary: 'Return a refs-only profile-selection receipt; paper/repo/product reference sources remain the design source and must produce source-derived design refs.',
      examples: [
        'opl profiles select --intent "colorectal surgery risk decision support with guideline evidence" --json',
        'opl profiles select --intent "workshop scheduling agent" --reference-source paper-ref:uploaded-framework --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileSelection(args),
    },
    'profiles conformance': {
      usage: 'opl profiles conformance --repo-dir <agent_repo> [--profile <profile_id>]',
      summary: 'Check target-agent lower-bound profile structure and source-derived design consumption refs; this does not validate design quality or readiness.',
      examples: [
        'opl profiles conformance --repo-dir /tmp/colorectal-risk-agent --profile evidence_grounded_decision_agent_profile.v1 --json',
      ],
      group: 'profiles',
      handler: (args) => buildAgentProfileConformance(args),
    },
  };
}

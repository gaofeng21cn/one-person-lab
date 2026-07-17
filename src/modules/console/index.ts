export const OPL_CONSOLE_SOURCE_MODULE = {
  moduleId: 'console',
  brandName: 'OPL Console',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.console',
  physicalRoot: 'src/modules/console',
} as const;

export { buildEvidenceGroundedDecisionAgentProfileConsoleDrilldown } from './evidence-grounded-profile-drilldown.ts';
export type { EvidenceGroundedDecisionAgentProfileDrilldownInput } from './evidence-grounded-profile-drilldown.ts';
export * from './agent-readiness.ts';
export * from './foundry-operator-projection.ts';
export * from './framework-operating-maturity.ts';
export * from './framework-readiness-attention-actions.ts';
export * from './framework-readiness-attention-counts.ts';
export * from './framework-readiness-compact-readback.ts';
export * from './framework-readiness-owner-delta-handoff-summary.ts';
export * from './framework-readiness-typed-blocker-attention.ts';
export * from './framework-readiness.ts';
export * from './framework-semantic-hygiene.ts';
export * from './private-platform-residue-owner-decisions.ts';
export * from './stage-candidate-portfolio.ts';
export * from './standard-domain-agent-template-consumption.ts';

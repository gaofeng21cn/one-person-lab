import { listStandardDomainAgentIds } from '../../kernel/standard-agent-registry.ts';

const BASE_FRAMEWORK_READINESS_SOURCE_COMMANDS = {
  semantic_hygiene: 'opl system semantic-hygiene --json',
  agents_readiness: 'opl agents readiness --family-defaults --json',
  pack_compiler: 'opl agents pack-compiler --family-defaults --json',
  stages_list: 'opl stages list --json',
  stages_readiness_family: 'opl stages readiness --family-defaults --json',
  app_operator_drilldown: 'opl runtime app-operator-drilldown --json',
  family_runtime_evidence_worklist:
    'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
};

export function frameworkReadinessStageSourceCommand(agentId: string) {
  return `opl stages readiness --domain ${agentId} --json`;
}

const STANDARD_AGENT_STAGE_SOURCE_COMMANDS = Object.fromEntries(
  listStandardDomainAgentIds().map((agentId) => [
    `stages_readiness_${agentId}`,
    frameworkReadinessStageSourceCommand(agentId),
  ]),
);

export const FRAMEWORK_READINESS_SOURCE_COMMANDS:
  typeof BASE_FRAMEWORK_READINESS_SOURCE_COMMANDS & Record<string, string> = {
    ...BASE_FRAMEWORK_READINESS_SOURCE_COMMANDS,
    ...STANDARD_AGENT_STAGE_SOURCE_COMMANDS,
  };

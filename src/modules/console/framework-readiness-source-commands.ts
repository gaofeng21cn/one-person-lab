export const FRAMEWORK_READINESS_SOURCE_COMMANDS = {
  semantic_hygiene: 'opl system semantic-hygiene --json',
  agents_readiness: 'opl agents readiness --family-defaults --json',
  pack_compiler: 'opl agents pack-compiler --family-defaults --json',
  stages_list: 'opl stages list --json',
  stages_readiness_family: 'opl stages readiness --family-defaults --json',
  stages_readiness_mas: 'opl stages readiness --domain mas --json',
  stages_readiness_mag: 'opl stages readiness --domain mag --json',
  stages_readiness_rca: 'opl stages readiness --domain rca --json',
  app_operator_drilldown: 'opl runtime app-operator-drilldown --json',
  family_runtime_evidence_worklist:
    'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
};

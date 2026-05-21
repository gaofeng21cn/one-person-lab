import fs from 'node:fs';

import {
  buildAgentLabExportEnvelope,
  buildAgentLabEvolutionResult,
  buildAgentLabMechanismReadModel,
  buildAgentLabOptimizeResult,
  buildAgentLabStageExecutorPolicyReadModel,
  buildAgentLabWorkbenchReadModel,
  buildCompleteAgentLabControlPlane,
  type AgentLabExportTarget,
} from '../../agent-lab-complete.ts';
import {
  agentLabRefSummary,
  buildAgentLabCostEstimate,
  buildAgentLabEfficiencyNonRegressionReadModel,
  buildSampleAgentLabResult,
  runAgentLabSuite,
  type AgentLabCostEstimatePreset,
  type AgentLabSuite,
} from '../../agent-lab.ts';
import { buildLonglineAgentLabResult } from '../../agent-lab-longline.ts';
import { FrameworkContractError } from '../../contracts.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

function buildAgentLabSamplePayload() {
  const sampleResult = buildSampleAgentLabResult();
  return {
    version: 'g2',
    agent_lab_sample: {
      surface_id: 'opl_agent_lab_framework_sample',
      sample_result: sampleResult,
      ref_summary: agentLabRefSummary(sampleResult),
      authority_boundary: sampleResult.authority_boundary,
    },
  };
}

function buildAgentLabLonglinePayload() {
  const suiteResult = buildLonglineAgentLabResult();
  return {
    version: 'g2',
    agent_lab_longline: {
      surface_id: 'opl_agent_lab_longline_suite',
      suite_result: suiteResult,
      ref_summary: agentLabRefSummary(suiteResult),
      authority_boundary: suiteResult.authority_boundary,
    },
  };
}

function buildAgentLabCompletePayload() {
  return {
    version: 'g2',
    agent_lab_complete: buildCompleteAgentLabControlPlane(),
  };
}

function buildAgentLabWorkbenchPayload() {
  return {
    version: 'g2',
    agent_lab_workbench: buildAgentLabWorkbenchReadModel(),
  };
}

function buildAgentLabMechanismPayload() {
  return {
    version: 'g2',
    agent_lab_mechanism: buildAgentLabMechanismReadModel(),
  };
}

function buildAgentLabStageExecutorPolicyPayload() {
  return {
    version: 'g2',
    agent_lab_stage_executor_policy: buildAgentLabStageExecutorPolicyReadModel(),
  };
}

function buildAgentLabEfficiencyPayload() {
  const readModel = buildAgentLabEfficiencyNonRegressionReadModel({
    suiteResults: [buildSampleAgentLabResult(), buildLonglineAgentLabResult()],
    explicitRefs: {
      duration_refs: ['duration-ref:agent-lab/cli/default-wall-clock'],
      cost_refs: ['cost-ref:agent-lab/cli/default-budget-envelope'],
      cache_hit_refs: ['cache-hit-ref:agent-lab/cli/default-cache-observation'],
      reuse_scope_refs: ['reuse-scope-ref:agent-lab/cli/default-shared-scope'],
      quality_floor_refs: ['quality-floor-ref:agent-lab/cli/domain-owned-floor'],
      no_forbidden_write_refs: ['no-forbidden-write-ref:agent-lab/cli/default-proof'],
      owner_route_refs: ['owner-route:opl/framework-agent-lab-efficiency'],
    },
  });
  return {
    version: 'g2',
    agent_lab_efficiency: {
      surface_id: 'opl_agent_lab_efficiency_nonregression',
      read_model: readModel,
      authority_boundary: readModel.authority_boundary,
    },
  };
}

function parseAgentLabCostEstimateArgs(args: string[], spec: CommandSpec) {
  let preset: AgentLabCostEstimatePreset | null = null;
  const allowedPresets = new Set(['rca-ppt-40']);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--preset') {
      throw buildUsageError(`Unknown option for agent-lab cost-estimate: ${token}.`, spec, { option: token });
    }

    const value = args[index + 1];
    if (!value) {
      throw buildUsageError('Missing value for option: --preset.', spec, { option: '--preset' });
    }
    if (!allowedPresets.has(value)) {
      throw buildUsageError(`Unsupported agent-lab cost estimate preset: ${value}.`, spec, { option: '--preset' });
    }
    preset = value as AgentLabCostEstimatePreset;
    index += 1;
  }

  if (!preset) {
    throw buildUsageError('agent-lab cost-estimate requires --preset <rca-ppt-40>.', spec, {
      option: '--preset',
    });
  }

  return { preset };
}

function parseAgentLabSuiteArgs(args: string[], spec: CommandSpec, commandName: string) {
  let suitePath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--suite') {
      throw buildUsageError(`Unknown option for agent-lab ${commandName}: ${token}.`, spec, { option: token });
    }

    const value = args[index + 1];
    if (!value) {
      throw buildUsageError('Missing value for option: --suite.', spec, { option: '--suite' });
    }
    suitePath = value;
    index += 1;
  }

  if (!suitePath) {
    throw buildUsageError(`agent-lab ${commandName} requires --suite <suite.json>.`, spec, { option: '--suite' });
  }

  return { suitePath };
}

function parseAgentLabRunArgs(args: string[], spec: CommandSpec) {
  return parseAgentLabSuiteArgs(args, spec, 'run');
}

function parseAgentLabExportArgs(args: string[], spec: CommandSpec) {
  let target: AgentLabExportTarget | null = null;
  const allowedTargets = new Set(['inspect-ai', 'openinference', 'langfuse', 'phoenix', 'json']);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token !== '--target') {
      throw buildUsageError(`Unknown option for agent-lab export: ${token}.`, spec, { option: token });
    }

    const value = args[index + 1];
    if (!value) {
      throw buildUsageError('Missing value for option: --target.', spec, { option: '--target' });
    }
    if (!allowedTargets.has(value)) {
      throw buildUsageError(`Unsupported agent-lab export target: ${value}.`, spec, { option: '--target' });
    }
    target = value as AgentLabExportTarget;
    index += 1;
  }

  if (!target) {
    throw buildUsageError('agent-lab export requires --target <inspect-ai|openinference|langfuse|phoenix|json>.', spec, {
      option: '--target',
    });
  }

  return { target };
}

function readAgentLabSuiteFile(suitePath: string): AgentLabSuite {
  let raw: string;
  try {
    raw = fs.readFileSync(suitePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Agent Lab suite file is missing: ${suitePath}.`, {
        file: suitePath,
      });
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as AgentLabSuite;
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Agent Lab suite file contains invalid JSON: ${suitePath}.`, {
      file: suitePath,
      cause: error instanceof Error ? error.message : 'JSON parsing failed unexpectedly.',
    });
  }
}

function buildAgentLabRunPayload(args: string[], spec: CommandSpec) {
  const { suitePath } = parseAgentLabRunArgs(args, spec);
  const suiteResult = runAgentLabSuite(readAgentLabSuiteFile(suitePath));
  return {
    version: 'g2',
    agent_lab_run: {
      surface_id: 'opl_agent_lab_external_suite_run',
      suite_path: suitePath,
      suite_result: suiteResult,
      ref_summary: agentLabRefSummary(suiteResult),
      authority_boundary: suiteResult.authority_boundary,
    },
  };
}

function buildAgentLabExportPayload(args: string[], spec: CommandSpec) {
  const { target } = parseAgentLabExportArgs(args, spec);
  return {
    version: 'g2',
    agent_lab_export: buildAgentLabExportEnvelope(target),
  };
}

function buildAgentLabOptimizePayload(args: string[], spec: CommandSpec) {
  const { suitePath } = parseAgentLabSuiteArgs(args, spec, 'optimize');
  return {
    version: 'g2',
    agent_lab_optimize: {
      suite_path: suitePath,
      ...buildAgentLabOptimizeResult(readAgentLabSuiteFile(suitePath)),
    },
  };
}

function buildAgentLabEvolvePayload(args: string[], spec: CommandSpec) {
  const { suitePath } = parseAgentLabSuiteArgs(args, spec, 'evolve');
  return {
    version: 'g2',
    agent_lab_evolve: {
      suite_path: suitePath,
      ...buildAgentLabEvolutionResult(readAgentLabSuiteFile(suitePath)),
    },
  };
}

function buildAgentLabCostEstimatePayload(args: string[], spec: CommandSpec) {
  const { preset } = parseAgentLabCostEstimateArgs(args, spec);
  const costEstimate = buildAgentLabCostEstimate({ preset });
  return {
    version: 'g2',
    agent_lab_cost_estimate: {
      surface_id: 'opl_agent_lab_cost_estimate',
      cost_estimate: costEstimate,
      authority_boundary: costEstimate.authority_boundary,
    },
  };
}

export {
  buildAgentLabCompletePayload,
  buildAgentLabCostEstimatePayload,
  buildAgentLabEvolvePayload,
  buildAgentLabEfficiencyPayload,
  buildAgentLabExportPayload,
  buildAgentLabLonglinePayload,
  buildAgentLabMechanismPayload,
  buildAgentLabOptimizePayload,
  buildAgentLabRunPayload,
  buildAgentLabSamplePayload,
  buildAgentLabStageExecutorPolicyPayload,
  buildAgentLabWorkbenchPayload,
};

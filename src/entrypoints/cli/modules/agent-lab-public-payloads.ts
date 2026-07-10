import fs from 'node:fs';

import { parseJsonText, readJsonRecordFile } from '../../../kernel/json-file.ts';
import {
  buildAgentLabExportEnvelope,
  buildAgentLabEvolutionResult,
  buildAgentLabMechanismReadModel,
  buildAgentLabOptimizeResult,
  buildAgentLabStageExecutorPolicyReadModel,
  buildAgentLabWorkbenchReadModel,
  buildCompleteAgentLabControlPlane,
  type AgentLabExportTarget,
} from '../../../modules/foundry-lab/agent-lab-complete.ts';
import {
  buildAgentLabRhoBackendPlan,
  buildAgentLabRhoBackendRun,
} from '../../../modules/foundry-lab/agent-lab-rho-backend.ts';
import {
  buildAgentLabWorkflowTemplateCatalog,
  buildAgentLabWorkflowTemplateRun,
  isAgentLabWorkflowTemplateId,
  listAgentLabWorkflowTemplateIds,
} from '../../../modules/foundry-lab/agent-lab-workflow-templates.ts';
import {
  agentLabRefSummary,
  buildAgentLabCostEstimate,
  buildAgentLabEfficiencyNonRegressionReadModel,
  buildSampleAgentLabResult,
  runAgentLabSuite,
  type AgentLabSuite,
} from '../../../modules/foundry-lab/agent-lab.ts';
import { executeAgentLabEvaluationWorkOrder } from '../../../modules/foundry-lab/agent-lab-evaluation-work-order.ts';
import { buildLonglineAgentLabResult } from '../../../modules/foundry-lab/agent-lab-longline.ts';
import { FrameworkContractError } from '../../../modules/charter/contracts.ts';
import { parseCommandOptions } from './command-registry.ts';
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

function buildAgentLabWorkflowTemplatePayload() {
  return {
    version: 'g2',
    agent_lab_workflow_template: buildAgentLabWorkflowTemplateCatalog(),
  };
}

function buildAgentLabWorkflowTemplateRunPayload(args: string[], spec: CommandSpec) {
  const run = buildAgentLabWorkflowTemplateRun(parseAgentLabWorkflowTemplateRunArgs(args, spec));
  return {
    version: 'g2',
    agent_lab_workflow_template_run: run,
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

function buildAgentLabRunEfficiencyPayload(args: string[], spec: CommandSpec) {
  const { suitePath } = parseAgentLabRunArgs(args, spec);
  const suite = readAgentLabSuiteFile(suitePath);
  const suiteResult = runAgentLabSuite(suite);
  const handoffRefs = collectEfficiencyHandoffProjections(suite);
  const readModel = buildAgentLabEfficiencyNonRegressionReadModel({
    suiteResults: [suiteResult],
    handoffRefs,
  });

  return {
    version: 'g2',
    agent_lab_run_efficiency: {
      surface_id: 'opl_agent_lab_efficiency_suite_run',
      suite_path: suitePath,
      suite_result: suiteResult,
      read_model: readModel,
      ref_summary: agentLabRefSummary(suiteResult),
      authority_boundary: readModel.authority_boundary,
    },
  };
}

function collectEfficiencyHandoffProjections(suite: AgentLabSuite): Record<string, unknown>[] {
  return Object.entries(suite as Record<string, unknown>)
    .filter(([key, value]) => (
      key === 'efficiency_handoff_projection' || key.endsWith('_efficiency_handoff_projection')
    ) && isJsonRecord(value))
    .map(([, value]) => value as Record<string, unknown>);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseAgentLabCostEstimateArgs(args: string[], spec: CommandSpec) {
  const profilePath = parseCommandOptions(args, spec, {
    profile: { type: 'string' },
  }).profile as string | undefined;

  if (!profilePath) {
    throw buildUsageError('agent-lab cost-estimate requires --profile <domain-owned-profile.json>.', spec, {
      option: '--profile',
    });
  }
  return { profilePath };
}

function parseAgentLabSuiteArgs(args: string[], spec: CommandSpec, commandName: string) {
  const suitePath = parseCommandOptions(args, spec, {
    suite: { type: 'string' },
  }).suite as string | undefined;

  if (!suitePath) {
    throw buildUsageError(`agent-lab ${commandName} requires --suite <suite.json>.`, spec, { option: '--suite' });
  }

  return { suitePath };
}

function parseAgentLabRunArgs(args: string[], spec: CommandSpec) {
  return parseAgentLabSuiteArgs(args, spec, 'run');
}

function parseAgentLabEvaluationWorkOrderArgs(args: string[], spec: CommandSpec) {
  const parsed = parseCommandOptions(args, spec, {
    'work-order': { type: 'string' },
    observations: { type: 'string' },
    output: { type: 'string' },
  });
  const workOrderPath = parsed['work-order'] as string | undefined;
  const observationPacketPath = parsed.observations as string | undefined;
  const outputDir = parsed.output as string | undefined;
  if (!workOrderPath || !outputDir) {
    throw buildUsageError(
      'agent-lab evaluation-work-order execute requires --work-order <work-order.json> and --output <dir>.',
      spec,
      { required: ['--work-order', '--output'] },
    );
  }
  return { workOrderPath, observationPacketPath, outputDir };
}

function parseAgentLabWorkflowTemplateRunArgs(args: string[], spec: CommandSpec) {
  const parsed = parseCommandOptions(args, spec, {
    template: { type: 'string' },
    project: { type: 'string' },
    output: { type: 'string' },
  });
  const templateId = parsed.template as string | undefined;
  const projectDir = parsed.project as string | undefined;
  const outputDir = parsed.output as string | undefined;

  if (!templateId) {
    throw buildUsageError('agent-lab workflow-template run requires --template <id>.', spec, {
      option: '--template',
    });
  }
  if (!isAgentLabWorkflowTemplateId(templateId)) {
    throw buildUsageError(`Unsupported agent-lab workflow template: ${templateId}.`, spec, {
      option: '--template',
      supported_template_ids: listAgentLabWorkflowTemplateIds(),
    });
  }
  if (!projectDir) {
    throw buildUsageError('agent-lab workflow-template run requires --project <dir>.', spec, {
      option: '--project',
    });
  }

  return { templateId, projectDir, outputDir };
}

function parseAgentLabRhoArgs(args: string[], spec: CommandSpec) {
  const projectDir = parseCommandOptions(args, spec, {
    project: { type: 'string' },
  }).project as string | undefined;

  if (!projectDir) {
    throw buildUsageError('agent-lab rho requires --project <dir>.', spec, { option: '--project' });
  }

  return { projectDir };
}

function parsePositiveIntegerOption(value: string, option: string, spec: CommandSpec) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildUsageError(`Option ${option} requires a positive integer.`, spec, { option, value });
  }
  return parsed;
}

function parseAgentLabRhoRunArgs(args: string[], spec: CommandSpec) {
  const parsed = parseCommandOptions(args, spec, {
    project: { type: 'string' },
    sessions: { type: 'string' },
    output: { type: 'string' },
    'max-trajectories': { type: 'string' },
  });
  const projectDir = parsed.project as string | undefined;
  const sessionsDir = parsed.sessions as string | undefined;
  const outputDir = parsed.output as string | undefined;
  const maxTrajectories = typeof parsed['max-trajectories'] === 'string'
    ? parsePositiveIntegerOption(parsed['max-trajectories'], '--max-trajectories', spec)
    : null;

  if (!projectDir) {
    throw buildUsageError('agent-lab rho run requires --project <dir>.', spec, { option: '--project' });
  }

  return { projectDir, sessionsDir, outputDir, maxTrajectories };
}

function parseAgentLabExportArgs(args: string[], spec: CommandSpec) {
  const allowedTargets = new Set(['inspect-ai', 'openinference', 'langfuse', 'phoenix', 'json']);
  const target = parseCommandOptions(args, spec, {
    target: { type: 'string' },
  }).target as string | undefined;

  if (!target) {
    throw buildUsageError('agent-lab export requires --target <inspect-ai|openinference|langfuse|phoenix|json>.', spec, {
      option: '--target',
    });
  }
  if (!allowedTargets.has(target)) {
    throw buildUsageError(`Unsupported agent-lab export target: ${target}.`, spec, { option: '--target' });
  }

  return { target: target as AgentLabExportTarget };
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
    return parseJsonText(raw) as AgentLabSuite;
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

function buildAgentLabEvaluationWorkOrderPayload(args: string[], spec: CommandSpec) {
  return {
    version: 'g2',
    agent_lab_evaluation_work_order_execution: executeAgentLabEvaluationWorkOrder(
      parseAgentLabEvaluationWorkOrderArgs(args, spec),
    ),
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

function buildAgentLabRhoPayload(args: string[], spec: CommandSpec) {
  const { projectDir } = parseAgentLabRhoArgs(args, spec);
  const backendPlan = buildAgentLabRhoBackendPlan({ projectDir });
  return {
    version: 'g2',
    agent_lab_rho: {
      surface_id: 'opl_agent_lab_rho_backend',
      backend_plan: backendPlan,
      authority_boundary: backendPlan.authority_boundary,
    },
  };
}

function buildAgentLabRhoRunPayload(args: string[], spec: CommandSpec) {
  return {
    version: 'g2',
    agent_lab_rho_run: buildAgentLabRhoBackendRun(parseAgentLabRhoRunArgs(args, spec)),
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
  const { profilePath } = parseAgentLabCostEstimateArgs(args, spec);
  const costEstimate = buildAgentLabCostEstimate({
    profile: readJsonRecordFile(profilePath, {
      missingMessage: () => 'Agent Lab cost estimate profile file was not found.',
      missingDetails: (file) => ({ file }),
      invalidJsonMessage: () => 'Agent Lab cost estimate profile file is not valid JSON.',
      invalidJsonDetails: (file, cause) => ({ file, cause }),
      invalidRootMessage: () => 'Agent Lab cost estimate profile must contain an object root.',
      invalidRootDetails: (file) => ({ file }),
    }),
    profile_ref: profilePath,
  });
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
  buildAgentLabEvaluationWorkOrderPayload,
  buildAgentLabEvolvePayload,
  buildAgentLabEfficiencyPayload,
  buildAgentLabExportPayload,
  buildAgentLabLonglinePayload,
  buildAgentLabMechanismPayload,
  buildAgentLabOptimizePayload,
  buildAgentLabRunEfficiencyPayload,
  buildAgentLabRunPayload,
  buildAgentLabRhoPayload,
  buildAgentLabRhoRunPayload,
  buildAgentLabSamplePayload,
  buildAgentLabStageExecutorPolicyPayload,
  buildAgentLabWorkbenchPayload,
  buildAgentLabWorkflowTemplatePayload,
  buildAgentLabWorkflowTemplateRunPayload,
};

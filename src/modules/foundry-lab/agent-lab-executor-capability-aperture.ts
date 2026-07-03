import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import type { AgentLabSuite, AgentLabTaskManifest } from './agent-lab.ts';

type JsonRecord = Record<string, unknown>;

type ExecutorRiskLane = 'low_risk' | 'medium_risk' | 'high_risk';

const EXECUTOR_CAPABILITY_APERTURE_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  contract_role: 'refs_only_planning_read_model_launch_audit_boundary',
  can_change_default_executor: false,
  can_execute_non_default_executor: false,
  can_claim_quality_equivalence: false,
  can_claim_tool_semantics_equivalence: false,
  can_claim_resume_equivalence: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_mutate_artifact_body: false,
  can_write_domain_truth: false,
  can_promote_default_agent: false,
  can_constrain_executor_reasoning: false,
  can_replace_ai_judgment: false,
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function nestedRecord(task: AgentLabTaskManifest, field: string) {
  const sources = [
    task.executor_capability_aperture,
    task.trajectory.executor_capability_aperture,
    task.mechanism_evolution_inputs,
  ];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }
    const value = source[field];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function nestedString(task: AgentLabTaskManifest, field: string) {
  const sources = [
    task.executor_capability_aperture,
    task.trajectory.executor_capability_aperture,
    task.trajectory,
    task.mechanism_evolution_inputs,
  ];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }
    const value = optionalString(source[field]);
    if (value) {
      return value;
    }
  }
  return null;
}

function nestedStringList(task: AgentLabTaskManifest, field: string) {
  return unique([
    ...stringList(isRecord(task.executor_capability_aperture) ? task.executor_capability_aperture[field] : null),
    ...stringList(isRecord(task.trajectory.executor_capability_aperture)
      ? task.trajectory.executor_capability_aperture[field]
      : null),
    ...stringList(isRecord(task.mechanism_evolution_inputs) ? task.mechanism_evolution_inputs[field] : null),
  ]);
}

function executorKind(task: AgentLabTaskManifest) {
  return nestedString(task, 'executor_kind')
    ?? optionalString(task.trajectory.agent_executor)
    ?? 'codex_cli';
}

function modelReasoning(task: AgentLabTaskManifest) {
  const model = nestedRecord(task, 'model_reasoning') ?? {};
  const modelRef = optionalString(model.model_ref) ?? nestedString(task, 'model_ref');
  const reasoningEffort = optionalString(model.reasoning_effort) ?? nestedString(task, 'reasoning_effort');
  const provider = optionalString(model.provider) ?? nestedString(task, 'provider') ?? 'codex_cli';
  const sourceRef = optionalString(model.source_ref) ?? nestedString(task, 'model_reasoning_source_ref');
  return {
    model_ref: modelRef ?? 'model-profile:codex-cli/default-current',
    model: optionalString(model.model) ?? nestedString(task, 'model') ?? 'codex_cli_default_current',
    reasoning_effort: reasoningEffort ?? 'executor_default',
    provider,
    source_ref: sourceRef ?? 'executor-binding-ref:codex-cli/default-profile',
    model_reasoning_is_launch_audit_metadata_only: true,
    does_not_constrain_ai_reasoning: true,
  };
}

function capabilityRefs(task: AgentLabTaskManifest) {
  return unique([
    ...task.trajectory.tool_call_refs,
    ...task.stage_refs,
    ...task.recovery_probes.flatMap((probe) => probe.source_refs),
    ...nestedStringList(task, 'capability_refs'),
    ...nestedStringList(task, 'required_capabilities'),
  ]);
}

function budget(task: AgentLabTaskManifest) {
  const resourceLimits = isRecord(task.environment.resource_limits) ? task.environment.resource_limits : {};
  const declaredBudget = nestedRecord(task, 'budget') ?? {};
  return {
    budget_ref: optionalString(declaredBudget.budget_ref) ?? `executor-budget-ref:${task.task_id}`,
    max_minutes: typeof declaredBudget.max_minutes === 'number'
      ? declaredBudget.max_minutes
      : typeof resourceLimits.max_minutes === 'number'
        ? resourceLimits.max_minutes
        : null,
    max_hours: typeof declaredBudget.max_hours === 'number'
      ? declaredBudget.max_hours
      : typeof resourceLimits.max_hours === 'number'
        ? resourceLimits.max_hours
        : null,
    max_stage_attempts: typeof declaredBudget.max_stage_attempts === 'number'
      ? declaredBudget.max_stage_attempts
      : typeof resourceLimits.max_stage_attempts === 'number'
        ? resourceLimits.max_stage_attempts
        : null,
    max_tokens: typeof declaredBudget.max_tokens === 'number'
      ? declaredBudget.max_tokens
      : typeof resourceLimits.max_tokens === 'number'
        ? resourceLimits.max_tokens
        : null,
    max_cost_usd: typeof declaredBudget.max_cost_usd === 'number'
      ? declaredBudget.max_cost_usd
      : typeof resourceLimits.max_cost_usd === 'number'
        ? resourceLimits.max_cost_usd
        : null,
    budget_is_launch_guard_only: true,
  };
}

function ttl(task: AgentLabTaskManifest) {
  const declaredTtl = nestedRecord(task, 'ttl') ?? nestedRecord(task, 'lease_ttl') ?? {};
  const ttlSeconds = typeof declaredTtl.ttl_seconds === 'number'
    ? declaredTtl.ttl_seconds
    : typeof declaredTtl.max_age_seconds === 'number'
      ? declaredTtl.max_age_seconds
      : null;
  return {
    ttl_seconds: ttlSeconds,
    expires_after_ref: optionalString(declaredTtl.expires_after_ref) ?? null,
    ttl_is_launch_audit_freshness_only: true,
  };
}

function allowedEffects(task: AgentLabTaskManifest) {
  const declaredEffects = nestedStringList(task, 'allowed_effects');
  const allowedEffectRefs = declaredEffects.length > 0
    ? declaredEffects
    : [
      'launch_stage_attempt',
      'write_executor_receipt_ref',
    ];
  return {
    allowed_effect_refs: allowedEffectRefs,
    can_launch_stage_attempt: allowedEffectRefs.includes('launch_stage_attempt'),
    can_write_executor_receipt_ref: allowedEffectRefs.includes('write_executor_receipt_ref'),
    can_write_domain_truth: false,
    can_authorize_quality_verdict: false,
    can_mutate_artifact_body: false,
    can_promote_default_agent: false,
    effects_are_launch_audit_receipt_only: true,
  };
}

function riskLane(task: AgentLabTaskManifest): ExecutorRiskLane {
  const declared = nestedString(task, 'risk_lane');
  if (declared === 'low_risk' || declared === 'medium_risk' || declared === 'high_risk') {
    return declared;
  }
  if (task.improvement_candidate.allowed_change_scope === 'manual_review_required') {
    return 'high_risk';
  }
  if (
    task.environment.environment_kind === 'provider_hosted'
    || task.environment.network_policy !== 'offline'
    || task.environment.sandbox_policy.includes('hosted')
  ) {
    return 'medium_risk';
  }
  return 'low_risk';
}

function apertureForTask(task: AgentLabTaskManifest) {
  const kind = executorKind(task);
  const defaultCodex = kind === 'codex_cli';
  const expectedReceiptRefs = unique([
    ...task.trajectory.receipt_refs,
    ...nestedStringList(task, 'expected_receipt_refs'),
    ...stringList(task.promotion_gate.promotion_receipt_refs),
  ]);
  const requiredCapabilities = unique([
    'stage_attempt_ref_recording',
    'closeout_receipt_ref_recording',
    ...nestedStringList(task, 'required_capabilities'),
  ]);
  const ttlModel = ttl(task);
  const budgetModel = budget(task);
  const allowedEffectsModel = allowedEffects(task);
  const riskLaneValue = riskLane(task);
  const leaseRef = `executor-capability-lease:${stableId('oaleclease', [
    task.task_id,
    kind,
    task.environment,
    task.trajectory.stage_attempt_refs,
    expectedReceiptRefs,
    requiredCapabilities,
    budgetModel,
    ttlModel,
    allowedEffectsModel.allowed_effect_refs,
    riskLaneValue,
  ])}`;

  return {
    task_id: task.task_id,
    domain_id: task.domain_id,
    task_family: task.task_family,
    aperture_ref: stableId('oaleca', [
      task.task_id,
      kind,
      task.environment,
      task.trajectory.stage_attempt_refs,
      expectedReceiptRefs,
      requiredCapabilities,
    ]),
    executor_capability_lease: {
      lease_kind: 'executor_capability_lease',
      lease_ref: leaseRef,
      issued_by: 'opl_runtime',
      lease_status: 'runtime_issued',
      executor_kind: kind,
      model_reasoning: modelReasoning(task),
      capabilities: {
        tool: {
          tool_call_refs: task.trajectory.tool_call_refs,
          required_capability_refs: capabilityRefs(task),
          can_execute_tools: task.trajectory.tool_call_refs.length > 0,
        },
        network: {
          network_policy: task.environment.network_policy,
          network_access_declared: task.environment.network_policy !== 'offline',
        },
        sandbox: {
          sandbox_policy: task.environment.sandbox_policy,
        },
        worktree: {
          workspace_locator_ref: task.environment.workspace_locator_ref,
          worktree_policy_ref: nestedString(task, 'worktree_policy_ref') ?? null,
          worktree_capability_declared: Boolean(task.environment.workspace_locator_ref),
        },
        subagent: {
          subagent_refs: nestedStringList(task, 'subagent_refs'),
          subagent_capability_declared: nestedStringList(task, 'subagent_refs').length > 0,
        },
      },
      budget: budgetModel,
      allowed_effects: allowedEffectsModel,
      expected_receipts: {
        expected_receipt_refs: expectedReceiptRefs,
        expected_receipt_ref_count: expectedReceiptRefs.length,
      },
      ttl: ttlModel,
      risk_lane: riskLaneValue,
      constrains_launch_audit_and_receipt_only: true,
      does_not_constrain_codex_internal_reasoning: true,
      authority_boundary: {
        ...EXECUTOR_CAPABILITY_APERTURE_AUTHORITY_BOUNDARY,
        can_write_owner_receipt: false,
      },
    },
    executor: {
      executor_kind: kind,
      executor_kind_source: defaultCodex ? 'default_codex_cli' : 'declared_executor_binding',
      selected_executor_ref: defaultCodex
        ? 'executor-ref:codex-cli/default-first-class'
        : `executor-ref:${kind}/${task.task_id}`,
      executor_binding_ref: defaultCodex
        ? 'executor-binding-ref:codex-cli/default-first-class'
        : (nestedString(task, 'executor_binding_ref') ?? null),
      codex_first_class_executor: defaultCodex,
      non_default_executor_requires_binding_ref: !defaultCodex,
    },
    model_reasoning: modelReasoning(task),
    capabilities: {
      tool: {
        tool_call_refs: task.trajectory.tool_call_refs,
        required_capability_refs: capabilityRefs(task),
        can_execute_tools: task.trajectory.tool_call_refs.length > 0,
      },
      network: {
        network_policy: task.environment.network_policy,
        network_access_declared: task.environment.network_policy !== 'offline',
        network_policy_is_launch_boundary_only: true,
      },
      sandbox: {
        sandbox_policy: task.environment.sandbox_policy,
        sandbox_policy_is_launch_boundary_only: true,
      },
      worktree: {
        workspace_locator_ref: task.environment.workspace_locator_ref,
        worktree_policy_ref: nestedString(task, 'worktree_policy_ref') ?? null,
        worktree_capability_declared: Boolean(task.environment.workspace_locator_ref),
      },
      subagent: {
        subagent_refs: nestedStringList(task, 'subagent_refs'),
        subagent_capability_declared: nestedStringList(task, 'subagent_refs').length > 0,
        subagent_use_is_executor_runtime_choice: true,
      },
    },
    budget: budgetModel,
    expected_receipt: {
      expected_receipt_refs: expectedReceiptRefs,
      expected_receipt_ref_count: expectedReceiptRefs.length,
      closeout_receipt_required: expectedReceiptRefs.length > 0,
      receipt_is_boundary_evidence_only: true,
    },
    ttl: ttlModel,
    allowed_effects: allowedEffectsModel,
    risk_lane: riskLaneValue,
    audit_boundary: {
      ...EXECUTOR_CAPABILITY_APERTURE_AUTHORITY_BOUNDARY,
      can_write_owner_receipt: false,
    },
  };
}

export function buildAgentLabExecutorCapabilityApertureReadModel(input: {
  suite: AgentLabSuite;
}) {
  const tasks = input.suite.tasks.map(apertureForTask);
  const capabilityRefsForSummary = unique(tasks.flatMap((task) => [
    ...task.capabilities.tool.required_capability_refs,
    ...task.capabilities.subagent.subagent_refs,
    task.capabilities.worktree.workspace_locator_ref,
  ]));
  return {
    surface_kind: 'opl_agent_lab_executor_capability_lease_read_model',
    previous_surface_kind: 'opl_agent_lab_executor_capability_aperture_read_model',
    lease_kind: 'executor_capability_lease',
    read_model_role: 'runtime_issued_executor_capability_lease',
    version: 'opl-agent-lab.v1.executor-capability-lease',
    read_model_id: stableId('oalecam', [
      input.suite.suite_id,
      tasks.map((task) => task.aperture_ref),
      tasks.map((task) => task.executor_capability_lease.lease_ref),
      tasks.map((task) => task.risk_lane),
    ]),
    suite_id: input.suite.suite_id,
    refs_only: true,
    status: 'ready_for_executor_first_stage_launch_audit',
    semantic_boundary: 'runtime_issued_launch_audit_receipt_boundary_only_not_codex_internal_reasoning_contract',
    default_executor_kind: 'codex_cli',
    codex_first: true,
    constrains_launch_audit_and_receipt_only: true,
    does_not_constrain_codex_internal_reasoning: true,
    required_task_fields: [
      'executor_kind',
      'model_reasoning',
      'tool_capability',
      'network_policy',
      'sandbox_policy',
      'worktree_locator',
      'subagent_refs',
      'budget',
      'expected_receipt_refs',
      'risk_lane',
    ],
    tasks,
    summary: {
      task_count: tasks.length,
      codex_cli_task_count: tasks.filter((task) => task.executor.executor_kind === 'codex_cli').length,
      non_default_executor_task_count: tasks.filter((task) => task.executor.executor_kind !== 'codex_cli').length,
      runtime_issued_lease_count: tasks.filter((task) =>
        task.executor_capability_lease.lease_status === 'runtime_issued').length,
      expiring_lease_count: tasks.filter((task) =>
        typeof task.executor_capability_lease.ttl.ttl_seconds === 'number').length,
      tool_capability_declared_task_count: tasks.filter((task) => task.capabilities.tool.can_execute_tools).length,
      network_declared_task_count: tasks.filter((task) => task.capabilities.network.network_access_declared).length,
      worktree_capability_declared_task_count: tasks.filter((task) =>
        task.capabilities.worktree.worktree_capability_declared).length,
      subagent_capability_declared_task_count: tasks.filter((task) =>
        task.capabilities.subagent.subagent_capability_declared).length,
      expected_receipt_ref_count: tasks.reduce((total, task) =>
        total + task.expected_receipt.expected_receipt_ref_count, 0),
      capability_ref_count: capabilityRefsForSummary.length,
      low_risk_count: tasks.filter((task) => task.risk_lane === 'low_risk').length,
      medium_risk_count: tasks.filter((task) => task.risk_lane === 'medium_risk').length,
      high_risk_count: tasks.filter((task) => task.risk_lane === 'high_risk').length,
    },
    authority_boundary: EXECUTOR_CAPABILITY_APERTURE_AUTHORITY_BOUNDARY,
  };
}

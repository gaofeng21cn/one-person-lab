import type { AgentBlueprint, FoundryRiskTier } from './protocol.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';

const RISK_ORDER: Record<FoundryRiskTier, number> = { low: 0, medium: 1, high: 2 };

function stable(value: unknown) {
  return canonicalJsonText(value);
}

function changed(left: unknown, right: unknown) {
  return stable(left) !== stable(right);
}

function stageStructure(blueprint: AgentBlueprint) {
  return {
    entry_stage_id: blueprint.stage_graph.entry_stage_id,
    stages: blueprint.stage_graph.stages.map((stage) => ({
      stage_id: stage.stage_id,
      stage_kind: stage.stage_kind,
      input_artifact_types: stage.input_artifact_types,
      output_artifact_types: stage.output_artifact_types,
      next_stage_ids: stage.next_stage_ids,
    })),
  };
}

function actionIo(blueprint: AgentBlueprint) {
  return blueprint.actions.map((action) => ({
    action_id: action.action_id,
    input_schema_ref: action.input_schema_ref,
    output_schema_ref: action.output_schema_ref,
  }));
}

function actionRouting(blueprint: AgentBlueprint) {
  return blueprint.actions.map((action) => ({
    action_id: action.action_id,
    entry_stage_id: action.entry_stage_id,
  }));
}

function stageBindings(blueprint: AgentBlueprint, kind: 'prompt' | 'skill' | 'knowledge' | 'capability') {
  return blueprint.stage_graph.stages.map((stage) => ({
    stage_id: stage.stage_id,
    refs: kind === 'prompt'
      ? [stage.prompt_ref]
      : kind === 'skill'
        ? stage.skill_refs
        : kind === 'knowledge'
          ? stage.knowledge_refs
          : stage.capability_refs,
  }));
}

export function maximumRiskTier(...tiers: FoundryRiskTier[]) {
  return tiers.reduce((highest, tier) => RISK_ORDER[tier] > RISK_ORDER[highest] ? tier : highest, 'low');
}

export function recomputeBlueprintRisk(
  previous: AgentBlueprint | null,
  next: AgentBlueprint,
): { risk_tier: FoundryRiskTier; reasons: string[] } {
  const reasons: string[] = [];
  let computed: FoundryRiskTier = 'low';
  const raise = (tier: FoundryRiskTier, reason: string) => {
    computed = maximumRiskTier(computed, tier);
    reasons.push(reason);
  };

  if (!previous) {
    raise('high', 'new_agent_topology_and_authority_activation');
  } else {
    if (changed(stageStructure(previous), stageStructure(next))) raise('high', 'stage_topology_or_io_changed');
    if (changed(actionIo(previous), actionIo(next))) raise('high', 'action_io_schema_changed');
    if (changed(actionRouting(previous), actionRouting(next))) raise('medium', 'action_routing_changed');
    if (changed(previous.artifact_contracts, next.artifact_contracts)) raise('high', 'artifact_schema_changed');
    if (changed(previous.authority_policy, next.authority_policy)) raise('high', 'authority_policy_changed');
    if (changed(previous.memory_policy, next.memory_policy)) raise('high', 'memory_policy_changed');
    if (changed(previous.content_refs.tool_refs, next.content_refs.tool_refs)) raise('high', 'tool_binding_changed');
    if (changed(previous.content_refs.model_refs, next.content_refs.model_refs)) raise('high', 'model_binding_changed');
    if (changed(previous.capability_requirements, next.capability_requirements)) raise('high', 'capability_or_permission_changed');
    if (changed(stageBindings(previous, 'capability'), stageBindings(next, 'capability'))) {
      raise('high', 'stage_capability_binding_changed');
    }
    if (changed(previous.content_refs.skill_refs, next.content_refs.skill_refs)) raise('medium', 'skill_content_changed');
    if (changed(previous.content_refs.helper_refs, next.content_refs.helper_refs)) raise('medium', 'helper_content_changed');
    if (changed(stageBindings(previous, 'skill'), stageBindings(next, 'skill'))) {
      raise('medium', 'stage_skill_binding_changed');
    }
    if (changed(previous.content_refs.prompt_refs, next.content_refs.prompt_refs)) reasons.push('prompt_content_changed');
    if (changed(previous.content_refs.knowledge_refs, next.content_refs.knowledge_refs)) reasons.push('knowledge_content_changed');
    if (changed(stageBindings(previous, 'prompt'), stageBindings(next, 'prompt'))) {
      reasons.push('stage_prompt_binding_changed');
    }
    if (changed(stageBindings(previous, 'knowledge'), stageBindings(next, 'knowledge'))) {
      reasons.push('stage_knowledge_binding_changed');
    }

    const previousCases = new Set(previous.eval_spec.public_cases.map((entry) => entry.case_id));
    const removedOrChanged = previous.eval_spec.public_cases.some((entry) => {
      const candidate = next.eval_spec.public_cases.find((nextEntry) => nextEntry.case_id === entry.case_id);
      return !candidate || changed(entry, candidate);
    });
    if (removedOrChanged) raise('high', 'existing_evaluation_case_removed_or_changed');
    const addedCases = next.eval_spec.public_cases.filter((entry) => !previousCases.has(entry.case_id));
    if (addedCases.length > 0) reasons.push('public_evaluation_cases_added');
    const previousProtected = new Map(previous.eval_spec.protected_requirements.map((entry) => [entry.category, entry]));
    const protectedRemovedOrWeakened = previous.eval_spec.protected_requirements.some((entry) => {
      const candidate = next.eval_spec.protected_requirements.find((nextEntry) => nextEntry.category === entry.category);
      return !candidate || candidate.minimum_case_count < entry.minimum_case_count;
    });
    if (protectedRemovedOrWeakened) raise('high', 'protected_evaluation_requirement_removed_or_weakened');
    if (next.eval_spec.protected_requirements.some((entry) => {
      const prior = previousProtected.get(entry.category);
      return !prior || entry.minimum_case_count > prior.minimum_case_count;
    })) reasons.push('protected_evaluation_requirements_strengthened');
    if (changed(previous.eval_spec.gates, next.eval_spec.gates)) raise('high', 'evaluation_gate_changed');
    if (previous.eval_spec.baseline_comparison.required && !next.eval_spec.baseline_comparison.required) {
      raise('high', 'baseline_comparison_disabled');
    }
    if (
      next.eval_spec.baseline_comparison.regression_tolerance
      > previous.eval_spec.baseline_comparison.regression_tolerance
    ) {
      raise('high', 'baseline_regression_tolerance_weakened');
    }
  }

  const riskTier = maximumRiskTier(computed, next.risk_hint);
  if (RISK_ORDER[next.risk_hint] > RISK_ORDER[computed]) reasons.push('provider_risk_hint_elevated');
  return { risk_tier: riskTier, reasons: [...new Set(reasons)] };
}

export function ownerGatePolicy(riskTier: FoundryRiskTier) {
  return {
    canary_owner_required: riskTier === 'high',
    active_owner_required: riskTier !== 'low',
  };
}

export function assertEvaluationPolicyNonWeakening(previous: AgentBlueprint, next: AgentBlueprint) {
  const violations: string[] = [];
  for (const priorCase of previous.eval_spec.public_cases) {
    const candidate = next.eval_spec.public_cases.find((entry) => entry.case_id === priorCase.case_id);
    if (!candidate) violations.push(`public_case_removed:${priorCase.case_id}`);
    else if (changed(priorCase, candidate)) violations.push(`public_case_changed:${priorCase.case_id}`);
  }
  for (const priorRequirement of previous.eval_spec.protected_requirements) {
    const candidate = next.eval_spec.protected_requirements.find((entry) => entry.category === priorRequirement.category);
    if (!candidate) violations.push(`protected_requirement_removed:${priorRequirement.category}`);
    else if (candidate.minimum_case_count < priorRequirement.minimum_case_count) {
      violations.push(`protected_requirement_weakened:${priorRequirement.category}`);
    }
  }
  for (const priorGate of previous.eval_spec.gates) {
    const candidate = next.eval_spec.gates.find((entry) => entry.gate_id === priorGate.gate_id);
    if (!candidate) {
      violations.push(`gate_removed:${priorGate.gate_id}`);
      continue;
    }
    if (
      candidate.metric !== priorGate.metric
      || candidate.operator !== priorGate.operator
      || candidate.required !== priorGate.required
    ) {
      violations.push(`gate_semantics_changed:${priorGate.gate_id}`);
      continue;
    }
    const weakened = priorGate.operator === 'gte'
      ? candidate.threshold < priorGate.threshold
      : priorGate.operator === 'lte'
        ? candidate.threshold > priorGate.threshold
        : candidate.threshold !== priorGate.threshold;
    if (weakened) violations.push(`gate_threshold_weakened:${priorGate.gate_id}`);
  }
  if (previous.eval_spec.baseline_comparison.required && !next.eval_spec.baseline_comparison.required) {
    violations.push('baseline_comparison_disabled');
  }
  if (
    next.eval_spec.baseline_comparison.regression_tolerance
    > previous.eval_spec.baseline_comparison.regression_tolerance
  ) {
    violations.push('baseline_regression_tolerance_weakened');
  }
  if (violations.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'EvolutionProposal deletes or weakens frozen evaluation policy.',
      { violations },
    );
  }
}

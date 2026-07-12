import type { TargetOperatingArchitectureContract } from '../../kernel/types.ts';
import {
  FrameworkContractError,
  expectString,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  expectNonEmptyStringArray,
  requireEveryValue,
} from './brand-module-contracts.ts';
import {
  TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS,
  TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS,
  TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES,
  expectBrandModuleIdArray,
  expectFalseBoolean,
  expectFiniteNumber,
  expectTrueBoolean,
  validateFalseBoundaryRecord,
} from './target-operating-architecture-shared.ts';

export function validateOneShotPlanLandingModel(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['one_shot_plan_landing_model'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare one_shot_plan_landing_model.',
      { file: filePath, field: 'one_shot_plan_landing_model' },
    );
  }

  const modelId = expectString(value.model_id, 'one_shot_plan_landing_model.model_id', filePath);
  if (modelId !== 'opl_family_one_shot_plan_landing.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.model_id must be canonical.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.model_id',
      actual: modelId,
    });
  }

  const slicesRaw = value.implementation_slices;
  if (!Array.isArray(slicesRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices must be an array.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.implementation_slices',
    });
  }

  const seenPlanIds = new Set<string>();
  const statusCounts = {
    opl_landed: 0,
    opl_landed_owner_gated: 0,
    external_owner_gated: 0,
  };
  const implementationSlices = slicesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each one-shot plan landing slice must be an object.', {
        file: filePath,
        index,
      });
    }
    const planId = expectString(entry.plan_id, 'one_shot_plan_landing_model.implementation_slices.plan_id', filePath);
    if (!TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS.includes(planId as typeof TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices.plan_id must be P0-P8.', {
        file: filePath,
        index,
        plan_id: planId,
        expected_plan_ids: [...TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS],
      });
    }
    if (seenPlanIds.has(planId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices plan ids must be unique.', {
        file: filePath,
        index,
        plan_id: planId,
      });
    }
    seenPlanIds.add(planId);
    const status = expectString(entry.status, 'one_shot_plan_landing_model.implementation_slices.status', filePath);
    if (!TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES.includes(status as typeof TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.implementation_slices.status must be a known landing status.', {
        file: filePath,
        index,
        status,
        expected_statuses: [...TARGET_ARCHITECTURE_ONE_SHOT_PLAN_STATUSES],
      });
    }
    statusCounts[status as keyof typeof statusCounts] += 1;
    return {
      plan_id: planId,
      title: expectString(entry.title, 'one_shot_plan_landing_model.implementation_slices.title', filePath),
      status: status as TargetOperatingArchitectureContract['one_shot_plan_landing_model']['implementation_slices'][number]['status'],
      opl_landed_surfaces: expectNonEmptyStringArray(
        entry.opl_landed_surfaces,
        'one_shot_plan_landing_model.implementation_slices.opl_landed_surfaces',
        filePath,
      ),
      validation_commands: expectNonEmptyStringArray(
        entry.validation_commands,
        'one_shot_plan_landing_model.implementation_slices.validation_commands',
        filePath,
      ),
      remaining_owner_gate: expectString(
        entry.remaining_owner_gate,
        'one_shot_plan_landing_model.implementation_slices.remaining_owner_gate',
        filePath,
      ),
      false_completion_claims: expectNonEmptyStringArray(
        entry.false_completion_claims,
        'one_shot_plan_landing_model.implementation_slices.false_completion_claims',
        filePath,
      ),
    };
  });
  requireEveryValue(
    [...seenPlanIds],
    TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS,
    'one_shot_plan_landing_model.implementation_slices.plan_id',
    filePath,
  );

  const summaryRaw = value.summary;
  if (!isRecord(summaryRaw)) {
    throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.summary must be an object.', {
      file: filePath,
      field: 'one_shot_plan_landing_model.summary',
    });
  }
  const summary = {
    total_plan_count: expectFiniteNumber(summaryRaw.total_plan_count, 'one_shot_plan_landing_model.summary.total_plan_count', filePath),
    opl_landed_count: expectFiniteNumber(summaryRaw.opl_landed_count, 'one_shot_plan_landing_model.summary.opl_landed_count', filePath),
    opl_landed_owner_gated_count: expectFiniteNumber(summaryRaw.opl_landed_owner_gated_count, 'one_shot_plan_landing_model.summary.opl_landed_owner_gated_count', filePath),
    external_owner_gated_count: expectFiniteNumber(summaryRaw.external_owner_gated_count, 'one_shot_plan_landing_model.summary.external_owner_gated_count', filePath),
    all_opl_controlled_surfaces_landed: expectTrueBoolean(
      summaryRaw.all_opl_controlled_surfaces_landed,
      'one_shot_plan_landing_model.summary.all_opl_controlled_surfaces_landed',
      filePath,
    ),
    external_owner_evidence_still_required: expectTrueBoolean(
      summaryRaw.external_owner_evidence_still_required,
      'one_shot_plan_landing_model.summary.external_owner_evidence_still_required',
      filePath,
    ),
    ready_claim_authorized: expectFalseBoolean(
      summaryRaw.ready_claim_authorized,
      'one_shot_plan_landing_model.summary.ready_claim_authorized',
      filePath,
    ),
  };
  const expectedSummary = {
    total_plan_count: TARGET_ARCHITECTURE_ONE_SHOT_PLAN_IDS.length,
    opl_landed_count: statusCounts.opl_landed,
    opl_landed_owner_gated_count: statusCounts.opl_landed_owner_gated,
    external_owner_gated_count: statusCounts.external_owner_gated,
  };
  for (const [field, expected] of Object.entries(expectedSummary)) {
    if (summary[field as keyof typeof expectedSummary] !== expected) {
      throw new FrameworkContractError('contract_shape_invalid', 'one_shot_plan_landing_model.summary counts must match implementation_slices.', {
        file: filePath,
        field: `one_shot_plan_landing_model.summary.${field}`,
        expected,
        actual: summary[field as keyof typeof expectedSummary],
      });
    }
  }

  return {
    model_id: modelId,
    purpose: expectString(value.purpose, 'one_shot_plan_landing_model.purpose', filePath),
    source_plan_ref: expectString(value.source_plan_ref, 'one_shot_plan_landing_model.source_plan_ref', filePath),
    default_completion_semantics: expectString(
      value.default_completion_semantics,
      'one_shot_plan_landing_model.default_completion_semantics',
      filePath,
    ),
    implementation_slices: implementationSlices,
    summary,
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'one_shot_plan_landing_model.authority_boundary',
    ),
  };
}

export function validateTargetOperatingArchitectureExperienceModel(
  filePath: string,
  value: unknown,
): TargetOperatingArchitectureContract['experience_operating_model'] {
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'target-operating-architecture-contract.json must declare experience_operating_model.',
      { file: filePath, field: 'experience_operating_model' },
    );
  }
  const modelId = expectString(value.model_id, 'experience_operating_model.model_id', filePath);
  if (modelId !== 'opl_family_ideal_experience_operating_model.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model.model_id must be canonical.', {
      file: filePath,
      field: 'experience_operating_model.model_id',
      actual: modelId,
    });
  }
  const defaultUserPathRaw = value.default_user_path;
  const targetAxesRaw = value.target_axes;
  if (!isRecord(defaultUserPathRaw) || !Array.isArray(targetAxesRaw)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'experience_operating_model must declare default_user_path and target_axes.',
      { file: filePath, field: 'experience_operating_model' },
    );
  }
  const seenAxisIds = new Set<string>();
  const targetAxes = targetAxesRaw.map((axis, index) => {
    if (!isRecord(axis)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Each experience target axis must be an object.', {
        file: filePath,
        index,
      });
    }
    const axisId = expectString(axis.axis_id, 'experience_operating_model.target_axes.axis_id', filePath);
    if (!TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS.includes(axisId as typeof TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS[number])) {
      throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model.target_axes.axis_id must be known.', {
        file: filePath,
        index,
        axis_id: axisId,
        allowed: [...TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS],
      });
    }
    if (seenAxisIds.has(axisId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'experience_operating_model target axes must be unique.', {
        file: filePath,
        index,
        axis_id: axisId,
      });
    }
    seenAxisIds.add(axisId);
    return {
      axis_id: axisId as TargetOperatingArchitectureContract['experience_operating_model']['target_axes'][number]['axis_id'],
      owner_modules: expectBrandModuleIdArray(
        axis.owner_modules,
        'experience_operating_model.target_axes.owner_modules',
        filePath,
      ),
      success_policy: expectString(
        axis.success_policy,
        'experience_operating_model.target_axes.success_policy',
        filePath,
      ),
      machine_checks: expectNonEmptyStringArray(
        axis.machine_checks,
        'experience_operating_model.target_axes.machine_checks',
        filePath,
      ),
      forbidden_regressions: expectNonEmptyStringArray(
        axis.forbidden_regressions,
        'experience_operating_model.target_axes.forbidden_regressions',
        filePath,
      ),
    };
  });
  requireEveryValue(
    [...seenAxisIds],
    TARGET_ARCHITECTURE_EXPERIENCE_AXIS_IDS,
    'experience_operating_model.target_axes.axis_id',
    filePath,
  );

  return {
    model_id: modelId,
    purpose: expectString(value.purpose, 'experience_operating_model.purpose', filePath),
    default_user_path: {
      planning_root: expectString(
        defaultUserPathRaw.planning_root,
        'experience_operating_model.default_user_path.planning_root',
        filePath,
      ),
      first_screen_policy: expectString(
        defaultUserPathRaw.first_screen_policy,
        'experience_operating_model.default_user_path.first_screen_policy',
        filePath,
      ),
      primary_read_surface: expectString(
        defaultUserPathRaw.primary_read_surface,
        'experience_operating_model.default_user_path.primary_read_surface',
        filePath,
      ),
      drilldown_policy: expectString(
        defaultUserPathRaw.drilldown_policy,
        'experience_operating_model.default_user_path.drilldown_policy',
        filePath,
      ),
    },
    target_axes: targetAxes,
    authority_boundary: validateFalseBoundaryRecord(
      filePath,
      value.authority_boundary,
      'experience_operating_model.authority_boundary',
    ),
    forbidden_claims: expectNonEmptyStringArray(
      value.forbidden_claims,
      'experience_operating_model.forbidden_claims',
      filePath,
    ),
  };
}

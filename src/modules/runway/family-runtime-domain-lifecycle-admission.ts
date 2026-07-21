import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { FamilyActionCatalogAction } from '../../kernel/family-action-catalog-contract.ts';
import { resolveStandardAgent } from '../../kernel/standard-agent-registry.ts';
import { readHostedAgentRuntimeActionContracts } from './hosted-agent-runtime-binding.ts';
import {
  preflightCanonicalActiveStandardAgentDomainLifecycle,
  standardAgentLifecycleAdmissionContract,
} from './standard-agent-domain-lifecycle-admission.ts';

type StageLaunchLifecycleAdmissionInput = {
  domainId: string;
  stageId: string;
  actionId?: string | null;
  domainPackRoot?: string | null;
  workspaceLocator: Record<string, unknown>;
  taskPayload?: Record<string, unknown> | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'domain_lifecycle_stage_launch_blocked',
    repair_route: {
      responsible_component: 'domain_lifecycle_authority_and_opl_stage_admission',
      issue: message,
      impact: 'The provider-backed Stage launch was rejected before attempt reservation or provider start.',
      repair_action: 'Use the current domain pack action binding and reactivate the work item through its domain-owned lifecycle authority before retrying.',
      expected_outcome: 'The exact declared action resolves and canonical domain lifecycle is active before Stage launch.',
    },
    ...details,
  });
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function actionContainsStage(action: FamilyActionCatalogAction, stageId: string) {
  if (action.execution_binding.kind !== 'stage_binding' || !action.stage_route) return false;
  return new Set([
    action.stage_route.entry_stage_ref,
    ...action.stage_route.required_stage_refs,
    ...action.stage_route.optional_stage_refs,
    ...action.stage_route.terminal_stage_refs,
  ]).has(stageId);
}

function lifecycleAction(input: {
  actions: FamilyActionCatalogAction[];
  actionId: string | null;
  stageId: string;
}) {
  const stageActions = input.actions.filter((action) => actionContainsStage(action, input.stageId));
  const catalogLifecycleActions = input.actions.filter((action) => (
    standardAgentLifecycleAdmissionContract(action) !== null
  ));
  if (input.actionId) {
    const exact = input.actions.find((action) => action.action_id === input.actionId) ?? null;
    if (exact && !actionContainsStage(exact, input.stageId)) {
      if (standardAgentLifecycleAdmissionContract(exact)) {
        fail('Lifecycle-gated action does not declare the requested Stage.', {
          action_id: input.actionId,
          stage_id: input.stageId,
        });
      }
      return null;
    }
    if (exact) return standardAgentLifecycleAdmissionContract(exact) ? exact : null;
    const protectedStageActions = stageActions.filter((action) => (
      standardAgentLifecycleAdmissionContract(action) !== null
    ));
    if (protectedStageActions.length > 0) {
      fail('Requested Stage is lifecycle-gated but its action identity is not declared by the pinned domain pack.', {
        requested_action_id: input.actionId,
        stage_id: input.stageId,
        declared_lifecycle_action_ids: protectedStageActions.map((action) => action.action_id).sort(),
      });
    }
    if (catalogLifecycleActions.length > 0) {
      fail('Lifecycle-capable domain pack cannot resolve the requested action identity.', {
        requested_action_id: input.actionId,
        stage_id: input.stageId,
        declared_lifecycle_action_ids: catalogLifecycleActions.map((action) => action.action_id).sort(),
      });
    }
    return null;
  }
  const protectedStageActions = stageActions.filter((action) => (
    standardAgentLifecycleAdmissionContract(action) !== null
  ));
  if (protectedStageActions.length > 1) {
    fail('Lifecycle-gated Stage action identity is ambiguous.', {
      stage_id: input.stageId,
      declared_lifecycle_action_ids: protectedStageActions.map((action) => action.action_id).sort(),
    });
  }
  if (protectedStageActions.length === 0 && catalogLifecycleActions.length > 0) {
    fail('Lifecycle-capable domain pack cannot resolve a declared action for the requested Stage.', {
      stage_id: input.stageId,
      declared_lifecycle_action_ids: catalogLifecycleActions.map((action) => action.action_id).sort(),
    });
  }
  return protectedStageActions[0] ?? null;
}

function fieldValues(input: {
  field: string;
  workspaceLocator: Record<string, unknown>;
  taskPayload: Record<string, unknown> | null;
}) {
  const nestedLocator = isRecord(input.workspaceLocator.workspace_locator)
    ? input.workspaceLocator.workspace_locator
    : null;
  return [
    input.workspaceLocator[input.field],
    nestedLocator?.[input.field],
    input.taskPayload?.[input.field],
  ].map(optionalText).filter((value): value is string => value !== null);
}

function lifecycleResolutionExpected(input: StageLaunchLifecycleAdmissionInput) {
  const standardAgent = resolveStandardAgent(input.domainId);
  if (standardAgent?.series_membership !== 'standard_domain_agent') return false;
  const nestedLocator = isRecord(input.workspaceLocator.workspace_locator)
    ? input.workspaceLocator.workspace_locator
    : null;
  return [
    input.workspaceLocator.study_id,
    input.workspaceLocator.work_item_id,
    input.workspaceLocator.standard_agent_action_run_ref,
    nestedLocator?.study_id,
    nestedLocator?.work_item_id,
    input.taskPayload?.study_id,
    input.taskPayload?.work_item_id,
  ].some((value) => optionalText(value) !== null);
}

export function preflightFamilyRuntimeDomainLifecycleAdmission(
  input: StageLaunchLifecycleAdmissionInput,
) {
  const domainPackRoot = optionalText(input.domainPackRoot);
  const requiresAuthoritativeResolution = lifecycleResolutionExpected(input);
  if (!domainPackRoot) {
    if (requiresAuthoritativeResolution) {
      fail('Standard Agent Stage launch is missing its pinned domain pack checkout.', {
        domain_id: input.domainId,
        stage_id: input.stageId,
        action_id: optionalText(input.actionId),
      });
    }
    return { status: 'not_declared' as const };
  }
  const actionCatalog = path.join(domainPackRoot, 'contracts', 'action_catalog.json');
  if (!fs.existsSync(actionCatalog) || !fs.statSync(actionCatalog).isFile()) {
    if (requiresAuthoritativeResolution) {
      fail('Standard Agent Stage launch pinned checkout is missing its authoritative action catalog.', {
        domain_id: input.domainId,
        stage_id: input.stageId,
        action_id: optionalText(input.actionId),
        domain_pack_root: domainPackRoot,
      });
    }
    return { status: 'not_declared' as const };
  }
  const { catalog } = readHostedAgentRuntimeActionContracts(domainPackRoot);
  const action = lifecycleAction({
    actions: catalog.actions,
    actionId: optionalText(input.actionId),
    stageId: input.stageId,
  });
  if (!action) return { status: 'not_declared' as const };
  const contract = standardAgentLifecycleAdmissionContract(action)!;
  const workItemIds = [...new Set(fieldValues({
    field: contract.work_item_id_field,
    workspaceLocator: input.workspaceLocator,
    taskPayload: input.taskPayload ?? null,
  }))];
  if (workItemIds.length !== 1) {
    fail('Lifecycle-gated Stage launch requires one unambiguous work-item identity.', {
      domain_id: input.domainId,
      action_id: action.action_id,
      stage_id: input.stageId,
      work_item_id_field: contract.work_item_id_field,
      observed_work_item_ids: workItemIds,
    });
  }
  const workspaceRoots = [...new Set(fieldValues({
    field: 'workspace_root',
    workspaceLocator: input.workspaceLocator,
    taskPayload: input.taskPayload ?? null,
  }))];
  if (workspaceRoots.length !== 1) {
    fail('Lifecycle-gated Stage launch requires one unambiguous workspace root.', {
      domain_id: input.domainId,
      action_id: action.action_id,
      stage_id: input.stageId,
      observed_workspace_roots: workspaceRoots,
    });
  }
  const admission = preflightCanonicalActiveStandardAgentDomainLifecycle({
    action,
    payload: { [contract.work_item_id_field]: workItemIds[0] },
    checkoutRoot: domainPackRoot,
    workspaceRoot: workspaceRoots[0]!,
  });
  return {
    ...admission,
    action_id: action.action_id,
    stage_id: input.stageId,
    work_item_id_field: contract.work_item_id_field,
    work_item_id: workItemIds[0]!,
  };
}

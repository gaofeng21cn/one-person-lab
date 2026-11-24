import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
} from '../../../kernel/family-action-catalog-contract.ts';
import { normalizeFoundryProviderManifest } from '../../../authority/evolution/index.ts';
import { requireWorkItemExecutionScopeSnapshot } from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import {
  DIGEST_PATTERN,
  canonicalStringList,
  exactKeys,
  fail,
  text,
  validateRunId,
} from './fields.ts';
import type { StandardAgentActionRunBinding, StandardAgentActionRunPlan } from './types.ts';

export function planRecord(value: Record<string, unknown>): StandardAgentActionRunPlan {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'accepted_domain_ids',
    'action_id',
    'workspace_root',
    'checkout_root',
    'runtime_domain_id',
    'target_domain_id',
    'catalog_target_domain_ids',
    'package_use_binding',
    'hosted_runtime_binding_ref',
    'execution_kind',
    'execution_scope',
    'catalog',
    'handler_registry',
    'foundry_provider_manifest',
    'request_payload_sha256',
    'original_invocation_sha256',
    'effective_payload',
    'request_sha256',
    'request_byte_size',
    'input_schema_validation',
    'timeout_ms',
    'started_at',
  ], 'Standard Agent action run plan');
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_plan'
    || value.version !== 'opl-standard-agent-action-run-plan.v2'
    || !path.isAbsolute(String(value.workspace_root))
    || !path.isAbsolute(String(value.checkout_root))
    || !['handler_ref', 'stage_binding', 'foundry_binding'].includes(String(value.execution_kind))
    || !isRecord(value.catalog)
    || (value.handler_registry !== null && !isRecord(value.handler_registry))
    || (value.package_use_binding !== null && !isRecord(value.package_use_binding))
    || !isRecord(value.input_schema_validation)
    || typeof value.request_payload_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_payload_sha256)
    || (value.original_invocation_sha256 !== undefined && (
      typeof value.original_invocation_sha256 !== 'string'
      || !DIGEST_PATTERN.test(value.original_invocation_sha256)
    ))
    || (value.effective_payload !== undefined && !isRecord(value.effective_payload))
    || typeof value.request_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || (value.timeout_ms !== null && (!Number.isSafeInteger(value.timeout_ms) || Number(value.timeout_ms) < 1))
  ) {
    fail('Standard Agent action run plan is invalid.');
  }
  let catalog: FamilyActionCatalog;
  try {
    const catalogInput = structuredClone(value.catalog);
    if (!isRecord(catalogInput) || !Array.isArray(catalogInput.actions)) {
      fail('Standard Agent action run plan catalog actions must be an array.');
    }
    for (const action of catalogInput.actions) {
      if (isRecord(action)) delete action.parameter_fields_explicit;
    }
    catalog = normalizeFamilyActionCatalog(catalogInput)
      ?? fail('Standard Agent action run plan catalog is missing.');
  } catch (error) {
    fail('Standard Agent action run plan catalog is invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (canonicalJsonText(catalog) !== canonicalJsonText(value.catalog)) {
    fail('Standard Agent action run plan catalog is not in normalized canonical form.');
  }
  let handlerRegistry: DomainHandlerRegistry | null;
  try {
    handlerRegistry = value.handler_registry === null
      ? null
      : normalizeDomainHandlerRegistry(value.handler_registry as Record<string, unknown>);
    if (
      handlerRegistry !== null
      && canonicalJsonText(handlerRegistry) !== canonicalJsonText(value.handler_registry)
    ) {
      fail('Standard Agent action run plan handler registry is not in normalized canonical form.');
    }
    assertFamilyActionHandlerRefsResolve(catalog!, handlerRegistry);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('Standard Agent action run plan handler registry is invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const runId = text(value.run_id, 'plan.run_id');
  validateRunId(runId);
  const actionId = text(value.action_id, 'plan.action_id');
  const action = catalog.actions.find((entry) => entry.action_id === actionId);
  const executionBinding = action?.execution_binding ?? null;
  const executionKind = value.execution_kind as StandardAgentActionRunPlan['execution_kind'];
  if (!executionBinding || executionBinding.kind !== executionKind) {
    fail('Standard Agent action run plan does not contain its selected execution binding.', {
      action_id: actionId,
      execution_kind: executionKind,
    });
  }
  if (isRecord(value.effective_payload)) {
    const effectiveBytes = canonicalJsonBytes(value.effective_payload);
    if (
      crypto.createHash('sha256').update(effectiveBytes).digest('hex') !== value.request_sha256
      || effectiveBytes.byteLength !== value.request_byte_size
    ) {
      fail('Standard Agent action run plan effective_payload does not match frozen request bytes.');
    }
  }
  const executionScope = value.execution_scope === undefined || value.execution_scope === null
    ? null
    : requireWorkItemExecutionScopeSnapshot(value.execution_scope);
  const workItemScopeRequired = action?.execution_scope?.kind === 'work_item';
  if ((workItemScopeRequired && !executionScope) || (!workItemScopeRequired && executionScope)) {
    fail('Standard Agent action run plan execution scope conflicts with its selected action.', {
      action_id: actionId,
      execution_scope_kind: action?.execution_scope?.kind ?? 'legacy_unspecified',
      execution_scope_present: Boolean(executionScope),
    });
  }
  const foundryProvider = value.foundry_provider_manifest;
  if (
    (executionKind === 'foundry_binding'
      && (!isRecord(foundryProvider) || typeof foundryProvider.provider_id !== 'string' || !foundryProvider.provider_id.trim()))
    || (executionKind !== 'foundry_binding' && foundryProvider !== null)
  ) {
    fail('Standard Agent action run plan has invalid frozen Foundry provider metadata.', {
      execution_kind: executionKind,
    });
  }
  let normalizedFoundryProvider: Record<string, unknown> | null = null;
  if (executionKind === 'foundry_binding') {
    try {
      normalizedFoundryProvider = normalizeFoundryProviderManifest(foundryProvider) as unknown as Record<string, unknown>;
    } catch (error) {
      fail('Standard Agent action run plan has an invalid frozen Foundry provider manifest.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (canonicalJsonText(normalizedFoundryProvider) !== canonicalJsonText(foundryProvider)) {
      fail('Standard Agent action run plan Foundry provider manifest is not in normalized canonical form.');
    }
  }
  const acceptedDomainIds = canonicalStringList(value.accepted_domain_ids, 'plan.accepted_domain_ids');
  const catalogTargetDomainIds = canonicalStringList(
    value.catalog_target_domain_ids,
    'plan.catalog_target_domain_ids',
  );
  const canonicalDomainId = text(value.canonical_domain_id, 'plan.canonical_domain_id');
  const runtimeDomainId = text(value.runtime_domain_id, 'plan.runtime_domain_id');
  const targetDomainId = text(value.target_domain_id, 'plan.target_domain_id');
  const planWorkspaceRoot = text(value.workspace_root, 'plan.workspace_root');
  const requiredAcceptedDomainIds = [...new Set([
    canonicalDomainId,
    runtimeDomainId,
    targetDomainId,
    ...catalogTargetDomainIds,
  ])].sort();
  if (
    requiredAcceptedDomainIds.some((domainId) => !acceptedDomainIds.includes(domainId))
    || !catalogTargetDomainIds.includes(catalog.target_domain_id)
  ) {
    fail('Standard Agent action run plan domain identity is inconsistent.', {
      canonical_domain_id: canonicalDomainId,
      target_domain_id: targetDomainId,
    });
  }
  if (
    executionScope
    && (
      executionScope.domain_id !== runtimeDomainId
      || executionScope.workspace_root !== planWorkspaceRoot
    )
  ) {
    fail('Standard Agent action run plan execution scope conflicts with its runtime identity.', {
      action_id: actionId,
      scope_domain_id: executionScope.domain_id,
      runtime_domain_id: runtimeDomainId,
      scope_workspace_root: executionScope.workspace_root,
      workspace_root: planWorkspaceRoot,
    });
  }
  return {
    ...value,
    run_id: runId,
    canonical_domain_id: canonicalDomainId,
    accepted_domain_ids: acceptedDomainIds,
    action_id: actionId,
    workspace_root: planWorkspaceRoot,
    checkout_root: text(value.checkout_root, 'plan.checkout_root'),
    runtime_domain_id: runtimeDomainId,
    target_domain_id: targetDomainId,
    catalog_target_domain_ids: catalogTargetDomainIds,
    package_use_binding: value.package_use_binding as Record<string, unknown> | null,
    hosted_runtime_binding_ref: text(
      value.hosted_runtime_binding_ref,
      'plan.hosted_runtime_binding_ref',
    ),
    execution_kind: executionKind,
    execution_scope: executionScope,
    catalog: catalog!,
    handler_registry: handlerRegistry,
    foundry_provider_manifest: normalizedFoundryProvider,
    request_payload_sha256: value.request_payload_sha256,
    ...(typeof value.original_invocation_sha256 === 'string'
      ? { original_invocation_sha256: value.original_invocation_sha256 }
      : {}),
    ...(isRecord(value.effective_payload) ? { effective_payload: value.effective_payload } : {}),
    request_sha256: value.request_sha256,
    request_byte_size: Number(value.request_byte_size),
    input_schema_validation: value.input_schema_validation,
    timeout_ms: value.timeout_ms === null ? null : Number(value.timeout_ms),
    started_at: text(value.started_at, 'plan.started_at'),
  } as StandardAgentActionRunPlan;
}

export function assertPlanRuntimeIdentity(
  plan: StandardAgentActionRunPlan,
  binding: StandardAgentActionRunBinding,
) {
  const provenance = binding.hosted_runtime_binding;
  if (
    plan.target_domain_id !== provenance.target_domain_id
    || plan.canonical_domain_id !== provenance.target_agent_id
  ) {
    fail('Standard Agent action run plan domain identity conflicts with runtime provenance.', {
      run_id: plan.run_id,
    });
  }
  const packageBinding = plan.package_use_binding;
  if (provenance.source_kind === 'installed_native_carrier') {
    const actionContractsSha256 = `sha256:${crypto.createHash('sha256').update(canonicalJsonText({
      action_catalog: plan.catalog,
      handler_registry: plan.handler_registry,
    })).digest('hex')}`;
    if (
      packageBinding !== null
      || plan.checkout_root !== provenance.plugin_source_path
      || actionContractsSha256 !== provenance.action_contracts_sha256
    ) {
      fail('Installed native carrier identity conflicts with runtime provenance.', {
        run_id: plan.run_id,
        checkout_root: plan.checkout_root,
        plugin_source_path: provenance.plugin_source_path,
        action_contracts_sha256: actionContractsSha256,
        expected_action_contracts_sha256: provenance.action_contracts_sha256,
      });
    }
    return;
  }
  if (!isRecord(packageBinding)) {
    fail('Standard Agent action run plan is missing its Foundry package-use binding.', { run_id: plan.run_id });
  }
  const rootPackage = isRecord(packageBinding.root_package)
    ? packageBinding.root_package
    : fail('Foundry package-use binding is missing root_package.', { run_id: plan.run_id });
  if (
    packageBinding.surface_kind !== 'opl_agent_package_use_binding.v1'
    || packageBinding.binding_origin !== 'foundry_active_agent_version'
    || packageBinding.dependency_closure_digest !== provenance.package_closure_digest
    || rootPackage.package_id !== provenance.target_agent_id
    || rootPackage.package_version !== provenance.active_version_id
    || rootPackage.content_digest !== provenance.candidate_digest
    || rootPackage.source_artifact_ref !== provenance.candidate_ref
    || rootPackage.artifact_digest !== provenance.candidate_digest
    || path.basename(plan.checkout_root) !== provenance.candidate_digest.slice('sha256:'.length)
  ) {
    fail('Foundry package-use identity conflicts with runtime provenance.', { run_id: plan.run_id });
  }
}

export function expectedExecutionBindingRef(plan: StandardAgentActionRunPlan) {
  const action = plan.catalog.actions.find((entry) => entry.action_id === plan.action_id)
    ?? fail('Standard Agent action run plan is missing its selected action.');
  const executionBinding = action.execution_binding;
  if (executionBinding.kind === 'handler_ref') return executionBinding.handler_ref;
  if (executionBinding.kind === 'stage_binding') {
    const entryStageRef = action.stage_route?.entry_stage_ref;
    if (typeof entryStageRef !== 'string' || !entryStageRef.trim()) {
      fail('Stage-bound action run plan is missing its entry stage.');
    }
    return `stage:${executionBinding.stage_manifest_ref}#${entryStageRef}`;
  }
  const providerId = plan.foundry_provider_manifest?.provider_id;
  if (typeof providerId !== 'string' || !providerId.trim()) {
    fail('Foundry-bound action run plan is missing its provider identity.');
  }
  return `foundry:${providerId}:${executionBinding.provider_manifest_ref}`;
}

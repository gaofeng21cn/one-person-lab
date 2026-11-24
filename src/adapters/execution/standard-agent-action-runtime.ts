import crypto from 'node:crypto';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { validateDesignRequest } from '../../authority/evolution/index.ts';
import {
  compileStandardAgentStageManifest,
  resolveStandardAgentStageTargetBinding,
} from '../../authority/packages/index.ts';
import {
  prepareStandardAgentActionRunRequest,
} from '../../authority/workspace/public/standard-agent-action-runtime.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import {
  DefaultHostedAgentRuntimeBindingResolver,
  readHostedAgentRuntimeActionContracts,
  type HostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingResolver,
  type HostedAgentRuntimeBindingSnapshot,
} from './hosted-agent-runtime-binding.ts';
import { runFoundryAction } from './standard-agent-action-runtime/foundry-action.ts';
import {
  actionDeclaresHostMaterialization,
  buildLiveActionContext,
  canonicalTimeoutMs,
  materializeLifecycleAdmissionContext,
  originalInvocationSha256,
  requestFromFrozenPlan,
  type StandardAgentActionContext,
} from './standard-agent-action-runtime/action-context.ts';
import {
  replayCompletedHandlerAction,
  runHandlerAction,
} from './standard-agent-action-runtime/handler-action.ts';
import { runStageAction } from './standard-agent-action-runtime/stage-action.ts';
import { actionLedger } from './standard-agent-action-runtime/action-persistence.ts';
import {
  canonicalDomainIds,
  packageUseBinding,
  reserveStandardAgentActionRunPlan,
} from './standard-agent-action-runtime/run-plan.ts';
import {
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunState,
  type StandardAgentActionRunBinding,
  type StandardAgentActionRunPlan,
} from './standard-agent-action-run-state.ts';
import { runStandardAgentHandlerSandbox } from './standard-agent-handler-sandbox.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';
import {
  applyDomainArtifactCasMaterialization,
} from './domain-artifact-cas-materialization.ts';
import {
  preflightStandardAgentDomainLifecycleAdmission,
} from './standard-agent-domain-lifecycle-admission.ts';
import { actionAuthorityBoundary, fail, sha256 } from './standard-agent-action-runtime/shared.ts';
import {
  assertStandardAgentActionInvocationSurface,
  INTERNAL_STANDARD_AGENT_ACTION_INVOCATION,
  qualificationProvisioningPayload,
  QUALIFICATION_PROVISIONING_ACTION_ID,
  QUALIFICATION_PROVISIONING_INVOCATION,
} from './standard-agent-action-runtime/qualification-provisioning.ts';
import { type StandardAgentActionRuntimeInput } from './standard-agent-action-runtime/types.ts';

export { QUALIFICATION_PROVISIONING_ACTION_ID } from './standard-agent-action-runtime/qualification-provisioning.ts';

type RuntimeDependencies = {
  resolveManagedCheckout?: typeof resolveStandardAgentManagedCheckout;
  resolveRuntimeBinding?: HostedAgentRuntimeBindingResolver['resolve'];
  resolvePinnedRuntimeBinding?: HostedAgentRuntimeBindingResolver['resolvePinned'];
  foundryRootOverride?: string;
  runHandler?: typeof runStandardAgentHandlerSandbox;
  applyDomainArtifactCas?: typeof applyDomainArtifactCasMaterialization;
  runStageRuntime?: typeof runFamilyRuntime;
  compileStageManifest?: typeof compileStandardAgentStageManifest;
  resolveTargetStageBinding?: typeof resolveStandardAgentStageTargetBinding;
  recordLedger?: typeof actionLedger;
  startFoundryRun?: (input: {
    request: ReturnType<typeof validateDesignRequest>;
    run_id: string;
  }) => Promise<unknown>;
};

function canonicalRunId(value?: string) {
  if (value?.trim()) return value.trim();
  return `action_${crypto.randomUUID()}`;
}

function standardAgentRuntimeResolver(
  dependencies: RuntimeDependencies,
  invocationContext?: symbol,
): Pick<HostedAgentRuntimeBindingResolver, 'resolve' | 'resolvePinned'> {
  const resolveManagedCheckout = dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout;
  const defaultResolver = new DefaultHostedAgentRuntimeBindingResolver({
    root_override: dependencies.foundryRootOverride,
    // Internal authority requests already bind workspace bytes for CAS.
    resolve_managed_checkout: invocationContext === INTERNAL_STANDARD_AGENT_ACTION_INVOCATION
      ? (input) => resolveManagedCheckout({ ...input, preserveWorkspaceForAuthorityEvaluation: true })
      : resolveManagedCheckout,
  });
  return dependencies.resolveRuntimeBinding
    ? {
        resolve: dependencies.resolveRuntimeBinding,
        resolvePinned: dependencies.resolvePinnedRuntimeBinding ?? (async () => fail(
          'A custom hosted runtime resolver must provide resolvePinned for legacy durable action replay.',
        )),
      }
    : defaultResolver;
}

function assertRequestedDomainMatchesBinding(
  requestedDomainId: string,
  runtimeBinding: HostedAgentRuntimeBindingSnapshot,
) {
  const requested = requestedDomainId.trim();
  const accepted = new Set([
    runtimeBinding.agent_id,
    runtimeBinding.runtime_domain_id,
    runtimeBinding.target_domain_id,
    ...runtimeBinding.catalog_target_domain_ids,
  ]);
  if (!accepted.has(requested)) {
    fail('Hosted Agent action run target does not match its frozen runtime binding.', {
      requested_domain_id: requested,
      frozen_agent_id: runtimeBinding.agent_id,
      frozen_target_domain_id: runtimeBinding.target_domain_id,
    });
  }
}
async function executeActionContext(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  runId: string;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  checkoutRoot: string;
  acceptedDomainIds: string[];
  packageUseBinding: Record<string, unknown> | null;
  runtimeBindingRef: string;
  runtimeBinding: HostedAgentRuntimeBindingProvenance;
  startedAt: string;
  timeoutMs: number | null;
  requestPayloadSha256: string;
  originalInvocationSha256: string;
  requestBytes: Buffer;
  context: StandardAgentActionContext;
  dependencies: RuntimeDependencies;
}) {
  const {
    action,
    registry,
    payload,
    foundryRequest,
    foundryProvider,
    inputValidation,
    executionScope,
  } = input.context;
  const lifecycleAdmission = preflightStandardAgentDomainLifecycleAdmission({
    action,
    payload,
    checkoutRoot: input.checkoutRoot,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    materializationDomainId: input.context.catalog.target_domain_id,
    runId: input.runId,
    originalInvocationSha256: input.originalInvocationSha256,
  });
  prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: action.action_id,
    requestBytes: input.requestBytes,
  });
  const common = {
    action,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    runId: input.runId,
    requestBytes: input.requestBytes,
    packageUseBinding: input.packageUseBinding,
    runtimeBindingRef: input.runtimeBindingRef,
    runtimeBinding: input.runtimeBinding,
    startedAt: input.startedAt,
  };
  const result = action.execution_binding.kind === 'handler_ref'
    ? await runHandlerAction({
        ...common,
        runtimeInput: {
          ...input.runtimeInput,
          workspaceRoot: input.workspaceRoot,
          payload,
          runId: input.runId,
          ...(input.timeoutMs === null ? { timeoutMs: undefined } : { timeoutMs: input.timeoutMs }),
        },
        registry: registry ?? fail('Handler-bound action requires a handler registry.'),
        materializationDomainId: input.context.catalog.target_domain_id,
        acceptedDomainIds: input.acceptedDomainIds,
        requestPayloadSha256: input.requestPayloadSha256,
        inputSchemaValidation: inputValidation,
        executionScope,
        checkoutRoot: input.checkoutRoot,
        runHandler: input.dependencies.runHandler ?? runStandardAgentHandlerSandbox,
        applyDomainArtifactCas: input.dependencies.applyDomainArtifactCas ?? applyDomainArtifactCasMaterialization,
        recordLedger: input.dependencies.recordLedger ?? actionLedger,
      })
    : action.execution_binding.kind === 'stage_binding'
      ? await runStageAction({
          ...common,
          payload,
          checkoutRoot: input.checkoutRoot,
          runtimeDomainId: input.runtimeDomainId,
          executionScope,
          runStageRuntime: input.dependencies.runStageRuntime ?? runFamilyRuntime,
          recordLedger: input.dependencies.recordLedger ?? actionLedger,
          authorityBoundary: actionAuthorityBoundary,
        })
      : await runFoundryAction({
          ...common,
          request: foundryRequest ?? fail('Foundry action requires a frozen validated request.'),
          foundryProvider: foundryProvider ?? fail('Foundry action requires a frozen provider manifest.'),
          startFoundryRun: input.dependencies.startFoundryRun,
          recordLedger: input.dependencies.recordLedger ?? actionLedger,
        });
  return {
    version: 'g2' as const,
    standard_agent_action_run: {
      ...result,
      hosted_runtime_binding_ref: input.runtimeBindingRef,
      hosted_runtime_binding: input.runtimeBinding,
      input_schema_validation: inputValidation,
      domain_lifecycle_admission: lifecycleAdmission,
    },
  };
}

function executeFrozenActionContext(
  input: StandardAgentActionRuntimeInput,
  runId: string,
  binding: StandardAgentActionRunBinding,
  plan: StandardAgentActionRunPlan,
  frozen: ReturnType<typeof requestFromFrozenPlan>,
  dependencies: RuntimeDependencies,
) {
  return executeActionContext({
    runtimeInput: input,
    runId,
    workspaceRoot: plan.workspace_root,
    domainId: plan.canonical_domain_id,
    runtimeDomainId: plan.runtime_domain_id,
    checkoutRoot: plan.checkout_root,
    acceptedDomainIds: plan.accepted_domain_ids,
    packageUseBinding: plan.package_use_binding,
    runtimeBindingRef: binding.hosted_runtime_binding_ref,
    runtimeBinding: binding.hosted_runtime_binding,
    startedAt: plan.started_at,
    timeoutMs: plan.timeout_ms,
    requestPayloadSha256: plan.request_payload_sha256,
    originalInvocationSha256: frozen.originalInvocationSha256,
    requestBytes: frozen.requestBytes,
    context: frozen.context,
    dependencies,
  });
}

export async function runStandardAgentAction(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
  invocationContext?: symbol,
) {
  if (!isRecord(input.payload)) fail('Standard Agent action payload must be a JSON object.');
  const runId = canonicalRunId(input.runId);
  const observedAt = new Date().toISOString();
  const frozenState = inspectStandardAgentActionRunState({
    workspaceRoot: input.workspaceRoot,
    runId,
  });
  const frozenBinding = frozenState?.binding ?? null;
  const frozenPlan = frozenState?.plan ?? null;
  const completion = frozenBinding
    ? inspectStandardAgentActionRunCompletion({
      workspaceRoot: input.workspaceRoot,
      runId,
    })
    : null;
  if (frozenBinding && frozenPlan) {
    const frozen = requestFromFrozenPlan({ runtimeInput: input, plan: frozenPlan });
    const completedQualificationReplay = invocationContext === QUALIFICATION_PROVISIONING_INVOCATION
      && frozen.context.action.action_id === QUALIFICATION_PROVISIONING_ACTION_ID
      && completion?.execution_kind === 'handler_ref'
      && completion.status === 'completed';
    assertStandardAgentActionInvocationSurface(
      frozen.context.action,
      completedQualificationReplay ? INTERNAL_STANDARD_AGENT_ACTION_INVOCATION : invocationContext,
      frozen.context.registry,
      frozenPlan.checkout_root,
    );
    if (
      completion?.execution_kind === 'handler_ref'
      && completion.status === 'completed'
      && (!actionDeclaresHostMaterialization(frozen.context.action) || completedQualificationReplay)
    ) {
      return replayCompletedHandlerAction({
        runtimeInput: input,
        runId,
        startedAt: frozenPlan.started_at,
        binding: frozenBinding,
        completion,
        action: frozen.context.action,
        executionScope: frozen.context.executionScope,
        workspaceRoot: frozenPlan.workspace_root,
        recordLedger: dependencies.recordLedger ?? actionLedger,
        materializationDomainId: frozen.context.catalog.target_domain_id,
        applyDomainArtifactCas: dependencies.applyDomainArtifactCas,
      });
    }
    return executeFrozenActionContext(input, runId, frozenBinding, frozenPlan, frozen, dependencies);
  }
  if (frozenBinding && completion?.execution_kind === 'handler_ref' && completion.status === 'completed') {
    fail('Completed legacy Handler replay has unresolved execution scope identity.', {
      run_id: runId,
      failure_code: 'standard_agent_handler_replay_execution_scope_unresolved',
    });
  }

  const runtimeResolver = standardAgentRuntimeResolver(dependencies, invocationContext);
  const runtimeBinding = frozenBinding
    ? await runtimeResolver.resolvePinned({
        provenance: frozenBinding.hosted_runtime_binding,
        provenance_ref: frozenBinding.hosted_runtime_binding_ref,
        workspaceRoot: input.workspaceRoot,
      })
    : await runtimeResolver.resolve({
        domainId: input.domainId,
        workspaceRoot: input.workspaceRoot,
      });
  assertRequestedDomainMatchesBinding(input.domainId, runtimeBinding);
  if (frozenBinding && (
    frozenBinding.run_id !== runId
    || frozenBinding.canonical_domain_id !== runtimeBinding.agent_id
    || frozenBinding.action_id !== input.actionId
    || frozenBinding.hosted_runtime_binding_ref !== runtimeBinding.provenance_ref
    || canonicalJsonText(frozenBinding.hosted_runtime_binding) !== canonicalJsonText(runtimeBinding.provenance)
  )) {
    fail('Hosted Agent action request conflicts with its frozen legacy run binding.', { run_id: runId });
  }
  let effectiveRuntimeInput = input;
  if (invocationContext === QUALIFICATION_PROVISIONING_INVOCATION) {
    const { catalog } = readHostedAgentRuntimeActionContracts(
      runtimeBinding.checkout_root, runtimeBinding.catalog_target_domain_ids,
    );
    const action = catalog.actions.find((candidate) => candidate.action_id === input.actionId)
      ?? fail('Qualification provisioning action is missing from the bound owner catalog.');
    effectiveRuntimeInput = { ...input, payload: qualificationProvisioningPayload(
      input, runtimeBinding.workspace_root, action, runtimeBinding.checkout_root,
    ) };
  }
  let liveContext = await buildLiveActionContext({
    runtimeInput: effectiveRuntimeInput,
    runtimeBinding,
    dependencies,
  });
  assertStandardAgentActionInvocationSurface(liveContext.action, invocationContext, liveContext.registry, runtimeBinding.checkout_root);
  const requestPayloadSha256 = sha256(canonicalJsonBytes(input.payload));
  const timeoutMs = canonicalTimeoutMs(input.timeoutMs);
  const invocationSha256 = originalInvocationSha256({
    domainId: runtimeBinding.agent_id,
    actionId: liveContext.action.action_id,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    requestPayloadSha256,
    timeoutMs,
  });
  const materializedContext = await materializeLifecycleAdmissionContext({
    runtimeInput: effectiveRuntimeInput,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    domainId: runtimeBinding.agent_id,
    runtimeDomainId: runtimeBinding.runtime_domain_id,
    acceptedProjectIds: [
      runtimeBinding.runtime_domain_id,
      runtimeBinding.target_domain_id,
      ...runtimeBinding.catalog_target_domain_ids,
    ],
    checkoutRoot: runtimeBinding.checkout_root,
    originalInvocationSha256: invocationSha256,
    context: liveContext,
    runInternalAction: (internalInput) => runStandardAgentAction(
      internalInput,
      dependencies,
      INTERNAL_STANDARD_AGENT_ACTION_INVOCATION,
    ),
  });
  liveContext = materializedContext.context;
  const liveRequestBytes = canonicalJsonBytes(liveContext.payload);

  if (!frozenBinding) {
    const { binding, plan } = reserveStandardAgentActionRunPlan({
      requestedDomainId: input.domainId,
      runId,
      runtimeBinding,
      context: liveContext,
      requestPayloadSha256,
      invocationSha256,
      requestBytes: liveRequestBytes,
      timeoutMs,
      startedAt: observedAt,
    });
    return executeFrozenActionContext(
      input, runId, binding, plan, requestFromFrozenPlan({ runtimeInput: input, plan }), dependencies,
    );
  }

  return executeActionContext({
    runtimeInput: input,
    runId,
    workspaceRoot: runtimeBinding.workspace_root,
    domainId: runtimeBinding.agent_id,
    runtimeDomainId: runtimeBinding.runtime_domain_id,
    checkoutRoot: runtimeBinding.checkout_root,
    acceptedDomainIds: canonicalDomainIds([
      runtimeBinding.agent_id,
      runtimeBinding.runtime_domain_id,
      runtimeBinding.target_domain_id,
      ...runtimeBinding.catalog_target_domain_ids,
    ]),
    packageUseBinding: packageUseBinding(runtimeBinding.package_use_binding),
    runtimeBindingRef: runtimeBinding.provenance_ref,
    runtimeBinding: runtimeBinding.provenance,
    startedAt: observedAt,
    timeoutMs,
    requestPayloadSha256,
    originalInvocationSha256: invocationSha256,
    requestBytes: liveRequestBytes,
    context: liveContext,
    dependencies,
  });
}

export function runStandardAgentQualificationProvisioning(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
) {
  if (input.actionId !== QUALIFICATION_PROVISIONING_ACTION_ID) {
    fail('Qualification provisioning surface only accepts its exact internal authority action.', {
      failure_code: 'qualification_provisioning_action_mismatch',
      action_id: input.actionId,
    });
  }
  const resolveManagedCheckout = dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout;
  return runStandardAgentAction(input, {
    ...dependencies,
    resolveManagedCheckout: (checkoutInput) => resolveManagedCheckout({
      ...checkoutInput,
      preserveWorkspaceForAuthorityEvaluation: true,
    }),
  }, QUALIFICATION_PROVISIONING_INVOCATION);
}

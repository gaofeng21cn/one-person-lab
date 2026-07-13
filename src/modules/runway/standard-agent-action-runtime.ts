import crypto from 'node:crypto';
import fs from 'node:fs';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
  type FamilyActionCatalog,
  type FamilyActionCatalogAction,
} from '../../kernel/family-action-catalog-contract.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { assertRepoJsonSchemaPayload } from '../../kernel/repo-json-schema.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';
import { resolveStandardAgent } from '../../kernel/standard-agent-registry.ts';
import { recordStandardAgentActionRunEvent } from '../ledger/standard-agent-action-run-ledger.ts';
import { compileStandardAgentStageManifest } from '../pack/standard-agent-stage-manifest.ts';
import {
  commitStandardAgentActionOutput,
  prepareStandardAgentActionRunRequest,
} from '../workspace/standard-agent-action-output.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import { openQueueDb } from './family-runtime-store.ts';
import { runStandardAgentHandlerSandbox } from './standard-agent-handler-sandbox.ts';
import { resolveStandardAgentManagedCheckout } from './standard-agent-managed-checkout.ts';

type StandardAgentActionRuntimeInput = {
  domainId: string;
  actionId: string;
  workspaceRoot: string;
  payload: Record<string, unknown>;
  runId?: string;
  timeoutMs?: number;
};

type RuntimeDependencies = {
  resolveManagedCheckout?: typeof resolveStandardAgentManagedCheckout;
  runHandler?: typeof runStandardAgentHandlerSandbox;
  runStageRuntime?: typeof runFamilyRuntime;
  compileStageManifest?: typeof compileStandardAgentStageManifest;
  recordLedger?: typeof actionLedger;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function readRepoJson(checkoutRoot: string, ref: string, label: string) {
  try {
    const resolved = resolveContainedRepoJsonFile(checkoutRoot, ref, label, 'managed package checkout');
    const parsed = parseJsonText(fs.readFileSync(resolved.real_path, 'utf8'));
    if (!isRecord(parsed)) fail(`${label} must contain an object.`, { ref });
    return parsed;
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail(`${label} could not be resolved from the managed package checkout.`, {
      ref,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function actionContracts(checkoutRoot: string) {
  let catalog: FamilyActionCatalog | null;
  let registry: DomainHandlerRegistry | null;
  try {
    catalog = normalizeFamilyActionCatalog(
      readRepoJson(checkoutRoot, 'contracts/action_catalog.json', 'Standard Agent action catalog'),
    );
    registry = fs.existsSync(`${checkoutRoot}/contracts/domain_handler_registry.json`)
      ? normalizeDomainHandlerRegistry(
          readRepoJson(checkoutRoot, 'contracts/domain_handler_registry.json', 'Standard Agent handler registry'),
        )
      : null;
    if (!catalog) fail('Standard Agent action catalog is missing.');
    assertFamilyActionHandlerRefsResolve(catalog, registry);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('Standard Agent action contracts are invalid.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return { catalog: catalog!, registry };
}

function canonicalRunId(value?: string) {
  if (value?.trim()) return value.trim();
  return `action_${crypto.randomUUID()}`;
}

function normalizedPayload(action: FamilyActionCatalogAction, payload: Record<string, unknown>, workspaceRoot: string) {
  const normalized = { ...payload };
  for (const field of action.workspace_locator_fields) {
    if (field !== 'workspace_root' && field !== 'workspace_path') continue;
    const declared = normalized[field];
    if (declared !== undefined && declared !== workspaceRoot) {
      fail(`Standard Agent action ${field} conflicts with --workspace.`, {
        field,
        declared,
        workspace_root: workspaceRoot,
      });
    }
    normalized[field] = workspaceRoot;
  }
  return normalized;
}

function storedBytesRef(value: { ref: string; sha256: string; byte_size: number }) {
  return { ref: value.ref, sha256: value.sha256, byte_size: value.byte_size };
}

function actionLedger(input: {
  runId: string;
  domainId: string;
  actionId: string;
  bindingRef: string;
  status: 'completed' | 'failed' | 'blocked';
  startedAt: string;
  completedAt: string;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}) {
  const { db } = openQueueDb();
  try {
    return recordStandardAgentActionRunEvent({
      db,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.actionId,
      bindingRef: input.bindingRef,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      input: storedBytesRef(input.stored.request),
      output: storedBytesRef(input.stored.output),
    });
  } finally {
    db.close();
  }
}

function failureBytes(error: unknown) {
  return canonicalJsonBytes({
    surface_kind: 'opl_standard_agent_action_failure',
    version: 'opl-standard-agent-action-failure.v1',
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_failed',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details : {},
  });
}

function wrapFailure(error: unknown, stored: ReturnType<typeof commitStandardAgentActionOutput>): never {
  throw new FrameworkContractError(
    error instanceof FrameworkContractError ? error.code : 'contract_shape_invalid',
    error instanceof Error ? error.message : String(error),
    {
      ...(error instanceof FrameworkContractError ? error.details : {}),
      action_run_ref: stored.action_run_ref,
      request_ref: stored.request.ref,
      output_ref: stored.output.ref,
    },
  );
}

function actionAuthorityBoundary() {
  return {
    opl_role: 'host_transport_schema_validation_exact_byte_persistence_and_refs_only_ledger',
    domain_role: 'truth_artifact_memory_quality_owner_receipt_typed_blocker_and_human_gate_authority',
    provider_completion_is_domain_ready: false,
    opl_can_write_domain_truth: false,
    opl_can_create_owner_receipt: false,
    opl_can_create_typed_blocker: false,
    opl_can_claim_quality_or_export_ready: false,
  } as const;
}

async function runHandlerAction(input: {
  runtimeInput: StandardAgentActionRuntimeInput;
  action: FamilyActionCatalogAction;
  registry: DomainHandlerRegistry;
  checkoutRoot: string;
  workspaceRoot: string;
  domainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  startedAt: string;
  runHandler: typeof runStandardAgentHandlerSandbox;
  recordLedger: typeof actionLedger;
}) {
  const handlerRef = input.action.execution_binding.kind === 'handler_ref'
    ? input.action.execution_binding.handler_ref
    : fail('Handler action has an invalid execution binding.');
  const handlerId = handlerRef.slice('handler:'.length);
  const handler = input.registry.handlers.find((entry) => entry.handler_id === handlerId)
    ?? fail('Standard Agent action handler is unresolved.', { handler_ref: handlerRef });
  prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });

  let receipt: ReturnType<typeof input.runHandler>;
  try {
    receipt = input.runHandler({
      checkoutRoot: input.checkoutRoot,
      binding: handler.binding,
      request: input.runtimeInput.payload,
      readRoots: [input.workspaceRoot],
      timeoutMs: input.runtimeInput.timeoutMs,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: failureBytes(error),
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: handlerRef,
      status: 'failed',
      startedAt: input.startedAt,
      completedAt,
      stored,
    });
    wrapFailure(error, stored);
  }

  let outputValidation: ReturnType<typeof assertRepoJsonSchemaPayload>;
  try {
    outputValidation = assertRepoJsonSchemaPayload({
      repoRoot: input.checkoutRoot,
      schemaRef: input.action.output_schema_ref,
      payload: receipt.output,
      label: `Standard Agent action ${input.action.action_id} output`,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: receipt.stdout_bytes,
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef: handlerRef,
      status: 'failed',
      startedAt: input.startedAt,
      completedAt,
      stored,
    });
    wrapFailure(error, stored);
  }

  const completedAt = new Date().toISOString();
  const stored = commitStandardAgentActionOutput({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
    outputBytes: receipt.stdout_bytes,
  });
  const ledger = input.recordLedger({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    bindingRef: handlerRef,
    status: 'completed',
    startedAt: input.startedAt,
    completedAt,
    stored,
  });
  return {
    surface_kind: 'opl_standard_agent_action_run',
    version: 'opl-standard-agent-action-run.v1',
    status: 'completed',
    execution_kind: 'handler_ref',
    run_id: input.runId,
    domain_id: input.domainId,
    action_id: input.action.action_id,
    binding_ref: handlerRef,
    package_use_binding: input.packageUseBinding,
    input_schema_ref: input.action.input_schema_ref,
    output_schema_validation: outputValidation,
    request: stored.request,
    output: stored.output,
    result: receipt.output,
    sandbox: {
      runtime_kind: receipt.runtime_kind,
      sandbox_kind: receipt.sandbox_kind,
      exit_code: receipt.exit_code,
      timed_out: receipt.timed_out,
    },
    ledger: ledger.ledger_entry,
    authority_boundary: actionAuthorityBoundary(),
  };
}

async function runStageAction(input: {
  action: FamilyActionCatalogAction;
  workspaceRoot: string;
  domainId: string;
  runtimeDomainId: string;
  runId: string;
  requestBytes: Buffer;
  packageUseBinding: unknown;
  startedAt: string;
  runStageRuntime: typeof runFamilyRuntime;
  recordLedger: typeof actionLedger;
}) {
  if (input.action.execution_binding.kind !== 'stage_binding' || !input.action.stage_route) {
    fail('Stage action has an invalid execution binding.', { action_id: input.action.action_id });
  }
  const prepared = prepareStandardAgentActionRunRequest({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.action.action_id,
    requestBytes: input.requestBytes,
  });
  const workspaceLocator = canonicalJsonText({
    workspace_root: input.workspaceRoot,
    standard_agent_action_run_ref: prepared.action_run_ref,
    action_request_ref: prepared.request.ref,
    action_request_sha256: prepared.request.sha256,
  });
  const bindingRef = `stage:${input.action.execution_binding.stage_manifest_ref}#${input.action.stage_route.entry_stage_ref}`;

  try {
    const created = await input.runStageRuntime([
      'attempt',
      'create',
      '--domain',
      input.runtimeDomainId,
      '--stage',
      input.action.stage_route.entry_stage_ref,
      '--action',
      input.action.action_id,
      '--provider',
      'temporal',
      '--workspace-locator',
      workspaceLocator,
      '--source-fingerprint',
      prepared.request.sha256,
      '--invocation-mode',
      'invocation',
      '--checkpoint-ref',
      prepared.request.ref,
      '--start',
    ]);
    const stageRun = isRecord(created.family_runtime_stage_run)
      ? created.family_runtime_stage_run
      : null;
    if (!stageRun) {
      fail('Stage-bound Standard Agent actions require the Temporal StageRun controller.', {
        action_id: input.action.action_id,
        returned_surface: Object.keys(created),
        failure_code: 'standard_agent_stage_action_requires_temporal_stage_run',
      });
    }
    const stageRunInput = isRecord(stageRun.stage_run_input) ? stageRun.stage_run_input : {};
    const workflowId = typeof stageRunInput.workflow_id === 'string' ? stageRunInput.workflow_id : '';
    const blockedReason = typeof stageRun.blocked_reason === 'string' && stageRun.blocked_reason.trim()
      ? stageRun.blocked_reason.trim()
      : null;
    if (!workflowId) fail('Temporal StageRun launch did not return a workflow id.');
    const query = blockedReason ? null : await input.runStageRuntime(['stage-run', 'query', workflowId]);
    const output = {
      surface_kind: 'opl_standard_agent_stage_action_launch',
      version: 'opl-standard-agent-stage-action-launch.v1',
      status: blockedReason ? 'blocked' : 'started',
      run_id: input.runId,
      domain_id: input.domainId,
      action_id: input.action.action_id,
      binding_ref: bindingRef,
      stage_route: input.action.stage_route,
      request_ref: prepared.request.ref,
      expected_domain_output_schema_ref: input.action.output_schema_ref,
      temporal_stage_run: created,
      temporal_stage_run_query: query,
      blocked_reason: blockedReason,
      authority_boundary: actionAuthorityBoundary(),
    };
    const completedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: canonicalJsonBytes(output),
    });
    const ledger = input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef,
      status: blockedReason ? 'blocked' : 'completed',
      startedAt: input.startedAt,
      completedAt,
      stored,
    });
    return {
      ...output,
      package_use_binding: input.packageUseBinding,
      request: stored.request,
      output: stored.output,
      ledger: ledger.ledger_entry,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const stored = commitStandardAgentActionOutput({
      workspaceRoot: input.workspaceRoot,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      requestBytes: input.requestBytes,
      outputBytes: failureBytes(error),
    });
    input.recordLedger({
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.action.action_id,
      bindingRef,
      status: 'failed',
      startedAt: input.startedAt,
      completedAt,
      stored,
    });
    wrapFailure(error, stored);
  }
}

export async function runStandardAgentAction(
  input: StandardAgentActionRuntimeInput,
  dependencies: RuntimeDependencies = {},
) {
  if (!isRecord(input.payload)) fail('Standard Agent action payload must be a JSON object.');
  const startedAt = new Date().toISOString();
  const resolveManagedCheckout = dependencies.resolveManagedCheckout ?? resolveStandardAgentManagedCheckout;
  const managed = await resolveManagedCheckout({
    domainId: input.domainId,
    workspaceRoot: input.workspaceRoot,
  });
  const requestedAgent = resolveStandardAgent(input.domainId);
  const catalogAgent = resolveStandardAgent(managed.agent.target_domain_id);
  if (!requestedAgent || !catalogAgent || requestedAgent.agent_id !== catalogAgent.agent_id) {
    fail('Standard Agent managed checkout identity is inconsistent.', {
      requested_domain_id: input.domainId,
      managed_agent_id: managed.agent.agent_id,
    });
  }
  const { catalog, registry } = actionContracts(managed.checkout_root);
  const declaredAgent = resolveStandardAgent(catalog.target_domain_id);
  if (!declaredAgent || declaredAgent.agent_id !== managed.agent.agent_id) {
    fail('Standard Agent action catalog target does not match the managed package.', {
      package_id: managed.package_id,
      catalog_target_domain_id: catalog.target_domain_id,
    });
  }
  const action = catalog.actions.find((candidate) => candidate.action_id === input.actionId)
    ?? fail('Standard Agent action is not declared by the managed package.', {
      domain_id: managed.agent.agent_id,
      action_id: input.actionId,
      available_action_ids: catalog.actions.map((candidate) => candidate.action_id),
    });
  const payload = normalizedPayload(action, input.payload, managed.workspace_root);
  if (action.execution_binding.kind === 'stage_binding') {
    (dependencies.compileStageManifest ?? compileStandardAgentStageManifest)(managed.checkout_root);
  }
  const inputValidation = assertRepoJsonSchemaPayload({
    repoRoot: managed.checkout_root,
    schemaRef: action.input_schema_ref,
    payload,
    label: `Standard Agent action ${action.action_id} input`,
  });
  const runId = canonicalRunId(input.runId);
  const requestBytes = canonicalJsonBytes(payload);
  const common = {
    action,
    workspaceRoot: managed.workspace_root,
    domainId: managed.agent.agent_id,
    runId,
    requestBytes,
    packageUseBinding: managed.package_use_binding,
    startedAt,
  };
  const result = action.execution_binding.kind === 'handler_ref'
    ? await runHandlerAction({
        ...common,
        runtimeInput: { ...input, payload },
        registry: registry ?? fail('Handler-bound action requires a handler registry.'),
        checkoutRoot: managed.checkout_root,
        runHandler: dependencies.runHandler ?? runStandardAgentHandlerSandbox,
        recordLedger: dependencies.recordLedger ?? actionLedger,
      })
    : await runStageAction({
        ...common,
        runtimeDomainId: managed.agent.domain_id,
        runStageRuntime: dependencies.runStageRuntime ?? runFamilyRuntime,
        recordLedger: dependencies.recordLedger ?? actionLedger,
      });
  return {
    version: 'g2',
    standard_agent_action_run: {
      ...result,
      input_schema_validation: inputValidation,
    },
  };
}

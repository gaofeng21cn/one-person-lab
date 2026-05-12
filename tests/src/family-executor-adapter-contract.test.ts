import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const retiredAliasField = ['compatibility', 'aliases'].join('_');

function readJson(relativePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonObject;
}

function assertLayeredExecutorPolicy(surface: JsonObject) {
  const layered = surface.layered_executor_semantics as JsonObject;
  const userShell = layered.user_interaction_shell as JsonObject;
  const frontendExecutorPolicy = layered.frontend_executor_policy as JsonObject;
  const effectiveDefault = layered.effective_default_executor as JsonObject;
  const stageLevel = layered.stage_level_structured_call_selection as JsonObject;
  const resolution = surface.effective_default_executor_resolution as JsonObject[];
  const ownership = surface.ownership_boundaries as JsonObject;
  const standalone = surface.standalone_domain_behavior as JsonObject;
  const runtimeProfileCatalog = surface.runtime_profile_catalog_boundary as JsonObject;
  const configurationExamples = surface.configuration_examples as JsonObject;

  assert.equal(userShell.owner, 'opl_or_domain_product_entry');
  assert.deepEqual(userShell.surfaces, [
    'opl',
    'opl_tui',
    'opl_app',
    'opl_acp_stdio',
    'domain_direct_skill_entry',
  ]);
  assert.equal(userShell.selects_effective_default_executor, false);
  assert.equal(userShell.holds_domain_truth, false);
  assert.equal(userShell.adapter_changes_default_interaction_semantics, false);
  assert.equal(frontendExecutorPolicy.owner, 'opl_tui_or_opl_app_frontend');
  assert.equal(frontendExecutorPolicy.default_behavior, 'preserve_existing_codex_cli_interaction');
  assert.equal(frontendExecutorPolicy.may_pass_explicit_executor_selection, true);
  assert.equal(frontendExecutorPolicy.may_resolve_implicit_default_executor, false);
  assert.equal(frontendExecutorPolicy.may_silently_substitute_non_default_executor, false);
  assert.equal(frontendExecutorPolicy.non_default_selection_requires_user_or_stage_explicit_signal, true);
  assert.equal(effectiveDefault.owner, 'opl_family_runtime_config');
  assert.equal(effectiveDefault.default_backend, 'codex_cli');
  assert.equal(effectiveDefault.concrete_executor_implementation_owned_here, false);
  assert.equal(effectiveDefault.domain_truth_owned_here, false);
  assert.equal(stageLevel.owner, 'domain_stage_contract');
  assert.equal(stageLevel.execution_shape, 'structured_call');
  assert.equal(stageLevel.may_accept_request_explicit_executor, true);
  assert.deepEqual(
    resolution.map((entry) => entry.source),
    [
      'request_explicit_executor',
      'opl_runtime_manager_or_handoff_default_executor',
      'domain_local_user_config',
      'domain_built_in_default_codex_cli',
    ],
  );
  assert.deepEqual(resolution.map((entry) => entry.priority), [1, 2, 3, 4]);
  assert.equal(resolution[3].executor, 'codex_cli');
  assert.ok((ownership.opl_owns as string[]).includes('effective_default_executor_semantics'));
  assert.ok((ownership.opl_does_not_own as string[]).includes('redcube_domain_truth'));
  assert.ok((ownership.opl_does_not_own as string[]).includes('concrete_executor_implementation'));
  assert.equal(ownership.domain_truth_stays_domain_owned, true);
  assert.equal(ownership.concrete_executor_implementation_stays_runtime_or_domain_owned, true);
  assert.deepEqual(standalone, {
    without_opl_config: 'use_domain_defaults',
    domain_default_executor: 'codex_cli',
    opl_config_required_for_family_override: true,
  });
  assert.equal(runtimeProfileCatalog.catalog_owner, 'opl_runtime_manager_or_hermes_agent_config_reference');
  assert.equal(runtimeProfileCatalog.domain_repo_provider_catalog_forbidden, true);
  assert.deepEqual(runtimeProfileCatalog.forbidden_domain_repo_fields, [
    'provider',
    'base_url',
    'api_key',
    'model_list',
  ]);
  assert.deepEqual(configurationExamples, {
    activation_status: 'example_only_not_default_active',
    default_active_backend: 'codex_cli',
    sample_non_default_backend: 'hermes_agent',
    activation_requires: 'explicit_request_or_runtime_manager_handoff_config',
  });
  if ('domain_repo_provider_catalog_forbidden' in surface) {
    assert.equal(surface.domain_repo_provider_catalog_forbidden, true);
  }
}

test('family executor defaults split canonical name, stage-selection status, and guardrails', () => {
  const contract = readJson('contracts/opl-framework/family-executor-adapter-defaults.json');
  const defaults = contract.defaults as JsonObject;
  const executorLabels = contract.executor_labels as JsonObject;
  const executorStatuses = contract.executor_statuses as JsonObject;
  const executionShapes = contract.execution_shapes as JsonObject;
  const guardrails = contract.guardrails as JsonObject;
  const topologySplit = contract.topology_split as JsonObject;
  const executorRegistry = contract.executor_registry as JsonObject;

  assert.equal(defaults.default_executor_name, 'codex_cli');
  assert.equal(defaults.default_executor_mode, 'autonomous');
  assert.equal(defaults.default_model, 'inherit_local_codex_default');
  assert.equal(defaults.default_reasoning_effort, 'inherit_local_codex_default');
  assert.deepEqual(contract.canonical_executor_backends, ['codex_cli', 'hermes_agent', 'claude_code']);
  assert.equal(executorRegistry.surface_kind, 'opl_agent_executor_registry');
  assert.equal(executorRegistry.request_contract, 'AgentExecutionRequest');
  assert.equal(executorRegistry.receipt_contract, 'AgentExecutionReceipt');
  assert.deepEqual(executorRegistry.default_resolution_order, [
    'cli_flag',
    'stage_attempt_input',
    'OPL_EXECUTOR_KIND',
    'codex_cli',
  ]);
  assert.ok(!(retiredAliasField in contract));
  assert.deepEqual((executionShapes.structured_call as JsonObject).allowed_backends, ['codex_cli', 'hermes_agent', 'claude_code']);
  assert.deepEqual((executionShapes.agent_loop as JsonObject).allowed_backends, ['codex_cli', 'hermes_agent', 'claude_code']);
  assert.equal(executorLabels.codex_cli, 'Codex CLI');
  assert.equal(executorLabels.hermes_agent, 'Hermes-Agent');
  assert.equal(executorLabels.claude_code, 'Claude Code');
  assert.equal(executorStatuses.codex_cli, 'default');
  assert.equal(executorStatuses.hermes_agent, 'experimental');
  assert.equal(executorStatuses.claude_code, 'experimental');
  assert.equal(guardrails.hermes_agent_requires_full_agent_loop, true);
  assert.equal(guardrails.non_default_executor_requires_explicit_selection, true);
  assert.equal(guardrails.non_default_executor_forbids_silent_codex_fallback, true);
  assert.equal(guardrails.simple_llm_backend_forbidden, true);
  assert.equal(guardrails.openai_compatible_gateway_backend_forbidden, true);
  assert.equal(guardrails.domain_repo_provider_catalog_forbidden, true);
  assert.deepEqual(topologySplit, {
    opl_role: 'stage_led_agent_executor_family_framework_contract',
    runtime_substrate_role: 'provider_backed_stage_attempt_orchestration',
    executor_adapter_role: 'domain_owned_stage_selection',
    concrete_executor_role: 'task_local_autonomous_execution',
  });
  assertLayeredExecutorPolicy(contract);
  assert.ok(!('default_executor' in defaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in guardrails));
  assert.ok(!((contract.canonical_executor_backends as string[]).includes('simple_llm')));
  assert.ok(!((contract.canonical_executor_backends as string[]).includes('openai_compatible_gateway')));
});

test('active framework contracts carry executor semantics through stage selection', () => {
  const executorDefaults = readJson('contracts/opl-framework/family-executor-adapter-defaults.json');
  const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');
  const vocabulary = readJson('contracts/opl-framework/stage-selection-vocabulary.json');
  const stageRules = vocabulary.selection_rules as string[];
  const verificationRefs = executorDefaults.verification_refs as string[];

  assert.equal(skeleton.contract_kind, 'opl_standard_domain_agent_skeleton_contract.v1');
  assert.deepEqual(skeleton.required_projection_fields, [
    'descriptor_refs',
    'sidecar_refs',
    'quality_gate_refs',
    'workspace_artifact_locator_refs',
    'runtime_artifact_locator_refs',
    'authority_boundary',
  ]);
  assert.deepEqual(skeleton.authority_boundary, {
    opl: 'framework_transport_and_projection_only',
    domain_agent: 'truth_quality_artifact_owner',
  });
  assert.ok(stageRules.includes('select by explicit domain-agent handle first'));
  assert.ok(stageRules.includes('OPL opens a stage-led framework handoff and does not become domain truth owner'));
  assert.ok(stageRules.includes('the selected domain agent owns quality, artifact, and publication or export authority'));
  assert.ok(verificationRefs.includes('contracts/opl-framework/standard-domain-agent-skeleton-contract.json'));
  assert.ok(verificationRefs.includes('contracts/opl-framework/stage-selection-vocabulary.json'));
  assert.ok(!verificationRefs.includes('contracts/opl-framework/domain-onboarding-readiness.schema.json'));
});

test('family manifests use the same split executor declaration', () => {
  const medAutoScienceFixture = readJson(
    'tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json',
  );
  const executorDefaults = medAutoScienceFixture.executor_defaults as JsonObject;

  assert.equal(executorDefaults.default_executor_name, 'codex_cli');
  assert.equal(executorDefaults.default_executor_mode, 'autonomous');
  assert.deepEqual(executorDefaults.canonical_executor_backends, ['codex_cli', 'hermes_agent', 'claude_code']);
  assert.equal(Object.prototype.hasOwnProperty.call(executorDefaults, retiredAliasField), false);
  assert.deepEqual(((executorDefaults.execution_shapes as JsonObject).structured_call as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
    'claude_code',
  ]);
  assert.deepEqual(((executorDefaults.execution_shapes as JsonObject).agent_loop as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
    'claude_code',
  ]);
  assert.deepEqual(executorDefaults.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
    claude_code: 'Claude Code',
  });
  assert.deepEqual(executorDefaults.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
    claude_code: 'experimental',
  });
  assert.equal(executorDefaults.hermes_agent_requires_full_agent_loop, true);
  assert.equal(executorDefaults.simple_llm_backend_forbidden, true);
  assert.equal(executorDefaults.openai_compatible_gateway_backend_forbidden, true);
  assertLayeredExecutorPolicy(executorDefaults);
  assert.ok(!('default_executor' in executorDefaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executorDefaults));
});

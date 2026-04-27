import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonObject = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonObject;
}

function assertLayeredExecutorPolicy(surface: JsonObject) {
  const layered = surface.layered_executor_semantics as JsonObject;
  const userShell = layered.user_interaction_shell as JsonObject;
  const effectiveDefault = layered.effective_default_executor as JsonObject;
  const routeLevel = layered.route_level_structured_call_routing as JsonObject;
  const resolution = surface.effective_default_executor_resolution as JsonObject[];
  const ownership = surface.ownership_boundaries as JsonObject;
  const standalone = surface.standalone_domain_behavior as JsonObject;
  const runtimeProfileCatalog = surface.runtime_profile_catalog_boundary as JsonObject;
  const configurationExamples = surface.configuration_examples as JsonObject;

  assert.equal(userShell.owner, 'opl_or_domain_frontdoor');
  assert.equal(userShell.selects_effective_default_executor, false);
  assert.equal(userShell.holds_domain_truth, false);
  assert.equal(effectiveDefault.owner, 'opl_family_runtime_config');
  assert.equal(effectiveDefault.default_backend, 'codex_cli');
  assert.equal(effectiveDefault.concrete_executor_implementation_owned_here, false);
  assert.equal(effectiveDefault.domain_truth_owned_here, false);
  assert.equal(routeLevel.owner, 'domain_route_contract');
  assert.equal(routeLevel.execution_shape, 'structured_call');
  assert.equal(routeLevel.may_accept_request_explicit_executor, true);
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

test('family executor defaults split canonical name, route status, and guardrails', () => {
  const contract = readJson('contracts/opl-gateway/family-executor-adapter-defaults.json');
  const defaults = contract.defaults as JsonObject;
  const executorLabels = contract.executor_labels as JsonObject;
  const executorStatuses = contract.executor_statuses as JsonObject;
  const compatibilityAliases = contract.compatibility_aliases as JsonObject;
  const executionShapes = contract.execution_shapes as JsonObject;
  const guardrails = contract.guardrails as JsonObject;

  assert.equal(defaults.default_executor_name, 'codex_cli');
  assert.equal(defaults.default_executor_mode, 'autonomous');
  assert.equal(defaults.default_model, 'inherit_local_codex_default');
  assert.equal(defaults.default_reasoning_effort, 'inherit_local_codex_default');
  assert.deepEqual(contract.canonical_executor_backends, ['codex_cli', 'hermes_agent']);
  assert.deepEqual(compatibilityAliases, { host_agent: 'codex_cli' });
  assert.deepEqual((executionShapes.structured_call as JsonObject).allowed_backends, ['codex_cli', 'hermes_agent']);
  assert.deepEqual((executionShapes.agent_loop as JsonObject).allowed_backends, ['codex_cli', 'hermes_agent']);
  assert.equal(executorLabels.codex_cli, 'Codex CLI');
  assert.equal(executorLabels.hermes_agent, 'Hermes-Agent');
  assert.equal(executorStatuses.codex_cli, 'default');
  assert.equal(executorStatuses.hermes_agent, 'experimental');
  assert.equal(guardrails.hermes_agent_requires_full_agent_loop, true);
  assert.equal(guardrails.simple_llm_backend_forbidden, true);
  assert.equal(guardrails.openai_compatible_gateway_backend_forbidden, true);
  assert.equal(guardrails.domain_repo_provider_catalog_forbidden, true);
  assertLayeredExecutorPolicy(contract);
  assert.ok(!('default_executor' in defaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in guardrails));
  assert.ok(!((contract.canonical_executor_backends as string[]).includes('simple_llm')));
  assert.ok(!((contract.canonical_executor_backends as string[]).includes('openai_compatible_gateway')));
});

test('domain onboarding schema example aligns execution model with split executor semantics', () => {
  const schema = readJson('contracts/opl-gateway/domain-onboarding-readiness.schema.json');
  const defs = schema.$defs as JsonObject;
  const executionModelDeclaration = defs.executionModelDeclaration as JsonObject;
  const properties = executionModelDeclaration.properties as JsonObject;
  const requiredFields = executionModelDeclaration.required as string[];
  const examples = schema.examples as JsonObject[];
  const firstExample = examples[0] as JsonObject;
  const executionModel = firstExample.execution_model as JsonObject;
  const formalInclusionGate = firstExample.formal_inclusion_gate as JsonObject;
  const executionModelAligned = formalInclusionGate.execution_model_aligned as JsonObject;
  const evidenceRefs = executionModelAligned.evidence_refs as string[];

  assert.ok(requiredFields.includes('default_executor_name'));
  assert.ok(requiredFields.includes('default_executor_mode'));
  assert.ok(requiredFields.includes('canonical_executor_backends'));
  assert.ok(requiredFields.includes('compatibility_aliases'));
  assert.ok(requiredFields.includes('execution_shapes'));
  assert.ok(requiredFields.includes('layered_executor_semantics'));
  assert.ok(requiredFields.includes('effective_default_executor_resolution'));
  assert.ok(requiredFields.includes('executor_labels'));
  assert.ok(requiredFields.includes('executor_statuses'));
  assert.ok(requiredFields.includes('ownership_boundaries'));
  assert.ok(requiredFields.includes('standalone_domain_behavior'));
  assert.ok(requiredFields.includes('runtime_profile_catalog_boundary'));
  assert.ok(requiredFields.includes('configuration_examples'));
  assert.ok(requiredFields.includes('hermes_agent_requires_full_agent_loop'));
  assert.ok(requiredFields.includes('simple_llm_backend_forbidden'));
  assert.ok(requiredFields.includes('openai_compatible_gateway_backend_forbidden'));
  assert.ok(requiredFields.includes('domain_repo_provider_catalog_forbidden'));
  assert.ok(!requiredFields.includes('default_executor'));
  assert.ok(!requiredFields.includes('hermes_native_requires_full_agent_loop'));
  assert.deepEqual(properties.default_executor_name, { const: 'codex_cli' });
  assert.deepEqual(properties.default_executor_mode, { const: 'autonomous' });
  assert.equal((properties.canonical_executor_backends as JsonObject).type, 'array');
  assert.equal((properties.compatibility_aliases as JsonObject).type, 'object');
  assert.equal((properties.execution_shapes as JsonObject).type, 'object');
  assert.equal((properties.executor_labels as JsonObject).type, 'object');
  assert.equal((properties.executor_statuses as JsonObject).type, 'object');
  assert.equal((properties.hermes_agent_requires_full_agent_loop as JsonObject).const, true);
  assert.equal((properties.simple_llm_backend_forbidden as JsonObject).const, true);
  assert.equal((properties.openai_compatible_gateway_backend_forbidden as JsonObject).const, true);
  assert.equal((properties.domain_repo_provider_catalog_forbidden as JsonObject).const, true);
  for (const field of [
    'layered_executor_semantics',
    'effective_default_executor_resolution',
    'ownership_boundaries',
    'standalone_domain_behavior',
    'runtime_profile_catalog_boundary',
    'configuration_examples',
  ]) {
    assert.deepEqual((properties[field] as JsonObject).const, executionModel[field]);
  }
  assert.equal(executionModel.default_executor_name, 'codex_cli');
  assert.equal(executionModel.default_executor_mode, 'autonomous');
  assert.deepEqual(executionModel.canonical_executor_backends, ['codex_cli', 'hermes_agent']);
  assert.deepEqual(executionModel.compatibility_aliases, { host_agent: 'codex_cli' });
  assert.deepEqual(((executionModel.execution_shapes as JsonObject).structured_call as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(((executionModel.execution_shapes as JsonObject).agent_loop as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(executionModel.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(executionModel.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(executionModel.hermes_agent_requires_full_agent_loop, true);
  assert.equal(executionModel.simple_llm_backend_forbidden, true);
  assert.equal(executionModel.openai_compatible_gateway_backend_forbidden, true);
  assertLayeredExecutorPolicy(executionModel);
  assert.ok(!('default_executor' in executionModel));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executionModel));
  assert.ok(evidenceRefs.includes('default_executor_name=codex_cli'));
  assert.ok(evidenceRefs.includes('default_executor_mode=autonomous'));
  assert.ok(evidenceRefs.includes('canonical_executor_backends=codex_cli,hermes_agent'));
  assert.ok(evidenceRefs.includes('execution_shapes=structured_call,agent_loop'));
  assert.ok(evidenceRefs.includes('executor_layers=user_interaction_shell,effective_default_executor,route_level_structured_call_routing'));
  assert.ok(evidenceRefs.includes('effective_default_executor_resolution=request_explicit_executor,opl_runtime_manager_or_handoff_default_executor,domain_local_user_config,domain_built_in_default_codex_cli'));
  assert.ok(evidenceRefs.includes('standalone_without_opl_config=use_domain_defaults'));
  assert.ok(evidenceRefs.includes('executor_status.hermes_agent=experimental'));
  assert.ok(evidenceRefs.includes('simple_llm_backend=forbidden'));
  assert.ok(evidenceRefs.includes('openai_compatible_gateway_backend=forbidden'));
  assert.ok(evidenceRefs.includes('domain_repo_provider_catalog=forbidden'));
  assert.ok(evidenceRefs.includes('configuration_examples=not_default_active'));
});

test('family manifests use the same split executor declaration', () => {
  const example = readJson('examples/opl-gateway/domain-onboarding-readiness.json');
  const exampleExecutionModel = example.execution_model as JsonObject;
  const exampleFormalInclusionGate = example.formal_inclusion_gate as JsonObject;
  const exampleExecutionModelAligned = exampleFormalInclusionGate.execution_model_aligned as JsonObject;
  const exampleEvidenceRefs = exampleExecutionModelAligned.evidence_refs as string[];
  const medAutoScienceFixture = readJson(
    'tests/fixtures/family-manifests/med-autoscience-product-entry-manifest.json',
  );
  const executorDefaults = medAutoScienceFixture.executor_defaults as JsonObject;

  assert.equal(exampleExecutionModel.default_executor_name, 'codex_cli');
  assert.equal(exampleExecutionModel.default_executor_mode, 'autonomous');
  assert.deepEqual(exampleExecutionModel.canonical_executor_backends, ['codex_cli', 'hermes_agent']);
  assert.deepEqual(exampleExecutionModel.compatibility_aliases, { host_agent: 'codex_cli' });
  assert.deepEqual(((exampleExecutionModel.execution_shapes as JsonObject).structured_call as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(((exampleExecutionModel.execution_shapes as JsonObject).agent_loop as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(exampleExecutionModel.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(exampleExecutionModel.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(exampleExecutionModel.hermes_agent_requires_full_agent_loop, true);
  assert.equal(exampleExecutionModel.simple_llm_backend_forbidden, true);
  assert.equal(exampleExecutionModel.openai_compatible_gateway_backend_forbidden, true);
  assertLayeredExecutorPolicy(exampleExecutionModel);
  assert.ok(exampleEvidenceRefs.includes('executor_status.hermes_agent=experimental'));

  assert.equal(executorDefaults.default_executor_name, 'codex_cli');
  assert.equal(executorDefaults.default_executor_mode, 'autonomous');
  assert.deepEqual(executorDefaults.canonical_executor_backends, ['codex_cli', 'hermes_agent']);
  assert.deepEqual(executorDefaults.compatibility_aliases, { host_agent: 'codex_cli' });
  assert.deepEqual(((executorDefaults.execution_shapes as JsonObject).structured_call as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(((executorDefaults.execution_shapes as JsonObject).agent_loop as JsonObject).allowed_backends, [
    'codex_cli',
    'hermes_agent',
  ]);
  assert.deepEqual(executorDefaults.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(executorDefaults.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(executorDefaults.hermes_agent_requires_full_agent_loop, true);
  assert.equal(executorDefaults.simple_llm_backend_forbidden, true);
  assert.equal(executorDefaults.openai_compatible_gateway_backend_forbidden, true);
  assertLayeredExecutorPolicy(executorDefaults);
  assert.ok(!('default_executor' in executorDefaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executorDefaults));
});

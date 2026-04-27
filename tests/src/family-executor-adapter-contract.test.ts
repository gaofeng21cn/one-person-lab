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
  assert.ok(requiredFields.includes('executor_labels'));
  assert.ok(requiredFields.includes('executor_statuses'));
  assert.ok(requiredFields.includes('hermes_agent_requires_full_agent_loop'));
  assert.ok(requiredFields.includes('simple_llm_backend_forbidden'));
  assert.ok(requiredFields.includes('openai_compatible_gateway_backend_forbidden'));
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
  assert.ok(!('default_executor' in executionModel));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executionModel));
  assert.ok(evidenceRefs.includes('default_executor_name=codex_cli'));
  assert.ok(evidenceRefs.includes('default_executor_mode=autonomous'));
  assert.ok(evidenceRefs.includes('canonical_executor_backends=codex_cli,hermes_agent'));
  assert.ok(evidenceRefs.includes('execution_shapes=structured_call,agent_loop'));
  assert.ok(evidenceRefs.includes('executor_status.hermes_agent=experimental'));
  assert.ok(evidenceRefs.includes('simple_llm_backend=forbidden'));
  assert.ok(evidenceRefs.includes('openai_compatible_gateway_backend=forbidden'));
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
  assert.ok(!('default_executor' in executorDefaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executorDefaults));
});

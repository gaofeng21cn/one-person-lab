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
  const guardrails = contract.guardrails as JsonObject;

  assert.equal(defaults.default_executor_name, 'codex_cli');
  assert.equal(defaults.default_executor_mode, 'autonomous');
  assert.equal(defaults.default_model, 'inherit_local_codex_default');
  assert.equal(defaults.default_reasoning_effort, 'inherit_local_codex_default');
  assert.equal(executorLabels.codex_cli, 'Codex CLI');
  assert.equal(executorLabels.hermes_agent, 'Hermes-Agent');
  assert.equal(executorStatuses.codex_cli, 'default');
  assert.equal(executorStatuses.hermes_agent, 'experimental');
  assert.equal(guardrails.hermes_agent_requires_full_agent_loop, true);
  assert.ok(!('default_executor' in defaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in guardrails));
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
  assert.ok(requiredFields.includes('executor_labels'));
  assert.ok(requiredFields.includes('executor_statuses'));
  assert.ok(requiredFields.includes('hermes_agent_requires_full_agent_loop'));
  assert.ok(!requiredFields.includes('default_executor'));
  assert.ok(!requiredFields.includes('hermes_native_requires_full_agent_loop'));
  assert.deepEqual(properties.default_executor_name, { const: 'codex_cli' });
  assert.deepEqual(properties.default_executor_mode, { const: 'autonomous' });
  assert.equal((properties.executor_labels as JsonObject).type, 'object');
  assert.equal((properties.executor_statuses as JsonObject).type, 'object');
  assert.equal((properties.hermes_agent_requires_full_agent_loop as JsonObject).const, true);
  assert.equal(executionModel.default_executor_name, 'codex_cli');
  assert.equal(executionModel.default_executor_mode, 'autonomous');
  assert.deepEqual(executionModel.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(executionModel.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(executionModel.hermes_agent_requires_full_agent_loop, true);
  assert.ok(!('default_executor' in executionModel));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executionModel));
  assert.ok(evidenceRefs.includes('default_executor_name=codex_cli'));
  assert.ok(evidenceRefs.includes('default_executor_mode=autonomous'));
  assert.ok(evidenceRefs.includes('executor_status.hermes_agent=experimental'));
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
  assert.deepEqual(exampleExecutionModel.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(exampleExecutionModel.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(exampleExecutionModel.hermes_agent_requires_full_agent_loop, true);
  assert.ok(exampleEvidenceRefs.includes('executor_status.hermes_agent=experimental'));

  assert.equal(executorDefaults.default_executor_name, 'codex_cli');
  assert.equal(executorDefaults.default_executor_mode, 'autonomous');
  assert.deepEqual(executorDefaults.executor_labels, {
    codex_cli: 'Codex CLI',
    hermes_agent: 'Hermes-Agent',
  });
  assert.deepEqual(executorDefaults.executor_statuses, {
    codex_cli: 'default',
    hermes_agent: 'experimental',
  });
  assert.equal(executorDefaults.hermes_agent_requires_full_agent_loop, true);
  assert.ok(!('default_executor' in executorDefaults));
  assert.ok(!('hermes_native_requires_full_agent_loop' in executorDefaults));
});

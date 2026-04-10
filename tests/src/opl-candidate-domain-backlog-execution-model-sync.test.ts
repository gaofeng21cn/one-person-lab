import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Json {
  return JSON.parse(read(relativePath)) as Json;
}

const expectedRequiredPackageIds = [
  'registry_material',
  'public_documentation',
  'truth_ownership',
  'review_surfaces',
  'execution_model',
  'discovery_readiness',
  'routing_readiness',
  'cross_domain_wording',
];

const expectedFormalInclusionCheckIds = [
  'registry_complete',
  'boundary_explicit',
  'truth_ownership_explicit',
  'discovery_ready',
  'routing_ready',
  'review_ready',
  'execution_model_aligned',
  'cross_domain_wording_aligned',
];

test('candidate-domain backlog public companions mirror execution-model blockers from the machine-readable backlog', () => {
  const backlog = readJson('contracts/opl-gateway/candidate-domain-backlog.json');
  const english = read('docs/references/opl-candidate-domain-backlog.md');
  const chinese = read('docs/references/opl-candidate-domain-backlog.zh-CN.md');

  assert.deepEqual(backlog.required_package_ids, expectedRequiredPackageIds);
  assert.deepEqual(backlog.formal_inclusion_check_ids, expectedFormalInclusionCheckIds);
  assert.ok(!backlog.required_package_ids.includes('discovery_routing_readiness'));
  assert.ok(
    backlog.backlog_rules.some((rule: string) =>
      /top-level signal.*domain-direction evidence.*does not by itself satisfy.*discovery readiness.*routing readiness.*admission/i.test(
        rule,
      ),
    ),
  );

  for (const doc of [english, chinese]) {
    assert.match(doc, /execution-model declaration|execution model|execution-model|执行模型/i);
    assert.match(doc, /stable agent runtime surface/i);
    assert.match(doc, /Auto.*Human-in-the-loop.*share one base|共享同一基座/i);
    assert.match(doc, /code-versus-Agent responsibility split|code-versus-Agent|code\/Agent responsibility split/i);
    assert.match(doc, /fixed-code-first/i);
    assert.match(doc, /under definition \/ deferred|under-definition \/ deferred|under definition|under-definition|仍然只能停留在 under definition \/ deferred/i);
    assert.match(doc, /discovery readiness blocker|discovery readiness|discovery-ready|discovery readiness blocker|发现 readiness blocker/i);
    assert.match(doc, /routing readiness blocker|routing readiness|routed-action-ready|路由 readiness blocker/i);
  }

  for (const label of ['Grant Ops', 'Thesis Ops', 'Review Ops']) {
    assert.match(
      english,
      new RegExp(`${label}[\\s\\S]{0,1200}execution-model declaration`, 'i'),
    );
  }

  for (const label of ['Grant Ops', 'Thesis Ops', 'Review Ops']) {
    assert.match(
      chinese,
      new RegExp(`${label}[\\s\\S]{0,1200}(execution-model declaration|stable agent runtime surface)`, 'i'),
    );
  }

  assert.match(english, /Grant Foundry -> Med Auto Grant/i);
  assert.match(english, /top-level signal/i);
  assert.match(english, /domain-direction evidence/i);
  assert.match(english, /does not count as an admitted domain gateway|is not an admitted domain gateway/i);
  assert.match(english, /does not count as `?G2`? discovery readiness|`?G2`? discovery-ready/i);
  assert.match(english, /does not count as `?G3`? routed-action readiness|`?G3`? routed-action-ready/i);

  assert.match(chinese, /Grant Foundry -> Med Auto Grant/);
  assert.match(chinese, /top-level signal|顶层信号/);
  assert.match(chinese, /domain-direction evidence|领域方向证据/);
  assert.match(chinese, /不等于已经 admitted 的 domain gateway|不等于已正式收录的 domain gateway/);
  assert.match(chinese, /不等于 `?G2`? discovery readiness|`?G2`? discovery-ready/);
  assert.match(chinese, /不等于 `?G3`? routed-action readiness|`?G3`? routed-action-ready|`?G3`? routed-action readiness|`?G3`? routed-action target/);
});

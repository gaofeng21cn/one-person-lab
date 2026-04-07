import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Json {
  return JSON.parse(read(relativePath)) as Json;
}

test('candidate-domain backlog public companions mirror execution-model blockers from the machine-readable backlog', () => {
  const backlog = readJson('contracts/opl-gateway/candidate-domain-backlog.json');
  const english = read('docs/references/opl-candidate-domain-backlog.md');
  const chinese = read('docs/references/opl-candidate-domain-backlog.zh-CN.md');

  assert.ok(backlog.required_package_ids.includes('execution_model'));
  assert.ok(backlog.formal_inclusion_check_ids.includes('execution_model_aligned'));

  for (const doc of [english, chinese]) {
    assert.match(doc, /execution-model declaration|execution model|execution-model|执行模型/i);
    assert.match(doc, /stable agent runtime surface/i);
    assert.match(doc, /Auto.*Human-in-the-loop.*share one base|共享同一基座/i);
    assert.match(doc, /code-versus-Agent responsibility split|code-versus-Agent|code\/Agent responsibility split/i);
    assert.match(doc, /fixed-code-first/i);
    assert.match(doc, /under definition \/ deferred|under-definition \/ deferred|under definition|under-definition|仍然只能停留在 under definition \/ deferred/i);
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
});

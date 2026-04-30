import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

test('family domain quality projection contract requires evidence, review, gate, and proof fields', () => {
  const doc = read('docs/references/family-domain-quality-projection-contract.md');
  const contract = readJson('contracts/opl-gateway/family-domain-quality-projection-contract.json');

  for (const field of [
    'quality_gate_status',
    'evidence_refs',
    'review_refs',
    'human_gate_reason',
    'failure_escalation',
    'latest_eval_or_proof_pointer',
    'assessment_owner',
  ]) {
    assert.match(doc, new RegExp(field));
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
});

test('family domain quality projection contract maps quality authority to MAS, MAG, and RCA surfaces', () => {
  const doc = read('docs/references/family-domain-quality-projection-contract.md');
  const mappings = readJson('contracts/opl-gateway/family-domain-quality-projection-contract.json').domain_mappings as Record<string, string[]>;

  for (const required of [
    'AI reviewer-backed `publication_eval/latest.json`',
    'grant review',
    'fundability gate',
    'submission readiness',
    'content-fit review',
    'render proof',
    'export proof',
    'visual QA',
  ]) {
    assert.match(doc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.ok(mappings['med-autoscience'].includes('AI reviewer-backed publication_eval/latest.json'));
  assert.ok(mappings['med-autogrant'].includes('fundability gate'));
  assert.ok(mappings['redcube-ai'].includes('export proof'));
});

test('family domain quality projection contract forbids generic or claim-only quality authority', () => {
  const doc = read('docs/references/family-domain-quality-projection-contract.md');
  const forbidden = readJson('contracts/opl-gateway/family-domain-quality-projection-contract.json').forbidden_quality_authorities as string[];

  for (const source of [
    'generic persona QA',
    'non-domain owner gate',
    'NEXUS role approval',
    'claim-only ready',
    'chat summary / memory / terminal prose',
    'OPL projection without domain-owned eval/proof refs',
  ]) {
    assert.match(doc, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.ok(forbidden.includes('generic persona QA'));
  assert.ok(forbidden.includes('claim-only ready'));
  assert.ok(forbidden.includes('OPL projection without domain-owned eval/proof refs'));
});


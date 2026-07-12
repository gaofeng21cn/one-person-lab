import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  validateStandardAgentImplementationProfile,
  validateStandardAgentImplementationProfileRefs,
} from '../../src/modules/pack/standard-agent-implementation-profile.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const schemaRef = 'contracts/opl-framework/standard-agent-implementation-profile.schema.json';

function profileWithHelpers(entries: unknown[]) {
  return {
    ...STANDARD_AGENT_IMPLEMENTATION_PROFILE,
    helpers: {
      ...STANDARD_AGENT_IMPLEMENTATION_PROFILE.helpers,
      entries,
    },
  };
}

test('standard implementation profile accepts the empty pack-only baseline', () => {
  const validation = validateStandardAgentImplementationProfile(STANDARD_AGENT_IMPLEMENTATION_PROFILE, { required: true });
  assert.equal(validation.status, 'passed');
  assert.deepEqual(validation.blockers, []);
});

test('standard implementation profile accepts an existing domain helper root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-implementation-profile-'));
  fs.mkdirSync(path.join(root, 'runtime', 'authority_functions'), { recursive: true });
  const validation = validateStandardAgentImplementationProfileRefs(profileWithHelpers([
    {
      language: 'python',
      role: 'domain_helper',
      source_roots: ['runtime/authority_functions/'],
    },
  ]), root);
  assert.equal(validation.status, 'passed');
  assert.deepEqual(validation.blockers, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('standard implementation profile blocks a missing helper root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-implementation-profile-'));
  const validation = validateStandardAgentImplementationProfileRefs(profileWithHelpers([
    {
      language: 'typescript',
      role: 'authority_function',
      source_roots: ['runtime/missing_helpers/'],
    },
  ]), root);
  assert.equal(validation.status, 'blocked');
  assert.ok(validation.blockers.some((blocker) => blocker.endsWith('_missing')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('standard implementation profile rejects Rust domain helpers', () => {
  const validation = validateStandardAgentImplementationProfile(profileWithHelpers([
    {
      language: 'rust',
      role: 'native_helper',
      source_roots: ['runtime/native_helpers/'],
    },
  ]), { required: true });
  assert.equal(validation.status, 'blocked');
  assert.ok(validation.blockers.includes('implementation_profile.helpers.entries[0]_rust_forbidden_in_domain_agent_profile'));
});

test('standard implementation profile schema accepts empty helpers and rejects identity drift', () => {
  const schema = parseJsonText(fs.readFileSync(path.join(repoRoot, schemaRef), 'utf8')) as Record<string, unknown>;
  const valid = validateJsonSchemaPayload(
    {
      schemaId: schemaRef,
      schema,
      sourceRef: schemaRef,
    },
    STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  );
  assert.equal(valid.ok, true);
  const invalid = validateJsonSchemaPayload(
    {
      schemaId: schemaRef,
      schema,
      sourceRef: schemaRef,
    },
    { ...STANDARD_AGENT_IMPLEMENTATION_PROFILE, agent_identity: 'domain_helper' },
  );
  assert.equal(invalid.ok, false);
});

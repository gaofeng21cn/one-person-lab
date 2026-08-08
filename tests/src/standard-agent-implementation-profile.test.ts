import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
  resolveStandardAgentImplementationProfile,
  validateStandardAgentImplementationProfileDeclaration,
  validateStandardAgentImplementationProfile,
  validateStandardAgentImplementationProfileRefs,
} from '../../src/modules/pack/standard-agent-implementation-profile.ts';
import {
  OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  STANDARD_DOMAIN_AGENT_REPO_LOCAL_RUNTIME_PROFILE_ID,
} from '../../src/modules/pack/standard-agent-execution-profile.ts';
import {
  STANDARD_AGENT_PACK_ABI,
  STANDARD_AGENT_PACK_ABI_DECLARATION,
  resolveStandardAgentPackAbi,
} from '../../src/modules/pack/standard-agent-pack-abi.ts';
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

test('standard implementation profile resolves the canonical ref plus helper delta', () => {
  const resolution = resolveStandardAgentImplementationProfile(
    STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
    {
      selectedExecutionProfileId: STANDARD_DOMAIN_AGENT_REPO_LOCAL_RUNTIME_PROFILE_ID,
      required: true,
    },
  );
  assert.equal(resolution.status, 'passed');
  assert.equal(resolution.applicability, 'repo_local');
  assert.equal(resolution.declaration_kind, 'canonical_ref_delta');
  assert.deepEqual(resolution.effective_profile, STANDARD_AGENT_IMPLEMENTATION_PROFILE);
});

test('standard implementation profile keeps legacy full declarations read compatible', () => {
  const validation = validateStandardAgentImplementationProfileDeclaration(
    STANDARD_AGENT_IMPLEMENTATION_PROFILE,
    { required: true },
  );
  assert.equal(validation.status, 'passed');
  assert.equal(validation.declaration_kind, 'legacy_full_profile');
  assert.deepEqual(validation.profile, STANDARD_AGENT_IMPLEMENTATION_PROFILE);
});

test('standard implementation profile blocks a non-canonical base ref', () => {
  const validation = validateStandardAgentImplementationProfileDeclaration({
    ...STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
    base_profile_ref: 'contracts/local-profile.json',
  }, { required: true });
  assert.equal(validation.status, 'blocked');
  assert.ok(validation.blockers.includes('implementation_profile_base_profile_ref_invalid'));
});

test('hosted execution profile rejects repo-local implementation declarations', () => {
  const absent = resolveStandardAgentImplementationProfile(undefined, {
    selectedExecutionProfileId: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
    required: true,
  });
  assert.deepEqual(absent, {
    status: 'not_applicable',
    applicability: 'opl_hosted',
    selected_execution_profile_id: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
    effective_profile: null,
    blockers: [],
  });

  const declared = resolveStandardAgentImplementationProfile(
    STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
    {
      selectedExecutionProfileId: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
    },
  );
  assert.equal(declared.status, 'blocked');
  assert.ok(declared.blockers.includes(
    'hosted_execution_profile_must_not_declare_repo_local_implementation_profile',
  ));
});

test('standard Agent Pack ABI authority ref resolves the Framework canonical constant', () => {
  const resolution = resolveStandardAgentPackAbi(STANDARD_AGENT_PACK_ABI_DECLARATION, {
    selectedExecutionProfileId: STANDARD_DOMAIN_AGENT_REPO_LOCAL_RUNTIME_PROFILE_ID,
    required: true,
  });
  assert.equal(resolution.status, 'passed');
  assert.equal(resolution.declaration_kind, 'canonical_authority_ref');
  assert.deepEqual(resolution.effective_abi, STANDARD_AGENT_PACK_ABI);

  const skeleton = parseJsonText(fs.readFileSync(path.join(
    repoRoot,
    'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
  ), 'utf8')) as Record<string, any>;
  assert.deepEqual(skeleton.agent_pack_contract.standard_agent_pack_abi, STANDARD_AGENT_PACK_ABI);
});

test('hosted execution profile rejects repo-local ABI declarations', () => {
  const absent = resolveStandardAgentPackAbi(undefined, {
    selectedExecutionProfileId: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
    required: true,
  });
  assert.deepEqual(absent, {
    status: 'not_applicable',
    applicability: 'opl_hosted',
    selected_execution_profile_id: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
    effective_abi: null,
    blockers: [],
  });
  const declared = resolveStandardAgentPackAbi(STANDARD_AGENT_PACK_ABI_DECLARATION, {
    selectedExecutionProfileId: OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  });
  assert.equal(declared.status, 'blocked');
  assert.ok(declared.blockers.includes(
    'hosted_execution_profile_must_not_declare_repo_local_standard_agent_pack_abi',
  ));
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
    STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
  );
  assert.equal(valid.ok, true);
  const legacy = validateJsonSchemaPayload(
    {
      schemaId: schemaRef,
      schema,
      sourceRef: schemaRef,
    },
    STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  );
  assert.equal(legacy.ok, true);
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

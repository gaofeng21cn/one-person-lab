import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const mapRef = 'contracts/opl-framework/cordis-surface-map.json';
const schemaRef = 'contracts/opl-framework/cordis-surface-map.schema.json';

type JsonObject = Record<string, unknown>;

function readJson(relativePath: string): JsonObject {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as JsonObject;
}

function repoPath(ref: string): string {
  return ref.split('#', 1)[0];
}

function readRepoRef(ref: string): string {
  return fs.readFileSync(path.join(repoRoot, repoPath(ref)), 'utf8');
}

function wordPattern(value: string): RegExp {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`);
}

function mapPayload(): JsonObject {
  return readJson(mapRef);
}

test('Cordis surface map is valid against its machine contract', () => {
  const schemaEntry = {
    schemaId: 'opl.cordis_surface_map.v1',
    schema: readJson(schemaRef),
    sourceRef: schemaRef,
  };
  const result = validateJsonSchemaPayload(schemaEntry, mapPayload());

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));

  const overclaim = structuredClone(mapPayload()) as {
    phase_state: { cordis_adopted: boolean };
  };
  overclaim.phase_state.cordis_adopted = false;
  const rejected = validateJsonSchemaPayload(schemaEntry, overclaim);
  assert.equal(rejected.ok, false);
  if (rejected.ok) assert.fail('Cordis adoption overclaim unexpectedly passed schema validation');
  assert.equal(
    rejected.errors.some((error) =>
      error.instance_path === '/phase_state/cordis_adopted'
      && error.keyword === 'const'
    ),
    true,
  );
});

test('Cordis surface map preserves the ten brand-domain candidates independently of source topology', () => {
  const map = mapPayload() as {
    modules: Array<{
      module_id: string;
      brand_name: string;
      public_entrypoint: string;
      candidate_plugin_id: string;
      lifecycle_state: string;
      candidate_disposition: string;
    }>;
  };

  const expectedIds = ['charter', 'atlas', 'workspace', 'pack', 'stagecraft', 'runway', 'ledger', 'console', 'foundry', 'connect'];
  const actualIds = map.modules.map((module) => module.module_id);
  assert.deepEqual(actualIds, expectedIds);

  for (const sourceModule of map.modules) {
    const candidate = map.modules.find((module) => module.module_id === sourceModule.module_id);
    assert.ok(candidate, `missing Cordis candidate for ${sourceModule.module_id}`);
    assert.equal(typeof candidate.brand_name, 'string');
    assert.equal(typeof candidate.public_entrypoint, 'string');
    assert.match(candidate.candidate_plugin_id, /^opl\.[a-z][a-z0-9-]*\.candidate$/);
    assert.equal(candidate.lifecycle_state, 'not_implemented');
    assert.notEqual(candidate.candidate_disposition, 'adopted');
  }
});

test('surface evidence points to existing exports and real caller files', () => {
  const map = mapPayload() as {
    modules: Array<{
      module_id: string;
      surface_evidence: Array<{
        symbol: string;
        declaration_ref: string;
        public_entrypoint_ref: string;
        caller_refs: string[];
      }>;
      provides: Array<{ service_id: string; existing_surface_symbol: string }>;
      injects: Array<{ service_id: string }>;
    }>;
  };

  const seenServiceIds = new Set<string>();
  for (const candidate of map.modules) {
    for (const evidence of candidate.surface_evidence) {
      const declaration = readRepoRef(evidence.declaration_ref);
      const publicEntrypoint = readRepoRef(evidence.public_entrypoint_ref);
      assert.match(declaration, wordPattern(evidence.symbol));
      assert.ok(publicEntrypoint.length > 0, `${candidate.module_id} public entrypoint is empty`);
      assert.ok(
        declaration.includes(`export function ${evidence.symbol}`)
          || declaration.includes(`export async function ${evidence.symbol}`)
          || declaration.includes(`export class ${evidence.symbol}`)
          || declaration.includes(`export const ${evidence.symbol}`),
        `${candidate.module_id}.${evidence.symbol} is not an exported declaration`,
      );
      assert.equal(candidate.provides.some((service) => service.existing_surface_symbol === evidence.symbol), true);

      for (const callerRef of evidence.caller_refs) {
        assert.notEqual(repoPath(callerRef), repoPath(evidence.declaration_ref));
        const caller = readRepoRef(callerRef);
        assert.match(caller, wordPattern(evidence.symbol), `${callerRef} does not contain ${evidence.symbol}`);
      }
    }

    for (const service of candidate.provides) {
      assert.equal(
        seenServiceIds.has(service.service_id),
        false,
        `duplicate service ${service.service_id}`,
      );
      seenServiceIds.add(service.service_id);
    }
  }

  for (const candidate of map.modules) {
    for (const injected of candidate.injects) {
      assert.equal(seenServiceIds.has(injected.service_id), true, injected.service_id);
    }
  }
});

test('candidate events and authority boundaries stay in-process and non-authoritative', () => {
  const map = mapPayload() as {
    phase_state: Record<string, unknown>;
    authority_boundary: Record<string, unknown>;
    global_forbidden_authorities: string[];
    modules: Array<{
      events: Array<{ event_id: string; durability: string; candidate_only: boolean; payload_ref: string }>;
      forbidden_authorities: string[];
      continue_authoritative_surfaces: Array<{ evidence_refs: string[] }>;
    }>;
  };

  assert.deepEqual(map.phase_state, {
    cordis_adopted: true,
    cordis_runtime_dependency_added: true,
    default_caller_changed: true,
    production_path_changed: true,
    composition_snapshot_approved: true,
    current_default_profile: 'base-headless',
    default_route: 'opl.profile.base-headless',
  });
  for (const value of Object.values(map.authority_boundary)) {
    assert.equal(value, false);
  }

  const eventIds = new Set<string>();
  for (const candidate of map.modules) {
    for (const event of candidate.events) {
      assert.equal(event.durability, 'in_process_only');
      assert.equal(event.candidate_only, true);
      assert.equal(eventIds.has(event.event_id), false);
      eventIds.add(event.event_id);
      assert.ok(fs.existsSync(path.join(repoRoot, repoPath(event.payload_ref))));
    }
    for (const authority of candidate.continue_authoritative_surfaces) {
      for (const ref of authority.evidence_refs) {
        assert.ok(fs.existsSync(path.join(repoRoot, repoPath(ref))), ref);
      }
    }
    for (const authority of candidate.forbidden_authorities) {
      assert.equal(map.global_forbidden_authorities.includes(authority), true);
    }
  }
  assert.ok(eventIds.size >= map.modules.length);
});

test('surface map records the exact Cordis runtime dependency', () => {
  const packageJson = readJson('package.json') as {
    dependencies?: Record<string, unknown>;
  };
  assert.equal(packageJson.dependencies?.['@deepseek-ai/cordis'], '4.0.5');
});

import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, test } from '../helpers.ts';

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCapabilityRepo(root: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agent', 'professional_skills', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent', 'professional_skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n');
  fs.writeFileSync(path.join(root, 'scripts', 'verify.sh'), '#!/usr/bin/env bash\nexit 0\n');
  writeJson(path.join(root, 'contracts', 'capability_map.json'), {
    surface_kind: 'opl_standard_agent_capability_map',
    schema_version: 'standard-agent-capability-map.v1',
    domain_id: path.basename(root),
    owner: 'demo-owner',
    authority_boundary: {
      can_write_domain_truth: false,
    },
    capabilities: [
      {
        capability_id: 'demo-professional-skill',
        surface_role: 'professional_skill',
        capability_kind: 'professional_skill',
        canonical_owner: 'demo-owner',
        canonical_target_paths: ['agent/professional_skills/demo/SKILL.md'],
        exposure_layer: 'repo_internal_professional_skill',
        codex_default_exposure: false,
        allowed_exposure_scopes: ['domain_runtime_stage'],
        verification_refs: ['scripts/verify.sh#demo'],
        forbidden_surfaces: ['owner_receipts'],
        owner_closeout_boundary_ref: 'contracts/capability_map.json#/owner_closeout_boundary',
        ...overrides,
      },
    ],
  });
}

test('capability-map audit passes valid cross-repo capability maps', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-audit-'));
  try {
    const first = path.join(fixtureRoot, 'first-agent');
    const second = path.join(fixtureRoot, 'second-agent');
    writeCapabilityRepo(first);
    writeCapabilityRepo(second);

    const result = spawnSync('node', [
      path.join(repoRoot, 'scripts', 'capability-map-audit.mjs'),
      first,
      second,
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = readJsonPayload(result.stdout);
    assert.equal(payload.status, 'passed');
    assert.equal(payload.checked_repo_count, 2);
    assert.deepEqual(payload.results.map((entry: Record<string, unknown>) => entry.status), ['passed', 'passed']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('capability-map audit blocks unlisted repo professional skills', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-audit-unlisted-'));
  try {
    const repo = path.join(fixtureRoot, 'unlisted-agent');
    writeCapabilityRepo(repo, {
      physical_source_ref: {
        ref_kind: 'repo_path',
        ref: 'contracts/capability_map.json',
        role: 'non_skill_source',
      },
      canonical_target_paths: ['contracts/capability_map.json'],
    });

    const result = spawnSync('node', [
      path.join(repoRoot, 'scripts', 'capability-map-audit.mjs'),
      repo,
      '--json',
    ], { encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const payload = readJsonPayload(result.stdout);
    assert.equal(payload.status, 'blocked');
    assert.equal(
      payload.results[0].blockers.includes(
        'missing_professional_skill_capability:agent/professional_skills/demo/SKILL.md',
      ),
      true,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('capability-map audit blocks unresolved capability paths', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-audit-bad-'));
  try {
    const repo = path.join(fixtureRoot, 'bad-agent');
    writeCapabilityRepo(repo, {
      canonical_target_paths: ['agent/professional_skills/missing/SKILL.md'],
    });

    const result = spawnSync('node', [
      path.join(repoRoot, 'scripts', 'capability-map-audit.mjs'),
      repo,
      '--json',
    ], { encoding: 'utf8' });

    assert.notEqual(result.status, 0);
    const payload = readJsonPayload(result.stdout);
    assert.equal(payload.status, 'blocked');
    assert.equal(
      payload.results[0].blockers.includes(
        'demo-professional-skill:missing_canonical_path:agent/professional_skills/missing/SKILL.md',
      ),
      true,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('capability-map audit expands shared policy profiles', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-audit-profiles-'));
  try {
    const repo = path.join(fixtureRoot, 'profile-agent');
    writeCapabilityRepo(repo);
    const mapPath = path.join(repo, 'contracts', 'capability_map.json');
    const map = readJson(mapPath);
    const capability = map.capabilities[0];
    map.capability_policy_profiles = {
      standard: {
        authority_boundary: { can_write_domain_truth: false },
        verification_refs: capability.verification_refs,
        forbidden_surfaces: capability.forbidden_surfaces,
        owner_closeout_boundary: {
          owner: 'demo-owner',
          required_return_shapes: ['owner_receipt_ref'],
          can_write_owner_receipt_body: false,
          can_create_typed_blocker: false,
        },
      },
    };
    capability.capability_policy_profile_ref = '#/capability_policy_profiles/standard';
    delete capability.verification_refs;
    delete capability.forbidden_surfaces;
    delete capability.owner_closeout_boundary_ref;
    writeJson(mapPath, map);

    const result = spawnSync('node', [
      path.join(repoRoot, 'scripts', 'capability-map-audit.mjs'),
      repo,
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readJsonPayload(result.stdout).status, 'passed');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function readJsonPayload(stdout: string): Record<string, any> {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-audit-output-'));
  try {
    const filePath = path.join(fixtureRoot, 'payload.json');
    fs.writeFileSync(filePath, stdout);
    return readJson(filePath);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

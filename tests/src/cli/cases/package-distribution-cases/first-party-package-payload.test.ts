import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { assertJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const generator = path.join(repoRoot, 'scripts/first-party-package-payload.mjs');
const sourceRepoUrl = 'https://github.com/example/example-agent.git';
const packageId = 'example-agent';
const pluginId = 'example-plugin';
const packageVersion = '0.3.1';
const defaultSourceRoot = `plugins/${pluginId}`;
const packageTemplates = Object.fromEntries(
  Object.entries({ agent: 'mag', capability: 'mas-scholar-skills', workflow: 'opl-flow' }).map(([kind, id]) => [
    kind,
    JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages', `${id}.json`),
      'utf8',
    )) as Record<string, any>,
  ]),
) as Record<'agent' | 'capability' | 'workflow', Record<string, any>>;

type SourceFixture = {
  repo: string;
  sourceCommit: string;
  sourceRoot: string;
  paths: string[];
};

type AuthorityFixture = {
  manifest: string;
  allowlist: string;
  output: string;
};

function git(repo: string, args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function rootedPath(sourceRoot: string, relativePath: string) {
  return sourceRoot === '.' ? relativePath : `${sourceRoot}/${relativePath}`;
}

function writeFile(repo: string, relativePath: string, content: string | Buffer, mode?: number) {
  const filePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (mode !== undefined) fs.chmodSync(filePath, mode);
}

function commitAll(repo: string, message: string) {
  git(repo, ['add', '--all']);
  git(repo, ['commit', '--quiet', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function createSourceRepo(root: string, input: {
  sourceRoot?: string;
  pluginName?: string;
  pluginVersion?: string;
  pluginBytes?: Buffer;
  executableSkill?: boolean;
  symlinkSkill?: boolean;
} = {}): SourceFixture {
  const sourceRoot = input.sourceRoot ?? defaultSourceRoot;
  const repo = path.join(root, 'source');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.name', 'Payload Test']);
  git(repo, ['config', 'user.email', 'payload-test@example.invalid']);
  git(repo, ['remote', 'add', 'origin', sourceRepoUrl]);
  const pluginPath = rootedPath(sourceRoot, '.codex-plugin/plugin.json');
  writeFile(
    repo,
    pluginPath,
    input.pluginBytes ?? `${JSON.stringify({ name: input.pluginName ?? pluginId, version: input.pluginVersion ?? packageVersion })}\n`,
  );
  writeFile(repo, rootedPath(sourceRoot, 'assets/icon.bin'), Buffer.from([0, 1, 2, 255]));
  const skillPath = rootedPath(sourceRoot, `skills/${pluginId}/SKILL.md`);
  if (input.symlinkSkill) {
    writeFile(repo, rootedPath(sourceRoot, 'skills/shared.md'), '# Shared\n');
    fs.mkdirSync(path.dirname(path.join(repo, skillPath)), { recursive: true });
    fs.symlinkSync('../../shared.md', path.join(repo, skillPath));
  } else {
    writeFile(repo, skillPath, '# Example 0.3.1\n', input.executableSkill ? 0o755 : undefined);
  }
  writeFile(repo, rootedPath(sourceRoot, 'README.md'), 'not part of the carrier payload\n');
  writeFile(repo, 'docs/repository-only.md', 'must never be discovered recursively\n');
  const sourceCommit = commitAll(repo, 'example payload source');
  return {
    repo,
    sourceCommit,
    sourceRoot,
    paths: ['.codex-plugin/plugin.json', 'assets/icon.bin', `skills/${pluginId}/SKILL.md`],
  };
}

function createAuthority(root: string, source: Pick<SourceFixture, 'repo' | 'sourceRoot' | 'paths'>, input: {
  id?: string;
  plugin?: string;
  version?: string;
  repository?: string;
  surface?: 'agent' | 'capability' | 'workflow';
  manifestSourceRepo?: boolean;
} = {}): AuthorityFixture {
  const id = input.id ?? packageId;
  const plugin = input.plugin ?? pluginId;
  const version = input.version ?? packageVersion;
  const repository = input.repository ?? sourceRepoUrl;
  const packagesDir = path.join(root, 'framework', 'packages');
  const manifestPath = path.join(packagesDir, `${id}.json`);
  const allowlistPath = path.join(root, 'framework', 'package-payload-allowlists', `${id}.json`);
  const manifest = structuredClone(packageTemplates[input.surface ?? 'agent']);
  manifest.package_id = id;
  if (manifest.agent_id !== undefined) manifest.agent_id = id;
  manifest.version = version;
  if (input.manifestSourceRepo === false) delete manifest.source_repo;
  else manifest.source_repo = repository;
  manifest.codex_surface.plugin_id = plugin;
  manifest.codex_surface.plugin_payload_manifest_url = `payloads/${id}-${version}.json`;
  if (manifest.codex_surface.required_skill_ids !== undefined) manifest.codex_surface.required_skill_ids = [plugin];
  if (manifest.content_lock !== undefined) {
    const contentLock = crypto.createHash('sha256');
    for (const relativePath of source.paths) {
      contentLock.update(relativePath, 'utf8');
      contentLock.update('\0');
      contentLock.update(fs.readFileSync(path.join(source.repo, rootedPath(source.sourceRoot, relativePath))));
    }
    manifest.content_lock.paths = source.paths;
    manifest.content_lock.digest = `sha256:${contentLock.digest('hex')}`;
  }
  const allowlist = {
    surface_kind: 'opl_package_payload_allowlist.v1',
    package_id: id,
    plugin_id: plugin,
    source_repo: repository,
    source_root: source.sourceRoot,
    paths: source.paths,
  };
  writeFile(root, path.relative(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFile(root, path.relative(root, allowlistPath), `${JSON.stringify(allowlist, null, 2)}\n`);
  return {
    manifest: manifestPath,
    allowlist: allowlistPath,
    output: path.join(packagesDir, 'payloads', `${id}-${version}.json`),
  };
}

function editJson(filePath: string, edit: (value: Record<string, any>) => void) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
  edit(value);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function generatorArgs(input: {
  authority: AuthorityFixture;
  repo: string;
  sourceCommit: string;
  check?: boolean;
}) {
  return [
    generator,
    '--manifest', input.authority.manifest,
    '--allowlist', input.authority.allowlist,
    '--repo', input.repo,
    '--source-commit', input.sourceCommit,
    ...(input.check ? ['--check'] : []),
  ];
}

function runGenerator(input: Parameters<typeof generatorArgs>[0], env: NodeJS.ProcessEnv = process.env) {
  return JSON.parse(execFileSync(process.execPath, generatorArgs(input), {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  })) as Record<string, any>;
}

function runFailure(input: Parameters<typeof generatorArgs>[0], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, generatorArgs(input), {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
}

function runConcurrent(input: Parameters<typeof generatorArgs>[0]) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, generatorArgs(input), { cwd: repoRoot });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({
      status,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

function sha256(content: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

test('generator consumes manifest identity and an exact allowlist, emits the canonical schema, and is idempotent', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const authority = createAuthority(root, source);
  const previousPayload = path.join(path.dirname(authority.output), `${packageId}-0.3.0.json`);
  fs.mkdirSync(path.dirname(previousPayload), { recursive: true });
  fs.writeFileSync(previousPayload, 'immutable-previous-payload\n');

  writeFile(source.repo, rootedPath(source.sourceRoot, '.codex-plugin/plugin.json'), 'dirty worktree bytes\n');
  assert.notEqual(git(source.repo, ['status', '--short']), '');
  const first = runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
  const firstBytes = fs.readFileSync(authority.output);
  const payload = JSON.parse(firstBytes.toString('utf8')) as Record<string, any>;

  assert.equal(first.status, 'created');
  assert.equal(first.output, authority.output);
  assert.equal(first.file_count, 3);
  assert.equal(first.payload_sha256, sha256(firstBytes));
  assert.equal(payload.surface_kind, 'opl_package_payload_manifest.v1');
  assert.equal(payload.schema_ref, 'contracts/opl-framework/package-payload-manifest.schema.json');
  assert.equal(payload.package_id, packageId);
  assert.equal(payload.package_version, packageVersion);
  assert.equal(payload.source_repo, sourceRepoUrl);
  assert.equal(payload.source_commit, source.sourceCommit);
  assert.equal(payload.source_root, defaultSourceRoot);
  assert.deepEqual(payload.files.map((entry: Record<string, string>) => entry.path), source.paths);
  assert.equal(payload.files.some((entry: Record<string, string>) => entry.path === 'README.md'), false);
  assert.equal(payload.files[0].sha256, sha256(`${JSON.stringify({ name: pluginId, version: packageVersion })}\n`));
  assert.equal(payload.files[1].sha256, sha256(Buffer.from([0, 1, 2, 255])));
  assert.match(payload.files[0].source_url, new RegExp(`/${source.sourceCommit}/plugins/${pluginId}/\\.codex-plugin/plugin\\.json$`));
  assert.equal(firstBytes.at(-1), 10);
  assert.equal(fs.readFileSync(previousPayload, 'utf8'), 'immutable-previous-payload\n');

  const payloadSchema = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/package-payload-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: payloadSchema.$id,
    schema: payloadSchema,
    sourceRef: 'contracts/opl-framework/package-payload-manifest.schema.json',
  }, payload));
  const invalidPrereleasePayload = structuredClone(payload);
  invalidPrereleasePayload.package_version = '0.3.1-alpha.01';
  assert.throws(() => assertJsonSchemaPayload({
    schemaId: payloadSchema.$id,
    schema: payloadSchema,
    sourceRef: 'contracts/opl-framework/package-payload-manifest.schema.json',
  }, invalidPrereleasePayload));

  const second = runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
  assert.equal(second.status, 'unchanged');
  assert.equal(second.payload_sha256, first.payload_sha256);
  assert.deepEqual(fs.readFileSync(authority.output), firstBytes);
  const checked = runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit, check: true });
  assert.equal(checked.status, 'checked');
  assert.deepEqual(
    fs.readdirSync(path.dirname(authority.output)).sort(),
    [`${packageId}-0.3.0.json`, `${packageId}-${packageVersion}.json`],
  );
});

test('source_root dot still reads only allowlisted blobs instead of recursively packaging the repository', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root, { sourceRoot: '.' });
  for (const surface of ['capability', 'workflow'] as const) {
    const authority = createAuthority(path.join(root, surface), source, {
      surface,
      manifestSourceRepo: surface !== 'capability',
    });
    const result = runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
    const payload = JSON.parse(fs.readFileSync(authority.output, 'utf8')) as Record<string, any>;

    assert.equal(result.source_root, '.', surface);
    assert.equal(result.file_count, source.paths.length, surface);
    assert.deepEqual(payload.files.map((entry: Record<string, string>) => entry.path), source.paths, surface);
    assert.equal(payload.files.some((entry: Record<string, string>) => entry.path.startsWith('docs/')), false, surface);
    assert.equal(payload.files.some((entry: Record<string, string>) => entry.path === 'README.md'), false, surface);
  }
});

test('existing SemVer paths are immutable in write and check modes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-immutable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const authority = createAuthority(root, source);

  const missingCheck = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit, check: true });
  assert.notEqual(missingCheck.status, 0);
  assert.match(missingCheck.stderr, /Tracked payload manifest is missing/);
  assert.equal(fs.existsSync(authority.output), false);

  runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
  const drifted = Buffer.from('different immutable bytes\n');
  fs.writeFileSync(authority.output, drifted);
  const writeConflict = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
  assert.notEqual(writeConflict.status, 0);
  assert.match(writeConflict.stderr, /Immutable payload manifest conflict/);
  assert.deepEqual(fs.readFileSync(authority.output), drifted);
  const checkConflict = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit, check: true });
  assert.notEqual(checkConflict.status, 0);
  assert.match(checkConflict.stderr, /Tracked payload manifest drift detected/);
  assert.deepEqual(fs.readFileSync(authority.output), drifted);

  const symlinkRoot = path.join(root, 'symlink-output');
  const symlinkSource = createSourceRepo(symlinkRoot);
  const symlinkAuthority = createAuthority(symlinkRoot, symlinkSource);
  const outside = path.join(symlinkRoot, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.dirname(symlinkAuthority.output));
  const symlinkResult = runFailure({
    authority: symlinkAuthority,
    repo: symlinkSource.repo,
    sourceCommit: symlinkSource.sourceCommit,
  });
  assert.notEqual(symlinkResult.status, 0);
  assert.match(symlinkResult.stderr, /Payload output directory must be the real packages\/payloads directory/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('concurrent writers converge for equal bytes and fail closed for different bytes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-concurrent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const authority = createAuthority(root, source);

  const equalResults = await Promise.all(Array.from({ length: 8 }, () => runConcurrent({
    authority,
    repo: source.repo,
    sourceCommit: source.sourceCommit,
  })));
  assert.equal(equalResults.every((result) => result.status === 0), true);
  const statuses = equalResults.map((result) => JSON.parse(result.stdout).status).sort();
  assert.deepEqual(statuses, ['created', ...Array.from({ length: 7 }, () => 'unchanged')].sort());
  assert.equal(fs.readdirSync(path.dirname(authority.output)).some((name) => name.endsWith('.tmp')), false);

  writeFile(source.repo, rootedPath(source.sourceRoot, `skills/${pluginId}/SKILL.md`), '# Divergent same-version bytes\n');
  const divergentCommit = commitAll(source.repo, 'divergent same-version payload');
  const expectedRoot = path.join(root, 'expected');
  const expectedA = createAuthority(path.join(expectedRoot, 'a'), source);
  const expectedB = createAuthority(path.join(expectedRoot, 'b'), source);
  runGenerator({ authority: expectedA, repo: source.repo, sourceCommit: source.sourceCommit });
  runGenerator({ authority: expectedB, repo: source.repo, sourceCommit: divergentCommit });
  const expectedBytes = [fs.readFileSync(expectedA.output), fs.readFileSync(expectedB.output)];

  const raceAuthority = createAuthority(path.join(root, 'race'), source);
  const divergentResults = await Promise.all([
    runConcurrent({ authority: raceAuthority, repo: source.repo, sourceCommit: source.sourceCommit }),
    runConcurrent({ authority: raceAuthority, repo: source.repo, sourceCommit: divergentCommit }),
  ]);
  assert.equal(divergentResults.filter((result) => result.status === 0).length, 1);
  assert.equal(divergentResults.filter((result) => result.status !== 0).length, 1);
  assert.match(divergentResults.find((result) => result.status !== 0)?.stderr ?? '', /Immutable payload manifest conflict/);
  const winner = fs.readFileSync(raceAuthority.output);
  assert.equal(expectedBytes.some((candidate) => candidate.equals(winner)), true);
});

test('Git parsing ignores hostile inherited GIT_* variables and binds the worktree root and origin', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-git-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const authority = createAuthority(root, source);
  const hostileEnvironment = {
    ...process.env,
    GIT_DIR: path.join(root, 'attacker.git'),
    GIT_WORK_TREE: path.join(root, 'attacker-worktree'),
    GIT_OBJECT_DIRECTORY: path.join(root, 'attacker-objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(root, 'attacker-alternates'),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.https://attacker.invalid/.insteadOf',
    GIT_CONFIG_VALUE_0: 'https://github.com/',
  };
  assert.equal(
    runGenerator({ authority, repo: source.repo, sourceCommit: source.sourceCommit }, hostileEnvironment).status,
    'created',
  );

  const nested = runFailure({
    authority,
    repo: path.join(source.repo, defaultSourceRoot),
    sourceCommit: source.sourceCommit,
  });
  assert.notEqual(nested.status, 0);
  assert.match(nested.stderr, /must name the Git worktree root/);

  git(source.repo, ['remote', 'set-url', 'origin', 'https://github.com/example/wrong.git']);
  const wrongOrigin = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
  assert.notEqual(wrongOrigin.status, 0);
  assert.match(wrongOrigin.stderr, /Git origin does not match/);
});

test('manifest, allowlist, source repository, output, and committed plugin identities are fail-closed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cases: Array<{
    name: string;
    sourceOptions?: Parameters<typeof createSourceRepo>[1];
    mutate: (authority: AuthorityFixture) => void;
    error: RegExp;
  }> = [
    {
      name: 'numeric prerelease leading zero',
      mutate: (authority) => editJson(authority.manifest, (manifest) => { manifest.version = '0.3.1-alpha.01'; }),
      error: /numeric prerelease identifier with a leading zero/,
    },
    {
      name: 'output dot segment',
      mutate: (authority) => editJson(authority.manifest, (manifest) => {
        manifest.codex_surface.plugin_payload_manifest_url = 'payloads/../outside.json';
      }),
      error: /must not contain empty or dot segments/,
    },
    {
      name: 'output identity mismatch',
      mutate: (authority) => editJson(authority.manifest, (manifest) => {
        manifest.codex_surface.plugin_payload_manifest_url = `payloads/wrong-${packageVersion}.json`;
      }),
      error: /payload output is not identity-bound/,
    },
    {
      name: 'allowlist package mismatch',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.package_id = 'wrong'; }),
      error: /allowlist identities do not match/,
    },
    {
      name: 'content lock path mismatch',
      mutate: (authority) => {
        editJson(authority.manifest, (manifest) => {
          manifest.content_lock = {
            algorithm: 'sha256',
            canonicalization: 'ordered_path_nul_file_bytes',
            paths: ['.codex-plugin/plugin.json', `skills/${pluginId}/SKILL.md`],
            digest: `sha256:${'0'.repeat(64)}`,
          };
        });
      },
      error: /content_lock paths do not match/,
    },
    {
      name: 'content lock digest mismatch',
      mutate: (authority) => {
        editJson(authority.manifest, (manifest) => {
          manifest.content_lock = {
            algorithm: 'sha256',
            canonicalization: 'ordered_path_nul_file_bytes',
            paths: ['.codex-plugin/plugin.json', 'assets/icon.bin', `skills/${pluginId}/SKILL.md`],
            digest: `sha256:${'0'.repeat(64)}`,
          };
        });
      },
      error: /does not match Framework package content_lock/,
    },
    {
      name: 'source repository mismatch',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => {
        allowlist.source_repo = 'https://github.com/example/wrong.git';
      }),
      error: /source repositories do not match/,
    },
    {
      name: 'source URL dot segment',
      mutate: (authority) => {
        const value = 'https://github.com/example/../example-agent.git';
        editJson(authority.manifest, (manifest) => { manifest.source_repo = value; });
        editJson(authority.allowlist, (allowlist) => { allowlist.source_repo = value; });
      },
      error: /URL dot segments/,
    },
    {
      name: 'committed plugin name mismatch',
      sourceOptions: { pluginName: 'wrong-plugin' },
      mutate: () => {},
      error: /Committed plugin name does not match/,
    },
    {
      name: 'committed plugin version mismatch',
      sourceOptions: { pluginVersion: '0.3.2' },
      mutate: () => {},
      error: /Committed plugin version does not match/,
    },
  ];

  for (const invalid of cases) {
    const caseRoot = path.join(root, invalid.name.replaceAll(' ', '-'));
    const source = createSourceRepo(caseRoot, invalid.sourceOptions);
    const authority = createAuthority(caseRoot, source);
    invalid.mutate(authority);
    const result = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
    assert.notEqual(result.status, 0, invalid.name);
    assert.match(result.stderr, invalid.error, invalid.name);
    assert.equal(fs.existsSync(authority.output), false, invalid.name);
  }
});

test('allowlist paths reject missing, executable, symlink, backslash, case, and Unicode hazards', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-paths-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cases: Array<{
    name: string;
    sourceOptions?: Parameters<typeof createSourceRepo>[1];
    mutate?: (authority: AuthorityFixture) => void;
    error: RegExp;
  }> = [
    {
      name: 'missing file',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.paths.push('assets/missing.bin'); }),
      error: /Allowlisted carrier files are missing/,
    },
    {
      name: 'executable file',
      sourceOptions: { executableSkill: true },
      error: /only 100644 blobs are allowed/,
    },
    {
      name: 'symlink file',
      sourceOptions: { symlinkSkill: true },
      error: /only 100644 blobs are allowed/,
    },
    {
      name: 'backslash path',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.paths.push('assets\\icon.bin'); }),
      error: /without backslashes/,
    },
    {
      name: 'dot path segment',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.paths.push('assets/../secret.bin'); }),
      error: /must not contain empty or dot segments/,
    },
    {
      name: 'case collision',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.paths.push('assets/Icon.bin'); }),
      error: /case or Unicode path collision/,
    },
    {
      name: 'Unicode normalization hazard',
      mutate: (authority) => editJson(authority.allowlist, (allowlist) => { allowlist.paths.push('assets/cafe\u0301.bin'); }),
      error: /NFC Unicode normalization/,
    },
  ];

  for (const invalid of cases) {
    const caseRoot = path.join(root, invalid.name.replaceAll(' ', '-'));
    const source = createSourceRepo(caseRoot, invalid.sourceOptions);
    const authority = createAuthority(caseRoot, source);
    invalid.mutate?.(authority);
    const result = runFailure({ authority, repo: source.repo, sourceCommit: source.sourceCommit });
    assert.notEqual(result.status, 0, invalid.name);
    assert.match(result.stderr, invalid.error, invalid.name);
    assert.equal(fs.existsSync(authority.output), false, invalid.name);
  }
});

test('manifest and committed plugin JSON require strict round-trip UTF-8', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-utf8-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const invalidPluginRoot = path.join(root, 'plugin');
  const invalidPlugin = createSourceRepo(invalidPluginRoot, { pluginBytes: Buffer.from([0x7b, 0xff, 0x7d]) });
  const pluginAuthority = createAuthority(invalidPluginRoot, invalidPlugin);
  const pluginResult = runFailure({
    authority: pluginAuthority,
    repo: invalidPlugin.repo,
    sourceCommit: invalidPlugin.sourceCommit,
  });
  assert.notEqual(pluginResult.status, 0);
  assert.match(pluginResult.stderr, /Committed Codex plugin manifest is not valid UTF-8/);

  const invalidManifestRoot = path.join(root, 'manifest');
  const source = createSourceRepo(invalidManifestRoot);
  const manifestAuthority = createAuthority(invalidManifestRoot, source);
  fs.writeFileSync(manifestAuthority.manifest, Buffer.from([0x7b, 0xff, 0x7d]));
  const manifestResult = runFailure({
    authority: manifestAuthority,
    repo: source.repo,
    sourceCommit: source.sourceCommit,
  });
  assert.notEqual(manifestResult.status, 0);
  assert.match(manifestResult.stderr, /Framework package manifest is not valid UTF-8/);
});

test('canonical Framework allowlists validate and remain aligned with package/plugin/source identities', () => {
  const schemaPath = path.join(repoRoot, 'contracts/opl-framework/package-payload-allowlist.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as Record<string, any>;
  const canonicalIds = ['mag', 'mas', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'];

  for (const id of canonicalIds) {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages', `${id}.json`),
      'utf8',
    )) as Record<string, any>;
    const allowlistPath = path.join(repoRoot, 'contracts/opl-framework/package-payload-allowlists', `${id}.json`);
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8')) as Record<string, any>;
    const payload = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages', manifest.codex_surface.plugin_payload_manifest_url),
      'utf8',
    )) as Record<string, any>;
    assert.doesNotThrow(() => assertJsonSchemaPayload({
      schemaId: schema.$id,
      schema,
      sourceRef: 'contracts/opl-framework/package-payload-allowlist.schema.json',
    }, allowlist), id);
    assert.equal(allowlist.package_id, manifest.package_id, id);
    assert.equal(allowlist.plugin_id, manifest.codex_surface.plugin_id, id);
    if (manifest.source_repo !== undefined) assert.equal(allowlist.source_repo, manifest.source_repo, id);
    assert.equal(allowlist.source_repo, payload.source_repo, id);
    assert.equal(allowlist.source_root, payload.source_root, id);
    assert.deepEqual(allowlist.paths, payload.files.map((entry: Record<string, string>) => entry.path), id);
  }
});

test('generator rejects non-exact commits and unknown caller-supplied identity flags', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-payload-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createSourceRepo(root);
  const authority = createAuthority(root, source);

  const shortCommit = runFailure({
    authority,
    repo: source.repo,
    sourceCommit: source.sourceCommit.slice(0, 12),
  });
  assert.notEqual(shortCommit.status, 0);
  assert.match(shortCommit.stderr, /exact lowercase 40-character Git SHA/);
  const missingCommit = runFailure({ authority, repo: source.repo, sourceCommit: 'f'.repeat(40) });
  assert.notEqual(missingCommit.status, 0);
  assert.match(missingCommit.stderr, /does not exist as an exact local Git commit object/);

  const injectedIdentity = spawnSync(process.execPath, [
    ...generatorArgs({ authority, repo: source.repo, sourceCommit: source.sourceCommit }),
    '--package-id', 'attacker',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(injectedIdentity.status, 0);
  assert.match(injectedIdentity.stderr, /Unknown option '--package-id'/);
  assert.equal(fs.existsSync(authority.output), false);
});

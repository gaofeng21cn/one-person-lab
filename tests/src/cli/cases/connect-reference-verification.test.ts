import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';

import { runOplConnectReferenceVerification } from '../../../../src/adapters/integration/opl-connect-reference-verification.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../../../src/kernel/family-workspace-root.ts';
import {
  assert,
  createFakeCodexFixture,
  createInstalledPackageCarrierFixture,
  fs,
  os,
  path,
  repoRoot,
  runCliAsync,
  shellSingleQuote,
  test,
} from '../helpers.ts';
import { createTestTlsServerFixture } from '../helpers-parts/tls-fixture.ts';

const configuredScholarPackageRoot = process.env.OPL_SCHOLAR_SKILLS_E2E_ROOT?.trim() || null;
const familyScholarPackageRoot = path.join(resolveFamilyWorkspaceRootFromRepoRoot(repoRoot), 'mas-scholar-skills');
const scholarPackageRoot = configuredScholarPackageRoot
  ?? (fs.existsSync(path.join(familyScholarPackageRoot, 'opl-package.json')) ? familyScholarPackageRoot : null);
if (configuredScholarPackageRoot && !fs.existsSync(path.join(configuredScholarPackageRoot, 'opl-package.json'))) {
  throw new Error(`Configured ScholarSkills E2E root is missing its owner manifest: ${configuredScholarPackageRoot}`);
}
const cliPackageFixture = scholarPackageRoot ? createInstalledPackageCarrierFixture(scholarPackageRoot) : null;
if (cliPackageFixture) {
  test.after(() => fs.rmSync(cliPackageFixture.fixtureRoot, { recursive: true, force: true }));
}
const packageBackedTest = cliPackageFixture ? test : test.skip;
const testTlsFixture = createTestTlsServerFixture();
test.after(() => testTlsFixture.close());

function isolatedScholarPackage() {
  const packageRoot = cliPackageFixture!.packageRoot;
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'opl-package.json'), 'utf8')) as {
    version: string;
  };
  return {
    runner: ({ args }: { binary: string; args: string[]; env: NodeJS.ProcessEnv }) => ({
      status: args.join(' ') === 'plugin list --json' ? 0 : 2,
      stdout: JSON.stringify({ installed: [{
        pluginId: 'mas-scholar-skills@mas-scholar-skills-test',
        version: manifest.version,
        enabled: false,
        source: { source: 'local', path: packageRoot },
        marketplaceSource: { sourceType: 'local', source: packageRoot },
      }] }),
      stderr: '',
      error: null,
    }),
  };
}

const originalTlsRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
test.after(() => {
  if (originalTlsRejectUnauthorized === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsRejectUnauthorized;
});

function cliEnv(overrides: Record<string, string> = {}) {
  return cliPackageFixture
    ? { OPL_STATE_DIR: cliPackageFixture.stateRoot, ...overrides }
    : overrides;
}

function contentLockDigest(sourceRoot: string, relativePaths: string[]) {
  const digest = crypto.createHash('sha256');
  for (const relativePath of relativePaths) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = fs.readFileSync(path.join(sourceRoot, relativePath));
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(fileLength);
    digest.update(fileBytes);
  }
  return `sha256:${digest.digest('hex')}`;
}

function refreshSyntheticContentLock(sourceRoot: string) {
  const manifestPath = path.join(sourceRoot, 'opl-package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    content_lock: { digest: string; paths: string[] };
  };
  manifest.content_lock.digest = contentLockDigest(sourceRoot, manifest.content_lock.paths);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
}

function syntheticReferenceProfileSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      provider: {
        type: 'object',
        properties: {
          provider_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
        },
      },
    },
  };
}

function syntheticReferenceStepSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://one-person-lab.dev/tests/synthetic-reference-adapter-step.schema.json',
    type: 'object',
    required: ['surface_kind', 'adapter_abi', 'next'],
    properties: {
      surface_kind: { const: 'opl_connect_reference_provider_adapter_step_result.v1' },
      adapter_abi: { const: 'opl-connect-reference-provider-adapter.v1' },
      next: {
        oneOf: [
          {
            type: 'object',
            required: ['kind', 'request', 'state'],
            properties: {
              kind: { const: 'request' },
              request: {
                type: 'object',
                required: ['method', 'url', 'body'],
                properties: {
                  method: { const: 'GET' },
                  url: { type: 'string', pattern: '^https://' },
                  headers: { type: 'object', additionalProperties: { type: 'string' } },
                  body: { type: 'null' },
                },
                additionalProperties: false,
              },
              state: { type: 'object' },
            },
            additionalProperties: false,
          },
          {
            type: 'object',
            required: ['kind', 'evidence'],
            properties: {
              kind: { const: 'complete' },
              evidence: {
                type: 'object',
                required: [
                  'match_basis',
                  'provider_identifiers',
                  'metadata',
                  'retraction_or_update_flags',
                  'normalized',
                  'match_assessment',
                ],
                properties: {
                  match_basis: { enum: ['doi', 'pmid', 'pmcid', 'title', 'none'] },
                  provider_identifiers: { type: 'object', additionalProperties: { type: 'string' } },
                  metadata: { type: 'object' },
                  retraction_or_update_flags: { type: 'object' },
                  normalized: { type: 'object' },
                  match_assessment: { type: 'object' },
                  verification_scope: { type: 'object' },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        ],
      },
    },
    additionalProperties: false,
  };
}

async function withSyntheticReferenceAdapter<T>(callback: (
  requests: string[],
  installedPackage: { runner: (input: { binary: string; args: string[]; env: NodeJS.ProcessEnv }) => {
    status: number;
    stdout: string;
    stderr: string;
    error: Error | null;
  } },
  sourceRoot: string,
) => Promise<T>) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-adapter-source-'));
  fs.mkdirSync(path.join(sourceRoot, 'contracts', 'reference-provider-adapters'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'runtime', 'reference-provider-adapters'), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, 'contracts', 'reference-provider-adapters', 'scientific-metadata.json'),
    JSON.stringify({
      providers: [{
        provider_id: 'synthetic-reference',
        adapter_id: 'synthetic_reference_adapter',
        receipt_provider_name: 'synthetic_receipt',
        aliases: [],
        endpoint: {
          default_base_url: 'https://profile.invalid',
          environment_override: 'OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE',
          allowed_origins: ['https://profile.invalid'],
        },
        verification_scope: { evidence_source: 'synthetic-reference-adapter' },
      }],
    }),
    'utf8',
  );
  const handlerFile = 'runtime/reference-provider-adapters/index.mjs';
  fs.writeFileSync(path.join(sourceRoot, 'runtime', 'reference-provider-adapters', 'index.mjs'), `
export function runReferenceProviderAdapterStep(request) {
  if (request.operation === 'build_request') {
    if (process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT === 'envelope') {
      return {
        next: {
          kind: 'complete',
          evidence: {
            match_basis: 'doi',
            provider_identifiers: { doi: request.reference.doi },
            metadata: {},
            retraction_or_update_flags: {},
            normalized: { doi: request.reference.doi },
          },
        },
      };
    }
    if (process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT === 'evidence') {
      return {
        surface_kind: 'opl_connect_reference_provider_adapter_step_result.v1',
        adapter_abi: 'opl-connect-reference-provider-adapter.v1',
        next: {
          kind: 'complete',
          evidence: {
            match_basis: 'doi',
            provider_identifiers: { doi: request.reference.doi },
            metadata: {},
          },
        },
      };
    }
    return {
      surface_kind: 'opl_connect_reference_provider_adapter_step_result.v1',
      adapter_abi: 'opl-connect-reference-provider-adapter.v1',
      next: {
        kind: 'request',
        request: {
          method: 'GET',
          url: process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BAD_ORIGIN === '1'
            ? 'https://evil.test/adapter-only'
            : String(request.provider.endpoint.base_url) + '/adapter-only',
          body: null,
        },
        state: { surface_kind: 'synthetic-reference-state', step: 1 },
      },
    };
  }
  if (request.operation === 'parse_response') {
    if (request.response.body.adapter_marker !== 'reference') throw new Error('synthetic reference adapter marker missing');
    return {
      surface_kind: 'opl_connect_reference_provider_adapter_step_result.v1',
      adapter_abi: 'opl-connect-reference-provider-adapter.v1',
      next: {
        kind: 'complete',
        evidence: {
          match_basis: 'doi',
          provider_identifiers: { doi: request.reference.doi },
          metadata: { title: request.reference.title },
          retraction_or_update_flags: {},
          normalized: {
            doi: request.reference.doi,
            pmid: null,
            pmcid: null,
            title: request.reference.title,
          },
          ...(process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT === 'missing' ? {} : {
            match_assessment: {
              match_status: process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT === 'held'
                ? 'provider_found' : 'identifier_matched',
              matched_identifiers: process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT === 'held'
                ? {} : { doi: request.reference.doi },
              mismatch_details: [],
              ...(process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT === 'held' ? {
                deferred_reason: 'owner held the match',
                deferred_code: 'provider_found_without_identifier_match',
              } : {}),
            },
          }),
          verification_scope: { evidence_source: 'synthetic-reference-adapter' },
        },
      },
    };
  }
  throw new Error('unexpected synthetic reference adapter operation');
}
`, 'utf8');

  const originalAdapterBase = process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE;
  const originalBadOrigin = process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BAD_ORIGIN;
  const originalMalformedResult = process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT;
  const originalAssessment = process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE = 'https://adapter.test';
  const binding = {
    module_id: 'mas-scholar-skills.reference-provider-adapters',
    module_kind: 'opl_connect_reference_provider_adapter',
    adapter_abi: 'opl-connect-reference-provider-adapter.v1',
    profile_ref: 'contracts/reference-provider-adapters/scientific-metadata.json',
    profile_schema_ref: 'contracts/reference-provider-adapters/reference-provider-profile.schema.json',
    registry_ref: 'contracts/reference-provider-adapters/reference-provider-adapter-registry.json',
    registry_schema_ref: 'contracts/reference-provider-adapters/reference-provider-adapter-registry.schema.json',
    step_schema_ref: 'contracts/reference-provider-adapters/reference-provider-adapter-step.schema.json',
    handler: { kind: 'typescript_export', file: handlerFile, export: 'runReferenceProviderAdapterStep' },
    max_steps: 1,
    contained_implementation_files: [handlerFile],
    exports: ['runReferenceProviderAdapterStep'],
  };
  const lockPaths = [
    'skills/mas-scholar-skills/SKILL.md',
    binding.profile_ref,
    binding.profile_schema_ref,
    binding.registry_ref,
    binding.registry_schema_ref,
    binding.step_schema_ref,
    handlerFile,
  ];
  for (const relativePath of lockPaths) {
    const filePath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }
  fs.writeFileSync(path.join(sourceRoot, 'skills', 'mas-scholar-skills', 'SKILL.md'), '# synthetic\n', 'utf8');
  fs.writeFileSync(
    path.join(sourceRoot, binding.profile_schema_ref),
    JSON.stringify(syntheticReferenceProfileSchema()),
    'utf8',
  );
  fs.writeFileSync(
    path.join(sourceRoot, binding.step_schema_ref),
    JSON.stringify(syntheticReferenceStepSchema()),
    'utf8',
  );
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), JSON.stringify({
    surface_kind: 'opl_capability_package_manifest.v2',
    package_id: 'mas-scholar-skills',
    display_name: 'Synthetic MAS Scholar Skills',
    publisher: 'synthetic',
    version: '0.0.0',
    source: 'first_party_repo_local',
    package_role: 'capability_package',
    capability_abi: { id: 'mas-scholar-skills.v1' },
    codex_surface: {
      plugin_id: 'mas-scholar-skills',
      required_skill_ids: ['mas-scholar-skills'],
      codex_default_exposure: false,
      optional_install_policy: 'all_exported_skills',
      interaction_mode: 'headless_internal',
    },
    exports: {
      core_skill_ids: ['mas-scholar-skills'],
      core_module_ids: [binding.module_id],
      optional_skill_policy_ref: 'contracts/synthetic-optional.json',
      optional_skills_installed_by_default: true,
      default_materialization_policy: 'all_exported_skills',
      runtime_module_bindings: [binding],
    },
    content_lock: {
      algorithm: 'sha256',
      canonicalization: 'ordered_path_length_file_length_bytes',
      digest: contentLockDigest(sourceRoot, lockPaths),
      paths: lockPaths,
    },
  }), 'utf8');
  const installedPackage = {
    runner: ({ args }: { binary: string; args: string[]; env: NodeJS.ProcessEnv }) => ({
      status: args.join(' ') === 'plugin list --json' ? 0 : 2,
      stdout: JSON.stringify({ installed: [{
        pluginId: 'mas-scholar-skills@synthetic',
        version: '0.0.0',
        enabled: false,
        source: { source: 'local', path: sourceRoot },
        marketplaceSource: { source: sourceRoot },
      }] }),
      stderr: '',
      error: null,
    }),
  };
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push(url.pathname);
    if (url.origin !== 'https://adapter.test' || url.pathname !== '/adapter-only') {
      throw new Error(`unexpected non-adapter reference request: ${url.toString()}`);
    }
    return new Response(JSON.stringify({ adapter_marker: 'reference' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    return await callback(requests, installedPackage, sourceRoot);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAdapterBase === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE;
    else process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE = originalAdapterBase;
    if (originalBadOrigin === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BAD_ORIGIN;
    else process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BAD_ORIGIN = originalBadOrigin;
    if (originalMalformedResult === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT;
    else process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT = originalMalformedResult;
    if (originalAssessment === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT;
    else process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT = originalAssessment;
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

test('reference verification routes transport and evidence through the installed package adapter state machine', async () => {
  await withSyntheticReferenceAdapter(async (requests, installedPackage) => {
    const output = await runOplConnectReferenceVerification({
      references: [{ id: 'synthetic-reference', doi: '10.9999/adapter', title: 'Synthetic adapter reference' }],
      providers: ['synthetic-reference'],
      maxRetries: 0,
      installedPackage,
    });
    const evidence = output.opl_connect_reference_verification.provider_evidence[0];
    assert.deepEqual(requests, ['/adapter-only']);
    assert.equal(evidence.status, 'matched');
    assert.equal(evidence.match_status, 'identifier_matched');
    assert.equal(evidence.provider_id, 'synthetic-reference');
    assert.equal(evidence.provider, 'synthetic_receipt');
    assert.equal(evidence.verification_scope.evidence_source, 'synthetic-reference-adapter');
  });
});

test('reference verification uses the package match assessment', async () => {
  await withSyntheticReferenceAdapter(async (_requests, installedPackage) => {
    process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT = 'held';
    const output = await runOplConnectReferenceVerification({
      references: [{ id: 'owner-assessment', doi: '10.9999/adapter' }],
      providers: ['synthetic-reference'],
      maxRetries: 0,
      installedPackage,
    });
    const evidence = output.opl_connect_reference_verification.provider_evidence[0];
    assert.equal(evidence.lookup_status, 'found');
    assert.equal(evidence.status, 'deferred');
    assert.equal(evidence.match_status, 'provider_found');
    assert.equal(evidence.deferred_reason, 'owner held the match');
  });
});

test('reference verification rejects a found result without the package match assessment', async () => {
  await withSyntheticReferenceAdapter(async (_requests, installedPackage) => {
    process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ASSESSMENT = 'missing';
    const output = await runOplConnectReferenceVerification({
      references: [{ id: 'missing-assessment', doi: '10.9999/adapter' }],
      providers: ['synthetic-reference'],
      maxRetries: 0,
      installedPackage,
    });
    const evidence = output.opl_connect_reference_verification.provider_evidence[0];
    assert.equal(evidence.lookup_status, 'error');
    assert.equal(evidence.error?.code, 'reference_provider_adapter_result_schema_invalid');
  });
});

test('reference verification CLI loads a repo-contained synthetic installed Package', async () => {
  await withSyntheticReferenceAdapter(async (_requests, _installedPackage, sourceRoot) => {
    const carrier = createInstalledPackageCarrierFixture(sourceRoot);
    const codex = createFakeCodexFixture(`
if [[ "$*" != "plugin list --json" ]]; then exit 2; fi
printf '%s\n' ${shellSingleQuote(JSON.stringify({ installed: [{
  pluginId: 'mas-scholar-skills@synthetic',
  version: '0.0.0',
  enabled: false,
  source: { source: 'local', path: sourceRoot },
  marketplaceSource: { source: sourceRoot },
}] }))}
`);
    const server = createServer(testTlsFixture.options, (request, response) => {
      const url = new URL(request.url ?? '/', 'https://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (url.pathname !== '/adapter-only') {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      response.end(JSON.stringify({ adapter_marker: 'reference' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-synthetic-cli-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    fs.writeFileSync(referencesFile, JSON.stringify([{
      id: 'synthetic-reference',
      doi: '10.1234/synthetic',
      title: 'Repo-contained fixture',
    }]), 'utf8');
    try {
      const output = await runCliAsync([
        'connect',
        'references',
        'verify',
        '--references-file',
        referencesFile,
        '--providers',
        'synthetic-reference',
        '--max-retries',
        '0',
      ], {
        OPL_STATE_DIR: carrier.stateRoot,
        OPL_CODEX_PLUGIN_BIN: codex.codexPath,
        OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE: `https://127.0.0.1:${address.port}`,
      }) as {
        opl_connect_reference_verification: {
          provider_evidence: Array<{ status: string; provider_id: string }>;
        };
      };
      const evidence = output.opl_connect_reference_verification.provider_evidence;
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0]?.status, 'matched');
      assert.equal(evidence[0]?.provider_id, 'synthetic-reference');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
      fs.rmSync(carrier.fixtureRoot, { recursive: true, force: true });
      fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    }
  });
});

test('reference verification rejects malformed adapter envelopes and evidence before network access', async () => {
  await withSyntheticReferenceAdapter(async (requests, installedPackage) => {
    for (const mode of ['envelope', 'evidence']) {
      process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_MALFORMED_RESULT = mode;
      const output = await runOplConnectReferenceVerification({
        references: [{ id: `synthetic-reference-malformed-${mode}`, doi: '10.9999/malformed' }],
        providers: ['synthetic-reference'],
        maxRetries: 0,
        installedPackage,
      });
      const evidence = output.opl_connect_reference_verification.provider_evidence[0];
      assert.equal(evidence.lookup_status, 'error');
      assert.equal(evidence.status, 'deferred');
      assert.equal(evidence.error?.code, 'reference_provider_adapter_result_schema_invalid');
      assert.equal(Array.isArray(evidence.error?.details?.schema_errors), true);
    }
    assert.deepEqual(requests, []);
  });
});

test('reference verification rejects unsafe profile provider ids before cache path construction', async () => {
  await withSyntheticReferenceAdapter(async (requests, installedPackage, sourceRoot) => {
    const profilePath = path.join(
      sourceRoot,
      'contracts',
      'reference-provider-adapters',
      'scientific-metadata.json',
    );
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as {
      providers: Array<{ provider_id: string }>;
    };
    profile.providers[0]!.provider_id = '../escape';
    fs.writeFileSync(profilePath, JSON.stringify(profile), 'utf8');
    refreshSyntheticContentLock(sourceRoot);
    const cacheRoot = path.join(sourceRoot, 'cache-root');
    await assert.rejects(
      () => runOplConnectReferenceVerification({
        references: [{ id: 'unsafe-provider', doi: '10.9999/unsafe' }],
        providers: ['../escape'],
        cacheRoot,
        maxRetries: 0,
        installedPackage,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'codex_command_failed');
        assert.equal(
          (error as { details?: { reason_code?: string } }).details?.reason_code,
          'reference_provider_profile_provider_id_invalid',
        );
        return true;
      },
    );
    assert.equal(fs.existsSync(path.resolve(cacheRoot, '..', 'escape')), false);
    assert.deepEqual(requests, []);
  });
});

test('reference verification rejects a handler origin outside the active provider profile before fetch', async () => {
  await withSyntheticReferenceAdapter(async (requests, installedPackage) => {
    process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BAD_ORIGIN = '1';
    const output = await runOplConnectReferenceVerification({
      references: [{ id: 'synthetic-reference-origin', doi: '10.9999/adapter' }],
      providers: ['synthetic-reference'],
      maxRetries: 0,
      installedPackage,
    });
    const evidence = output.opl_connect_reference_verification.provider_evidence[0];
    assert.equal(evidence.lookup_status, 'error');
    assert.equal(evidence.status, 'deferred');
    assert.equal(evidence.error?.code, 'reference_provider_request_origin_not_allowed');
    assert.deepEqual(requests, []);
  });
});

test('reference verification manually follows allowlisted redirects and blocks unsafe chains', async () => {
  await withSyntheticReferenceAdapter(async (requests, installedPackage) => {
    const originalFetch = globalThis.fetch;
    let mode: 'same-origin' | 'disallowed' | 'loop' | 'hop-limit' = 'same-origin';
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push(url.toString());
      assert.equal(init?.redirect, 'manual');
      const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
      if (mode === 'same-origin') {
        if (url.pathname === '/redirect/adapter-only') return redirect('/adapter-only');
        if (url.pathname === '/adapter-only') return new Response(JSON.stringify({ adapter_marker: 'reference' }));
      }
      if (mode === 'disallowed' && url.pathname === '/redirect/adapter-only') {
        return redirect('https://evil.test/adapter-only');
      }
      if (mode === 'loop') {
        if (url.pathname === '/loop-a/adapter-only') return redirect('/loop-b');
        if (url.pathname === '/loop-b') return redirect('/loop-a/adapter-only');
      }
      if (mode === 'hop-limit') {
        const match = /^\/hop-(\d+)(?:\/adapter-only)?$/.exec(url.pathname);
        if (match) return redirect(`/hop-${Number(match[1]) + 1}`);
      }
      throw new Error(`unexpected reference redirect request: ${url.toString()}`);
    };
    const input = {
      references: [{ id: 'redirect-reference', doi: '10.9999/redirect', title: 'Redirect policy' }],
      providers: ['synthetic-reference'],
      maxRetries: 0,
      installedPackage,
    };
    try {
      process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE = 'https://adapter.test/redirect';
      const sameOrigin = await runOplConnectReferenceVerification(input);
      assert.equal(sameOrigin.opl_connect_reference_verification.provider_evidence[0]?.status, 'matched');
      assert.deepEqual(requests, [
        'https://adapter.test/redirect/adapter-only',
        'https://adapter.test/adapter-only',
      ]);

      requests.length = 0;
      mode = 'disallowed';
      const disallowed = await runOplConnectReferenceVerification(input);
      const disallowedEvidence = disallowed.opl_connect_reference_verification.provider_evidence[0];
      assert.equal(disallowedEvidence?.error?.code, 'reference_provider_redirect_origin_not_allowed');
      assert.deepEqual(requests, ['https://adapter.test/redirect/adapter-only']);

      requests.length = 0;
      mode = 'loop';
      process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE = 'https://adapter.test/loop-a';
      const loop = await runOplConnectReferenceVerification(input);
      assert.equal(loop.opl_connect_reference_verification.provider_evidence[0]?.error?.code, 'reference_provider_redirect_loop');
      assert.deepEqual(requests, [
        'https://adapter.test/loop-a/adapter-only',
        'https://adapter.test/loop-b',
      ]);

      requests.length = 0;
      mode = 'hop-limit';
      process.env.OPL_CONNECT_SYNTHETIC_REFERENCE_ADAPTER_BASE = 'https://adapter.test/hop-0';
      const hopLimit = await runOplConnectReferenceVerification(input);
      assert.equal(hopLimit.opl_connect_reference_verification.provider_evidence[0]?.error?.code, 'reference_provider_redirect_hop_limit_exceeded');
      assert.equal(requests.length, 6);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

packageBackedTest('reference providers normalize OpenAlex and both Semantic Scholar PMID fields', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-pmid-normalization-'));
  const referencesFile = path.join(fixtureRoot, 'references.json');
  fs.writeFileSync(referencesFile, JSON.stringify([
    { id: 'ref-pmid', doi: '10.1234/pmid', title: 'PMID field' },
    { id: 'ref-pubmed', doi: '10.1234/pubmed', title: 'PubMed field' },
  ]), 'utf8');
  const originalFetch = globalThis.fetch;
  const originalOpenAlexBase = process.env.OPL_CONNECT_OPENALEX_API_BASE;
  const originalSemanticScholarBase = process.env.OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE;
  process.env.OPL_CONNECT_OPENALEX_API_BASE = 'https://openalex.test';
  process.env.OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE = 'https://semantic-scholar.test';
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const pubmedField = decodeURIComponent(url.pathname).includes('10.1234/pubmed');
    if (url.hostname === 'openalex.test') {
      return new Response(JSON.stringify({
        id: `https://openalex.org/${pubmedField ? 'W2' : 'W1'}`,
        doi: `https://doi.org/10.1234/${pubmedField ? 'pubmed' : 'pmid'}`,
        title: pubmedField ? 'PubMed field' : 'PMID field',
        ids: { pmid: `https://pubmed.ncbi.nlm.nih.gov/${pubmedField ? '222' : '111'}/` },
      }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      paperId: pubmedField ? 'S2-2' : 'S2-1',
      externalIds: {
        DOI: `10.1234/${pubmedField ? 'pubmed' : 'pmid'}`,
        ...(pubmedField ? { PubMed: '222' } : { PMID: '111' }),
      },
      title: pubmedField ? 'PubMed field' : 'PMID field',
    }), { headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await runOplConnectReferenceVerification({
      referencesFile,
      providers: ['openalex', 'semantic-scholar'],
      maxRetries: 0,
      installedPackage: isolatedScholarPackage(),
    });
    assert.deepEqual(
      result.opl_connect_reference_verification.provider_evidence.map((entry) => entry.provider_identifiers.pmid),
      ['111', '111', '222', '222'],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAlexBase === undefined) delete process.env.OPL_CONNECT_OPENALEX_API_BASE;
    else process.env.OPL_CONNECT_OPENALEX_API_BASE = originalOpenAlexBase;
    if (originalSemanticScholarBase === undefined) delete process.env.OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE;
    else process.env.OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE = originalSemanticScholarBase;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

async function startFakeReferenceProviderServer() {
  const requests: string[] = [];
  let crossrefAttempts = 0;
  const server = createServer(testTlsFixture.options, (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}?${url.searchParams.toString()}`);
    response.setHeader('content-type', 'application/json');

    if (url.pathname.startsWith('/crossref/works/')) {
      crossrefAttempts += 1;
      if (crossrefAttempts === 1) {
        response.statusCode = 500;
        response.end(JSON.stringify({ message: 'temporary_crossref_failure' }));
        return;
      }
      response.end(JSON.stringify({
        message: {
          DOI: '10.1234/example',
          title: ['Provider receipt cache and retry evidence'],
          URL: 'https://doi.org/10.1234/example',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/openalex/works/')) {
      response.end(JSON.stringify({
        id: 'https://openalex.org/W123',
        doi: 'https://doi.org/10.1234/example',
        title: 'Provider receipt cache and retry evidence',
        publication_year: 2026,
        primary_location: {
          source: {
            display_name: 'Journal of Connector Evidence',
          },
        },
        ids: {
          pmid: 'https://pubmed.ncbi.nlm.nih.gov/123456/',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/id-only-openalex/works/')) {
      response.end(JSON.stringify({
        id: 'https://openalex.org/W-ID-ONLY',
        title: 'Provider receipt cache and retry evidence',
        primary_location: {
          source: {
            display_name: 'Journal of Connector Evidence',
          },
        },
        ids: {},
      }));
      return;
    }

    if (url.pathname.startsWith('/rate-limited-openalex/works/')) {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: 'rate_limited' }));
      return;
    }

    if (url.pathname.startsWith('/semantic/paper/')) {
      response.end(JSON.stringify({
        paperId: 'S2-987654',
        externalIds: {
          DOI: '10.1234/example',
          PubMed: '123456',
        },
        title: 'Provider receipt cache and retry evidence',
        year: 2026,
        publicationVenue: {
          name: 'Journal of Connector Evidence',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/conflict-semantic/paper/')) {
      response.end(JSON.stringify({
        paperId: 'S2-CONFLICT',
        externalIds: {
          DOI: '10.9999/wrong',
          PMID: '654321',
        },
        title: 'Provider receipt cache and retry evidence',
        year: 2026,
        publicationVenue: {
          name: 'Journal of Connector Evidence',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/conflict-doi/')) {
      response.setHeader('content-type', 'text/html');
      response.end(`
        <html>
          <head>
            <meta name="citation_title" content="Different publisher landing title" />
            <meta name="citation_journal_title" content="Journal of Connector Evidence" />
            <meta name="citation_publication_date" content="2026-04-03" />
          </head>
        </html>
      `);
      return;
    }

    if (url.pathname.startsWith('/doi/')) {
      response.setHeader('content-type', 'text/html');
      response.end(`
        <html>
          <head>
            <meta name="citation_title" content="Provider receipt cache and retry evidence" />
            <meta name="citation_journal_title" content="Journal of Connector Evidence" />
            <meta name="citation_publication_date" content="2026-04-03" />
            <title>Fallback publisher title</title>
          </head>
        </html>
      `);
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fake reference provider server did not bind a TCP address.');
  }
  return {
    baseUrl: `https://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

packageBackedTest('connect references verify returns provider receipts, cache metadata, retries, and no-authority boundary', async () => {
  const fakeProviders = await startFakeReferenceProviderServer();
  try {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    const cacheRoot = path.join(fixtureRoot, 'cache');
    fs.writeFileSync(referencesFile, JSON.stringify({
      references: [
        {
          id: 'ref-1',
          doi: '10.1234/example',
          pmid: '987654',
          title: 'Provider receipt cache and retry evidence',
        },
      ],
    }), 'utf8');

    const env = cliEnv({
      OPL_CONNECT_CROSSREF_API_BASE: `${fakeProviders.baseUrl}/crossref`,
    });
    const args = [
      'connect',
      'references',
      'verify',
      '--references-file',
      referencesFile,
      '--providers',
      'crossref',
      '--cache-root',
      cacheRoot,
      '--max-retries',
      '1',
    ];

    const output = await runCliAsync(args, env) as {
      opl_connect_reference_verification: {
        surface_kind: string;
        verification_role: string;
        status: string;
        request: { providers: string[]; max_retries: number };
        provider_evidence: Array<{
          reference_id: string;
          provider: string;
          provider_id: string;
          lookup_status: string;
          status: string;
          match_status: string;
          match_basis: string;
          receipt_ref: string;
          matched_identifiers: Record<string, string>;
          provider_identifiers: Record<string, string>;
          mismatch_details: Array<{ field: string; expected: string; actual: string }>;
          metadata: { title?: string; year?: string; journal?: string };
          verification_scope: Record<string, unknown>;
          normalized: { doi: string | null; pmid: string | null; title: string | null };
          cache: { status: string; write_status: string; cache_ref: string | null };
          retry_attempts: Array<{ attempt: number; status: string; http_status: number | null }>;
        }>;
        provider_receipts: Array<{
          reference_id: string;
          provider_id: string;
          status: string;
          match_status: string;
          receipt_ref: string;
          receipt_scope: string;
          authority: string;
        }>;
        cache: { entries: Array<{ status: string; write_status: string }> };
        retry_attempts: Array<{ provider_id: string; operation: string; attempt: number; status: string }>;
        no_authority_boundary: {
          read_only: boolean;
          can_write_domain_truth: boolean;
          can_create_owner_receipt: boolean;
          can_create_typed_blocker: boolean;
          can_claim_reference_truth: boolean;
          can_claim_citation_quality: boolean;
          can_claim_claim_support: boolean;
          can_claim_citation_truth: boolean;
          can_claim_publication_readiness: boolean;
          can_claim_domain_ready: boolean;
          can_claim_production_ready: boolean;
        };
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.equal(result.surface_kind, 'opl_connect_reference_verification_readonly');
    assert.equal(result.verification_role, 'metadata_provider_receipt_only');
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.request.providers, ['crossref']);
    assert.equal(result.request.max_retries, 1);
    assert.equal(result.provider_evidence.length, 1);

    const crossref = result.provider_evidence.find((entry) => entry.provider_id === 'crossref');
    assert.ok(crossref);
    assert.equal(crossref.status, 'matched');
    assert.equal(crossref.match_status, 'identifier_matched');
    assert.equal(crossref.provider, 'crossref');
    assert.equal(crossref.lookup_status, 'found');
    assert.equal(crossref.match_basis, 'doi');
    assert.equal(crossref.normalized.doi, '10.1234/example');
    assert.equal(crossref.matched_identifiers.doi, '10.1234/example');
    assert.equal(crossref.provider_identifiers.doi, '10.1234/example');
    assert.deepEqual(crossref.mismatch_details, []);
    assert.equal(crossref.metadata.title, 'Provider receipt cache and retry evidence');
    assert.equal(crossref.cache.status, 'miss');
    assert.equal(crossref.cache.write_status, 'written');
    assert.equal(crossref.retry_attempts.length, 2);
    assert.deepEqual(crossref.retry_attempts.map((entry) => entry.status), ['retryable_error', 'success']);
    assert.equal(crossref.receipt_ref.startsWith('opl://connect/references/verify/'), true);
    assert.equal(result.provider_receipts.length, 1);
    assert.equal(result.provider_receipts.every((entry) => entry.status === 'matched'), true);
    assert.equal(result.provider_receipts.every((entry) => entry.match_status === 'identifier_matched'), true);
    assert.equal(result.provider_receipts.every((entry) => entry.receipt_ref.startsWith('opl://connect/references/verify/')), true);
    assert.equal(result.provider_receipts.every((entry) => entry.receipt_scope === 'metadata_provider_receipt_only'), true);
    assert.equal(result.provider_receipts.every((entry) => entry.authority === 'provider_receipt_candidate_only'), true);
    assert.equal(result.cache.entries.every((entry) => entry.status === 'miss' && entry.write_status === 'written'), true);
    assert.equal(result.retry_attempts.some((entry) => entry.provider_id === 'crossref' && entry.status === 'retryable_error'), true);
    assert.equal(result.retry_attempts.every((entry) => entry.operation === 'provider_request'), true);
    assert.deepEqual(result.no_authority_boundary, {
      read_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_reference_truth: false,
      can_claim_citation_quality: false,
      can_claim_claim_support: false,
      can_claim_citation_truth: false,
      can_claim_publication_readiness: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    });

    const requestCountAfterFirstRun = fakeProviders.requests.length;
    const cached = await runCliAsync(args, env) as typeof output;
    assert.equal(fakeProviders.requests.length, requestCountAfterFirstRun);
    assert.equal(
      cached.opl_connect_reference_verification.provider_evidence.every((entry) => entry.cache.status === 'hit'),
      true,
    );
    assert.equal(cached.opl_connect_reference_verification.retry_attempts.length, 0);
  } finally {
    await fakeProviders.close();
  }
});

packageBackedTest('connect references verify covers OpenAlex, Semantic Scholar, Crossmark, and publisher receipts', async () => {
  const fakeProviders = await startFakeReferenceProviderServer();
  try {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-provider-coverage-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    fs.writeFileSync(referencesFile, JSON.stringify([
      {
        id: 'ref-1',
        doi: '10.1234/example',
        title: 'Provider receipt cache and retry evidence',
      },
    ]), 'utf8');

    const output = await runCliAsync([
      'connect',
      'references',
      'verify',
      '--references-file',
      referencesFile,
      '--providers',
      'openalex,semantic_scholar,crossmark,publisher',
      '--max-retries',
      '1',
    ], cliEnv({
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/openalex`,
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/semantic`,
      OPL_CONNECT_CROSSREF_API_BASE: `${fakeProviders.baseUrl}/crossref`,
      OPL_CONNECT_PUBLISHER_DOI_BASE: `${fakeProviders.baseUrl}/doi`,
    })) as {
      opl_connect_reference_verification: {
        request: { providers: string[] };
        provider_evidence: Array<{
          provider: string;
          provider_id: string;
          lookup_status: string;
          status: string;
          match_status: string;
          matched_identifiers: Record<string, string>;
          provider_identifiers: Record<string, string>;
          metadata: { title?: string; journal?: string };
          retraction_or_update_flags: Record<string, unknown>;
          verification_scope: Record<string, unknown>;
        }>;
        provider_receipts: Array<{ provider_id: string; status: string; match_status: string; verification_scope: Record<string, unknown> }>;
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.deepEqual(result.request.providers, ['openalex', 'semantic-scholar', 'crossmark', 'publisher']);
    assert.deepEqual(result.provider_evidence.map((entry) => [entry.provider, entry.lookup_status, entry.status, entry.match_status]), [
      ['openalex', 'found', 'matched', 'identifier_matched'],
      ['semantic_scholar', 'found', 'matched', 'identifier_matched'],
      ['crossmark', 'found', 'matched', 'identifier_matched'],
      ['publisher', 'found', 'matched', 'identifier_matched'],
    ]);
    assert.equal(result.provider_evidence[0].matched_identifiers.openalex, 'https://openalex.org/W123');
    assert.equal(result.provider_evidence[0].provider_identifiers.pmid, '123456');
    assert.equal(result.provider_evidence[1].matched_identifiers.semantic_scholar, 'S2-987654');
    assert.equal(result.provider_evidence[1].provider_identifiers.pmid, '123456');
    assert.equal(result.provider_evidence[2].retraction_or_update_flags.crossmark_metadata_source, 'crossref_rest_api');
    assert.equal(result.provider_evidence[2].verification_scope.evidence_source, 'crossref_metadata_signal');
    assert.equal(result.provider_evidence[2].verification_scope.independent_crossmark_api_verified, false);
    const publisher = result.provider_evidence[3];
    assert.equal(publisher.matched_identifiers.publisher_landing_url.includes('/doi/'), true);
    assert.equal(publisher.metadata.title, 'Provider receipt cache and retry evidence');
    assert.equal(publisher.retraction_or_update_flags.publisher_lookup_source, 'doi_resolver_landing_metadata');
    assert.equal(publisher.retraction_or_update_flags.full_text_body_verified, false);
    assert.equal(publisher.verification_scope.evidence_source, 'doi_resolver_landing_metadata');
    assert.equal(publisher.verification_scope.landing_metadata_only, true);
    assert.equal(publisher.verification_scope.full_text_body_verified, false);
    assert.equal(result.provider_receipts.every((entry) => entry.status === 'matched'), true);
    assert.equal(result.provider_receipts.every((entry) => entry.match_status === 'identifier_matched'), true);
    assert.equal(
      result.provider_receipts.find((entry) => entry.provider_id === 'publisher')?.verification_scope.full_text_body_verified,
      false,
    );
  } finally {
    await fakeProviders.close();
  }
});

packageBackedTest('connect references verify separates provider found from strict identifier match and defers conflicts', async () => {
  const fakeProviders = await startFakeReferenceProviderServer();
  try {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-strict-match-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    fs.writeFileSync(referencesFile, JSON.stringify([
      {
        id: 'ref-1',
        doi: '10.1234/example',
        title: 'Provider receipt cache and retry evidence',
      },
    ]), 'utf8');

    const output = await runCliAsync([
      'connect',
      'references',
      'verify',
      '--references-file',
      referencesFile,
      '--providers',
      'openalex,semantic_scholar,publisher',
      '--max-retries',
      '0',
    ], cliEnv({
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/id-only-openalex`,
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/conflict-semantic`,
      OPL_CONNECT_PUBLISHER_DOI_BASE: `${fakeProviders.baseUrl}/conflict-doi`,
    })) as {
      opl_connect_reference_verification: {
        provider_evidence: Array<{
          provider_id: string;
          lookup_status: string;
          status: string;
          match_status: string;
          matched_identifiers: Record<string, string>;
          provider_identifiers: Record<string, string>;
          mismatch_details: Array<{ field: string; expected: string; actual: string }>;
          verification_scope: Record<string, unknown>;
        }>;
        provider_receipts: Array<{ provider_id: string; status: string }>;
        deferred_provider_receipt_requirements: Array<{
          provider_id: string;
          status: string;
          match_status: string;
          mismatch_details: Array<{ field: string; expected: string; actual: string }>;
        }>;
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.deepEqual(result.provider_evidence.map((entry) => [entry.provider_id, entry.lookup_status, entry.status, entry.match_status]), [
      ['openalex', 'found', 'deferred', 'provider_found'],
      ['semantic-scholar', 'found', 'deferred', 'metadata_conflict'],
      ['publisher', 'found', 'deferred', 'metadata_conflict'],
    ]);
    assert.deepEqual(result.provider_receipts, []);

    const openalex = result.provider_evidence.find((entry) => entry.provider_id === 'openalex');
    const semanticScholar = result.provider_evidence.find((entry) => entry.provider_id === 'semantic-scholar');
    const publisher = result.provider_evidence.find((entry) => entry.provider_id === 'publisher');
    assert.ok(openalex);
    assert.ok(semanticScholar);
    assert.ok(publisher);
    assert.equal(openalex.provider_identifiers.openalex, 'https://openalex.org/W-ID-ONLY');
    assert.equal(openalex.matched_identifiers.openalex, undefined);
    assert.deepEqual(openalex.mismatch_details, []);
    assert.equal(semanticScholar.mismatch_details[0].field, 'doi');
    assert.equal(semanticScholar.provider_identifiers.pmid, '654321');
    assert.equal(semanticScholar.mismatch_details[0].expected, '10.1234/example');
    assert.equal(semanticScholar.mismatch_details[0].actual, '10.9999/wrong');
    assert.equal(publisher.mismatch_details[0].field, 'title');
    assert.equal(publisher.provider_identifiers.publisher_landing_url.includes('/conflict-doi/'), true);
    assert.equal(publisher.verification_scope.landing_metadata_only, true);
    assert.equal(publisher.verification_scope.full_text_body_verified, false);
    assert.deepEqual(result.deferred_provider_receipt_requirements.map((entry) => [
      entry.provider_id,
      entry.status,
      entry.match_status,
      entry.mismatch_details[0]?.field ?? null,
    ]), [
      ['openalex', 'deferred', 'provider_found', null],
      ['semantic-scholar', 'deferred', 'metadata_conflict', 'doi'],
      ['publisher', 'deferred', 'metadata_conflict', 'title'],
    ]);
  } finally {
    await fakeProviders.close();
  }
});

packageBackedTest('connect references verify defers one failed provider while matched providers keep receipts', async () => {
  const fakeProviders = await startFakeReferenceProviderServer();
  try {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-provider-error-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    fs.writeFileSync(referencesFile, JSON.stringify([
      {
        id: 'ref-1',
        doi: '10.1234/example',
        pmid: '123456',
        title: 'Provider receipt cache and retry evidence',
      },
    ]), 'utf8');

    const output = await runCliAsync([
      'connect',
      'references',
      'verify',
      '--references-file',
      referencesFile,
      '--providers',
      'semantic-scholar,openalex',
      '--max-retries',
      '0',
    ], cliEnv({
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/semantic`,
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/rate-limited-openalex`,
    })) as {
      opl_connect_reference_verification: {
        status: string;
        provider_evidence: Array<{
          provider_id: string;
          lookup_status: string;
          status: string;
          receipt_ref: string;
          error?: { code: string; message: string; details?: Record<string, unknown> };
          retry_attempts: Array<{ attempt: number; status: string; http_status: number | null }>;
        }>;
        provider_receipts: Array<{ provider_id: string; status: string; receipt_ref: string }>;
        deferred_provider_receipt_requirements: Array<{ provider_id: string; status: string; reason: string }>;
        retry_attempts: Array<{ provider_id: string; status: string; http_status: number | null }>;
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.equal(result.status, 'completed');

    const semanticScholar = result.provider_evidence.find((entry) => entry.provider_id === 'semantic-scholar');
    const openalex = result.provider_evidence.find((entry) => entry.provider_id === 'openalex');
    assert.ok(semanticScholar);
    assert.ok(openalex);
    assert.equal(semanticScholar.status, 'matched');
    assert.equal(openalex.status, 'deferred');
    assert.equal(openalex.lookup_status, 'error');
    assert.equal(openalex.error?.details?.status, 429);
    assert.deepEqual(openalex.retry_attempts, [{ attempt: 0, status: 'failed', http_status: 429 }]);
    assert.deepEqual(result.provider_receipts.map((entry) => [entry.provider_id, entry.status]), [
      ['semantic-scholar', 'matched'],
    ]);
    assert.equal(result.provider_receipts[0].receipt_ref, semanticScholar.receipt_ref);
    assert.deepEqual(result.deferred_provider_receipt_requirements.map((entry) => [entry.provider_id, entry.status]), [
      ['openalex', 'deferred'],
    ]);
    assert.equal(result.deferred_provider_receipt_requirements[0].reason.includes('Reference provider returned a non-OK status'), true);
    assert.equal(result.retry_attempts.some((entry) => entry.provider_id === 'openalex' && entry.http_status === 429), true);
  } finally {
    await fakeProviders.close();
  }
});

packageBackedTest('connect references verify declares publisher DOI requirement without pretending provider truth', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-deferred-'));
  const referencesFile = path.join(fixtureRoot, 'references.json');
  fs.writeFileSync(referencesFile, JSON.stringify([
    {
      id: 'ref-1',
      title: 'Deferred provider evidence boundary',
    },
  ]), 'utf8');

  const output = await runCliAsync([
    'connect',
    'references',
    'verify',
    '--references-file',
    referencesFile,
    '--providers',
    'publisher',
  ], cliEnv()) as {
    opl_connect_reference_verification: {
      provider_evidence: Array<{ provider: string; provider_id: string; lookup_status: string; status: string; deferred_reason: string }>;
      deferred_provider_receipt_requirements: Array<{ provider_id: string; status: string }>;
    };
  };

  const result = output.opl_connect_reference_verification;
  assert.deepEqual(result.provider_evidence.map((entry) => [entry.provider_id, entry.status]), [
    ['publisher', 'deferred'],
  ]);
  assert.equal(result.provider_evidence[0].provider, 'publisher');
  assert.equal(result.provider_evidence[0].lookup_status, 'deferred');
  assert.equal(result.provider_evidence.every((entry) => entry.deferred_reason.includes('DOI')), true);
  assert.deepEqual(result.deferred_provider_receipt_requirements.map((entry) => entry.provider_id), [
    'publisher',
  ]);
});

packageBackedTest('connect references defer a chunked oversized provider body and abort its attempt', async () => {
  const originalFetch = globalThis.fetch;
  const originalLimit = process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
  let activeSignal: AbortSignal | undefined;
  let cancelled = false;
  process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = '64';
  globalThis.fetch = async (_input, init) => {
    activeSignal = init?.signal ?? undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(40)));
        controller.enqueue(new TextEncoder().encode('x'.repeat(40)));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await runOplConnectReferenceVerification({
      references: [{ id: 'ref-large', pmid: '123456' }],
      providers: ['pubmed'],
      maxRetries: 0,
      installedPackage: isolatedScholarPackage(),
    });
    const evidence = result.opl_connect_reference_verification.provider_evidence[0];
    assert.equal(result.opl_connect_reference_verification.status, 'completed');
    assert.equal(evidence.lookup_status, 'error');
    assert.equal(evidence.status, 'deferred');
    assert.equal(evidence.error?.code, 'provider_response_too_large');
    assert.equal(cancelled, true);
    assert.equal(activeSignal?.aborted, true);

    process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = '1024';
    globalThis.fetch = async (_input, init) => {
      activeSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({
        result: {
          uids: ['123456'],
          '123456': {
            uid: '123456',
            title: 'Bounded legal provider response',
            articleids: [{ idtype: 'doi', value: '10.1234/bounded' }],
          },
        },
      }), { headers: { 'content-type': 'application/json' } });
    };
    const legal = await runOplConnectReferenceVerification({
      references: [{ id: 'ref-legal', pmid: '123456' }],
      providers: ['pubmed'],
      maxRetries: 0,
      installedPackage: isolatedScholarPackage(),
    });
    assert.equal(legal.opl_connect_reference_verification.provider_evidence[0].status, 'matched');
    assert.equal(activeSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLimit === undefined) delete process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
    else process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = originalLimit;
  }
});

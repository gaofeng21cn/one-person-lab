import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';

import {
  assert,
  createFakeCodexPluginManagerFixture,
  createInstalledPackageCarrierFixture,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import { createTestTlsServerFixture } from '../helpers-parts/tls-fixture.ts';
import {
  buildScientificConnectorProviderRegistryReadback,
  runOplConnectScientificSearch,
  scientificConnectorProviderIds,
} from '../../../../src/adapters/integration/opl-connect-scientific.ts';
import {
  normalizeReferenceVerificationProviders,
  referenceVerificationProviderIds,
} from '../../../../src/adapters/integration/opl-connect-reference-verification.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../../../src/kernel/family-workspace-root.ts';

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

type ScientificSearchOutput = {
  opl_connect_scientific: {
    surface_kind: string;
    connector_id: string;
    connector_profile: string;
    profile_role: string;
    provider_id: string;
    normalized_results: Array<{
      source_provider: string;
      doi: string | null;
      pmid: string | null;
      pmcid: string | null;
      journal: string | null;
      publication_year: string | null;
      authors: string[];
      article_types: string[];
    }>;
    retrieval_count_reconciliation: {
      provider_total: number | null;
      returned_count: number;
      requested_limit: number;
      result_set_complete: boolean | null;
      next_page_available: boolean | null;
    };
    result_refs: string[];
    receipt_refs: {
      connector_invocation_ref: string;
    };
    provider_receipt_role: string;
    ownership_boundary: {
      connector_profile_owner: string;
      provider_receipt_owner: string;
      citation_judgment_owner: string;
      connector_receipt_counts_as_citation_truth: boolean;
      connector_receipt_counts_as_domain_truth: boolean;
    };
    authority_boundary: {
      read_only: boolean;
      can_write_domain_truth: boolean;
      can_sign_owner_receipt: boolean;
      can_create_typed_blocker: boolean;
      can_claim_publication_readiness: boolean;
      can_claim_citation_truth: boolean;
    };
  };
};

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

function syntheticScientificStepSchema() {
  const candidateRequired = [
    'source_ref',
    'source_kind',
    'source_provider',
    'provider_id',
    'doi',
    'pmid',
    'pmcid',
    'openalex_id',
    'title',
    'journal',
    'publication_year',
    'authors',
    'article_types',
    'source_urls',
  ];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://one-person-lab.dev/tests/synthetic-scientific-adapter-step.schema.json',
    type: 'object',
    required: ['surface_kind', 'adapter_abi', 'next'],
    properties: {
      surface_kind: { const: 'opl_connect_scientific_search_adapter_step_result.v1' },
      adapter_abi: { const: 'opl-connect-scientific-search-adapter.v1' },
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
            required: ['kind', 'candidates', 'provider_total'],
            properties: {
              kind: { const: 'complete' },
              candidates: {
                type: 'array',
                items: { type: 'object', required: candidateRequired },
              },
              provider_total: { type: ['integer', 'null'], minimum: 0 },
            },
            additionalProperties: false,
          },
        ],
      },
    },
    additionalProperties: false,
  };
}

async function withSyntheticScientificAdapter<T>(callback: (
  requests: string[],
  installedPackage: { runner: (input: { binary: string; args: string[]; env: NodeJS.ProcessEnv }) => {
    status: number;
    stdout: string;
    stderr: string;
    error: Error | null;
  } },
  sourceRoot: string,
) => Promise<T>) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scientific-adapter-source-'));
  fs.mkdirSync(path.join(sourceRoot, 'contracts', 'scientific-search-adapters'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'runtime', 'scientific-search-adapters'), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, 'contracts', 'scientific-search-adapters', 'scientific-search.json'),
    JSON.stringify({
      registry_owner: 'synthetic-scientific-adapter',
      providers: [{
        provider_id: 'synthetic-scientific',
        adapter_id: 'synthetic_scientific_adapter',
        source_provider: 'Synthetic Scientific Source',
        source_system: 'Synthetic Scientific API',
        endpoint: {
          default_base_url: 'https://profile.invalid',
          environment_override: 'OPL_CONNECT_SYNTHETIC_ADAPTER_BASE',
          allowed_origins: ['https://profile.invalid'],
        },
      }],
    }),
    'utf8',
  );
  const handlerFile = 'runtime/scientific-search-adapters/index.mjs';
  fs.writeFileSync(path.join(sourceRoot, 'runtime', 'scientific-search-adapters', 'index.mjs'), `
export function runScientificSearchAdapterStep(request) {
  if (request.operation === 'build_search_request') {
    if (process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT === 'envelope') {
      return { next: { kind: 'complete', candidates: [], provider_total: 0 } };
    }
    if (process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT === 'candidate') {
      return {
        surface_kind: 'opl_connect_scientific_search_adapter_step_result.v1',
        adapter_abi: 'opl-connect-scientific-search-adapter.v1',
        next: { kind: 'complete', candidates: [{ title: 'Incomplete candidate' }], provider_total: 1 },
      };
    }
    return {
      surface_kind: 'opl_connect_scientific_search_adapter_step_result.v1',
      adapter_abi: 'opl-connect-scientific-search-adapter.v1',
      next: {
        kind: 'request',
        request: {
          method: 'GET',
          url: process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BAD_ORIGIN === '1'
            ? 'https://evil.test/adapter-only'
            : String(request.provider.endpoint.base_url) + '/adapter-only',
          body: null,
        },
        state: { surface_kind: 'synthetic-scientific-state', step: 1 },
      },
    };
  }
  if (request.operation === 'parse_search_response') {
    if (request.response.body.adapter_marker !== 'scientific') throw new Error('synthetic scientific adapter marker missing');
    return {
      surface_kind: 'opl_connect_scientific_search_adapter_step_result.v1',
      adapter_abi: 'opl-connect-scientific-search-adapter.v1',
      next: {
        kind: 'complete',
        provider_total: 1,
        candidates: [{
          source_ref: 'synthetic:scientific',
          source_kind: 'literature_article',
          source_provider: 'Synthetic Scientific Source',
          provider_id: 'synthetic-scientific',
          doi: null,
          pmid: null,
          pmcid: null,
          openalex_id: null,
          title: 'Synthetic adapter candidate',
          journal: null,
          publication_year: null,
          authors: [],
          article_types: [],
          source_urls: {},
        }],
      },
    };
  }
  throw new Error('unexpected synthetic scientific adapter operation');
}
`, 'utf8');

  const originalAdapterBase = process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE;
  const originalBadOrigin = process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BAD_ORIGIN;
  const originalMalformedResult = process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE = 'https://adapter.test';
  const binding = {
    module_id: 'mas-scholar-skills.scientific-search-adapters',
    module_kind: 'opl_connect_scientific_search_adapter',
    adapter_abi: 'opl-connect-scientific-search-adapter.v1',
    profile_ref: 'contracts/scientific-search-adapters/scientific-search.json',
    profile_schema_ref: 'contracts/scientific-search-adapters/scientific-search-provider-profile.schema.json',
    registry_ref: 'contracts/scientific-search-adapters/scientific-search-adapter-registry.json',
    registry_schema_ref: 'contracts/scientific-search-adapters/scientific-search-adapter-registry.schema.json',
    step_schema_ref: 'contracts/scientific-search-adapters/scientific-search-adapter-step.schema.json',
    handler: { kind: 'typescript_export', file: handlerFile, export: 'runScientificSearchAdapterStep' },
    max_steps: 1,
    contained_implementation_files: [handlerFile],
    exports: ['runScientificSearchAdapterStep'],
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
    path.join(sourceRoot, binding.step_schema_ref),
    JSON.stringify(syntheticScientificStepSchema()),
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
    capability_dependencies: [],
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
      throw new Error(`unexpected non-adapter scientific request: ${url.toString()}`);
    }
    return new Response(JSON.stringify({ adapter_marker: 'scientific' }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    return await callback(requests, installedPackage, sourceRoot);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAdapterBase === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE;
    else process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE = originalAdapterBase;
    if (originalBadOrigin === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BAD_ORIGIN;
    else process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BAD_ORIGIN = originalBadOrigin;
    if (originalMalformedResult === undefined) delete process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT;
    else process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT = originalMalformedResult;
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

packageBackedTest('scientific connector providers are explicit adapters with no core default', () => {
  const installedPackage = isolatedScholarPackage();
  const registry = buildScientificConnectorProviderRegistryReadback(installedPackage);
  assert.equal(registry.surface_kind, 'opl_scientific_connector_provider_registry');
  assert.equal(registry.default_provider_id, null);
  assert.deepEqual(
    scientificConnectorProviderIds(installedPackage),
    ['crossref', 'openalex', 'pubmed', 'pmc'],
  );
  assert.equal(registry.providers.every((provider) => provider.adapter_role === 'optional_provider_adapter'), true);
  assert.equal(registry.authority_boundary.can_write_domain_truth, false);
});

packageBackedTest('canonical ScholarSkills installed descriptor executes the two-step package handler through Framework I/O', async () => {
  const scholarRoot = scholarPackageRoot!;
  assert.equal(fs.existsSync(path.join(scholarRoot, 'opl-package.json')), true, `missing canonical ScholarSkills package: ${scholarRoot}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(scholarRoot, 'opl-package.json'), 'utf8')) as {
    version: string;
    exports: { runtime_module_bindings: Array<{ module_id: string; module_kind: string; adapter_abi: string; max_steps: number }> };
  };
  const binding = manifest.exports.runtime_module_bindings.find((entry) => entry.module_kind === 'opl_connect_scientific_search_adapter');
  assert.ok(binding);
  assert.equal(binding.max_steps, 2);
  const installedPackage = {
    runner: ({ args }: { binary: string; args: string[]; env: NodeJS.ProcessEnv }) => ({
      status: args.join(' ') === 'plugin list --json' ? 0 : 2,
      stdout: JSON.stringify({ installed: [{
        pluginId: 'mas-scholar-skills@mas-scholar-skills',
        version: manifest.version,
        enabled: false,
        source: { source: 'local', path: scholarRoot },
        marketplaceSource: { sourceType: 'local', source: scholarRoot },
      }] }),
      stderr: '',
      error: null,
    }),
  };
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.OPL_CONNECT_PUBMED_EUTILS_BASE;
  const requests: string[] = [];
  process.env.OPL_CONNECT_PUBMED_EUTILS_BASE = 'https://scholar-e2e.test/entrez/eutils';
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push(url.pathname);
    if (url.pathname.endsWith('/esearch.fcgi')) {
      return new Response(JSON.stringify({ esearchresult: { count: '1', idlist: ['20332509'] } }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/esummary.fcgi')) {
      return new Response(JSON.stringify({ result: {
        uids: ['20332509'],
        '20332509': {
          uid: '20332509',
          title: 'Canonical ScholarSkills E2E',
          pubdate: '2026',
          fulljournalname: 'Framework I/O Journal',
          authors: [{ name: 'Package Owner' }],
          pubtype: ['Journal Article'],
          articleids: [{ idtype: 'doi', value: '10.9999/scholar-e2e' }],
        },
      } }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ScholarSkills E2E request: ${url.toString()}`);
  };
  try {
    const output = await runOplConnectScientificSearch({
      provider: 'pubmed',
      query: 'canonical ScholarSkills package',
      limit: 1,
      installedPackage,
    });
    assert.deepEqual(requests, ['/entrez/eutils/esearch.fcgi', '/entrez/eutils/esummary.fcgi']);
    assert.deepEqual(output.opl_connect_scientific.result_refs, ['pubmed:20332509']);
    assert.equal(output.opl_connect_scientific.normalized_results[0].doi, '10.9999/scholar-e2e');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.OPL_CONNECT_PUBMED_EUTILS_BASE;
    else process.env.OPL_CONNECT_PUBMED_EUTILS_BASE = originalBase;
  }
});

packageBackedTest('reference verification provider registry owns defaults and aliases', () => {
  const installedPackage = isolatedScholarPackage();
  const providerIds = referenceVerificationProviderIds(installedPackage);
  assert.deepEqual(providerIds, [
    'crossref',
    'openalex',
    'pubmed',
    'pmc',
    'semantic-scholar',
    'crossmark',
    'publisher',
  ]);
  assert.deepEqual(
    normalizeReferenceVerificationProviders([], installedPackage),
    providerIds,
  );
  assert.deepEqual(
    normalizeReferenceVerificationProviders(
      ['openalex,semantic_scholar,pubmed,pmc', 'openalex'],
      installedPackage,
    ),
    ['openalex', 'semantic-scholar', 'pubmed', 'pmc'],
  );
  assert.throws(
    () => normalizeReferenceVerificationProviders(['unsupported-provider'], installedPackage),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'codex_command_failed');
      assert.deepEqual(
        (error as { details?: { supported?: string[] } }).details?.supported,
        providerIds,
      );
      return true;
    },
  );
  assert.throws(
    () => normalizeReferenceVerificationProviders(['', '   ', ','], installedPackage),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'codex_command_failed');
      assert.match((error as Error).message, /at least one non-empty provider/);
      return true;
    },
  );
});

test('scientific connector routes HTTP and normalization through the installed package adapter state machine', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage) => {
    const output = await runOplConnectScientificSearch({
      provider: 'synthetic-scientific',
      query: 'adapter-owned query',
      limit: 1,
      installedPackage,
    });
    assert.deepEqual(requests, ['/adapter-only']);
    assert.deepEqual(output.opl_connect_scientific.result_refs, ['synthetic:scientific']);
    assert.equal(output.opl_connect_scientific.normalized_results[0].title, 'Synthetic adapter candidate');
  });
});

test('scientific connector CLI loads a repo-contained synthetic installed Package', async () => {
  await withSyntheticScientificAdapter(async (_requests, _installedPackage, sourceRoot) => {
    fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({
      name: 'mas-scholar-skills', version: '0.0.0', skills: './skills/',
    }), 'utf8');
    const carrier = createInstalledPackageCarrierFixture(sourceRoot);
    const codex = createFakeCodexPluginManagerFixture();
    const server = createServer(testTlsFixture.options, (request, response) => {
      const url = new URL(request.url ?? '/', 'https://127.0.0.1');
      response.setHeader('content-type', 'application/json');
      if (url.pathname !== '/adapter-only') {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      response.end(JSON.stringify({ adapter_marker: 'scientific' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const output = await runCliAsync([
        'connect',
        'scientific',
        'search',
        '--provider',
        'synthetic-scientific',
        '--query',
        'repo-contained fixture',
        '--limit',
        '1',
      ], {
        OPL_STATE_DIR: carrier.stateRoot,
        OPL_CODEX_PLUGIN_BIN: codex.codexPath,
        OPL_CONNECT_SYNTHETIC_ADAPTER_BASE: `https://127.0.0.1:${address.port}`,
      }) as ScientificSearchOutput;
      assert.deepEqual(output.opl_connect_scientific.result_refs, ['synthetic:scientific']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      fs.rmSync(carrier.fixtureRoot, { recursive: true, force: true });
      fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    }
  });
});

test('scientific connector rejects malformed adapter envelopes and candidates before network access', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage) => {
    for (const mode of ['envelope', 'candidate']) {
      process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_MALFORMED_RESULT = mode;
      await assert.rejects(
        () => runOplConnectScientificSearch({
          provider: 'synthetic-scientific',
          query: `malformed adapter ${mode}`,
          limit: 1,
          installedPackage,
        }),
        (error: unknown) => {
          const details = (error as { details?: { reason_code?: string; schema_errors?: unknown[] } }).details;
          assert.equal((error as { code?: string }).code, 'codex_command_failed');
          assert.equal(details?.reason_code, 'scientific_adapter_result_schema_invalid');
          assert.equal((details?.schema_errors?.length ?? 0) > 0, true);
          return true;
        },
      );
    }
    assert.deepEqual(requests, []);
  });
});

test('scientific connector requires restart when a loaded module path changes digest', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage, sourceRoot) => {
    const input = {
      provider: 'synthetic-scientific',
      query: 'module generation',
      limit: 1,
      installedPackage,
    };
    await runOplConnectScientificSearch(input);
    fs.appendFileSync(
      path.join(sourceRoot, 'runtime', 'scientific-search-adapters', 'index.mjs'),
      '\n// replacement generation\n',
      'utf8',
    );
    refreshSyntheticContentLock(sourceRoot);
    await assert.rejects(
      () => runOplConnectScientificSearch(input),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'codex_command_failed');
        assert.equal(
          (error as { details?: { reason_code?: string } }).details?.reason_code,
          'installed_runtime_module_restart_required',
        );
        return true;
      },
    );
    assert.deepEqual(requests, ['/adapter-only']);
  });
});

test('scientific connector rejects a handler origin outside the active provider profile before fetch', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage) => {
    process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BAD_ORIGIN = '1';
    await assert.rejects(
      () => runOplConnectScientificSearch({
        provider: 'synthetic-scientific',
        query: 'malicious origin',
        limit: 1,
        installedPackage,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'codex_command_failed');
        assert.equal(
          (error as { details?: { reason_code?: string } }).details?.reason_code,
          'scientific_provider_request_origin_not_allowed',
        );
        return true;
      },
    );
    assert.deepEqual(requests, []);
  });
});

test('scientific connector manually follows allowlisted redirects and blocks unsafe chains', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage) => {
    const originalFetch = globalThis.fetch;
    let mode: 'same-origin' | 'disallowed' | 'loop' | 'hop-limit' = 'same-origin';
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push(url.toString());
      assert.equal(init?.redirect, 'manual');
      const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
      if (mode === 'same-origin') {
        if (url.pathname === '/redirect/adapter-only') return redirect('/adapter-only');
        if (url.pathname === '/adapter-only') return new Response(JSON.stringify({ adapter_marker: 'scientific' }));
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
      throw new Error(`unexpected scientific redirect request: ${url.toString()}`);
    };
    const input = {
      provider: 'synthetic-scientific',
      query: 'redirect policy',
      limit: 1,
      installedPackage,
    };
    try {
      process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE = 'https://adapter.test/redirect';
      const sameOrigin = await runOplConnectScientificSearch(input);
      assert.deepEqual(sameOrigin.opl_connect_scientific.result_refs, ['synthetic:scientific']);
      assert.deepEqual(requests, [
        'https://adapter.test/redirect/adapter-only',
        'https://adapter.test/adapter-only',
      ]);

      requests.length = 0;
      mode = 'disallowed';
      await assert.rejects(
        () => runOplConnectScientificSearch(input),
        (error: unknown) => {
          assert.equal((error as { details?: { reason_code?: string } }).details?.reason_code, 'scientific_provider_redirect_origin_not_allowed');
          return true;
        },
      );
      assert.deepEqual(requests, ['https://adapter.test/redirect/adapter-only']);

      requests.length = 0;
      mode = 'loop';
      process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE = 'https://adapter.test/loop-a';
      await assert.rejects(
        () => runOplConnectScientificSearch(input),
        (error: unknown) => {
          assert.equal((error as { details?: { reason_code?: string } }).details?.reason_code, 'scientific_provider_redirect_loop');
          return true;
        },
      );
      assert.deepEqual(requests, [
        'https://adapter.test/loop-a/adapter-only',
        'https://adapter.test/loop-b',
      ]);

      requests.length = 0;
      mode = 'hop-limit';
      process.env.OPL_CONNECT_SYNTHETIC_ADAPTER_BASE = 'https://adapter.test/hop-0';
      await assert.rejects(
        () => runOplConnectScientificSearch(input),
        (error: unknown) => {
          assert.equal((error as { details?: { reason_code?: string } }).details?.reason_code, 'scientific_provider_redirect_hop_limit_exceeded');
          return true;
        },
      );
      assert.equal(requests.length, 6);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('scientific connector rejects installed package content lock drift before handler execution', async () => {
  await withSyntheticScientificAdapter(async (requests, installedPackage, sourceRoot) => {
    fs.appendFileSync(path.join(sourceRoot, 'runtime', 'scientific-search-adapters', 'index.mjs'), '\n// drift\n', 'utf8');
    await assert.rejects(
      () => runOplConnectScientificSearch({
        provider: 'synthetic-scientific',
        query: 'content lock drift',
        limit: 1,
        installedPackage,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'codex_command_failed');
        assert.equal(
          (error as { details?: { reason_code?: string } }).details?.reason_code,
          'installed_runtime_module_content_lock_mismatch',
        );
        return true;
      },
    );
    assert.deepEqual(requests, []);
  });
});

test('scientific provider discovery is lazy for help and fail-closed for Connect without an installed Package', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-empty-carrier-state-'));
  // Project-local capability packages are also discovered from sibling owners.
  const env = { OPL_STATE_DIR: stateRoot, OPL_FAMILY_WORKSPACE_ROOT: stateRoot };
  try {
    const help = runCli(['--help'], env);
    assert.equal(help.version, 'g2');
    const failure = runCliFailure([
      'connect',
      'scientific',
      'search',
      '--provider',
      'synthetic-scientific',
      '--query',
      'missing package',
      '--json',
    ], env);
    assert.equal(failure.payload.error.code, 'codex_command_failed');
    assert.equal(failure.payload.error.details.reason_code, 'installed_package_descriptor_missing');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

async function startFakeScientificServer() {
  const requests: string[] = [];
  const server = createServer(testTlsFixture.options, (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}?${url.searchParams.toString()}`);
    response.setHeader('content-type', 'application/json');

    if (url.pathname.endsWith('/crossref/works')) {
      response.end(JSON.stringify({
        message: {
          items: [
            {
              DOI: '10.2000/crossref-example',
              title: ['Crossref metadata for clinical models'],
              'container-title': ['Metadata Journal'],
              published: { 'date-parts': [[2025, 4, 1]] },
              author: [{ given: 'Alex', family: 'Rivera' }],
            },
          ],
        },
      }));
      return;
    }

    if (url.pathname.endsWith('/openalex/works')) {
      response.end(JSON.stringify({
        results: [
          {
            id: 'https://openalex.org/W123',
            doi: 'https://doi.org/10.3000/openalex-example',
            title: 'OpenAlex citation graph support',
            publication_year: 2024,
            primary_location: {
              source: { display_name: 'Graph Methods' },
            },
            ids: {
              pmid: 'https://pubmed.ncbi.nlm.nih.gov/67890',
            },
            authorships: [
              { author: { display_name: 'Sam Lee' } },
            ],
          },
        ],
      }));
      return;
    }

    if (url.pathname.endsWith('/pubmed/esearch.fcgi')) {
      response.end(JSON.stringify({
        esearchresult: {
          count: '2',
          idlist: ['20332509'],
        },
      }));
      return;
    }

    if (url.pathname.endsWith('/pubmed/esummary.fcgi')) {
      response.end(JSON.stringify({
        result: {
          uids: ['20332509'],
          '20332509': {
            uid: '20332509',
            title: 'CONSORT 2010 statement',
            pubdate: '2010 Mar 23',
            fulljournalname: 'BMJ',
            authors: [{ name: 'Schulz KF' }],
            pubtype: ['Journal Article', 'Randomized Controlled Trial'],
            articleids: [
              { idtype: 'doi', value: '10.1136/bmj.c332' },
              { idtype: 'pmc', value: 'PMC2844940' },
            ],
          },
        },
      }));
      return;
    }

    if (url.pathname.endsWith('/pmc/search')) {
      response.end(JSON.stringify({
        hitCount: 3,
        resultList: {
          result: [{
            id: '20332509',
            pmid: '20332509',
            pmcid: 'PMC2844940',
            doi: '10.1136/bmj.c332',
            title: 'CONSORT 2010 statement',
            pubYear: '2010',
            journalTitle: 'BMJ',
            authorList: { author: [{ fullName: 'Schulz KF' }] },
            pubTypeList: { pubType: ['journal article', 'guideline'] },
            inEPMC: 'Y',
          }],
        },
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fake scientific connector server did not bind a TCP address.');
  }
  const baseUrl = `https://127.0.0.1:${address.port}`;
  return {
    crossrefBaseUrl: `${baseUrl}/crossref`,
    openalexBaseUrl: `${baseUrl}/openalex`,
    pubmedBaseUrl: `${baseUrl}/pubmed`,
    europePmcBaseUrl: `${baseUrl}/pmc`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

packageBackedTest('connect scientific search returns normalized Crossref refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'crossref', '--query', 'clinical model', '--limit', '1'],
      cliEnv({ OPL_CONNECT_CROSSREF_API_BASE: fakeServer.crossrefBaseUrl }),
    ) as ScientificSearchOutput;
    const scientific = output.opl_connect_scientific;

    assert.equal(scientific.provider_id, 'crossref');
    assert.deepEqual(scientific.result_refs, ['crossref:10.2000/crossref-example']);
    assert.equal(scientific.normalized_results[0].journal, 'Metadata Journal');
    assert.equal(scientific.normalized_results[0].publication_year, '2025');
    assert.deepEqual(scientific.normalized_results[0].authors, ['Alex Rivera']);
    assert.equal(scientific.retrieval_count_reconciliation.provider_total, null);
    assert.equal(scientific.retrieval_count_reconciliation.returned_count, 1);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/crossref/works?')), true);
  } finally {
    await fakeServer.close();
  }
});

packageBackedTest('connect scientific search discovers and normalizes PubMed refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'pubmed', '--query', 'CONSORT randomized trial', '--limit', '1'],
      cliEnv({ OPL_CONNECT_PUBMED_EUTILS_BASE: fakeServer.pubmedBaseUrl }),
    ) as ScientificSearchOutput;
    const scientific = output.opl_connect_scientific;

    assert.deepEqual(scientific.result_refs, ['pubmed:20332509']);
    assert.equal(scientific.normalized_results[0].doi, '10.1136/bmj.c332');
    assert.equal(scientific.normalized_results[0].pmcid, 'PMC2844940');
    assert.deepEqual(scientific.normalized_results[0].article_types, [
      'Journal Article',
      'Randomized Controlled Trial',
    ]);
    assert.equal(scientific.retrieval_count_reconciliation.provider_total, 2);
    assert.equal(scientific.retrieval_count_reconciliation.next_page_available, true);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/pubmed/esearch.fcgi?')), true);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/pubmed/esummary.fcgi?')), true);
  } finally {
    await fakeServer.close();
  }
});

packageBackedTest('connect scientific search discovers and normalizes Europe PMC refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'pmc', '--query', 'OPEN_ACCESS:Y AND CONSORT', '--limit', '1'],
      cliEnv({ OPL_CONNECT_EUROPE_PMC_API_BASE: fakeServer.europePmcBaseUrl }),
    ) as ScientificSearchOutput;
    const scientific = output.opl_connect_scientific;

    assert.deepEqual(scientific.result_refs, ['pmc:PMC2844940']);
    assert.equal(scientific.normalized_results[0].pmid, '20332509');
    assert.equal(scientific.normalized_results[0].pmcid, 'PMC2844940');
    assert.deepEqual(scientific.normalized_results[0].article_types, ['journal article', 'guideline']);
    assert.equal(scientific.retrieval_count_reconciliation.provider_total, 3);
    assert.equal(scientific.retrieval_count_reconciliation.result_set_complete, false);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/pmc/search?')), true);
  } finally {
    await fakeServer.close();
  }
});

packageBackedTest('connect scientific search returns normalized OpenAlex refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'openalex', '--query', 'citation graph', '--limit', '1'],
      cliEnv({ OPL_CONNECT_OPENALEX_API_BASE: fakeServer.openalexBaseUrl }),
    ) as ScientificSearchOutput;
    const scientific = output.opl_connect_scientific;

    assert.equal(scientific.provider_id, 'openalex');
    assert.deepEqual(scientific.result_refs, ['openalex:W123']);
    assert.equal(scientific.normalized_results[0].doi, '10.3000/openalex-example');
    assert.equal(scientific.normalized_results[0].pmid, '67890');
    assert.deepEqual(scientific.normalized_results[0].authors, ['Sam Lee']);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/openalex/works?')), true);
  } finally {
    await fakeServer.close();
  }
});

test('connect scientific search requires provider and query', () => {
  const missingProvider = runCliFailure(['connect', 'scientific', 'search', '--query', 'clinical AI'], cliEnv());
  assert.equal(missingProvider.status, 2);
  assert.equal(missingProvider.payload.error.code, 'cli_usage_error');
  assert.match(missingProvider.payload.error.message, /requires --provider/);

  const missingQuery = runCliFailure(['connect', 'scientific', 'search', '--provider', 'crossref'], cliEnv());
  assert.equal(missingQuery.status, 2);
  assert.equal(missingQuery.payload.error.code, 'cli_usage_error');
  assert.match(missingQuery.payload.error.message, /requires --query/);

  const compatibility = runCliFailure(['connect', 'pubmed', 'search', '--query', 'clinical AI'], cliEnv());
  assert.equal(compatibility.status, 2);
  assert.equal(compatibility.payload.error.code, 'unknown_command');

});

packageBackedTest('connect scientific bounds chunked provider bodies and keeps legal responses working', async () => {
  const originalFetch = globalThis.fetch;
  const originalLimit = process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
  let activeSignal: AbortSignal | undefined;
  let cancelled = false;
  process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = '64';
  try {
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

    let failure: unknown;
    try {
      await runOplConnectScientificSearch({
        provider: 'crossref',
        query: 'oversized',
        limit: 1,
        installedPackage: isolatedScholarPackage(),
      });
    } catch (error) {
      failure = error;
    }
    assert.equal((failure as { details?: { reason_code?: string } }).details?.reason_code, 'provider_response_too_large');
    assert.equal(cancelled, true);
    assert.equal(activeSignal?.aborted, true);

    globalThis.fetch = async (_input, init) => {
      activeSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ message: { items: [] } }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const legal = await runOplConnectScientificSearch({
      provider: 'crossref',
      query: 'legal',
      limit: 1,
      installedPackage: isolatedScholarPackage(),
    });
    assert.deepEqual(legal.opl_connect_scientific.normalized_results, []);
    assert.equal(activeSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLimit === undefined) delete process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES;
    else process.env.OPL_CONNECT_MAX_RESPONSE_BODY_BYTES = originalLimit;
  }
});

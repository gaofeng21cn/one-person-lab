import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import path from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';

import {
  createFakeCodexPluginManagerFixture,
  createInstalledPackageCarrierFixture,
  repoRoot,
} from './cli/helpers.ts';
import { createTestTlsServerFixture } from './cli/helpers-parts/tls-fixture.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../src/kernel/family-workspace-root.ts';

const configuredScholarPackageRoot = process.env.OPL_SCHOLAR_SKILLS_E2E_ROOT?.trim() || null;
const familyScholarPackageRoot = path.join(resolveFamilyWorkspaceRootFromRepoRoot(repoRoot), 'mas-scholar-skills');
const scholarPackageRoot = configuredScholarPackageRoot
  ?? (fs.existsSync(path.join(familyScholarPackageRoot, 'opl-package.json')) ? familyScholarPackageRoot : null);
if (configuredScholarPackageRoot && !fs.existsSync(path.join(configuredScholarPackageRoot, 'opl-package.json'))) {
  throw new Error(`Configured ScholarSkills E2E root is missing its owner manifest: ${configuredScholarPackageRoot}`);
}
const packageFixture = scholarPackageRoot ? createInstalledPackageCarrierFixture(scholarPackageRoot) : null;
const codexFixture = packageFixture
  ? createFakeCodexPluginManagerFixture(path.join(packageFixture.fixtureRoot, 'codex-plugin-manager'))
  : null;
if (packageFixture) {
  test.after(() => fs.rmSync(packageFixture.fixtureRoot, { recursive: true, force: true }));
}
const packageBackedTest = packageFixture ? test : test.skip;

const testTlsFixture = createTestTlsServerFixture();
test.after(() => testTlsFixture.close());

async function startFakeBiomedicalProviderServer(options: { pubmedSearch429Responses?: number } = {}) {
  const requests: string[] = [];
  const requestRecords: Array<{ request: string; startedAt: number; status: number }> = [];
  let remainingPubmedSearch429Responses = options.pubmedSearch429Responses ?? 0;
  const server = createServer(testTlsFixture.options, (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const requestPath = `${url.pathname}?${url.searchParams.toString()}`;
    requests.push(requestPath);
    const requestRecord = { request: requestPath, startedAt: Date.now(), status: 0 };
    requestRecords.push(requestRecord);

    if (url.pathname.endsWith('/pubmed/esearch.fcgi')) {
      if (remainingPubmedSearch429Responses > 0) {
        remainingPubmedSearch429Responses -= 1;
        requestRecord.status = 429;
        response.statusCode = 429;
        response.setHeader('retry-after', '1');
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: 'rate_limited' }));
        return;
      }
      requestRecord.status = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        esearchresult: { count: '1', idlist: ['20332509'] },
      }));
      return;
    }
    if (url.pathname.endsWith('/pubmed/esummary.fcgi')) {
      requestRecord.status = 200;
      response.setHeader('content-type', 'application/json');
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
      requestRecord.status = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        hitCount: 1,
        resultList: {
          result: [{
            id: '20332509',
            source: 'MED',
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
    if (url.pathname.endsWith('/pmc/PMC2844940/fullTextXML')) {
      requestRecord.status = 200;
      response.setHeader('content-type', 'application/xml');
      response.end('<article><front><article-meta /></front></article>');
      return;
    }

    requestRecord.status = 404;
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake biomedical provider server did not bind.');
  const baseUrl = `https://127.0.0.1:${address.port}`;
  return {
    pubmedBaseUrl: `${baseUrl}/pubmed`,
    europePmcBaseUrl: `${baseUrl}/pmc`,
    requests,
    requestRecords,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function structuredContent(result: unknown) {
  assert.equal(typeof result, 'object');
  assert.notEqual(result, null);
  const payload = (result as { structuredContent?: unknown }).structuredContent;
  assert.equal(typeof payload, 'object');
  assert.notEqual(payload, null);
  return payload as Record<string, any>;
}

packageBackedTest('opl-connect stdio MCP exposes progressive discovery and executes PubMed tools', async () => {
  const fakeServer = await startFakeBiomedicalProviderServer({ pubmedSearch429Responses: 1 });
  const transport = new StdioClientTransport({
    command: path.join(repoRoot, 'bin', 'opl'),
    args: ['connect', 'mcp-stdio'],
    cwd: repoRoot,
    env: {
      ...getDefaultEnvironment(),
      CODEX_HOME: packageFixture!.codexHome,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      OPL_CODEX_PLUGIN_BIN: codexFixture!.codexPath,
      OPL_STATE_DIR: packageFixture!.stateRoot,
      OPL_CONNECT_PUBMED_EUTILS_BASE: fakeServer.pubmedBaseUrl,
      OPL_CONNECT_EUROPE_PMC_API_BASE: fakeServer.europePmcBaseUrl,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'opl-connect-test-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, 'opl-connect');

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), [
      'opl_connect_search_tools',
      'opl_connect_describe_tool',
      'opl_connect_execute_tool',
    ]);
    assert.equal(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true), true);

    const searched = structuredContent(await client.callTool({
      name: 'opl_connect_search_tools',
      arguments: { query: 'scientific', toolset: 'scientific' },
    }));
    assert.deepEqual(searched.tools.map((tool: { tool_id: string }) => tool.tool_id), ['scientific_search']);
    assert.equal(searched.authority_boundary.can_write_domain_truth, false);

    const described = structuredContent(await client.callTool({
      name: 'opl_connect_describe_tool',
      arguments: { tool_id: 'scientific_search' },
    }));
    assert.deepEqual(described.input_schema.properties.provider, { type: 'string', minLength: 1 });

    const searchResult = structuredContent(await client.callTool({
      name: 'opl_connect_execute_tool',
      arguments: {
        tool_id: 'scientific_search',
        arguments: { provider: 'pubmed', query: 'CONSORT randomized trial', limit: 1 },
      },
    }));
    assert.equal(searchResult.error, undefined, JSON.stringify(searchResult));
    assert.deepEqual(searchResult.opl_connect_scientific.result_refs, ['pubmed:20332509']);
    assert.equal(searchResult.opl_connect_scientific.normalized_results[0].doi, '10.1136/bmj.c332');
    const retriedPubmedSearches = fakeServer.requestRecords.filter((entry) => {
      const requestUrl = new URL(entry.request, fakeServer.pubmedBaseUrl);
      return requestUrl.pathname.endsWith('/pubmed/esearch.fcgi')
        && requestUrl.searchParams.get('term') === 'CONSORT randomized trial';
    });
    assert.equal(retriedPubmedSearches.length, 2);
    assert.deepEqual(retriedPubmedSearches.map((entry) => entry.status), [429, 200]);
    assert.ok(retriedPubmedSearches[1].startedAt - retriedPubmedSearches[0].startedAt >= 900);

    const parallelSearchResults = await Promise.all([
      client.callTool({
        name: 'opl_connect_execute_tool',
        arguments: {
          tool_id: 'scientific_search',
          arguments: { provider: 'pubmed', query: 'PubMed concurrency one', limit: 1 },
        },
      }),
      client.callTool({
        name: 'opl_connect_execute_tool',
        arguments: {
          tool_id: 'scientific_search',
          arguments: { provider: 'pubmed', query: 'PubMed concurrency two', limit: 1 },
        },
      }),
    ]);
    for (const result of parallelSearchResults) {
      assert.equal(structuredContent(result).error, undefined, JSON.stringify(result));
    }
    const pubmedRequestRecords = fakeServer.requestRecords.filter((entry) => (
      new URL(entry.request, fakeServer.pubmedBaseUrl).pathname.startsWith('/pubmed/')
    ));
    for (let index = 1; index < pubmedRequestRecords.length; index += 1) {
      assert.ok(
        pubmedRequestRecords[index].startedAt - pubmedRequestRecords[index - 1].startedAt >= 350,
        `PubMed request gap was shorter than the configured rate limit: ${JSON.stringify(pubmedRequestRecords)}`,
      );
    }

    const verifyResult = structuredContent(await client.callTool({
      name: 'opl_connect_execute_tool',
      arguments: {
        tool_id: 'references_verify',
        arguments: {
          references: [{ id: 'consort', pmid: '20332509' }],
          providers: ['pubmed', 'pmc'],
          max_retries: 0,
        },
      },
    }));
    assert.equal(verifyResult.opl_connect_reference_verification.request.reference_source_kind, 'inline_references');
    assert.deepEqual(
      verifyResult.opl_connect_reference_verification.provider_receipts.map(
        (receipt: { provider_id: string }) => receipt.provider_id,
      ),
      ['pubmed', 'pmc'],
    );

    const invalidResult = await client.callTool({
      name: 'opl_connect_execute_tool',
      arguments: {
        tool_id: 'references_verify',
        arguments: { references: [{}], providers: ['pubmed'] },
      },
    });
    assert.equal(invalidResult.isError, true);
    assert.equal(structuredContent(invalidResult).error.code, 'cli_usage_error');

    const emptyProviderResult = await client.callTool({
      name: 'opl_connect_execute_tool',
      arguments: {
        tool_id: 'references_verify',
        arguments: {
          references: [{ id: 'consort', pmid: '20332509' }],
          providers: [''],
        },
      },
    });
    assert.equal(emptyProviderResult.isError, true);
    assert.equal(structuredContent(emptyProviderResult).error.code, 'cli_usage_error');
    assert.match(structuredContent(emptyProviderResult).error.message, /non-empty provider string/);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/pubmed/esearch.fcgi?')), true);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/pmc/search?')), true);
  } finally {
    await client.close().catch(() => undefined);
    await fakeServer.close();
  }
});

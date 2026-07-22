import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';

import { repoRoot } from './cli/helpers.ts';

async function startFakeBiomedicalProviderServer() {
  const requests: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}?${url.searchParams.toString()}`);

    if (url.pathname.endsWith('/pubmed/esearch.fcgi')) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        esearchresult: { count: '1', idlist: ['20332509'] },
      }));
      return;
    }
    if (url.pathname.endsWith('/pubmed/esummary.fcgi')) {
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
      response.setHeader('content-type', 'application/xml');
      response.end('<article><front><article-meta /></front></article>');
      return;
    }

    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake biomedical provider server did not bind.');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    pubmedBaseUrl: `${baseUrl}/pubmed`,
    europePmcBaseUrl: `${baseUrl}/pmc`,
    requests,
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

test('opl-connect stdio MCP exposes progressive discovery and executes PubMed tools', async () => {
  const fakeServer = await startFakeBiomedicalProviderServer();
  const transport = new StdioClientTransport({
    command: path.join(repoRoot, 'bin', 'opl'),
    args: ['connect', 'mcp-stdio'],
    cwd: repoRoot,
    env: {
      ...getDefaultEnvironment(),
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
      arguments: { query: 'PubMed', toolset: 'scientific' },
    }));
    assert.deepEqual(searched.tools.map((tool: { tool_id: string }) => tool.tool_id), ['scientific_search']);
    assert.equal(searched.authority_boundary.can_write_domain_truth, false);

    const described = structuredContent(await client.callTool({
      name: 'opl_connect_describe_tool',
      arguments: { tool_id: 'scientific_search' },
    }));
    assert.deepEqual(described.input_schema.properties.provider.enum, ['crossref', 'openalex', 'pubmed', 'pmc']);

    const searchResult = structuredContent(await client.callTool({
      name: 'opl_connect_execute_tool',
      arguments: {
        tool_id: 'scientific_search',
        arguments: { provider: 'pubmed', query: 'CONSORT randomized trial', limit: 1 },
      },
    }));
    assert.deepEqual(searchResult.opl_connect_scientific.result_refs, ['pubmed:20332509']);
    assert.equal(searchResult.opl_connect_scientific.normalized_results[0].doi, '10.1136/bmj.c332');

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

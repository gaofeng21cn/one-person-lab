import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { assert, runCliAsync, runCliFailure, test } from '../helpers.ts';
import {
  buildScientificConnectorProviderRegistryReadback,
  scientificConnectorProviderIds,
} from '../../../../src/modules/connect/opl-connect-scientific.ts';

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
      journal: string | null;
      publication_year: string | null;
      authors: string[];
    }>;
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

test('scientific connector providers are explicit adapters with no core default', () => {
  const registry = buildScientificConnectorProviderRegistryReadback();
  assert.equal(registry.surface_kind, 'opl_scientific_connector_provider_registry');
  assert.equal(registry.default_provider_id, null);
  assert.deepEqual(scientificConnectorProviderIds(), ['crossref', 'openalex']);
  assert.equal(registry.providers.every((provider) => provider.adapter_role === 'optional_provider_adapter'), true);
  assert.equal(registry.authority_boundary.can_write_domain_truth, false);
});

async function startFakeScientificServer() {
  const requests: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
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
              issued: { 'date-parts': [[2025, 4, 1]] },
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

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fake scientific connector server did not bind a TCP address.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    crossrefBaseUrl: `${baseUrl}/crossref`,
    openalexBaseUrl: `${baseUrl}/openalex`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('connect scientific search returns normalized Crossref refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'crossref', '--query', 'clinical model', '--limit', '1'],
      { OPL_CONNECT_CROSSREF_API_BASE: fakeServer.crossrefBaseUrl },
    ) as ScientificSearchOutput;
    const scientific = output.opl_connect_scientific;

    assert.equal(scientific.provider_id, 'crossref');
    assert.deepEqual(scientific.result_refs, ['crossref:10.2000/crossref-example']);
    assert.equal(scientific.normalized_results[0].journal, 'Metadata Journal');
    assert.equal(scientific.normalized_results[0].publication_year, '2025');
    assert.deepEqual(scientific.normalized_results[0].authors, ['Alex Rivera']);
    assert.equal(fakeServer.requests.some((entry) => entry.includes('/crossref/works?')), true);
  } finally {
    await fakeServer.close();
  }
});

test('connect scientific search returns normalized OpenAlex refs', async () => {
  const fakeServer = await startFakeScientificServer();
  try {
    const output = await runCliAsync(
      ['connect', 'scientific', 'search', '--provider', 'openalex', '--query', 'citation graph', '--limit', '1'],
      { OPL_CONNECT_OPENALEX_API_BASE: fakeServer.openalexBaseUrl },
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
  const missingProvider = runCliFailure(['connect', 'scientific', 'search', '--query', 'clinical AI']);
  assert.equal(missingProvider.status, 2);
  assert.equal(missingProvider.payload.error.code, 'cli_usage_error');
  assert.match(missingProvider.payload.error.message, /requires --provider/);

  const missingQuery = runCliFailure(['connect', 'scientific', 'search', '--provider', 'crossref']);
  assert.equal(missingQuery.status, 2);
  assert.equal(missingQuery.payload.error.code, 'cli_usage_error');
  assert.match(missingQuery.payload.error.message, /requires --query/);

  const retiredProvider = runCliFailure([
    'connect',
    'scientific',
    'search',
    '--provider',
    'pubmed',
    '--query',
    'clinical AI',
  ]);
  assert.equal(retiredProvider.status, 2);
  assert.equal(retiredProvider.payload.error.code, 'cli_usage_error');

  const compatibility = runCliFailure(['connect', 'pubmed', 'search', '--query', 'clinical AI']);
  assert.equal(compatibility.status, 2);
  assert.equal(compatibility.payload.error.code, 'unknown_command');

  const retiredVerifier = runCliFailure([
    'connect',
    'references',
    'verify',
    '--references-file',
    'unused.json',
    '--providers',
    'pubmed',
  ]);
  assert.equal(retiredVerifier.status, 2);
  assert.equal(retiredVerifier.payload.error.code, 'cli_usage_error');
});

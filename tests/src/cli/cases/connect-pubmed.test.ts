import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { assert, runCliAsync, runCliFailure, test } from '../helpers.ts';

async function startFakePubMedServer() {
  const requests: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}?${url.searchParams.toString()}`);
    response.setHeader('content-type', 'application/json');

    if (url.pathname.endsWith('/esearch.fcgi')) {
      response.end(JSON.stringify({
        esearchresult: {
          count: '2',
          retmax: '2',
          retstart: '0',
          idlist: ['12345', '67890'],
        },
      }));
      return;
    }

    if (url.pathname.endsWith('/esummary.fcgi')) {
      response.end(JSON.stringify({
        result: {
          uids: ['12345', '67890'],
          '12345': {
            uid: '12345',
            title: 'Clinical AI evidence workflows',
            fulljournalname: 'Journal of Medical AI',
            pubdate: '2026 Jun',
            sortpubdate: '2026/06/01 00:00',
            authors: [{ name: 'Jane Doe' }, { name: 'John Smith' }],
            articleids: [
              { idtype: 'pubmed', value: '12345' },
              { idtype: 'doi', value: '10.1000/example-ai' },
            ],
          },
          '67890': {
            uid: '67890',
            title: 'Reproducible literature review systems',
            source: 'Methods Today',
            pubdate: '2025',
            authors: [{ name: 'Alex Chen' }],
            articleids: [{ idtype: 'pubmed', value: '67890' }],
          },
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
    throw new Error('Fake PubMed server did not bind a TCP address.');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/entrez/eutils`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('connect pubmed search returns normalized read-only literature refs', async () => {
  const fakePubMed = await startFakePubMedServer();
  try {
    const output = await runCliAsync(['connect', 'pubmed', 'search', '--query', 'clinical AI evidence', '--limit', '2'], {
      OPL_CONNECT_PUBMED_API_BASE: fakePubMed.baseUrl,
    }) as {
      opl_connect_pubmed: {
        surface_kind: string;
        connector_id: string;
        connector_profile: string;
        profile_role: string;
        canonical_profile_command: string;
        status: string;
        request: { query: string; limit: number };
        normalized_results: Array<{
          source_ref: string;
          pmid: string;
          doi: string | null;
          title: string;
          journal: string | null;
          authors: string[];
          source_urls: { pubmed: string; doi: string | null };
        }>;
        receipt_refs: {
          connector_invocation_ref: string;
          ledger_receipt_candidate_ref: string;
        };
        provider_receipt_candidate_refs: string[];
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
          can_claim_domain_ready: boolean;
          can_claim_production_ready: boolean;
        };
      };
    };

    assert.equal(output.opl_connect_pubmed.surface_kind, 'opl_connect_pubmed_readonly_search');
    assert.equal(output.opl_connect_pubmed.connector_id, 'pubmed');
    assert.equal(output.opl_connect_pubmed.connector_profile, 'scientific');
    assert.equal(
      output.opl_connect_pubmed.profile_role,
      'pubmed_compatibility_entry_for_optional_scientific_connector_profile',
    );
    assert.equal(output.opl_connect_pubmed.canonical_profile_command, 'connect scientific search --provider pubmed');
    assert.equal(output.opl_connect_pubmed.status, 'completed');
    assert.deepEqual(output.opl_connect_pubmed.request, {
      query: 'clinical AI evidence',
      limit: 2,
    });
    assert.equal(output.opl_connect_pubmed.normalized_results.length, 2);
    assert.deepEqual(output.opl_connect_pubmed.normalized_results[0], {
      source_ref: 'pubmed:12345',
      source_kind: 'literature_article',
      source_provider: 'PubMed',
      pmid: '12345',
      doi: '10.1000/example-ai',
      title: 'Clinical AI evidence workflows',
      journal: 'Journal of Medical AI',
      publication_date: '2026 Jun',
      authors: ['Jane Doe', 'John Smith'],
      source_urls: {
        pubmed: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
        doi: 'https://doi.org/10.1000/example-ai',
      },
    });
    assert.equal(
      output.opl_connect_pubmed.receipt_refs.connector_invocation_ref.startsWith('opl://connect/pubmed/search/'),
      true,
    );
    assert.equal(
      output.opl_connect_pubmed.receipt_refs.ledger_receipt_candidate_ref.startsWith('opl://ledger/connect/pubmed/search/'),
      true,
    );
    assert.deepEqual(output.opl_connect_pubmed.provider_receipt_candidate_refs, [
      output.opl_connect_pubmed.receipt_refs.ledger_receipt_candidate_ref,
    ]);
    assert.equal(output.opl_connect_pubmed.provider_receipt_role, 'provider_receipt_candidate_only');
    assert.equal(output.opl_connect_pubmed.ownership_boundary.connector_profile_owner, 'OPL Connect');
    assert.equal(output.opl_connect_pubmed.ownership_boundary.provider_receipt_owner, 'OPL Connect');
    assert.equal(output.opl_connect_pubmed.ownership_boundary.citation_judgment_owner, 'MAS / domain owner');
    assert.equal(output.opl_connect_pubmed.ownership_boundary.connector_receipt_counts_as_citation_truth, false);
    assert.equal(output.opl_connect_pubmed.ownership_boundary.connector_receipt_counts_as_domain_truth, false);
    assert.deepEqual(output.opl_connect_pubmed.authority_boundary, {
      read_only: true,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_publication_readiness: false,
      can_claim_citation_truth: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    });
    assert.equal(fakePubMed.requests.some((entry) => entry.includes('esearch.fcgi')), true);
    assert.equal(fakePubMed.requests.some((entry) => entry.includes('esummary.fcgi')), true);
  } finally {
    await fakePubMed.close();
  }
});

test('connect pubmed search requires a query', () => {
  const failure = runCliFailure(['connect', 'pubmed', 'search', '--limit', '2']);
  assert.equal(failure.status, 2);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --query/);
});

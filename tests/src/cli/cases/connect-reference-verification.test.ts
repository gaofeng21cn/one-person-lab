import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { assert, fs, os, path, runCliAsync, test } from '../helpers.ts';

async function startFakeReferenceProviderServer() {
  const requests: string[] = [];
  let crossrefAttempts = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
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

    if (url.pathname.endsWith('/esearch.fcgi')) {
      response.end(JSON.stringify({
        esearchresult: {
          idlist: ['987654'],
        },
      }));
      return;
    }

    if (url.pathname.endsWith('/esummary.fcgi')) {
      response.end(JSON.stringify({
        result: {
          uids: ['987654'],
          '987654': {
            uid: '987654',
            title: 'Provider receipt cache and retry evidence',
            fulljournalname: 'Journal of Connector Evidence',
            pubdate: '2026',
            articleids: [
              { idtype: 'pubmed', value: '987654' },
              { idtype: 'doi', value: '10.1234/example' },
            ],
          },
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
          pmid: 'https://pubmed.ncbi.nlm.nih.gov/987654',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/semantic/paper/')) {
      response.end(JSON.stringify({
        paperId: 'S2-987654',
        externalIds: {
          DOI: '10.1234/example',
          PubMed: '987654',
        },
        title: 'Provider receipt cache and retry evidence',
        year: 2026,
        publicationVenue: {
          name: 'Journal of Connector Evidence',
        },
      }));
      return;
    }

    if (url.pathname.startsWith('/doi/')) {
      response.setHeader('content-type', 'text/html');
      response.end(`
        <html>
          <head>
            <meta name="citation_title" content="Publisher landing page title" />
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
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('connect references verify returns provider receipts, cache metadata, retries, and no-authority boundary', async () => {
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

    const env = {
      OPL_CONNECT_CROSSREF_API_BASE: `${fakeProviders.baseUrl}/crossref`,
      OPL_CONNECT_PUBMED_API_BASE: `${fakeProviders.baseUrl}/pubmed`,
    };
    const args = [
      'connect',
      'references',
      'verify',
      '--references-file',
      referencesFile,
      '--providers',
      'crossref,pubmed',
      '--cache-root',
      cacheRoot,
      '--max-retries',
      '1',
    ];

    const output = await runCliAsync(args, env) as {
      opl_connect_reference_verification: {
        surface_kind: string;
        status: string;
        request: { providers: string[]; max_retries: number };
        provider_evidence: Array<{
          reference_id: string;
          provider: string;
          provider_id: string;
          lookup_status: string;
          status: string;
          match_basis: string;
          receipt_ref: string;
          matched_identifiers: Record<string, string>;
          metadata: { title?: string; year?: string; journal?: string };
          normalized: { doi: string | null; pmid: string | null; title: string | null };
          cache: { status: string; write_status: string; cache_ref: string | null };
          retry_attempts: Array<{ attempt: number; status: string; http_status: number | null }>;
        }>;
        provider_receipts: Array<{
          reference_id: string;
          provider_id: string;
          status: string;
          receipt_ref: string;
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
        };
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.equal(result.surface_kind, 'opl_connect_reference_verification_readonly');
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.request.providers, ['crossref', 'pubmed']);
    assert.equal(result.request.max_retries, 1);
    assert.equal(result.provider_evidence.length, 2);

    const crossref = result.provider_evidence.find((entry) => entry.provider_id === 'crossref');
    const pubmed = result.provider_evidence.find((entry) => entry.provider_id === 'pubmed');
    assert.ok(crossref);
    assert.ok(pubmed);
    assert.equal(crossref.status, 'matched');
    assert.equal(crossref.provider, 'crossref');
    assert.equal(crossref.lookup_status, 'found');
    assert.equal(crossref.match_basis, 'doi');
    assert.equal(crossref.normalized.doi, '10.1234/example');
    assert.equal(crossref.matched_identifiers.doi, '10.1234/example');
    assert.equal(crossref.metadata.title, 'Provider receipt cache and retry evidence');
    assert.equal(crossref.cache.status, 'miss');
    assert.equal(crossref.cache.write_status, 'written');
    assert.equal(crossref.retry_attempts.length, 2);
    assert.deepEqual(crossref.retry_attempts.map((entry) => entry.status), ['retryable_error', 'success']);
    assert.equal(crossref.receipt_ref.startsWith('opl://connect/references/verify/'), true);
    assert.equal(pubmed.status, 'matched');
    assert.equal(pubmed.provider, 'pubmed');
    assert.equal(pubmed.lookup_status, 'found');
    assert.equal(pubmed.match_basis, 'pmid');
    assert.equal(pubmed.normalized.pmid, '987654');
    assert.equal(pubmed.cache.status, 'miss');
    assert.equal(pubmed.cache.write_status, 'written');
    assert.equal(pubmed.receipt_ref.startsWith('opl://connect/references/verify/'), true);
    assert.equal(result.provider_receipts.length, 2);
    assert.equal(result.provider_receipts.every((entry) => entry.status === 'matched'), true);
    assert.equal(result.provider_receipts.every((entry) => entry.receipt_ref.startsWith('opl://connect/references/verify/')), true);
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

test('connect references verify covers OpenAlex, Semantic Scholar, Crossmark, and publisher receipts', async () => {
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
    ], {
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/openalex`,
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/semantic`,
      OPL_CONNECT_CROSSREF_API_BASE: `${fakeProviders.baseUrl}/crossref`,
      OPL_CONNECT_PUBLISHER_DOI_BASE: `${fakeProviders.baseUrl}/doi`,
    }) as {
      opl_connect_reference_verification: {
        request: { providers: string[] };
        provider_evidence: Array<{
          provider: string;
          provider_id: string;
          lookup_status: string;
          status: string;
          matched_identifiers: Record<string, string>;
          metadata: { title?: string; journal?: string };
          retraction_or_update_flags: Record<string, unknown>;
        }>;
        provider_receipts: Array<{ provider_id: string; status: string }>;
      };
    };

    const result = output.opl_connect_reference_verification;
    assert.deepEqual(result.request.providers, ['openalex', 'semantic-scholar', 'crossmark', 'publisher']);
    assert.deepEqual(result.provider_evidence.map((entry) => [entry.provider, entry.lookup_status]), [
      ['openalex', 'found'],
      ['semantic_scholar', 'found'],
      ['crossmark', 'found'],
      ['publisher', 'found'],
    ]);
    assert.equal(result.provider_evidence[0].matched_identifiers.openalex, 'https://openalex.org/W123');
    assert.equal(result.provider_evidence[1].matched_identifiers.semantic_scholar, 'S2-987654');
    assert.equal(result.provider_evidence[2].retraction_or_update_flags.crossmark_metadata_source, 'crossref_rest_api');
    const publisher = result.provider_evidence[3];
    assert.equal(publisher.matched_identifiers.publisher_landing_url.includes('/doi/'), true);
    assert.equal(publisher.metadata.title, 'Publisher landing page title');
    assert.equal(publisher.retraction_or_update_flags.full_text_body_verified, false);
    assert.equal(result.provider_receipts.every((entry) => entry.status === 'matched'), true);
  } finally {
    await fakeProviders.close();
  }
});

test('connect references verify declares publisher DOI requirement without pretending provider truth', async () => {
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
  ]) as {
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

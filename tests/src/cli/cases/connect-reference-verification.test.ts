import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { runOplConnectReferenceVerification } from '../../../../src/modules/connect/opl-connect-reference-verification.ts';
import { assert, fs, os, path, runCliAsync, test } from '../helpers.ts';

test('reference providers normalize OpenAlex and both Semantic Scholar PMID fields', async () => {
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
    };
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

test('connect references verify separates provider found from strict identifier match and defers conflicts', async () => {
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
    ], {
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/id-only-openalex`,
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/conflict-semantic`,
      OPL_CONNECT_PUBLISHER_DOI_BASE: `${fakeProviders.baseUrl}/conflict-doi`,
    }) as {
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

test('connect references verify defers one failed provider while matched providers keep receipts', async () => {
  const fakeProviders = await startFakeReferenceProviderServer();
  try {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reference-verification-provider-error-'));
    const referencesFile = path.join(fixtureRoot, 'references.json');
    fs.writeFileSync(referencesFile, JSON.stringify([
      {
        id: 'ref-1',
        doi: '10.1234/example',
        pmid: '987654',
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
    ], {
      OPL_CONNECT_SEMANTIC_SCHOLAR_API_BASE: `${fakeProviders.baseUrl}/semantic`,
      OPL_CONNECT_OPENALEX_API_BASE: `${fakeProviders.baseUrl}/rate-limited-openalex`,
    }) as {
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

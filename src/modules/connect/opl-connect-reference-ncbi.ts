type ReferenceIdentifiers = {
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
};

export type NcbiReferenceMetadata = {
  title?: string;
  year?: string;
  journal?: string;
  authors?: string[];
  abstract?: string;
  article_types?: string[];
};

export type NcbiReferenceRecord = {
  identifiers: ReferenceIdentifiers & Record<string, string | null>;
  metadata: NcbiReferenceMetadata;
  normalized: ReferenceIdentifiers & { title: string | null };
  fullTextAvailable: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDoi(value: string | null) {
  return value
    ?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLowerCase() || null;
}

export function normalizePmcid(value: string | null) {
  const normalized = value?.trim().toUpperCase() || null;
  if (!normalized) return null;
  return normalized.startsWith('PMC') ? normalized : `PMC${normalized}`;
}

function articleIdentifier(entry: Record<string, unknown>, ...types: string[]) {
  const wanted = new Set(types.map((type) => type.toLowerCase()));
  const identifiers = Array.isArray(entry.articleids) ? entry.articleids : [];
  for (const raw of identifiers) {
    const identifier = asRecord(raw);
    const type = asString(identifier.idtype)?.toLowerCase();
    const value = asString(identifier.value);
    if (type && value && wanted.has(type)) return value;
  }
  return null;
}

function yearFromText(value: string | null) {
  return value?.match(/\b\d{4}\b/)?.[0] ?? null;
}

function compactMetadata(metadata: NcbiReferenceMetadata): NcbiReferenceMetadata {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.length > 0
  ));
}

function stringList(value: unknown) {
  return (Array.isArray(value) ? value : [value])
    .map(asString)
    .filter((entry): entry is string => Boolean(entry));
}

export function parsePubmedSummary(payload: unknown, requestedPmid: string): NcbiReferenceRecord | null {
  const result = asRecord(asRecord(payload).result);
  const uids = Array.isArray(result.uids) ? result.uids.map(asString).filter(Boolean) : [];
  const uid = uids.find((entry) => entry === requestedPmid) ?? uids[0] ?? requestedPmid;
  const entry = asRecord(result[uid]);
  const title = asString(entry.title);
  if (Object.keys(entry).length === 0 || !title) return null;
  const doi = normalizeDoi(articleIdentifier(entry, 'doi') ?? asString(entry.elocationid));
  const pmcid = normalizePmcid(articleIdentifier(entry, 'pmc', 'pmcid'));
  const authors = (Array.isArray(entry.authors) ? entry.authors : [])
    .map((author) => asString(asRecord(author).name))
    .filter((author): author is string => Boolean(author));
  return {
    identifiers: {
      doi,
      pmid: uid,
      pmcid,
      pubmed: uid,
    },
    metadata: compactMetadata({
      title,
      year: yearFromText(asString(entry.pubdate)) ?? undefined,
      journal: asString(entry.fulljournalname) ?? asString(entry.source) ?? undefined,
      authors,
      article_types: stringList(entry.pubtype),
    }),
    normalized: { doi, pmid: uid, pmcid, title },
    fullTextAvailable: Boolean(pmcid),
  };
}

export function parseEuropePmcResults(payload: unknown): NcbiReferenceRecord[] {
  const resultList = asRecord(asRecord(payload).resultList);
  const results = Array.isArray(resultList.result) ? resultList.result : [];
  return results.map(asRecord).flatMap((entry) => {
    if (Object.keys(entry).length === 0) return [];
    const source = asString(entry.source)?.toUpperCase() ?? null;
    const providerId = asString(entry.id);
    const doi = normalizeDoi(asString(entry.doi));
    const pmid = asString(entry.pmid)
      ?? (source === 'MED' || (providerId !== null && /^\d+$/.test(providerId)) ? providerId : null);
    const pmcid = normalizePmcid(
      asString(entry.pmcid)
        ?? (source === 'PMC' || providerId?.toUpperCase().startsWith('PMC') ? providerId : null),
    );
    const title = asString(entry.title);
    const authorList = asRecord(entry.authorList);
    const authors = (Array.isArray(authorList.author) ? authorList.author : [])
      .map((author) => asString(asRecord(author).fullName) ?? asString(asRecord(author).collectiveName))
      .filter((author): author is string => Boolean(author));
    const fullTextAvailable = entry.inEPMC === 'Y'
      || entry.isOpenAccess === 'Y'
      || pmcid !== null;
    return [{
      identifiers: {
        doi,
        pmid,
        pmcid,
        europe_pmc: providerId,
      },
      metadata: compactMetadata({
        title: title ?? undefined,
        year: yearFromText(asString(entry.pubYear) ?? asString(entry.firstPublicationDate)) ?? undefined,
        journal: asString(entry.journalTitle) ?? undefined,
        authors,
        abstract: asString(entry.abstractText) ?? undefined,
        article_types: stringList(asRecord(entry.pubTypeList).pubType),
      }),
      normalized: { doi, pmid, pmcid, title },
      fullTextAvailable,
    }];
  });
}

export function parseEuropePmcSearch(payload: unknown): NcbiReferenceRecord | null {
  return parseEuropePmcResults(payload)[0] ?? null;
}

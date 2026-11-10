import { isRecord } from '../../../kernel/contract-validation.ts';

export function githubRepositoryIdentity(sourceRepo: string | null | undefined) {
  try {
    const source = new URL(sourceRepo ?? '');
    if (source.protocol !== 'https:' || source.hostname !== 'github.com'
      || source.username || source.password || source.port || source.search || source.hash) return null;
    const match = /^\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(source.pathname);
    if (!match || ['.', '..'].includes(match[2])) return null;
    return { repository: `${match[1]}/${match[2]}`.toLowerCase(), sourceRepo: source.toString() };
  } catch { return null; }
}

/** The repository channel is an explicit preview source, independent of OCI publication. */
export function githubPreviewSourceIdentity(subject: {
  visibility?: string;
  publication_channel_admission?: string;
  credential_provider?: string | null;
  access_policy_ref?: string | null;
  source_repo?: string | null;
  source_commit?: string | null;
  codex_surface?: Record<string, unknown>;
}) {
  const surface = subject.codex_surface;
  const carrier = isRecord(surface?.configured_codex_plugin_carrier)
    ? surface.configured_codex_plugin_carrier : null;
  if (subject.visibility !== 'authorized_only' || subject.publication_channel_admission !== 'development_only'
    || subject.credential_provider !== 'github_packages' || !carrier || carrier.publication_ref != null) return null;
  const source = githubRepositoryIdentity(subject.source_repo);
  const sourceCommit = typeof surface?.carrier_source_commit === 'string'
    ? surface.carrier_source_commit : subject.source_commit;
  if (!source || !sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)
    || subject.access_policy_ref !== `github-repository:${source.repository}`) return null;
  return { ...source, sourceCommit };
}

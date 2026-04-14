declare module '../../scripts/doc-series-audit-lib.mjs' {
  export interface RepoSpec {
    slug: string;
    displayName: string;
    directoryName: string;
    requiredChecklistPhrases?: string[];
    requiredDocsIndexSnippets?: string[];
    requiredReferenceIndexSnippets?: string[];
    extraRequiredFiles?: string[];
  }

  export interface AuditIssue {
    code: string;
    message: string;
  }

  export interface RepoAuditResult {
    slug: string;
    displayName: string;
    repoPath?: string | null;
    issues: AuditIssue[];
  }

  export interface DocSeriesAudit {
    ok: boolean;
    repoCount: number;
    issueCount: number;
    results: RepoAuditResult[];
  }

  export const CORE_DOCS: string[];
  export const CHECKLIST_SECTION_TITLES: string[];
  export const SERIES_REPO_LABELS: string[];
  export const DEFAULT_REPO_SPECS: RepoSpec[];

  export function auditRepoSeriesSurface(input: {
    spec: RepoSpec;
    repoPath?: string | null;
  }): RepoAuditResult;

  export function auditDocSeries(input?: {
    repoPathsBySlug?: Record<string, string>;
    repoSpecs?: RepoSpec[];
  }): DocSeriesAudit;

  export function formatAuditReport(audit: DocSeriesAudit): string;

  export function parseRepoArgument(rawValue: string): {
    slug: string;
    repoPath: string;
  };

  export function resolveDefaultRepoPathsFromOplRepo(oplRepoRoot: string): Record<string, string>;
}

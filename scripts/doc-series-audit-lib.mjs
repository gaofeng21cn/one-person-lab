import fs from 'node:fs';
import path from 'node:path';

export const CORE_DOCS = [
  'docs/project.md',
  'docs/status.md',
  'docs/architecture.md',
  'docs/invariants.md',
  'docs/decisions.md',
];

export const CHECKLIST_SECTION_TITLES = [
  '## 目标',
  '## 一、默认入口',
  '## 二、核心五件套',
  '## 三、公开层与内部层',
  '## 四、系列一致性检查',
  '## 五、默认验证',
];

export const SERIES_REPO_LABELS = [
  'One Person Lab',
  'Med Auto Science',
  'Med Auto Grant',
  'RedCube AI',
];

const COMMON_CHECKLIST_PHRASES = [
  'README.md',
  'README.zh-CN.md',
  'docs/README.md',
  'docs/README.zh-CN.md',
  ...CORE_DOCS,
  ...SERIES_REPO_LABELS,
  'Hermes-Agent',
  'AGENTS.md',
  '第二真相源',
  'scripts/verify.sh meta',
];

const DISALLOWED_DOCS_INDEX_PATTERNS = [
  {
    code: 'docs-index-governance-source',
    pattern: /Documentation governance rules are maintained in \[`?AGENTS\.md/i,
    message: 'docs/README* must not position AGENTS.md as the only governance source.',
  },
  {
    code: 'docs-index-governance-source',
    pattern: /文档治理规则统一收口在 \[`?AGENTS\.md/,
    message: 'docs/README* must not position AGENTS.md as the only governance source.',
  },
];

export const DEFAULT_REPO_SPECS = [
  {
    slug: 'opl',
    displayName: 'One Person Lab',
    directoryName: 'one-person-lab',
    requiredChecklistPhrases: [],
    requiredDocsIndexSnippets: [
      'series-doc-governance-checklist.md',
      'four-repo-doc-series-sync-summary-2026-04-14.md',
      'four-repo-doc-intake-template.md',
    ],
    requiredReferenceIndexSnippets: [
      'series-doc-governance-checklist.md',
      'four-repo-doc-series-sync-summary-2026-04-14.md',
      'four-repo-doc-intake-template.md',
    ],
    extraRequiredFiles: ['docs/references/four-repo-doc-intake-template.md'],
  },
  {
    slug: 'med-autoscience',
    displayName: 'Med Auto Science',
    directoryName: 'med-autoscience',
    requiredChecklistPhrases: [
      'make test-meta',
      'docs/runtime/**',
      'docs/program/**',
      'docs/capabilities/**',
      'docs/policies/**',
    ],
    requiredDocsIndexSnippets: ['series-doc-governance-checklist.md'],
  },
  {
    slug: 'med-autogrant',
    displayName: 'Med Auto Grant',
    directoryName: 'med-autogrant',
    requiredChecklistPhrases: [
      'make test-meta',
      'docs/specs/**',
      'schemas/v1/',
      'contracts/runtime-program/',
    ],
    requiredDocsIndexSnippets: ['series-doc-governance-checklist.md'],
  },
  {
    slug: 'redcube-ai',
    displayName: 'RedCube AI',
    directoryName: 'redcube-ai',
    requiredChecklistPhrases: [
      'npm run test:meta',
      'docs/program/**',
      'docs/policies/**',
      'typed boundary',
    ],
    requiredDocsIndexSnippets: ['series-doc-governance-checklist.md'],
  },
];

function relative(repoPath, targetPath) {
  return path.relative(repoPath, targetPath).replaceAll(path.sep, '/');
}

function addIssue(issues, code, message) {
  issues.push({ code, message });
}

function readTextIfExists(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return fs.readFileSync(absolutePath, 'utf8');
}

function auditRequiredFiles(spec, repoPath, issues) {
  const requiredFiles = [
    'README.md',
    'README.zh-CN.md',
    'docs/README.md',
    'docs/README.zh-CN.md',
    'docs/references/series-doc-governance-checklist.md',
    ...CORE_DOCS,
    ...(spec.extraRequiredFiles ?? []),
  ];

  for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(repoPath, relativePath))) {
      addIssue(issues, 'missing-file', `Missing required file: ${relativePath}`);
    }
  }
}

function auditChecklist(spec, repoPath, issues) {
  const checklistPath = path.join(repoPath, 'docs/references/series-doc-governance-checklist.md');
  const checklist = readTextIfExists(checklistPath);

  if (checklist === null) {
    return;
  }

  let previousHeadingIndex = -1;

  for (const heading of CHECKLIST_SECTION_TITLES) {
    const headingIndex = checklist.indexOf(heading);

    if (headingIndex === -1) {
      addIssue(
        issues,
        'missing-checklist-heading',
        `Checklist is missing required heading "${heading}" in ${relative(repoPath, checklistPath)}`,
      );
      continue;
    }

    if (headingIndex < previousHeadingIndex) {
      addIssue(
        issues,
        'out-of-order-checklist-heading',
        `Checklist heading "${heading}" appears out of order in ${relative(repoPath, checklistPath)}`,
      );
    }

    previousHeadingIndex = headingIndex;
  }

  for (const snippet of [...COMMON_CHECKLIST_PHRASES, ...(spec.requiredChecklistPhrases ?? [])]) {
    if (!checklist.includes(snippet)) {
      addIssue(
        issues,
        'missing-checklist-phrase',
        `Checklist is missing required snippet "${snippet}" in ${relative(repoPath, checklistPath)}`,
      );
    }
  }
}

function auditDocsIndexes(spec, repoPath, issues) {
  const docsIndexFiles = ['docs/README.md', 'docs/README.zh-CN.md'];

  for (const relativePath of docsIndexFiles) {
    const absolutePath = path.join(repoPath, relativePath);
    const content = readTextIfExists(absolutePath);

    if (content === null) {
      continue;
    }

    for (const coreDoc of CORE_DOCS) {
      const basename = path.basename(coreDoc);
      if (!content.includes(basename)) {
        addIssue(
          issues,
          'missing-docs-index-link',
          `${relativePath} must link ${basename} to keep the core working set explicit.`,
        );
      }
    }

    for (const snippet of spec.requiredDocsIndexSnippets ?? []) {
      if (!content.includes(snippet)) {
        addIssue(
          issues,
          'missing-docs-index-link',
          `${relativePath} must link ${snippet} to keep the series governance surface visible.`,
        );
      }
    }

    for (const { code, pattern, message } of DISALLOWED_DOCS_INDEX_PATTERNS) {
      if (pattern.test(content)) {
        addIssue(issues, code, `${relativePath}: ${message}`);
      }
    }
  }
}

function auditReferenceIndexes(spec, repoPath, issues) {
  const snippets = spec.requiredReferenceIndexSnippets ?? [];
  if (snippets.length === 0) {
    return;
  }

  for (const relativePath of ['docs/references/README.md', 'docs/references/README.zh-CN.md']) {
    const absolutePath = path.join(repoPath, relativePath);
    const content = readTextIfExists(absolutePath);

    if (content === null) {
      addIssue(issues, 'missing-reference-index', `Missing required reference index: ${relativePath}`);
      continue;
    }

    for (const snippet of snippets) {
      if (!content.includes(snippet)) {
        addIssue(
          issues,
          'missing-reference-index-link',
          `${relativePath} must link ${snippet} to keep the central reference intake surface visible.`,
        );
      }
    }
  }
}

export function auditRepoSeriesSurface({ spec, repoPath }) {
  const issues = [];

  if (!repoPath || !fs.existsSync(repoPath)) {
    addIssue(
      issues,
      'missing-repo',
      `Repository path for ${spec.displayName} does not exist: ${repoPath ?? '<unset>'}`,
    );

    return {
      slug: spec.slug,
      displayName: spec.displayName,
      repoPath,
      issues,
    };
  }

  auditRequiredFiles(spec, repoPath, issues);
  auditChecklist(spec, repoPath, issues);
  auditDocsIndexes(spec, repoPath, issues);
  auditReferenceIndexes(spec, repoPath, issues);

  return {
    slug: spec.slug,
    displayName: spec.displayName,
    repoPath,
    issues,
  };
}

export function auditDocSeries({
  repoPathsBySlug,
  repoSpecs = DEFAULT_REPO_SPECS,
} = {}) {
  const results = repoSpecs.map((spec) =>
    auditRepoSeriesSurface({
      spec,
      repoPath: repoPathsBySlug?.[spec.slug],
    }),
  );
  const issueCount = results.reduce((count, result) => count + result.issues.length, 0);

  return {
    ok: issueCount === 0,
    repoCount: results.length,
    issueCount,
    results,
  };
}

export function formatAuditReport(audit) {
  const lines = [];

  lines.push(
    audit.ok
      ? `Series doc audit passed for ${audit.repoCount} repositories.`
      : `Series doc audit found ${audit.issueCount} issue(s) across ${audit.repoCount} repositories.`,
  );

  for (const result of audit.results) {
    lines.push(`- ${result.displayName}: ${result.issues.length === 0 ? 'OK' : `${result.issues.length} issue(s)`}`);
    lines.push(`  path: ${result.repoPath ?? '<unset>'}`);

    for (const issue of result.issues) {
      lines.push(`  [${issue.code}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

export function parseRepoArgument(rawValue) {
  const separatorIndex = rawValue.indexOf('=');

  if (separatorIndex <= 0 || separatorIndex === rawValue.length - 1) {
    throw new Error(`Invalid --repo value "${rawValue}". Expected "<slug>=<path>".`);
  }

  const slug = rawValue.slice(0, separatorIndex);
  const repoPath = path.resolve(rawValue.slice(separatorIndex + 1));

  if (!DEFAULT_REPO_SPECS.some((spec) => spec.slug === slug)) {
    throw new Error(`Unknown repo slug "${slug}". Expected one of: ${DEFAULT_REPO_SPECS.map((spec) => spec.slug).join(', ')}`);
  }

  return { slug, repoPath };
}

export function resolveDefaultRepoPathsFromOplRepo(oplRepoRoot) {
  const resolvedOplRepoRoot = path.resolve(oplRepoRoot);
  const parentDir = path.dirname(resolvedOplRepoRoot);
  const inWorktree = path.basename(parentDir) === '.worktrees';
  const primaryOplRoot = inWorktree ? path.dirname(parentDir) : resolvedOplRepoRoot;

  if (path.basename(primaryOplRoot) !== 'one-person-lab') {
    throw new Error(
      `Cannot infer sibling repository paths from ${resolvedOplRepoRoot}. Run this script from the OPL repo or pass explicit --repo arguments.`,
    );
  }

  const workspaceRoot = path.dirname(primaryOplRoot);
  const worktreeName = inWorktree ? path.basename(resolvedOplRepoRoot) : null;
  const repoPathsBySlug = { opl: resolvedOplRepoRoot };

  for (const spec of DEFAULT_REPO_SPECS) {
    if (spec.slug === 'opl') {
      continue;
    }

    const defaultRepoRoot = path.join(workspaceRoot, spec.directoryName);
    const worktreeCandidate = worktreeName
      ? path.join(defaultRepoRoot, '.worktrees', worktreeName)
      : null;

    repoPathsBySlug[spec.slug] =
      worktreeCandidate !== null && fs.existsSync(worktreeCandidate)
        ? worktreeCandidate
        : defaultRepoRoot;
  }

  return repoPathsBySlug;
}

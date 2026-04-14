import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CHECKLIST_SECTION_TITLES,
  CORE_DOCS,
  DEFAULT_REPO_SPECS,
  SERIES_REPO_LABELS,
  auditDocSeries,
  formatAuditReport,
} from '../../scripts/doc-series-audit-lib.mjs';

function writeFile(baseDir: string, relativePath: string, content: string) {
  const absolutePath = path.join(baseDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function buildChecklist(requiredSnippets: string[]) {
  return `${CHECKLIST_SECTION_TITLES.join('\n\n')}

${[...new Set([...SERIES_REPO_LABELS, ...requiredSnippets])].join('\n')}\n`;
}

function createRepoFixture(baseDir: string, spec: (typeof DEFAULT_REPO_SPECS)[number]) {
  writeFile(baseDir, 'README.md', '# README\n');
  writeFile(baseDir, 'README.zh-CN.md', '# README\n');

  const docsIndexSnippets = [
    ...CORE_DOCS.map((relativePath) => path.basename(relativePath)),
    ...(spec.requiredDocsIndexSnippets ?? []),
  ].join('\n');

  writeFile(baseDir, 'docs/README.md', docsIndexSnippets);
  writeFile(baseDir, 'docs/README.zh-CN.md', docsIndexSnippets);

  for (const relativePath of CORE_DOCS) {
    writeFile(baseDir, relativePath, `# ${path.basename(relativePath)}\n`);
  }

  writeFile(
    baseDir,
    'docs/references/series-doc-governance-checklist.md',
    buildChecklist([
      'README.md',
      'README.zh-CN.md',
      'docs/README.md',
      'docs/README.zh-CN.md',
      ...CORE_DOCS,
      'Hermes-Agent',
      'AGENTS.md',
      '第二真相源',
      'scripts/verify.sh meta',
      ...(spec.requiredChecklistPhrases ?? []),
    ]),
  );

  if (spec.requiredReferenceIndexSnippets?.length) {
    const refsContent = spec.requiredReferenceIndexSnippets.join('\n');
    writeFile(baseDir, 'docs/references/README.md', refsContent);
    writeFile(baseDir, 'docs/references/README.zh-CN.md', refsContent);
  }

  for (const relativePath of spec.extraRequiredFiles ?? []) {
    writeFile(baseDir, relativePath, '# extra\n');
  }
}

test('auditDocSeries accepts a fully aligned four-repo fixture', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-doc-series-audit-'));

  try {
    const repoPathsBySlug: Record<string, string> = {};

    for (const spec of DEFAULT_REPO_SPECS) {
      const repoPath = path.join(tempRoot, spec.slug);
      repoPathsBySlug[spec.slug] = repoPath;
      createRepoFixture(repoPath, spec);
    }

    const audit = auditDocSeries({ repoPathsBySlug });

    assert.equal(audit.ok, true);
    assert.equal(audit.issueCount, 0);
    assert.match(formatAuditReport(audit), /Series doc audit passed/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('auditDocSeries reports docs indexes that still position AGENTS.md as the only governance source', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-doc-series-audit-'));

  try {
    const repoPathsBySlug: Record<string, string> = {};

    for (const spec of DEFAULT_REPO_SPECS) {
      const repoPath = path.join(tempRoot, spec.slug);
      repoPathsBySlug[spec.slug] = repoPath;
      createRepoFixture(repoPath, spec);
    }

    writeFile(
      repoPathsBySlug['med-autoscience'],
      'docs/README.md',
      'Documentation governance rules are maintained in [`AGENTS.md`](../AGENTS.md).\n',
    );

    const audit = auditDocSeries({ repoPathsBySlug });
    const medAutoScience = audit.results.find((result) => result.slug === 'med-autoscience');

    assert.equal(audit.ok, false);
    assert.ok(medAutoScience);
    assert.ok(
      medAutoScience!.issues.some((issue) => issue.code === 'docs-index-governance-source'),
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

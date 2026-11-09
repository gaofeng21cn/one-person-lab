import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { assert, test } from './cli/helpers.ts';
import {
  buildOkfContextBundleFromDomainPack,
  buildOkfContextBundleFromDomainRepo,
  validateOkfContextBundle,
  writeOkfContextBundleProjection,
} from '../../src/authority/packages/okf-context-bundle.ts';

type JsonRecord = Record<string, unknown>;

const testDir = path.dirname(fileURLToPath(import.meta.url));
const okfFixtureDir = path.resolve(testDir, '..', 'fixtures', 'okf');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(okfFixtureDir, relativePath), 'utf8')) as JsonRecord;
}

test('BookForge domain pack projects to a valid body-free OKF context bundle', () => {
  const packCompilerInput = readJson('bookforge-context-bundle/pack_compiler_input.json');
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'opl-okf-bookforge-'));
  try {
    const projection = buildOkfContextBundleFromDomainPack(packCompilerInput, {
      bundleId: 'okf:fixture:opl-bookforge',
      sourceRootRef: 'repo:opl-bookforge',
    });
    const write = writeOkfContextBundleProjection(projection, outputRoot);
    const validation = validateOkfContextBundle({ bundlePath: outputRoot });

    assert.equal(projection.surface_kind, 'opl_okf_context_bundle_projection');
    assert.equal(projection.bundle_id, 'okf:fixture:opl-bookforge');
    assert.equal(projection.authority_boundary.can_write_domain_truth, false);
    assert.equal(projection.authority_boundary.can_write_memory_body, false);
    assert.equal(projection.authority_boundary.can_schedule_runtime, false);
    assert.equal(validation.status, 'valid');
    assert.equal(validation.warnings.length, 0);
    assert.equal(write.written_files.length, 30);

    const conceptFiles = validation.files.filter((file) => file.role === 'concept');
    const requiredPaths = packCompilerInput.required_domain_pack_paths as string[];
    assert.equal(conceptFiles.length, requiredPaths.length);
    assert.ok(conceptFiles.some((file) => file.path === 'opl-bookforge/stage/storyline-architecture.md'));

    const storylineStage = fs.readFileSync(
      path.join(outputRoot, 'opl-bookforge/stage/storyline-architecture.md'),
      'utf8',
    );
    assert.match(storylineStage, /repo:opl-bookforge:agent\/stages\/storyline-architecture.md/);
    assert.match(storylineStage, /\[\[opl-bookforge\/prompt\/storyline-architecture]]/);
    assert.match(storylineStage, /This concept intentionally carries no prompt, skill, knowledge, quality gate, artifact, or memory body/);
    assert.equal(storylineStage.includes('Goal: turn a proposed book'), false);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

const domainRepoFixtures = [
  {
    fixtureDir: 'mas-domain-repo',
    domainId: 'med-autoscience',
    sourceRootRef: 'repo:med-autoscience',
  },
  {
    fixtureDir: 'mag-domain-repo',
    domainId: 'med-autogrant',
    sourceRootRef: 'repo:med-autogrant',
  },
  {
    fixtureDir: 'rca-domain-repo',
    domainId: 'redcube_ai',
    sourceRootRef: 'repo:redcube-ai',
  },
  {
    fixtureDir: 'oma-domain-repo',
    domainId: 'opl-meta-agent',
    sourceRootRef: 'repo:opl-meta-agent',
  },
  {
    fixtureDir: 'bookforge-domain-repo',
    domainId: 'opl-bookforge',
    sourceRootRef: 'repo:opl-bookforge',
  },
] as const;

function conceptPathForDomainPackRef(domainId: string, resourcePath: string) {
  const normalized = resourcePath.replaceAll('\\', '/');
  const slug = path.posix.basename(normalized).replace(/\.md$/i, '');
  if (normalized.includes('/prompts/')) {
    return `${domainId}/prompt/${slug}.md`;
  }
  if (normalized.includes('/stages/')) {
    return `${domainId}/stage/${slug}.md`;
  }
  if (normalized.includes('/skills/')) {
    return `${domainId}/skill/${slug}.md`;
  }
  if (normalized.includes('/tools/')) {
    return `${domainId}/tool_affordance/${slug}.md`;
  }
  if (normalized.includes('/knowledge/')) {
    return `${domainId}/knowledge/${slug}.md`;
  }
  if (normalized.includes('/quality_gates/')) {
    return `${domainId}/quality_gate/${slug}.md`;
  }
  return `${domainId}/pack_ref/${slug}.md`;
}

for (const fixture of domainRepoFixtures) {
  test(`${fixture.domainId} domain pack fixture projects to a valid body-free OKF bundle`, () => {
    const packCompilerInput = readJson(`${fixture.fixtureDir}/pack_compiler_input.json`);
    const outputRoot = mkdtempSync(path.join(tmpdir(), `opl-okf-${fixture.fixtureDir}-`));
    try {
      const projection = buildOkfContextBundleFromDomainPack(packCompilerInput, {
        bundleId: `okf:fixture:${fixture.domainId}`,
        sourceRootRef: fixture.sourceRootRef,
      });
      const write = writeOkfContextBundleProjection(projection, outputRoot);
      const validation = validateOkfContextBundle({ bundlePath: outputRoot });
      const requiredPaths = packCompilerInput.required_domain_pack_paths as string[];

      assert.equal(projection.surface_kind, 'opl_okf_context_bundle_projection');
      assert.equal(projection.bundle_id, `okf:fixture:${fixture.domainId}`);
      assert.equal(projection.authority_boundary.can_write_domain_truth, false);
      assert.equal(projection.authority_boundary.can_write_memory_body, false);
      assert.equal(projection.authority_boundary.can_schedule_runtime, false);
      assert.equal(validation.status, 'valid');
      assert.equal(validation.warnings.length, 0);
      assert.equal(write.written_files.length, requiredPaths.length + 2);

      const conceptFiles = validation.files.filter((file) => file.role === 'concept');
      assert.equal(conceptFiles.length, requiredPaths.length);
      const firstPackRefPath = conceptPathForDomainPackRef(fixture.domainId, requiredPaths[0] ?? '');
      assert.ok(
        conceptFiles.some((file) => file.path === firstPackRefPath),
        `${fixture.domainId} OKF bundle should include ${firstPackRefPath}`,
      );

      const firstConcept = fs.readFileSync(path.join(outputRoot, firstPackRefPath), 'utf8');
      assert.match(firstConcept, new RegExp(`${fixture.sourceRootRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`));
      assert.match(firstConcept, /This concept intentionally carries no prompt, skill, knowledge, quality gate, artifact, or memory body/);
      assert.equal(firstConcept.includes('memory_body:'), false);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });
}

test('durable catalogs project body-free OKF knowledge references', () => {
  for (const fixture of domainRepoFixtures) {
    const result = buildOkfContextBundleFromDomainRepo({
      repoRoot: path.join(okfFixtureDir, fixture.fixtureDir),
      packPath: 'pack_compiler_input.json',
    });
    assert.equal(result.knowledge_catalog_status, 'loaded');
    assert.equal(result.memory_locator_count, 1);
    const file = Object.values(result.projection.files).find((entry) => entry.frontmatter.type === 'memory_locator');
    assert.ok(file);
    assert.deepEqual(file.frontmatter.scope, { kind: 'product', id: fixture.domainId });
    assert.equal(file.frontmatter.content_kind, 'mechanism');
    assert.equal('layer' in file.frontmatter, false);
    assert.equal('content' in file.frontmatter, false);
    assert.equal('memory_body' in file.frontmatter, false);
    assert.equal(file.body.trim(), '# Method\n\nKnowledge body: agent/knowledge/method.md');
    assert.equal(result.authority_boundary.can_write_memory_body, false);
  }
});

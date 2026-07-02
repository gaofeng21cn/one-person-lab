import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, test } from './cli/helpers.ts';
import {
  buildOkfContextBundleFromDomainPack,
  buildOkfMemoryLocatorConcept,
  validateOkfContextBundle,
  writeOkfContextBundleProjection,
} from '../../src/modules/pack/okf-context-bundle.ts';

type JsonRecord = Record<string, unknown>;

const testDir = path.dirname(fileURLToPath(import.meta.url));
const okfFixtureDir = path.resolve(testDir, '..', 'fixtures', 'okf');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(okfFixtureDir, relativePath), 'utf8')) as JsonRecord;
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

test('domain memory descriptor fixtures map to body-free OKF locator concepts', () => {
  const concepts = domainRepoFixtures.map((fixture) => (
    buildOkfMemoryLocatorConcept(readJson(`${fixture.fixtureDir}/memory_descriptor.json`))
  ));

  assert.deepEqual(
    concepts.map((concept) => concept.frontmatter?.domain_id),
    domainRepoFixtures.map((fixture) => fixture.domainId),
  );
  for (const concept of concepts) {
    assert.equal(concept.type, 'memory_locator');
    assert.equal(concept.frontmatter?.resource_body_mode, 'body_free_locator');
    const authority = concept.frontmatter?.authority_boundary as JsonRecord;
    assert.equal(authority.domain_owns_body, true);
    assert.equal(authority.opl_can_write_memory_body, false);
    assert.equal(authority.opl_can_write_domain_truth, false);
    assert.equal(authority.opl_can_accept_or_reject_writeback, false);
    assert.equal('memory_body' in concept, false);
    assert.equal('content' in concept, false);
  }
});

test('family memory descriptors map to OKF locator concepts without memory body authority', () => {
  const fixture = readJson('memory-locators.json');
  const descriptors = fixture.descriptors as JsonRecord[];
  const concepts = descriptors.map((descriptor) => buildOkfMemoryLocatorConcept(descriptor));

  assert.deepEqual(
    concepts.map((concept) => concept.frontmatter?.domain_id),
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent'],
  );

  for (const concept of concepts) {
    assert.equal(concept.type, 'memory_locator');
    assert.equal(concept.frontmatter?.resource_body_mode, 'body_free_locator');
    const authority = concept.frontmatter?.authority_boundary as JsonRecord;
    assert.equal(authority.domain_owns_body, true);
    assert.equal(authority.memory_body_authority, 'domain_owns_body');
    assert.equal(authority.opl_can_write_memory_body, false);
    assert.equal(authority.opl_can_write_domain_truth, false);
    assert.equal(authority.opl_can_accept_or_reject_writeback, false);
    assert.equal('memory_body' in concept, false);
    assert.equal('content' in concept, false);
  }

  const mas = concepts.find((concept) => concept.frontmatter?.domain_id === 'med-autoscience');
  assert.ok(mas);
  assert.equal(mas.id, 'med-autoscience/memory_locator/mas_publication_route_memory');
  assert.equal(mas.resource, 'docs/policies/study-workflow/publication_route_memory_policy.md');
});

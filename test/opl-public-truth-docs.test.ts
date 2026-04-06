import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): unknown {
  return JSON.parse(read(relativePath));
}

test('public truth docs use execution visibility wording instead of runtime monitoring', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const sharedFoundation = read('docs/shared-foundation.md');
  const sharedFoundationZh = read('docs/shared-foundation.zh-CN.md');

  assert.match(readme, /execution visibility/i);
  assert.doesNotMatch(readme, /runtime monitoring/i);
  assert.match(readmeZh, /执行可见性/);
  assert.doesNotMatch(readmeZh, /运行监控/);

  assert.match(sharedFoundation, /execution visibility/i);
  assert.doesNotMatch(sharedFoundation, /runtime monitoring/i);
  assert.match(sharedFoundationZh, /执行可见性/);
  assert.doesNotMatch(sharedFoundationZh, /运行监控/);
});

test('grant scaffold stays public and non-admitting across tracked public docs', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');

  assert.match(readme, /Grant Foundry -> Med Auto Grant/);
  assert.match(readme, /public scaffold/i);
  assert.match(readme, /not yet an admitted `OPL` domain gateway and harness/i);

  assert.match(readmeZh, /Grant Foundry -> Med Auto Grant/);
  assert.match(readmeZh, /公开 scaffold/);
  assert.match(readmeZh, /还不是已经 admitted 的 `OPL` domain gateway 与 harness/);

  assert.match(taskMap, /not yet an admitted domain/i);
  assert.match(taskMap, /not yet a `G2` discovery target/i);
  assert.match(taskMap, /not yet a `G3` routed-action target/i);
  assert.match(taskMap, /without building a handoff payload/i);

  assert.match(taskMapZh, /还不是正式收录 domain/);
  assert.match(taskMapZh, /还不是 `G2` discovery target/);
  assert.match(taskMapZh, /还不是 `G3` routed-action target/);
  assert.match(taskMapZh, /不会构建 handoff payload/);

  assert.match(roadmap, /Grant Ops`, `Thesis Ops`, and `Review Ops` remain under definition/i);
  assert.match(
    roadmap,
    /does \*\*not\*\* make `Grant Ops` a `G2` discovery target or a `G3` routed-action target/i,
  );

  assert.match(roadmapZh, /`Grant Ops`、`Thesis Ops`、`Review Ops` 仍处于定义阶段/);
  assert.match(
    roadmapZh,
    /不代表 `Grant Ops` 已经变成 `G2` discovery target 或 `G3` routed-action target/,
  );
});

test('tracked admission guards still require explicit execution-model evidence', () => {
  const onboardingContract = read('docs/opl-domain-onboarding-contract.md');
  const candidateBacklogJson = JSON.stringify(
    readJson('contracts/opl-gateway/candidate-domain-backlog.json'),
  );

  assert.match(onboardingContract, /stable agent runtime surface/i);
  assert.match(onboardingContract, /share one base|shared-base/i);
  assert.match(onboardingContract, /fixed-code-first/i);

  assert.match(candidateBacklogJson, /stable agent runtime surface for the future Grant Ops domain/i);
  assert.match(candidateBacklogJson, /promote_to_g2_without_domain_gateway/i);
  assert.match(candidateBacklogJson, /promote_to_g3_without_explicit_route_evidence/i);
});

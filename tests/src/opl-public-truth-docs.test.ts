import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

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

test('grant scaffold stays public and non-admitting across tracked docs', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const status = read('docs/status.md');
  const architecture = read('docs/architecture.md');
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  for (const doc of [readme, taskMap, onboarding, publicSurfaceIndex, gatewayContracts]) {
    assert.match(doc, /Grant Foundry -> Med Auto Grant/);
    assert.match(doc, /signal-only|public scaffold|top-level signal|future direction|domain-direction evidence/i);
    assert.match(
      doc,
      /not yet an admitted `OPL` domain gateway and harness|not an admitted domain gateway|not indexed here as an admitted domain|not admitted/i,
    );
  }

  for (const doc of [readmeZh, status, architecture, taskMapZh, onboardingZh, publicSurfaceIndexZh, gatewayContractsZh]) {
    assert.match(doc, /Grant Foundry -> Med Auto Grant/);
    assert.match(doc, /signal-only|公开 scaffold|顶层信号|top-level signal|future direction|领域方向证据/);
    assert.match(doc, /还不是已经 admitted 的 `OPL` domain gateway 与 harness|不等于已正式收录的 domain gateway|不是已 admitted 的 domain gateway/);
  }

  for (const doc of [taskMap, onboarding, publicSurfaceIndex, gatewayContracts]) {
    assert.match(doc, /`?G2`? discovery readiness|`?G2`? discovery target|`?G3`? routed-action readiness|`?G3`? routed-action target/i);
    assert.match(doc, /handoff-ready|handoff readiness/i);
  }

  for (const doc of [status, architecture, taskMapZh, onboardingZh, publicSurfaceIndexZh, gatewayContractsZh]) {
    assert.match(doc, /`?G2`? discovery readiness|`?G2`? discovery target|`?G3`? routed-action readiness|`?G3`? routed-action target/);
    assert.match(doc, /handoff-ready|handoff readiness/);
  }
});

test('tracked admission guards still require explicit execution-model evidence', () => {
  const onboardingContract = read('docs/opl-domain-onboarding-contract.md');
  const candidateBacklogJson = JSON.stringify(
    readJson('contracts/opl-gateway/candidate-domain-backlog.json'),
  );

  assert.match(onboardingContract, /stable agent runtime surface/i);
  assert.match(onboardingContract, /shared-base substrate layering|shared-base|share one base/i);
  assert.match(onboardingContract, /fixed-code-first/i);

  assert.match(candidateBacklogJson, /stable agent runtime surface for the future Grant Ops domain/i);
  assert.match(candidateBacklogJson, /promote_to_g2_without_domain_gateway/i);
  assert.match(candidateBacklogJson, /promote_to_g3_without_explicit_route_evidence/i);
});

test('docs index exposes the core working set and s1 companions', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');

  for (const token of [
    'project.md',
    'status.md',
    'architecture.md',
    'invariants.md',
    'decisions.md',
    '../contracts/README.md',
    'operating-model.md',
    'unified-harness-engineering-substrate.md',
    'opl-runtime-naming-and-boundary-contract.md',
    'roadmap.md',
    'references/hermes-agent-runtime-substrate-benchmark.md',
    'references/opl-vertical-online-agent-platform-roadmap.md',
  ]) {
    assert.match(docsIndex, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const token of [
    'project.md',
    'status.md',
    'architecture.md',
    'invariants.md',
    'decisions.md',
    '../contracts/README.md',
    'operating-model.zh-CN.md',
    'unified-harness-engineering-substrate.zh-CN.md',
    'opl-runtime-naming-and-boundary-contract.zh-CN.md',
    'roadmap.zh-CN.md',
    'references/hermes-agent-runtime-substrate-benchmark.md',
    'references/opl-vertical-online-agent-platform-roadmap.md',
  ]) {
    assert.match(docsIndexZh, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('public docs distinguish the public mainline from the repo-tracked s1 follow-on', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const status = read('docs/status.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');

  for (const doc of [readme, roadmap, status, publicSurfaceIndex]) {
    assert.match(doc, /repo-tracked follow-on/i);
    assert.match(doc, /S1 \/ shared runtime substrate v1 contract freeze/);
    assert.doesNotMatch(doc, /central-sync stop/i);
  }

  for (const doc of [readmeZh, roadmapZh, status, publicSurfaceIndexZh]) {
    assert.match(doc, /repo-tracked follow-on|当前 repo-tracked follow-on/);
    assert.match(doc, /S1 \/ shared runtime substrate v1 contract freeze/);
    assert.doesNotMatch(doc, /中央同步停车/);
  }
});

test('formal entry remains cli-first while mcp stays supported and controller stays internal', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const operatingModel = read('docs/operating-model.md');
  const operatingModelZh = read('docs/operating-model.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  for (const doc of [readme, roadmap]) {
    assert.match(doc, /TypeScript CLI.*read-only gateway baseline|TypeScript CLI.*read-only gateway surface|CLI-first/i);
    assert.match(doc, /MCP/);
    assert.match(doc, /controller/i);
    assert.match(doc, /`?Codex`?-default host-agent runtime/);
  }

  for (const doc of [readmeZh, roadmapZh]) {
    assert.match(doc, /TypeScript CLI.*read-only gateway baseline|TypeScript CLI.*read-only gateway surface|CLI-first/);
    assert.match(doc, /MCP/);
    assert.match(doc, /controller/);
    assert.match(doc, /Codex-default host-agent runtime/);
  }

  for (const doc of [operatingModel, operatingModelZh]) {
    assert.match(doc, /TypeScript CLI.*read-only gateway baseline|CLI-first/);
    assert.match(doc, /MCP/);
    assert.match(doc, /controller/);
    assert.match(doc, /S1 \/ shared runtime substrate v1 contract freeze/);
  }

  for (const doc of [gatewayContracts, gatewayContractsZh]) {
    assert.match(doc, /TypeScript CLI.*read-only gateway baseline|CLI-first/);
    assert.match(doc, /host-agent runtime/);
    assert.match(doc, /S1 \/ shared runtime substrate v1 contract freeze/);
  }
});

test('substrate and runtime naming docs freeze the six shared object groups without inserting a new routed hop', () => {
  const substrate = read('docs/unified-harness-engineering-substrate.md');
  const substrateZh = read('docs/unified-harness-engineering-substrate.zh-CN.md');
  const naming = read('docs/opl-runtime-naming-and-boundary-contract.md');
  const namingZh = read('docs/opl-runtime-naming-and-boundary-contract.zh-CN.md');
  const architecture = read('docs/architecture.md');
  const invariants = read('docs/invariants.md');

  for (const doc of [substrate, naming, architecture, invariants]) {
    assert.match(doc, /OPL Gateway/);
    assert.match(doc, /Domain Gateway/);
    assert.match(doc, /Domain Harness OS/);
  }

  assert.doesNotMatch(substrate, /-> Unified Harness Engineering Substrate ->/);
  assert.doesNotMatch(substrateZh, /-> Unified Harness Engineering Substrate ->/);
  assert.match(substrate, /not a new routed hop/i);
  assert.match(substrateZh, /不是新的 routed hop/);
  assert.match(naming, /shared contract layer, not a separate routing layer/i);
  assert.match(namingZh, /共享 contract layer，不是.*新路由层/);
  assert.match(architecture, /Human \/ Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS/);
  assert.match(invariants, /Human \/ Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS/);
  assert.doesNotMatch(architecture, /Human \/ Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS -> Domain Repository/);
  assert.match(architecture, /Domain Repository.*not.*extra.*control chain|Domain Repository.*不是.*额外一环/);

  for (const token of [
    'runtime profile',
    'session substrate',
    'gateway runtime status',
    'memory provider hook',
    'delivery / cron substrate',
    'approval / interrupt / resume',
  ]) {
    assert.match(substrate, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.match(substrateZh, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(naming, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.match(namingZh, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(naming, /tool registry sits inside this sixth object group/i);
  assert.match(namingZh, /tool registry 归在这一组对象里/);
  assert.match(substrate, /gateway-owned machine-readable surface/i);
  assert.match(substrateZh, /gateway-owned machine-readable surface/);
});

test('contracts docs keep s1 outside json and point to the correct companion docs', () => {
  const contractsReadme = read('contracts/README.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  assert.match(contractsReadme, /machine-readable contract surface/);
  assert.match(contractsReadme, /shared runtime substrate v1/);

  assert.match(gatewayContracts, /does \*\*not\*\* enter `contracts\/opl-gateway\/\*\.json` yet/i);
  assert.match(gatewayContractsZh, /不\*\*不\*\*直接进入|它\*\*不\*\*直接进入|不直接进入 `contracts\/opl-gateway\/\*\.json`/);

  for (const doc of [gatewayContracts, gatewayContractsZh]) {
    assert.match(doc, /Hermes Agent Runtime Substrate Benchmark|Hermes Agent Runtime Substrate 对标与吸收清单/);
    assert.match(doc, /OPL Vertical Online Agent Platform Roadmap|OPL 垂类在线 Agent 平台演进蓝图/);
    assert.match(doc, /history\/omx\/README/);
  }
});

test('public surface index and routed-action docs stay planning-only and aligned with s1', () => {
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const routedAction = read('docs/opl-routed-action-gateway.md');
  const routedActionZh = read('docs/opl-routed-action-gateway.zh-CN.md');

  assert.match(publicSurfaceIndex, /planning-level contract only/i);
  assert.match(publicSurfaceIndexZh, /planning-level 合同参考/);
  assert.match(publicSurfaceIndex, /S1 \/ shared runtime substrate v1 contract freeze/);
  assert.match(publicSurfaceIndexZh, /S1 \/ shared runtime substrate v1 contract freeze/);

  for (const doc of [routedAction, routedActionZh]) {
    assert.match(doc, /route_request/);
    assert.match(doc, /build_handoff_payload/);
    assert.match(doc, /audit_routing_decision/);
    assert.match(doc, /domain_gateway/);
  }
});

test('hermes benchmark freezes adopted adapted deferred rejected and the s1 adoption order', () => {
  const hermesBenchmark = read('docs/references/hermes-agent-runtime-substrate-benchmark.md');
  const verticalRoadmap = read('docs/references/opl-vertical-online-agent-platform-roadmap.md');

  for (const heading of ['## Adopted', '## Adapted', '## Deferred', '## Rejected']) {
    assert.match(hermesBenchmark, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const token of [
    'runtime profile',
    'session substrate',
    'gateway runtime status',
    'memory provider hook',
    'delivery / cron substrate',
    'approval / interrupt / resume',
    'tool registry contract',
    'gateway owner process',
    'managed runtime',
  ]) {
    assert.match(hermesBenchmark, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  assert.match(verticalRoadmap, /med-autoscience/);
  assert.match(verticalRoadmap, /med-autogrant/);
  assert.match(verticalRoadmap, /redcube-ai/);
  assert.match(verticalRoadmap, /当前 north star/);
  assert.match(verticalRoadmap, /What Counts As Done For `S1`/);
  assert.match(verticalRoadmap, /What Must Not Be Done In `S1`/);
  assert.match(verticalRoadmap, /当前 tranche 记录/);

  assert.ok(verticalRoadmap.indexOf('### `med-autoscience`') < verticalRoadmap.indexOf('### `med-autogrant`'));
  assert.ok(verticalRoadmap.indexOf('### `med-autogrant`') < verticalRoadmap.indexOf('### `redcube-ai`'));
});

test('vertical roadmap freezes what can move into domains and what must stay at the opl top layer', () => {
  const verticalRoadmap = read('docs/references/opl-vertical-online-agent-platform-roadmap.md');

  assert.match(verticalRoadmap, /哪些内容已经可以压到 domain/);
  assert.match(verticalRoadmap, /哪些内容仍只能停留在 `OPL` 顶层/);
  assert.match(verticalRoadmap, /gateway-owned machine-readable surface/);
  assert.match(verticalRoadmap, /成熟本地产品 runtime pilot/);
  assert.match(verticalRoadmap, /source-readiness \/ research-mainline/);
  assert.match(verticalRoadmap, /runtime owner/);
});

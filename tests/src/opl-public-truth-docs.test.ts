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
  assert.match(roadmap, /Grant Foundry -> Med Auto Grant/i);
  assert.match(roadmap, /top-level signal/i);
  assert.match(roadmap, /domain-direction evidence/i);
  assert.match(
    roadmap,
    /not an admitted domain gateway|does \*\*not\*\* make `Grant Ops` a `G2` discovery target or a `G3` routed-action target/i,
  );

  assert.match(roadmapZh, /`Grant Ops`、`Thesis Ops`、`Review Ops` 仍处于定义阶段/);
  assert.match(roadmapZh, /Grant Foundry -> Med Auto Grant/);
  assert.match(roadmapZh, /top-level signal|顶层信号/);
  assert.match(roadmapZh, /domain-direction evidence|领域方向证据/);
  assert.match(
    roadmapZh,
    /不等于已正式收录的 domain gateway|不代表 `Grant Ops` 已经变成 `G2` discovery target 或 `G3` routed-action target/,
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

test('grant candidate path keeps med auto grant at signal-only evidence instead of admission or readiness', () => {
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const backlog = read('docs/references/opl-candidate-domain-backlog.md');
  const backlogZh = read('docs/references/opl-candidate-domain-backlog.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');
  const acceptance = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');

  for (const doc of [roadmap, taskMap, backlog, onboarding, publicSurfaceIndex, gatewayContracts, acceptance]) {
    assert.match(doc, /Grant Foundry -> Med Auto Grant/i);
    assert.match(doc, /top-level signal/i);
    assert.match(doc, /domain-direction evidence/i);
    assert.match(doc, /not an admitted domain gateway|do not satisfy admission|not indexed here as an admitted domain/i);
    assert.match(doc, /not (?:count as|make).*G2 discovery readiness|not (?:count as|make).*G2 discovery target|G2 discovery-ready|does \*\*not\*\* satisfy.*discovery readiness|do not satisfy.*discovery readiness/i);
    assert.match(doc, /not (?:count as|make).*G3 routed-action readiness|not (?:count as|make).*G3 routed-action target|G3 routed-action-ready|does \*\*not\*\* satisfy.*routing readiness|do not satisfy.*routing readiness/i);
    assert.match(doc, /handoff-ready|handoff readiness/i);
  }

  for (const doc of [roadmapZh, taskMapZh, backlogZh, onboardingZh, publicSurfaceIndexZh, gatewayContractsZh, acceptanceZh]) {
    assert.match(doc, /Grant Foundry -> Med Auto Grant/);
    assert.match(doc, /top-level signal|顶层信号/);
    assert.match(doc, /domain-direction evidence|领域方向证据/);
    assert.match(doc, /不等于已正式收录的 domain gateway|不等于已经 admitted 的 domain gateway|不会被写成已收录 domain gateway|不能满足 admission/);
    assert.match(doc, /不等于 `?G2`? discovery readiness|不等于 `?G2`? discovery target|`?G2`? discovery-ready|不能满足.*discovery readiness/);
    assert.match(doc, /不等于 `?G3`? routed-action readiness|不等于 `?G3`? routed-action target|`?G3`? routed-action-ready|`?G3`? routed-action readiness|不能满足.*routing readiness/);
    assert.match(doc, /handoff-ready|handoff readiness/);
  }
});

test('gateway and onboarding docs cross-reference the current four-repo alignment companions', () => {
  const onboardingContract = read('docs/opl-domain-onboarding-contract.md');
  const onboardingContractZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  for (const doc of [onboardingContract, onboardingContractZh]) {
    assert.match(doc, /references\/host-agent-runtime-contract\.md/);
    assert.match(doc, /references\/development-operating-model\.md/);
    assert.match(doc, /Codex Host/i);
    assert.match(doc, /OMX/);
  }

  for (const doc of [gatewayContracts, gatewayContractsZh]) {
    assert.match(doc, /docs\/references\/contract-convergence-v1-execution-board\.md/);
    assert.match(doc, /docs\/references\/ecosystem-status-matrix\.md/);
    assert.match(doc, /docs\/references\/host-agent-runtime-contract\.md/);
    assert.match(doc, /docs\/references\/development-operating-model\.md/);
    assert.match(doc, /docs\/references\/runtime-alignment-taskboard\.md/);
    assert.match(doc, /docs\/references\/omx-stage-gated-longrun-guide\.md/);
  }
});

test('contract convergence execution board freezes the current unified program and phase-c behavior convergence plan', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const executionBoard = read('docs/references/contract-convergence-v1-execution-board.md');
  const statusMatrix = read('docs/references/ecosystem-status-matrix.md');
  const taskboard = read('docs/references/runtime-alignment-taskboard.md');
  const managedRuntimeReadiness = read('docs/references/managed-runtime-migration-readiness-checklist.md');
  const longrunPlaybook = read('docs/references/omx-longrun-prompt-playbook.md');

  assert.match(docsIndex, /references\/contract-convergence-v1-execution-board\.md/);
  assert.match(docsIndexZh, /references\/contract-convergence-v1-execution-board\.md/);

  assert.match(executionBoard, /Contract Convergence v1/);
  assert.match(executionBoard, /Phase C \/ Object And Report Behavior Convergence/);
  assert.match(executionBoard, /default_formal_entry = CLI/);
  assert.match(executionBoard, /supported_protocol_layer = MCP/);
  assert.match(executionBoard, /internal_controller_surface = controller/);
  assert.match(executionBoard, /execution handle contract/);
  assert.match(executionBoard, /durable surface contract/);
  assert.match(executionBoard, /repo-verified behavior/);
  assert.match(executionBoard, /control-plane/);
  assert.match(executionBoard, /product runtime/);
  assert.match(executionBoard, /shared public code framework|共享公共代码框架/);
  assert.match(executionBoard, /monorepo \/ runtime core ingest \/ controlled cutover/);
  assert.match(executionBoard, /不属于当前四仓 `?Phase C`? 的直接交付/);
  assert.match(executionBoard, /Phase 2 \/ source-readiness deep research trigger \+ gate convergence/);
  assert.match(executionBoard, /Phase 2 \/ workspace (?:\/ )?operator quickstart convergence/);
  assert.match(executionBoard, /Phase 2 \/ runtime watch locator integrity hardening/);
  assert.match(executionBoard, /fd01266/);
  assert.match(executionBoard, /workspace doctor.*只做诊断/);
  assert.match(executionBoard, /bootstrap writer.*source intake \/ source research|source intake \/ source research.*bootstrap writer/);
  assert.match(executionBoard, /e8146a1/);
  assert.match(executionBoard, /762ea4c/);
  assert.match(executionBoard, /phase_2_family_parity_autopilot_continuation_board/);
  assert.match(executionBoard, /phase_2_family_parity_governance_surface_convergence/);
  assert.match(executionBoard, /R5\.A \/ Hosted-Friendly Session Boundary/);
  assert.match(executionBoard, /6277163/);
  assert.match(executionBoard, /e8f9582/);
  assert.match(executionBoard, /2c434b1/);
  assert.match(executionBoard, /c3ba2a7/);
  assert.match(executionBoard, /98df81f/);
  assert.match(executionBoard, /post-R5A local runtime hardening/);
  assert.match(executionBoard, /dd865e0/);
  assert.match(executionBoard, /40e343c/);
  assert.match(executionBoard, /d17959e/);
  assert.match(executionBoard, /ee1c0b2/);
  assert.match(executionBoard, /7444000/);
  assert.match(executionBoard, /9b5cea8/);
  assert.match(executionBoard, /7ee19a8/);
  assert.match(executionBoard, /6c64264/);

  assert.match(statusMatrix, /Contract Convergence v1/);
  assert.match(statusMatrix, /Phase C \/ Object And Report Behavior Convergence/);
  assert.match(statusMatrix, /monorepo \/ runtime core ingest \/ controlled cutover/);
  assert.match(statusMatrix, /不是当前四仓统一 `?Phase C`? 的 blocker|不是当前统一 program 的直接交付项/);
  assert.match(statusMatrix, /CURRENT_MAXIMUM_REACHED_AND_ABSORBED_TO_MAIN|honest stop/i);
  assert.match(statusMatrix, /workspace (?:\/ )?operator quickstart convergence|runtime watch locator integrity hardening/);
  assert.match(statusMatrix, /fd01266/);
  assert.match(statusMatrix, /workspace doctor.*只做诊断/);
  assert.match(statusMatrix, /source intake \/ source research/);
  assert.match(statusMatrix, /e8146a1/);
  assert.match(statusMatrix, /762ea4c/);
  assert.match(statusMatrix, /phase_2_family_parity_autopilot_continuation_board/);
  assert.match(statusMatrix, /post-R5A local runtime hardening current truth|root-checkout truth path anchoring|root checkout/);
  assert.match(statusMatrix, /6277163/);
  assert.match(statusMatrix, /e8f9582/);
  assert.match(statusMatrix, /2c434b1/);
  assert.match(statusMatrix, /c3ba2a7/);
  assert.match(statusMatrix, /98df81f/);
  assert.match(statusMatrix, /CURRENT_PROGRAM\.program_id/);
  assert.match(statusMatrix, /post-R5A local runtime hardening/);
  assert.match(statusMatrix, /manual stabilization checklist/);
  assert.match(statusMatrix, /runtime_watch.*auto-recovery|heartbeat \/ auto-recovery/);
  assert.match(statusMatrix, /premature completion/);
  assert.match(statusMatrix, /9b5cea8/);
  assert.match(statusMatrix, /7ee19a8/);
  assert.match(statusMatrix, /6c64264/);
  assert.match(taskboard, /Contract Convergence v1/);
  assert.match(taskboard, /Phase C \/ Object And Report Behavior Convergence/);
  assert.match(taskboard, /verification checkpoint|行为验证/);
  assert.match(taskboard, /monorepo \/ runtime core ingest \/ controlled cutover/);
  assert.match(taskboard, /后置 domain-internal 轨道|不在当前 taskboard 的活跃实现范围/);
  assert.match(taskboard, /same-mainline continuation board|phase_2_family_parity_autopilot_continuation_board|post-R5A local runtime hardening delta/);
  assert.match(taskboard, /workspace (?:\/ )?operator quickstart convergence|runtime watch locator integrity hardening/);
  assert.match(taskboard, /fd01266/);
  assert.match(taskboard, /workspace doctor.*只做诊断/);
  assert.match(taskboard, /workspace-init surface/);
  assert.match(taskboard, /e8146a1/);
  assert.match(taskboard, /762ea4c/);
  assert.match(taskboard, /phase_2_family_parity_autopilot_continuation_board/);
  assert.match(taskboard, /root-checkout truth path anchoring|root checkout/);
  assert.match(taskboard, /6277163/);
  assert.match(taskboard, /e8f9582/);
  assert.match(taskboard, /2c434b1/);
  assert.match(taskboard, /c3ba2a7/);
  assert.match(taskboard, /98df81f/);
  assert.match(taskboard, /CURRENT_PROGRAM\.program_id/);
  assert.match(taskboard, /honest stop/i);
  assert.match(taskboard, /post-R5A local runtime hardening/);
  assert.match(taskboard, /manual_runtime_stabilization_checklist\.md/);
  assert.match(taskboard, /premature completion/);
  assert.ok(
    taskboard.includes('control-plane state 迁回 repo-tracked truth') || taskboard.includes('.omx/**'),
  );
  assert.match(longrunPlaybook, /machine-readable \/ repo-tracked truth/);
  assert.match(longrunPlaybook, /workspace doctor.*bootstrap writer.*source intake \/ source research|source intake \/ source research.*bootstrap writer/);
  assert.match(longrunPlaybook, /762ea4c/);
  assert.match(longrunPlaybook, /6c64264/);
  assert.match(longrunPlaybook, /CURRENT_PROGRAM\.program_id/);
  assert.match(longrunPlaybook, /manual stabilization checklist/);
  assert.match(longrunPlaybook, /premature completion/);
  assert.doesNotMatch(longrunPlaybook, /若可以，就优先收紧 revised-workspace validator/);

  for (const doc of [executionBoard, statusMatrix, taskboard, managedRuntimeReadiness, longrunPlaybook]) {
    assert.doesNotMatch(doc, /workspace \/ operator quickstart convergence` 仍未被冻结/);
    assert.doesNotMatch(doc, /等待 `workspace \/ operator quickstart convergence`/);
    assert.doesNotMatch(doc, /判断这条 next line 是否能在当前 hard boundary 内被诚实冻结/);
  }
});

test('phase-1 public gateway docs distinguish CLI transport from the host-agent and control-plane defaults', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const discoveryGateway = read('docs/opl-read-only-discovery-gateway.md');
  const discoveryGatewayZh = read('docs/opl-read-only-discovery-gateway.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');

  for (const doc of [readme, readmeZh, discoveryGateway, discoveryGatewayZh]) {
    assert.match(doc, /Codex-default host-agent runtime/);
    assert.match(doc, /Codex-only/i);
  }

  assert.match(discoveryGateway, /legacy `Codex Host` \/ `OMX` split/i);
  assert.match(discoveryGatewayZh, /历史上的 `Codex Host` \/ `OMX` 分工/);
  assert.doesNotMatch(discoveryGateway, /At the development-control layer, `Codex Host` freezes planning and truth while `OMX` handles long-running execution/i);
  assert.doesNotMatch(discoveryGatewayZh, /在开发控制面上，`Codex Host` 负责规划冻结与真相裁决，`OMX` 负责在这些已冻结边界内做长时执行/);
  assert.match(onboarding, /active execution path remains Codex-only/i);
  assert.match(onboardingZh, /当前活跃执行入口仍是 Codex-only/);
  assert.match(onboarding, /historical `Codex Host` \/ `OMX` migration discipline/i);
  assert.match(onboardingZh, /历史 `Codex Host` \/ `OMX` 迁移纪律/);
  assert.match(discoveryGateway, /does not grant route authority/i);
  assert.match(discoveryGatewayZh, /不授予 route authority/);
});

test('phase-1 formal entry wording keeps OPL at the CLI-first read-only gateway surface', () => {
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  assert.match(roadmap, /formal entry.*TypeScript CLI.*read-only gateway surface/i);
  assert.match(roadmapZh, /formal entry.*TypeScript CLI.*read-only gateway surface/);
  assert.match(publicSurfaceIndex, /formal entry.*CLI-first \/ read-only gateway surface/i);
  assert.match(publicSurfaceIndexZh, /formal entry.*CLI-first \/ read-only gateway surface/);
  assert.match(gatewayContracts, /formal entry.*TypeScript CLI.*read-only gateway surface/i);
  assert.match(gatewayContractsZh, /formal entry.*TypeScript CLI.*read-only gateway surface/);
  assert.match(
    gatewayContracts,
    /rather than a launcher, mutation entry, or runtime-owner surface|not a launcher, mutation entry, or runtime-owner surface/i,
  );
  assert.match(gatewayContractsZh, /不是 launcher、mutation entry 或 runtime-owner surface/);
});

test('public surface index and routed-action docs stay aligned with the frozen gateway contracts', () => {
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const routedActionGateway = read('docs/opl-routed-action-gateway.md');
  const routedActionGatewayZh = read('docs/opl-routed-action-gateway.zh-CN.md');

  assert.match(publicSurfaceIndex, /### 1\. OPL public-entry surfaces[\s\S]{0,600}Gateway Rollout/);
  assert.match(publicSurfaceIndexZh, /### 1\. OPL 公开入口界面[\s\S]{0,600}Gateway 落地路线/);
  assert.match(publicSurfaceIndex, /### 2\. OPL contract surfaces[\s\S]{0,1300}Governance \/ Audit Operating Surface/);
  assert.match(publicSurfaceIndex, /### 2\. OPL contract surfaces[\s\S]{0,1800}Publish \/ Promotion Operating Surface/);
  assert.match(publicSurfaceIndexZh, /### 2\. OPL 合同界面[\s\S]{0,1300}Governance \/ Audit Operating Surface/);
  assert.match(publicSurfaceIndexZh, /### 2\. OPL 合同界面[\s\S]{0,1800}Publish \/ Promotion Operating Surface/);
  assert.doesNotMatch(publicSurfaceIndex, /### 1\. OPL public-entry surfaces[\s\S]{0,400}Unified Harness Engineering Substrate/);
  assert.doesNotMatch(publicSurfaceIndexZh, /### 1\. OPL 公开入口界面[\s\S]{0,400}Unified Harness Engineering Substrate/);

  for (const doc of [routedActionGateway, routedActionGatewayZh]) {
    assert.match(doc, /"operation": "route_request"/);
    assert.match(doc, /"operation": "build_handoff_payload"/);
    assert.match(doc, /"operation": "audit_routing_decision"/);
    assert.match(doc, /"route_status": "routed"/);
  }
});

test('current gateway docs keep the phase-1 formal-entry baseline while the public mainline activates the minimal admitted-domain federation package', () => {
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const discovery = read('docs/opl-read-only-discovery-gateway.md');
  const discoveryZh = read('docs/opl-read-only-discovery-gateway.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const rollout = read('docs/references/opl-gateway-rollout.md');
  const rolloutZh = read('docs/references/opl-gateway-rollout.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  assert.match(roadmap, /2026-04-10[\s\S]{0,120}Phase 2 \/ Minimal admitted-domain federation activation package/i);
  assert.match(roadmapZh, /截至 `?2026-04-10`?，`?OPL`? 公开主线仍停留在已 absorbed 的 `?Phase 2 \/ Minimal admitted-domain federation activation package`?/);
  assert.match(roadmap, /No new active follow-on tranche is currently open|central-sync stop/i);
  assert.match(roadmapZh, /没有新的 active follow-on tranche 打开|中央同步停车/);
  assert.match(discovery, /already has a runnable local `TypeScript CLI`-first \/ read-only gateway baseline/i);
  assert.match(discoveryZh, /已具备可运行的本地 `?TypeScript CLI`?-first \/ read-only gateway baseline/);
  assert.match(roadmap, /Phase 1[\s\S]{0,40}formal entry contract and public system surface/i);
  assert.match(roadmapZh, /`Phase 1` 的 formal entry contract 与 public system surface/);
  assert.match(publicSurfaceIndex, /`?G3`?.*thin handoff planning.*planning-contract closeout|planning-level contract/i);
  assert.match(publicSurfaceIndexZh, /`?G3`?.*planning-contract closeout|planning-level contract|planning-only/);
  assert.match(publicSurfaceIndex, /Minimal admitted-domain federation activation package/i);
  assert.match(publicSurfaceIndexZh, /Minimal admitted-domain federation activation package/);
  assert.match(publicSurfaceIndex, /No new active follow-on tranche is open|central sync/i);
  assert.match(publicSurfaceIndexZh, /当前没有新的 active follow-on tranche|central sync/i);
  assert.doesNotMatch(publicSurfaceIndex, /pre-freeze/i);
  assert.doesNotMatch(publicSurfaceIndexZh, /预冻结/);
  assert.match(rollout, /G3 thin handoff planning freeze hardening.*planning-contract boundary|`?G3`? remains inactive beyond the planning freeze/i);
  assert.match(rolloutZh, /G3 thin handoff planning freeze hardening.*planning-contract closeout 边界|`?G3`? 在 planning freeze 之外仍未激活/);
  assert.match(gatewayContracts, /G2 stable public baseline/i);
  assert.match(gatewayContracts, /Phase 1 \/ G3 thin handoff planning freeze hardening/i);
  assert.match(gatewayContracts, /Phase 2 \/ Minimal admitted-domain federation activation package/i);
  assert.match(gatewayContracts, /MedAutoScience/i);
  assert.match(gatewayContracts, /RedCube AI/i);
  assert.match(gatewayContracts, /No new active follow-on tranche is currently open|central sync/i);
  assert.match(gatewayContractsZh, /G2 stable public baseline/);
  assert.match(gatewayContractsZh, /Phase 1 \/ G3 thin handoff planning freeze hardening/);
  assert.match(gatewayContractsZh, /Phase 2 \/ Minimal admitted-domain federation activation package/);
  assert.match(gatewayContractsZh, /MedAutoScience/);
  assert.match(gatewayContractsZh, /RedCube AI/);
  assert.match(gatewayContractsZh, /当前没有新的 active follow-on tranche|central sync/i);
});

test('top-level positioning docs freeze the g2 release-closeout and substrate boundary wording', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');

  assert.match(readme, /Phase 1 \/ G2 release-closeout/i);
  assert.match(readmeZh, /Phase 1 \/ G2 release-closeout/);
  assert.match(roadmap, /Phase 1 \/ G2 release-closeout/i);
  assert.match(roadmapZh, /Phase 1 \/ G2 release-closeout/);

  assert.match(readme, /shared public code framework/i);
  assert.match(readmeZh, /共享代码框架/);
  assert.match(roadmap, /shared public code framework/i);
  assert.match(roadmapZh, /共享代码框架/);
});

test('public docs keep the absorbed phase-1 exit freeze while activating the minimal admitted-domain federation package', () => {
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');
  const rollout = read('docs/references/opl-gateway-rollout.md');
  const rolloutZh = read('docs/references/opl-gateway-rollout.zh-CN.md');

  for (const doc of [roadmap, publicSurfaceIndex, gatewayContracts, rollout]) {
    assert.match(doc, /Phase 1 exit \+ next-stage activation package freeze/i);
    assert.match(doc, /Minimal admitted-domain federation activation package/i);
    assert.match(doc, /Review Ops/i);
    assert.match(doc, /Thesis Ops/i);
  }

  for (const doc of [roadmapZh, publicSurfaceIndexZh, gatewayContractsZh, rolloutZh]) {
    assert.match(doc, /Phase 1 exit \+ next-stage activation package freeze/);
    assert.match(doc, /Minimal admitted-domain federation activation package/);
    assert.match(doc, /Review Ops/);
    assert.match(doc, /Thesis Ops/);
  }
});

test('review candidate path keeps blocker packages explicit and below handoff readiness', () => {
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const backlog = read('docs/references/opl-candidate-domain-backlog.md');
  const backlogZh = read('docs/references/opl-candidate-domain-backlog.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const acceptance = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');

  for (const doc of [taskMap, backlog, onboarding, acceptance]) {
    assert.match(doc, /Review Ops/i);
    assert.match(doc, /execution_model|execution-model/i);
    assert.match(doc, /discovery_readiness|discovery readiness/i);
    assert.match(doc, /routing_readiness|routing readiness/i);
    assert.match(doc, /cross_domain_wording|cross-domain wording/i);
    assert.match(doc, /handoff-ready|handoff readiness/i);
    assert.match(doc, /domain_gateway/i);
    assert.match(doc, /no-bypass|bypass/i);
  }

  for (const doc of [taskMapZh, backlogZh, onboardingZh, acceptanceZh]) {
    assert.match(doc, /Review Ops/);
    assert.match(doc, /execution_model|execution-model/);
    assert.match(doc, /discovery_readiness|discovery readiness/);
    assert.match(doc, /routing_readiness|routing readiness/);
    assert.match(doc, /cross_domain_wording|cross-domain wording/);
    assert.match(doc, /handoff-ready|handoff readiness/);
    assert.match(doc, /domain_gateway/);
    assert.match(doc, /no-bypass|bypass/);
  }
});

test('thesis candidate path keeps blocker packages explicit and below handoff readiness', () => {
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const backlog = read('docs/references/opl-candidate-domain-backlog.md');
  const backlogZh = read('docs/references/opl-candidate-domain-backlog.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const acceptance = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');

  for (const doc of [taskMap, backlog, onboarding, acceptance]) {
    assert.match(doc, /Thesis Ops/i);
    assert.match(doc, /execution_model|execution-model/i);
    assert.match(doc, /discovery_readiness|discovery readiness/i);
    assert.match(doc, /routing_readiness|routing readiness/i);
    assert.match(doc, /cross_domain_wording|cross-domain wording/i);
    assert.match(doc, /handoff-ready|handoff readiness/i);
    assert.match(doc, /domain_gateway/i);
    assert.match(doc, /no-bypass|bypass/i);
  }

  for (const doc of [taskMapZh, backlogZh, onboardingZh, acceptanceZh]) {
    assert.match(doc, /Thesis Ops/);
    assert.match(doc, /execution_model|execution-model/);
    assert.match(doc, /discovery_readiness|discovery readiness/);
    assert.match(doc, /routing_readiness|routing readiness/);
    assert.match(doc, /cross_domain_wording|cross-domain wording/);
    assert.match(doc, /handoff-ready|handoff readiness/);
    assert.match(doc, /domain_gateway/);
    assert.match(doc, /no-bypass|bypass/);
  }
});

test('repo-tracked thin handoff planning brief freezes route_request without activating a routed-action runtime', () => {
  const brief = read('docs/plans/2026-04-07-g3-thin-handoff-planning-brief.md');

  assert.match(brief, /route_request/);
  assert.match(brief, /build_handoff_payload/);
  assert.match(brief, /audit_routing_decision/);
  assert.match(brief, /不得绕过 domain gateway/);
  assert.match(brief, /不实现真正的 `?G3 mutation\/routed-action runtime`?/);
});

test('repo-tracked g2 release closeout note freezes the public baseline without activating g3', () => {
  const closeout = read('docs/plans/2026-04-07-g2-release-closeout-note.md');

  assert.match(closeout, /G2 stable public baseline/);
  assert.match(closeout, /已具备可运行的本地 `?TypeScript CLI`?-first \/ read-only gateway baseline/);
  assert.match(closeout, /`?G3`? 仍未激活/);
  assert.match(closeout, /不实现真正的 `?G3 mutation\/routed-action runtime`?/);
  assert.match(closeout, /Unified Harness Engineering Substrate/);
  assert.match(closeout, /不是共享代码框架/);
});

test('g3 planning docs keep handoff planning-only and forbid launcher semantics', () => {
  const acceptance = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');
  const routedAction = read('docs/opl-routed-action-gateway.md');
  const routedActionZh = read('docs/opl-routed-action-gateway.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  for (const doc of [acceptance, routedAction, gatewayContracts]) {
    assert.match(doc, /planning gate|planning-level contract|planning dependency/i);
    assert.match(doc, /domain_gateway/);
    assert.match(doc, /launcher/i);
    assert.match(doc, /no-bypass|bypass/i);
    assert.doesNotMatch(doc, /pre-freeze/i);
  }

  for (const doc of [acceptanceZh, routedActionZh, gatewayContractsZh]) {
    assert.match(doc, /planning gate|planning-level contract|planning dependency|规划 gate|planning-level/);
    assert.match(doc, /domain_gateway/);
    assert.match(doc, /launcher/);
    assert.match(doc, /不得绕过 domain gateway|绕过 domain gateway/);
    assert.doesNotMatch(doc, /预冻结/);
  }
});

test('acceptance spec snippets keep split onboarding blockers and execution-model gate aligned', () => {
  const acceptance = read('docs/references/opl-gateway-acceptance-test-spec.md');
  const acceptanceZh = read('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md');

  assert.match(
    acceptance,
    /required_packages\s*=\s*\{[\s\S]{0,240}'discovery_readiness'[\s\S]{0,160}'routing_readiness'[\s\S]{0,160}'cross_domain_wording'/,
  );
  assert.match(
    acceptance,
    /required_checks\s*=\s*\{[\s\S]{0,220}'discovery_ready'[\s\S]{0,160}'routing_ready'[\s\S]{0,160}'execution_model_aligned'[\s\S]{0,160}'cross_domain_wording_aligned'/,
  );
  assert.match(
    acceptanceZh,
    /required_packages\s*=\s*\{[\s\S]{0,240}'discovery_readiness'[\s\S]{0,160}'routing_readiness'[\s\S]{0,160}'cross_domain_wording'/,
  );
  assert.match(
    acceptanceZh,
    /required_checks\s*=\s*\{[\s\S]{0,220}'discovery_ready'[\s\S]{0,160}'routing_ready'[\s\S]{0,160}'execution_model_aligned'[\s\S]{0,160}'cross_domain_wording_aligned'/,
  );
});

test('repo-tracked g3 planning closeout note hardens the planning-only boundary', () => {
  const closeout = read('docs/plans/2026-04-07-g3-thin-handoff-planning-closeout-note.md');

  assert.match(closeout, /Phase 1 \/ G3 thin handoff planning freeze hardening/);
  assert.match(closeout, /route_request/);
  assert.match(closeout, /build_handoff_payload/);
  assert.match(closeout, /audit_routing_decision/);
  assert.match(closeout, /domain_gateway/);
  assert.match(closeout, /不得绕过 domain gateway/);
  assert.match(closeout, /不新增 mutation entry/);
  assert.match(closeout, /不把 routed-actions schema 写成 launcher/);
});

test('reference-grade sync docs stay below the public mainline truth surface', () => {
  const gatewayContracts = read('contracts/opl-gateway/README.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.zh-CN.md');
  const matrix = read('docs/references/ecosystem-status-matrix.md');
  const taskboard = read('docs/references/runtime-alignment-taskboard.md');

  assert.match(gatewayContracts, /顶层参考同步面/);
  assert.match(publicSurfaceIndex, /内部参考同步锚点/);
  assert.match(matrix, /不反向抬升为 `?OPL`? 公开主线真相/);
  assert.match(taskboard, /不反向抬升为 `?OPL`? 公开主线真相/);
});

test('internal reference truth docs carry the 2026-04-11 snapshot and current OPL stop state', () => {
  const matrix = read('docs/references/ecosystem-status-matrix.md');
  const taskboard = read('docs/references/runtime-alignment-taskboard.md');

  assert.match(matrix, /状态锚点：`?2026-04-11`?/);
  assert.match(matrix, /G2 stable public baseline/);
  assert.match(matrix, /G3 thin handoff planning/);
  assert.match(matrix, /Phase 1 exit \+ next-stage activation package freeze/);
  assert.match(matrix, /Minimal admitted-domain federation activation package/);
  assert.match(matrix, /Review Ops -> Thesis Ops/);
  assert.match(matrix, /formal entry.*TypeScript CLI \+ read-only gateway baseline/);
  assert.match(matrix, /CURRENT_MAXIMUM_REACHED_AND_ABSORBED_TO_MAIN|honest stop/i);
  assert.match(taskboard, /状态锚点：`?2026-04-11`?/);
  assert.match(taskboard, /G2 stable public baseline/);
  assert.match(taskboard, /G3 thin handoff planning/);
  assert.match(taskboard, /Minimal admitted-domain federation activation package/);
  assert.match(taskboard, /Review Ops -> Thesis Ops/);
  assert.match(taskboard, /formal entry contract.*TypeScript CLI.*read-only gateway surface/);
  assert.match(taskboard, /honest stop/i);
});

test('owner-line brief freezes the current central reference convergence lane', () => {
  const ownerLine = read('docs/references/opl-phase2-ecosystem-sync-owner-line.md');

  assert.match(ownerLine, /状态锚点：`?2026-04-11`?/);
  assert.match(ownerLine, /machine-readable \/ repo-tracked truth/);
  assert.match(ownerLine, /e8146a1/);
  assert.match(ownerLine, /762ea4c/);
  assert.match(ownerLine, /phase_2_family_parity_autopilot_continuation_board/);
  assert.match(ownerLine, /98df81f/);
  assert.match(ownerLine, /manual stabilization checklist/);
  assert.match(ownerLine, /CENTRAL_REFERENCE_CONVERGENCE_CLOSED_AND_ABSORBED/);
  assert.match(ownerLine, /NO_NEW_ADMITTED_DOMAIN_DELTA_HONEST_STOP/);
});


test('public docs activate the minimal admitted-domain federation package without promoting OPL into a runtime owner', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');
  const rollout = read('docs/references/opl-gateway-rollout.md');
  const rolloutZh = read('docs/references/opl-gateway-rollout.zh-CN.md');

  for (const doc of [readme, roadmap, publicSurfaceIndex, gatewayContracts, rollout]) {
    assert.match(doc, /Minimal admitted-domain federation activation package/i);
    assert.match(doc, /MedAutoScience/i);
    assert.match(doc, /RedCube AI/i);
    assert.match(doc, /already admitted domains only|admitted domain surfaces/i);
    assert.match(doc, /TypeScript CLI.*read-only gateway surface|CLI-first \/ read-only gateway surface|CLI-first \/ read-only gateway baseline/i);
    assert.match(doc, /runtime owner/i);
  }

  for (const doc of [readmeZh, roadmapZh, publicSurfaceIndexZh, gatewayContractsZh, rolloutZh]) {
    assert.match(doc, /Minimal admitted-domain federation activation package/);
    assert.match(doc, /MedAutoScience/);
    assert.match(doc, /RedCube AI/);
    assert.match(doc, /仅面向已 admitted domain|只面向已 admitted domain|至少两个 admitted domain surface|两条 admitted domain surface|已 admitted domain surface/);
    assert.match(doc, /TypeScript CLI.*read-only gateway surface|CLI-first \/ read-only gateway surface|CLI-first \/ read-only gateway baseline/);
    assert.match(doc, /runtime owner/);
  }

  assert.match(readme, /Grant Foundry -> Med Auto Grant/);
  assert.match(readmeZh, /Grant Foundry -> Med Auto Grant/);
  assert.match(roadmap, /Review Ops/i);
  assert.match(roadmapZh, /Review Ops/);
  assert.match(roadmap, /Thesis Ops/i);
  assert.match(roadmapZh, /Thesis Ops/);
});

test('english readme exposes the opl architecture blueprint svg', () => {
  const readme = read('README.md');
  const assetPath = path.join(repoRoot, 'assets', 'branding', 'opl-architecture-blueprint.svg');

  assert.match(readme, /assets\/branding\/opl-architecture-blueprint\.svg/);
  assert.ok(fs.existsSync(assetPath));
});

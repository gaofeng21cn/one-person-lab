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

test('grant public docs describe an active repository line with separately gated federation wording', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const taskMap = read('docs/task-map.md');
  const taskMapZh = read('docs/task-map.zh-CN.md');
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');

  assert.match(readme, /Grant Foundry -> Med Auto Grant/);
  assert.match(readme, /active medical Grant Ops repository line|active grant-domain repository line/i);
  assert.match(readme, /separately gated/i);

  assert.match(readmeZh, /Grant Foundry -> Med Auto Grant/);
  assert.match(readmeZh, /活跃的医学 `Grant Ops` 业务仓|活跃的 grant-domain 业务仓路径/);
  assert.match(readmeZh, /单独门控/);

  assert.match(taskMap, /current lifecycle state: under-definition candidate workstream/i);
  assert.match(taskMap, /discovery and routing path: .*`?G2`? discovery readiness/i);
  assert.match(taskMap, /discovery and routing path: .*`?G3`? routed-action readiness/i);
  assert.match(taskMap, /unknown_domain/);
  assert.match(taskMap, /active medical `Grant Ops` repository line|top-level federation admission \/ handoff wording remains separately gated/i);

  assert.match(taskMapZh, /当前生命周期状态：under-definition candidate workstream/);
  assert.match(taskMapZh, /discovery \/ routing 路径：等待 `?G2`? discovery readiness/);
  assert.match(taskMapZh, /discovery \/ routing 路径：.*`?G3`? routed-action readiness/);
  assert.match(taskMapZh, /unknown_domain/);
  assert.match(taskMapZh, /活跃的医学 `Grant Ops` 业务仓路径|顶层 federation admission \/ handoff 上仍单独门控/);

  assert.match(roadmap, /Grant Ops`, `Thesis Ops`, and `Review Ops` remain under definition/i);
  assert.match(roadmap, /Grant Foundry -> Med Auto Grant/i);
  assert.match(roadmap, /active medical `Grant Ops` repository line|active repository line/i);
  assert.match(roadmap, /separately gated/i);
  assert.match(
    roadmap,
    /next visible milestones are registry material, discovery readiness, routing readiness, and onboarding evidence|next milestones are registry material, `?G2`? discovery readiness, `?G3`? routed-action readiness/i,
  );

  assert.match(roadmapZh, /`Grant Ops`、`Thesis Ops`、`Review Ops` 仍处于定义阶段/);
  assert.match(roadmapZh, /Grant Foundry -> Med Auto Grant/);
  assert.match(roadmapZh, /活跃的医学 `Grant Ops` 业务仓路径|活跃业务仓路径/);
  assert.match(roadmapZh, /单独门控/);
  assert.match(
    roadmapZh,
    /后续里程碑聚焦在 registry material、discovery readiness、routing readiness 与 onboarding evidence|下一步里程碑是 registry material、`?G2`? discovery readiness、`?G3`? routed-action readiness 与 domain-onboarding evidence/,
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

test('grant candidate path keeps federation admission and handoff separately gated even when the repo line is active', () => {
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
    assert.match(doc, /top-level signal|active .*repository line|separately gated/i);
    assert.match(doc, /domain-direction evidence|federation admission \/ handoff wording/i);
    assert.match(doc, /public scaffold|candidate|onboarding|future Grant Ops path|future grant domain|active .*repository line/i);
    assert.match(doc, /`?G2`? discovery readiness|discovery readiness|discovery \/ routing readiness|discovery-ready|candidate\/onboarding lanes|below the onboarding gate|candidate-definition lanes/i);
    assert.match(doc, /`?G3`? routed-action readiness|routing readiness|discovery \/ routing readiness|routed-action-ready|candidate\/onboarding lanes|below the onboarding gate|candidate-definition lanes/i);
    assert.match(doc, /handoff-ready|handoff readiness|handoff evidence|domain handoff|domain-onboarding evidence|follow-on route|below the onboarding gate|separately gated/i);
  }

  for (const doc of [roadmapZh, taskMapZh, backlogZh, onboardingZh, publicSurfaceIndexZh, gatewayContractsZh, acceptanceZh]) {
    assert.match(doc, /Grant Foundry -> Med Auto Grant/);
    assert.match(doc, /top-level signal|顶层信号|活跃.*业务仓路径|单独门控/);
    assert.match(doc, /domain-direction evidence|领域方向证据|admission \/ handoff wording|顶层 federation admission \/ handoff 上仍单独门控/);
    assert.match(doc, /公开 scaffold|候选|onboarding|future Grant Ops 路径|future grant domain 路径|candidate-definition|活跃.*业务仓路径/);
    assert.match(doc, /`?G2`? discovery readiness|discovery readiness|discovery \/ routing readiness|`?G2`? discovery-ready|candidate ?\/ ?onboarding 路径|位于 onboarding gate 之下|candidate-definition 路径/);
    assert.match(doc, /`?G3`? routed-action readiness|routing readiness|discovery \/ routing readiness|`?G3`? routed-action-ready|candidate ?\/ ?onboarding 路径|位于 onboarding gate 之下|candidate-definition 路径/);
    assert.match(doc, /handoff-ready|handoff readiness|handoff evidence|domain handoff|handoff 资格|domain-onboarding evidence|follow-on route|位于 onboarding gate 之下|单独门控/);
  }
});

test('gateway and onboarding docs separate current execution references from historical migration references', () => {
  const onboardingContract = read('docs/opl-domain-onboarding-contract.md');
  const onboardingContractZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  for (const doc of [onboardingContract, onboardingContractZh]) {
    assert.match(doc, /references\/host-agent-runtime-contract\.md/);
    assert.match(doc, /references\/development-operating-model\.md/);
    assert.match(doc, /history\/omx\/README/);
    assert.match(doc, /Codex-only/i);
    assert.match(doc, /historical migration|历史迁移/);
  }

  for (const doc of [gatewayContracts, gatewayContractsZh]) {
    assert.match(doc, /docs\/references\/contract-convergence-v1-execution-board\.md/);
    assert.match(doc, /docs\/references\/ecosystem-status-matrix\.md/);
    assert.match(doc, /docs\/references\/host-agent-runtime-contract\.md/);
    assert.match(doc, /docs\/references\/development-operating-model\.md/);
    assert.match(doc, /docs\/references\/runtime-alignment-taskboard\.md/);
    assert.match(doc, /docs\/history\/omx\/README/);
    assert.match(doc, /historical migration|历史迁移/);
  }
});

test('shared runtime and domain contracts are linked from public and gateway contract surfaces', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');
  const contractsIndex = read('contracts/README.md');
  const runtimeContract = read('docs/shared-runtime-contract.md');
  const runtimeContractZh = read('docs/shared-runtime-contract.zh-CN.md');
  const domainContract = read('docs/shared-domain-contract.md');
  const domainContractZh = read('docs/shared-domain-contract.zh-CN.md');

  for (const doc of [docsIndex, docsIndexZh, gatewayContracts, gatewayContractsZh, contractsIndex]) {
    assert.match(doc, /shared-runtime-contract/i);
    assert.match(doc, /shared-domain-contract/i);
  }

  assert.match(contractsIndex, /family-orchestration/i);

  assert.match(runtimeContract, /Shared Runtime Contract/);
  assert.match(runtimeContract, /`?Hermes-Agent`?-backed runtime substrate/i);
  assert.match(runtimeContract, /not the whole substrate|not the whole `UHS`/i);
  assert.match(runtimeContract, /family event envelope/i);
  assert.match(runtimeContract, /family checkpoint lineage/i);
  assert.match(runtimeContractZh, /Shared Runtime Contract/);
  assert.match(runtimeContractZh, /Hermes-Agent.*runtime substrate/);
  assert.match(runtimeContractZh, /不是整个 `UHS`|不等于整个 substrate/);
  assert.match(runtimeContractZh, /family event envelope/i);
  assert.match(runtimeContractZh, /family checkpoint lineage/i);

  assert.match(domainContract, /Shared Domain Contract/);
  assert.match(domainContract, /formal-entry matrix/i);
  assert.match(domainContract, /per-run handle/i);
  assert.match(domainContract, /family action graph/i);
  assert.match(domainContract, /family human gate/i);
  assert.match(domainContract, /family product-entry manifest v2/i);
  assert.match(domainContractZh, /Shared Domain Contract/);
  assert.match(domainContractZh, /formal-entry matrix/);
  assert.match(domainContractZh, /per-run handle/);
  assert.match(domainContractZh, /family action graph/i);
  assert.match(domainContractZh, /family human gate/i);
  assert.match(domainContractZh, /family product-entry manifest v2/i);
});

test('family orchestration absorb note stays visible from docs and reference indexes', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const refsIndex = read('docs/references/README.md');
  const refsIndexZh = read('docs/references/README.zh-CN.md');
  const status = read('docs/status.md');
  const decisions = read('docs/decisions.md');
  const absorbNote = read('docs/references/family-orchestration-contract-absorb-crewai.md');

  for (const doc of [docsIndex, docsIndexZh, refsIndex, refsIndexZh, status]) {
    assert.match(doc, /family-orchestration-contract-absorb-crewai\.md/);
  }

  assert.match(decisions, /contract-first/);
  assert.match(decisions, /CrewAI/);
  assert.match(absorbNote, /不把 `CrewAI` 引入为 `OPL` family runtime dependency/);
  assert.match(absorbNote, /family event envelope/);
  assert.match(absorbNote, /family checkpoint lineage/);
  assert.match(absorbNote, /family action graph/);
  assert.match(absorbNote, /family human gate/);
  assert.match(absorbNote, /family product-entry manifest v2/);
});

test('top-level execution mainline is framed as frontdesk hardening plus conditional central sync follow-on', () => {
  const status = read('docs/status.md');
  const board = read('docs/references/opl-frontdesk-delivery-board.md');

  assert.match(status, /opl-frontdesk-delivery-board\.md/);
  assert.match(status, /opl-phase-2-central-reference-sync-board\.md/);
  assert.match(status, /front desk|frontdesk|hosted runtime hardening/i);
  assert.match(status, /central sync|中央同步/);

  assert.match(board, /docs\/status\.md/);
  assert.match(board, /contracts\/opl-gateway\/README\.md/);
  assert.match(board, /opl-phase-2-central-reference-sync-board\.md/);
  assert.match(board, /admitted-domain.*delta|central reference surfaces drift|中央 reference surface/);
  assert.match(board, /hosted runtime hardening|hosted hardening/i);
  assert.match(board, /locator|shared_handoff|domain-manifests/);
  assert.match(board, /下一条执行 issue|推荐下一条 issue/);
});

test('family direct-entry rollout references stay visible from status and docs indexes', () => {
  const status = read('docs/status.md');
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const refsIndex = read('docs/references/README.md');
  const refsIndexZh = read('docs/references/README.zh-CN.md');
  const familyArchitecture = read('docs/references/family-product-entry-and-domain-handoff-architecture.md');
  const rolloutBoard = read('docs/references/family-lightweight-direct-entry-rollout-board.md');

  for (const doc of [status, docsIndex, docsIndexZh, refsIndex, refsIndexZh]) {
    assert.match(doc, /family-lightweight-direct-entry-rollout-board\.md/);
  }

  assert.match(rolloutBoard, /OPL/);
  assert.match(rolloutBoard, /Med Auto Science/);
  assert.match(rolloutBoard, /RedCube AI/);
  assert.match(rolloutBoard, /Med Auto Grant/);
  assert.match(rolloutBoard, /论文配图以外的 research runtime 主线/);
  assert.match(rolloutBoard, /lightweight direct entry/);
  assert.match(familyArchitecture, /operator entry/);
  assert.match(familyArchitecture, /agent entry/);
  assert.match(familyArchitecture, /product entry/);
});

test('contract convergence execution board freezes the current unified program and phase-c behavior convergence plan', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const executionBoard = read('docs/references/contract-convergence-v1-execution-board.md');
  const statusMatrix = read('docs/references/ecosystem-status-matrix.md');
  const taskboard = read('docs/references/runtime-alignment-taskboard.md');
  const managedRuntimeReadiness = read('docs/references/managed-runtime-migration-readiness-checklist.md');
  const hermesBenchmark = read('docs/references/hermes-agent-runtime-substrate-benchmark.md');
  const longrunPlaybook = read('docs/references/omx-longrun-prompt-playbook.md');

  assert.match(docsIndex, /references\/contract-convergence-v1-execution-board\.md/);
  assert.match(docsIndexZh, /references\/contract-convergence-v1-execution-board\.md/);
  assert.match(docsIndex, /references\/hermes-agent-runtime-substrate-benchmark\.md/);
  assert.match(docsIndexZh, /references\/hermes-agent-runtime-substrate-benchmark\.md/);

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
  assert.match(hermesBenchmark, /Hermes Agent Runtime Substrate 对标与吸收清单/);
  assert.match(hermesBenchmark, /不是把 `OPL` 改写成另一个 `Hermes Agent`|不把 `OPL` 改写成另一个 `Hermes Agent`/);
  assert.match(hermesBenchmark, /也不是把 `OPL` 重新定位成“通用长期在线 agent 平台”|不改写成“通用长期在线 agent 平台”/);
  assert.match(hermesBenchmark, /runtime profile/);
  assert.match(hermesBenchmark, /session substrate/);
  assert.match(hermesBenchmark, /gateway owner process/);
  assert.match(hermesBenchmark, /memory tier contract/);
  assert.match(hermesBenchmark, /approval \/ interrupt \/ resume/);
  assert.match(hermesBenchmark, /redcube-ai/);
  assert.match(hermesBenchmark, /med-autogrant/);
  assert.match(hermesBenchmark, /med-autoscience/);

  for (const doc of [executionBoard, statusMatrix, taskboard, managedRuntimeReadiness, hermesBenchmark, longrunPlaybook]) {
    assert.doesNotMatch(doc, /workspace \/ operator quickstart convergence` 仍未被冻结/);
    assert.doesNotMatch(doc, /等待 `workspace \/ operator quickstart convergence`/);
    assert.doesNotMatch(doc, /判断这条 next line 是否能在当前 hard boundary 内被诚实冻结/);
  }
});

test('phase-1 public gateway docs distinguish CLI transport from the development host and future runtime substrate', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const discoveryGateway = read('docs/opl-read-only-discovery-gateway.md');
  const discoveryGatewayZh = read('docs/opl-read-only-discovery-gateway.zh-CN.md');
  const onboarding = read('docs/opl-domain-onboarding-contract.md');
  const onboardingZh = read('docs/opl-domain-onboarding-contract.zh-CN.md');

  for (const doc of [readme, readmeZh, discoveryGateway, discoveryGatewayZh]) {
    assert.match(doc, /Codex-only/i);
    assert.match(doc, /Hermes-Agent/);
  }

  assert.match(discoveryGateway, /legacy `Codex Host` \/ `OMX` split/i);
  assert.match(discoveryGatewayZh, /历史上的 `Codex Host` \/ `OMX` 分工/);
  assert.doesNotMatch(discoveryGateway, /At the development-control layer, `Codex Host` freezes planning and truth while `OMX` handles long-running execution/i);
  assert.doesNotMatch(discoveryGatewayZh, /在开发控制面上，`Codex Host` 负责规划冻结与真相裁决，`OMX` 负责在这些已冻结边界内做长时执行/);
  assert.match(readme, /preferred future substrate direction is a true upstream `Hermes-Agent` integration/i);
  assert.match(readmeZh, /优选的未来 substrate 方向.*上游 `Hermes-Agent` 集成/);
  assert.match(onboarding, /active execution path remains Codex-only/i);
  assert.match(onboardingZh, /当前活跃执行入口仍是 Codex-only/);
  assert.match(onboarding, /historical `Codex Host` \/ `OMX` migration discipline/i);
  assert.match(onboardingZh, /历史 `Codex Host` \/ `OMX` 迁移纪律/);
  assert.match(discoveryGateway, /does not grant route authority/i);
  assert.match(discoveryGatewayZh, /不授予 route authority/);
});

test('product-entry docs freeze the managed external-kernel choice instead of fork or user-managed install', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const status = read('docs/status.md');
  const decisions = read('docs/decisions.md');
  const architecture = read('docs/architecture.md');
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const refsIndex = read('docs/references/README.md');
  const refsIndexZh = read('docs/references/README.zh-CN.md');
  const runtimeContract = read('docs/shared-runtime-contract.md');
  const runtimeContractZh = read('docs/shared-runtime-contract.zh-CN.md');
  const decisionNote = read('docs/references/opl-product-entry-and-hermes-kernel-integration.md');
  const executorDefaults = read('docs/references/family-executor-adapter-defaults.md');
  const hermesProofLane = read('docs/references/hermes-native-executor-proof-lane.md');
  const familyEntryDoc = read('docs/references/family-product-entry-and-domain-handoff-architecture.md');
  const masCutoverBoard = read('docs/references/mas-top-level-cutover-board.md');

  assert.match(readme, /now ships a local direct product-entry shell/i);
  assert.match(readme, /external kernel, managed by OPL product packaging/i);
  assert.match(readme, /not requiring users to manually install and understand `Hermes-Agent`/i);
  assert.match(readme, /default front door is `opl`|`opl` now ships/i);
  assert.match(readme, /opl doctor[\s\S]*opl ask[\s\S]*opl chat[\s\S]*opl resume[\s\S]*opl sessions[\s\S]*opl logs[\s\S]*opl repair-hermes-gateway[\s\S]*opl web/i);
  assert.match(readme, /opl "<request\.\.\.>"|opl <request/i);
  assert.match(readme, /Domain Handoff -> Domain Product Entry \/ Domain Gateway/i);
  assert.match(readme, /local web front desk pilot|local web pilot/i);
  assert.match(readme, /hosted.*still not landed|hosted.*not ready/i);
  assert.match(readmeZh, /本地 direct product-entry shell/);
  assert.match(readmeZh, /external kernel, managed by OPL product packaging/);
  assert.match(readmeZh, /不要求用户先手工安装并理解 `Hermes-Agent`/);
  assert.match(readmeZh, /默认入口的本地 direct product-entry shell|以 `opl` 为默认入口|默认入口是 `opl`|默认前台命令就是 `opl`/);
  assert.match(readmeZh, /opl doctor[\s\S]*opl ask[\s\S]*opl chat[\s\S]*opl resume[\s\S]*opl sessions[\s\S]*opl logs[\s\S]*opl repair-hermes-gateway[\s\S]*opl web/);
  assert.match(readmeZh, /opl "<request\.\.\.>"|opl <request/i);
  assert.match(readmeZh, /Domain Handoff -> Domain Product Entry \/ Domain Gateway/);
  assert.match(readmeZh, /本地 web front desk pilot|本地 web pilot/);
  assert.match(readmeZh, /hosted.*仍未落地|hosted.*未完成/);

  assert.match(status, /当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell/);
  assert.match(status, /本地 web front desk pilot|本地 web pilot/);
  assert.match(status, /hosted \/ web 前台真相：.*仍未落地|hosted.*仍未完成/);
  assert.match(status, /Hermes Kernel Integration.*external kernel, managed by OPL product packaging/);
  assert.match(status, /家族级入口真相|operator entry.*agent entry.*product entry/);
  assert.match(status, /家族默认执行器.*Codex CLI autonomous.*Codex.*默认配置/);
  assert.match(status, /Hermes-native.*实验路线/);
  assert.match(status, /Hermes AIAgent.*完整.*agent loop|完整的 Hermes AIAgent/);
  assert.match(status, /不是.*chat relay|不是一步一步 chat/);
  assert.match(architecture, /opl front desk \/ quick ask \/ ops shell/i);
  assert.match(architecture, /User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter/);
  assert.match(architecture, /target_domain_id/);
  assert.match(architecture, /return_surface_contract/);
  assert.match(architecture, /Codex CLI autonomous.*Codex.*默认配置/);
  assert.match(architecture, /Hermes-native.*实验/);
  assert.match(architecture, /Hermes AIAgent.*agent loop|完整的 agent loop/);
  assert.match(architecture, /chat relay|一步一步 chat/);
  assert.match(decisions, /Codex CLI autonomous/);
  assert.match(decisions, /inherit_local_codex_default/);
  assert.match(decisions, /Hermes-native.*完整.*AIAgent.*agent loop|完整的 Hermes AIAgent/);

  assert.match(docsIndex, /opl-product-entry-and-hermes-kernel-integration\.md/);
  assert.match(docsIndexZh, /opl-product-entry-and-hermes-kernel-integration\.md/);
  assert.match(docsIndex, /family-product-entry-and-domain-handoff-architecture\.md/);
  assert.match(docsIndexZh, /family-product-entry-and-domain-handoff-architecture\.md/);
  assert.match(docsIndex, /family-executor-adapter-defaults\.md/);
  assert.match(docsIndexZh, /family-executor-adapter-defaults\.md/);
  assert.match(docsIndex, /hermes-native-executor-proof-lane\.md/);
  assert.match(docsIndexZh, /hermes-native-executor-proof-lane\.md/);
  assert.match(docsIndex, /mas-top-level-cutover-board\.md/);
  assert.match(docsIndexZh, /mas-top-level-cutover-board\.md/);
  assert.match(refsIndex, /opl-product-entry-and-hermes-kernel-integration\.md/);
  assert.match(refsIndexZh, /opl-product-entry-and-hermes-kernel-integration\.md/);
  assert.match(refsIndex, /family-product-entry-and-domain-handoff-architecture\.md/);
  assert.match(refsIndexZh, /family-product-entry-and-domain-handoff-architecture\.md/);
  assert.match(refsIndex, /family-executor-adapter-defaults\.md/);
  assert.match(refsIndexZh, /family-executor-adapter-defaults\.md/);
  assert.match(refsIndex, /hermes-native-executor-proof-lane\.md/);
  assert.match(refsIndexZh, /hermes-native-executor-proof-lane\.md/);
  assert.match(refsIndex, /mas-top-level-cutover-board\.md/);
  assert.match(refsIndexZh, /mas-top-level-cutover-board\.md/);

  assert.match(runtimeContract, /external kernel, managed by OPL product packaging/i);
  assert.match(runtimeContractZh, /external kernel, managed by OPL product packaging/);

  assert.match(decisionNote, /不 fork \/ vendor 上游 `Hermes-Agent` kernel 代码/);
  assert.match(decisionNote, /用户不需要手工维护一套“先会 Hermes 才能会 OPL”的流程/);
  assert.match(decisionNote, /平台内部运行 `Hermes` kernel/);
  assert.match(executorDefaults, /Codex CLI autonomous/);
  assert.match(executorDefaults, /inherit_local_codex_default/);
  assert.match(executorDefaults, /Hermes AIAgent/);
  assert.match(executorDefaults, /chat relay|一步一步 chat/);
  assert.match(hermesProofLane, /Codex CLI autonomous/);
  assert.match(hermesProofLane, /AIAgent/);
  assert.match(hermesProofLane, /\/v1\/runs/);
  assert.match(hermesProofLane, /chat relay|单次 `chat completion`/);
  assert.match(hermesProofLane, /skills|browser|delegate|memory|session/);
  assert.match(familyEntryDoc, /OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff/);
  assert.match(familyEntryDoc, /User -> Domain Product Entry -> Domain Gateway -> Hermes Kernel -> Domain Harness OS/);
  assert.match(familyEntryDoc, /mas-top-level-cutover-board\.md/);
  assert.match(masCutoverBoard, /display .*支线不混入这条主线|display 资产化单独开线/);
  assert.match(masCutoverBoard, /OPL -> Med Auto Science/);
});

test('phase-1 formal entry wording keeps OPL at the CLI-first gateway contract surface', () => {
  const roadmap = read('docs/roadmap.md');
  const roadmapZh = read('docs/roadmap.zh-CN.md');
  const publicSurfaceIndex = read('docs/opl-public-surface-index.md');
  const publicSurfaceIndexZh = read('docs/opl-public-surface-index.zh-CN.md');
  const gatewayContracts = read('contracts/opl-gateway/README.md');
  const gatewayContractsZh = read('contracts/opl-gateway/README.zh-CN.md');

  assert.match(roadmap, /formal entry.*TypeScript CLI.*gateway contract surface/i);
  assert.match(roadmapZh, /formal entry.*TypeScript CLI.*gateway contract surface/);
  assert.match(publicSurfaceIndex, /formal entry.*CLI-first \/ gateway contract surface/i);
  assert.match(publicSurfaceIndexZh, /formal entry.*CLI-first \/ gateway contract surface/);
  assert.match(gatewayContracts, /formal entry.*TypeScript CLI.*gateway contract surface/i);
  assert.match(gatewayContractsZh, /formal entry.*TypeScript CLI.*gateway contract surface/);
  assert.match(gatewayContracts, /Runtime ownership continues to stay with the admitted domains/i);
  assert.match(gatewayContractsZh, /runtime ownership 继续保留在 admitted domain 一侧/);
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
  assert.match(discovery, /already has a runnable local `TypeScript CLI`-first \/ gateway contract baseline/i);
  assert.match(discoveryZh, /已具备可运行的本地 `?TypeScript CLI`?-first \/ gateway contract baseline/);
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

  assert.match(readme, /shared runtime layer, hosted entry surfaces, and .*`Hermes-Agent` rollout/i);
  assert.match(readmeZh, /共享运行层、托管入口与任何真实的 `Hermes-Agent` 落地进度/);
  assert.match(roadmap, /shared-code extraction decisions downstream of domain maturity/i);
  assert.match(roadmapZh, /共享代码回抽决策继续放在 domain maturity 之后/);
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
    assert.match(doc, /handoff-ready|handoff readiness|domain handoff/i);
    assert.match(doc, /domain_gateway/i);
    assert.match(doc, /no-bypass|bypass/i);
  }

  for (const doc of [taskMapZh, backlogZh, onboardingZh, acceptanceZh]) {
    assert.match(doc, /Review Ops/);
    assert.match(doc, /execution_model|execution-model/);
    assert.match(doc, /discovery_readiness|discovery readiness/);
    assert.match(doc, /routing_readiness|routing readiness/);
    assert.match(doc, /cross_domain_wording|cross-domain wording/);
    assert.match(doc, /handoff-ready|handoff readiness|domain handoff|handoff 资格/);
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
    assert.match(doc, /handoff-ready|handoff readiness|domain handoff/i);
    assert.match(doc, /domain_gateway/i);
    assert.match(doc, /no-bypass|bypass/i);
  }

  for (const doc of [taskMapZh, backlogZh, onboardingZh, acceptanceZh]) {
    assert.match(doc, /Thesis Ops/);
    assert.match(doc, /execution_model|execution-model/);
    assert.match(doc, /discovery_readiness|discovery readiness/);
    assert.match(doc, /routing_readiness|routing readiness/);
    assert.match(doc, /cross_domain_wording|cross-domain wording/);
    assert.match(doc, /handoff-ready|handoff readiness|domain handoff|handoff 资格/);
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
  assert.match(closeout, /已具备可运行的本地 `?TypeScript CLI`?-first \/ gateway contract baseline/);
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
    assert.match(doc, /no-bypass|bypass/i);
    assert.doesNotMatch(doc, /pre-freeze/i);
  }

  assert.match(acceptance, /launcher/i);
  assert.match(routedAction, /launcher/i);
  assert.match(gatewayContracts, /planning-dependency layer|launcher/i);

  for (const doc of [acceptanceZh, routedActionZh, gatewayContractsZh]) {
    assert.match(doc, /planning gate|planning-level contract|planning dependency|规划 gate|planning-level/);
    assert.match(doc, /domain_gateway/);
    assert.match(doc, /不得绕过 domain gateway|绕过 domain gateway|只经过 domain gateway|no-bypass/);
    assert.doesNotMatch(doc, /预冻结/);
  }

  assert.match(acceptanceZh, /launcher/);
  assert.match(routedActionZh, /launcher/);
  assert.match(gatewayContractsZh, /planning dependency 层|launcher/);
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
  assert.match(matrix, /formal entry.*TypeScript CLI \+ gateway contract baseline/);
  assert.match(matrix, /CURRENT_MAXIMUM_REACHED_AND_ABSORBED_TO_MAIN|honest stop/i);
  assert.match(taskboard, /状态锚点：`?2026-04-11`?/);
  assert.match(taskboard, /G2 stable public baseline/);
  assert.match(taskboard, /G3 thin handoff planning/);
  assert.match(taskboard, /Minimal admitted-domain federation activation package/);
  assert.match(taskboard, /Review Ops -> Thesis Ops/);
  assert.match(taskboard, /formal entry contract.*TypeScript CLI.*gateway contract surface/);
  assert.match(taskboard, /honest stop/i);
});

test('owner-line brief freezes the current central reference convergence lane', () => {
  const ownerLine = read('docs/references/opl-phase2-ecosystem-sync-owner-line.md');

  assert.match(ownerLine, /状态锚点：`?2026-04-13`?/);
  assert.match(ownerLine, /machine-readable \/ repo-tracked truth/);
  assert.match(ownerLine, /c124c5d/);
  assert.match(ownerLine, /product frontdesk/);
  assert.match(ownerLine, /federated product entry/);
  assert.match(ownerLine, /待吸收默认执行器|pilot prep/);
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
    assert.match(doc, /already admitted domains only|admitted domain surfaces|covers the two admitted surfaces/i);
    assert.match(doc, /TypeScript CLI.*gateway contract surface|CLI-first \/ gateway contract surface|CLI-first \/ gateway contract baseline/i);
  }

  for (const doc of [readmeZh, roadmapZh, publicSurfaceIndexZh, gatewayContractsZh, rolloutZh]) {
    assert.match(doc, /Minimal admitted-domain federation activation package/);
    assert.match(doc, /MedAutoScience/);
    assert.match(doc, /RedCube AI/);
    assert.match(doc, /仅面向已 admitted domain|只面向已 admitted domain|至少两个 admitted domain surface|两条 admitted domain surface|已 admitted domain surface|当前只覆盖上面两条已 admitted domain surface/);
    assert.match(doc, /TypeScript CLI.*gateway contract surface|CLI-first \/ gateway contract surface|CLI-first \/ gateway contract baseline/);
  }

  assert.match(gatewayContracts, /Runtime ownership continues to stay with the admitted domains/i);
  assert.match(gatewayContractsZh, /runtime ownership 继续保留在 admitted domain 一侧/);

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

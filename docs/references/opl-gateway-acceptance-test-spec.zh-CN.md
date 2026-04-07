[English](./opl-gateway-acceptance-test-spec.md) | **中文**

# OPL Gateway Acceptance Test Spec

## 目的

这份文档冻结当前 `OPL Gateway` 文档/合同体系的 acceptance / test-spec。

它的作用是：让 gateway 的推进变成“可检查”，而不是每次都重新解释一遍架构。

目标不是 runtime verification。
目标是 contract verification、wording verification、routing-safety verification，以及 federation-boundary verification。

## 范围

这份 acceptance spec 覆盖：

- `G1` 机器可读 registry / handoff 完整性
- `G2` 只读 discovery 正确性
- `G3` routed action 安全性
- domain onboarding gate 完整性
- `P5.M1` governance / audit operating surface 完整性
- `P5.M2` publish / promotion operating surface 完整性
- `P7` example corpus 完整性
- `P8` public surface index 完整性
- `P10` routed-safety example 完整性
- `P12` operating example 完整性
- `P13` operating-record-catalog 完整性
- `P14` surface lifecycle map 完整性
- `P15` surface authority matrix 完整性
- `P16` surface review matrix 完整性
- `P17` task-topology 完整性
- `P18` candidate-domain backlog 完整性
- `P23.M4 / G4` candidate-index rollout boundary 完整性
- 各公开表面之间的 cross-domain wording consistency

## 上位依据

下面这些文档与工件构成此 acceptance spec 的依据：

- [README](../../README.zh-CN.md)
- [OPL Federation Contract](../opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](../opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](../opl-public-surface-index.zh-CN.md)
- [OPL 任务版图](../task-map.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Gateway 落地路线](./opl-gateway-rollout.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)
- [`acceptance-matrix.json`](../../contracts/opl-gateway/acceptance-matrix.json)

## 配套参考 Surfaces

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.zh-CN.md)
- [OPL Operating Record Catalog](./opl-operating-record-catalog.zh-CN.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.zh-CN.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.zh-CN.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.zh-CN.md)

这些配套 surface 只承担 illustrative 或 reference-only 角色。gateway corpus 展示跨层组合；operating corpus 把独立的 `P5.M1` / `P5.M2` record materialize 成 example；operating-record catalog 集中索引全部已冻结 record kind；lifecycle map 把这些已冻结 surface 之间的 dependency / discoverability graph 显式化；authority matrix 则把 routing / execution / truth / review / publication ownership boundary 显式化，同时不变成 authorization engine；review matrix 则把 human-review / acceptance / companion-surface / publishability-stage obligation 显式化，同时不变成 approval engine 或 publish controller；candidate-domain backlog 则把 pre-onboarding 阶段仍缺的边界材料显式记录出来，同时不提前收录 domain、也不创造 routed readiness。它们帮助人类与 Agent 理解已冻结 surface，但不替代上面的 contracts 与 acceptance gates。

## A. G1 Registry Completeness

### 验收标准

`G1` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/workstreams.json` 存在，且是合法 JSON。
2. `contracts/opl-gateway/domains.json` 存在，且是合法 JSON。
3. `contracts/opl-gateway/routing-vocabulary.json` 存在，且是合法 JSON。
4. `contracts/opl-gateway/handoff.schema.json` 存在，且是合法 JSON Schema JSON。
5. workstream registry 显式编码了：
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
6. domain registry 显式保持 canonical truth 留在各自 domain，而不在 `OPL`。
7. routing vocabulary 显式包含顶层 routing order 与 special-case family handling。
8. handoff schema 定义的是从 OPL 到 domain gateway 的冻结 payload，而不是授权直接 targeting harness。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/` 下所有 JSON / schema 文件。
- 检查 `workstreams.json`、`domains.json`、`routing-vocabulary.json` 与 `handoff.schema.json` 中的必需映射和边界字段。
- 确认 contract README 将该目录描述为 machine-readable contract materialization，而不是 runtime。

## B. G2 Discovery Correctness

### 验收标准

`G2` 只有在下面全部成立时才算通过：

1. discovery contract 定义了：
   - `list_workstreams`
   - `get_workstream`
   - `list_domains`
   - `get_domain`
   - `list_surfaces`
   - `get_surface`
   - `resolve_request_surface`
   - `explain_domain_boundary`
2. `G2` discovery 被显式写成 read-only。
3. `G2` 显式**不**负责：
   - 创建 deliverable
   - 修改 workspace
   - 启动 run
   - 绕过 domain gateway
   - 拥有 canonical runtime truth
4. `resolve_request_surface` 明确建立在已冻结的 G1 registries 与 routing vocabulary 之上。
5. `xiaohongshu` 可以解析到 `redcube`，但不能被自动标记成 `presentation_ops`。
6. 当前 `Phase 1` CLI baseline 以 machine-readable help / validation / discovery output 暴露这些能力，而不是退回 prose-only transport。

### 验证方式

- 检查 `docs/opl-read-only-discovery-gateway.md` 与 `.zh-CN.md` 中的必需操作和非目标。
- 检查 `list_surfaces` / `get_surface` 的操作定义与 CLI transport 命令说明。
- 验证 discovery 文档反向链接到机器可读 G1 工件。
- 验证 discovery wording 没有把 `G2` 提升成 mutation surface。

## C. G3 Routing Safety

### 验收标准

`G3` 只有在下面全部成立时才算通过：

当前 `Phase 1` 里，这里是 planning gate，不是 runtime gate。当前 `G3` surface 仍只是 planning-level contract，`routed-actions.schema.json` 仍只是 planning dependency，而不是 launcher。

1. routed action contract 定义了：
   - `route_request`
   - `build_handoff_payload`
   - `audit_routing_decision`
2. `route_request` 支持显式未决状态：
   - `refused`
   - `unknown_domain`
   - `ambiguous_task`
3. `build_handoff_payload` 的目标只能是 `domain_gateway`。
4. routed contract 明确禁止绕过 domain gateway 直接调用 harness。
5. 机器可读 routed-action schema 与公开 G3 文档保持一致。
6. routing evidence 保持显式、可审计，而不是藏在 best-effort wording 后面。
7. 当前文档把 `G3` 限定为 planning-only 的 thin handoff contract wording，而不是当前已激活的 mutation runtime。

### 验证方式

- 解析 `contracts/opl-gateway/routed-actions.schema.json`。
- 检查 `docs/opl-routed-action-gateway.md` 与 `.zh-CN.md` 中的全部必需操作和失败状态。
- 用 `rg` 检查 planning gate / planning-level contract / planning dependency wording，并确认 routed-action prose 仍不是 launcher。
- 用 `rg` 检查 no-bypass wording，并确认它被写成硬规则，而不是偏好建议。

## D. Domain Onboarding Gate

### 验收标准

onboarding gate 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/domain-onboarding-readiness.schema.json` 存在，且是合法 JSON Schema JSON。
2. `examples/opl-gateway/domain-onboarding-readiness.json` 存在，且能通过该 schema 校验。
3. onboarding contract 要求新 domain 提供完整 `G1` registry material。
4. onboarding contract 要求显式 public documentation surface。
5. onboarding contract 要求显式 truth-ownership declaration。
6. onboarding contract 要求显式 review surface。
7. onboarding contract 要求显式 discovery-readiness declaration，且 discovery 继续只指向 `domain_gateway`，不会提前暗示 handoff readiness。
8. onboarding contract 要求显式 routing-readiness declaration，且 `domain_gateway` 继续是唯一 successful target，并保留 no-bypass 规则。
9. onboarding contract 要求显式 cross-domain wording material，使 OPL/domain 角色语言可以被直接审查。
10. onboarding contract 定义了正式收录门槛，覆盖：
   - registry complete
   - boundary explicit
   - truth ownership explicit
   - discovery ready
   - routing ready
   - review ready
   - execution model aligned
   - cross-domain wording aligned
11. onboarding contract 保持 non-executing、不会自动收录 domain，也不会替代 prose review gate。
12. onboarding contract 显式禁止“先挂名，后补边界”。
13. onboarding contract 显式禁止把未来 domain 写成 `OPL` 内部模块。
14. 像 `Grant Foundry -> Med Auto Grant` 这样的 signal-only scaffold，本身不能满足 admission、discovery readiness 或 routing readiness。

### 验证方式

- 解析 `contracts/opl-gateway/domain-onboarding-readiness.schema.json`，并用 `examples/opl-gateway/domain-onboarding-readiness.json` 校验它。
- 检查 `docs/opl-domain-onboarding-contract.md` 与 `.zh-CN.md` 是否覆盖全部 required gate。
- 确认 onboarding gate 建立在 G1/G2/G3 之后，而不是替代它们。
- 确认 onboarding contract 没有把 canonical truth 上收给 `OPL`。

## E. P5.M1 Governance / Audit Operating-Surface Integrity

### 验收标准

`P5.M1` 只有在下面全部成立时才算通过：

1. `docs/references/opl-governance-audit-operating-surface.md` 与 `.zh-CN.md` 存在。
2. `contracts/opl-gateway/governance-audit.schema.json` 存在，且是合法 JSON Schema JSON。
3. governance / audit surface 只允许这些顶层 record kind：
   - `routing_audit`
   - `governance_decision`
   - `publish_readiness_signal`
   - `cross_domain_review_index`
4. governance / audit 文档与 schema 把 `OPL` 保持在 index/signal 层，而不是 runtime truth、review truth 或 publish truth owner。
5. 机器可读 governance / audit envelope 仍然要求 `domain_truth_refs` 必须存在。
6. governance schema 保持 kind-specific record 显式分离，并且不允许 `decision_source = opl_gateway`。
7. `publish_readiness_signal` 仍被显式写成不等于 publication、submission、release、export 或 domain approval truth。
8. governance / audit wording 仍然禁止绕过 domain gateway 去直接碰 harness。

### 验证方式

- 解析 `contracts/opl-gateway/governance-audit.schema.json`。
- 检查 `docs/references/opl-governance-audit-operating-surface.md` 与 `.zh-CN.md` 中的 allowed record kind 和 no-truth-shift wording。
- 确认 schema 使用了 kind-specific discrimination，且 `decision_source` 不包含 `opl_gateway`。
- 确认 governance / audit wording 仍然位于 routed action 之后，而没有重新发明执行 runtime。

## F. P5.M2 Publish / Promotion Operating-Surface Integrity

### 验收标准

`P5.M2` 只有在下面全部成立时才算通过：

1. `docs/references/opl-publish-promotion-operating-surface.md` 与 `.zh-CN.md` 存在。
2. `contracts/opl-gateway/publish-promotion.schema.json` 存在，且是合法 JSON Schema JSON。
3. publish / promotion surface 显式声明：只有在 domain-owned publish / release / export / submission outcome 已经存在之后，它才开始生效。
4. publish / promotion 文档与 schema 只允许这些顶层 record kind：
   - `publish_outcome_index`
   - `promotion_candidate_signal`
   - `promotion_surface_index`
5. publish / promotion 文档与 schema 把 `OPL` 保持在 index/signal 层，而不是 publish truth、release truth、export truth、submission truth 或 public-channel posting truth owner。
6. 机器可读 publish / promotion envelope 仍然要求 `domain_truth_refs` 必须存在。
7. publish / promotion wording 仍然禁止 direct venue submission、direct export/release、direct public posting，以及 direct harness bypass。
8. `P5.M1 -> P5.M2` 的边界仍然显式成立：readiness 留在 `P5.M1`；post-publish indexing 与 promotion signaling 留在 `P5.M2`。

### 验证方式

- 解析 `contracts/opl-gateway/publish-promotion.schema.json`。
- 检查 `docs/references/opl-publish-promotion-operating-surface.md` 与 `.zh-CN.md` 中的 post-publish boundary 和 no-truth-shift wording。
- 确认 schema 保持 kind-specific record 显式分离，且 `domain_truth_refs` 仍为 mandatory。
- 确认 publish / promotion wording 没有把 `OPL` 变成 venue-submission runtime 或 public-channel posting runtime。

## G. Cross-Domain Wording Consistency

### 验收标准

wording-consistency gate 只有在下面全部成立时才算通过：

1. `OPL` 的公开表面都把 `OPL` 写成 top-level gateway / federation surface。
2. `OPL` 的公开表面**不会**把 `OPL` 写成：
   - 所有 runtime 行为都已经落在这里
   - domain gateway 的替代品
   - 单体 runtime
3. `MedAutoScience` 仍被写成 active 的 `Research Ops` domain gateway 与 harness。
4. `RedCube AI` 仍被写成视觉交付 / 承接 `Presentation Ops` 的 domain gateway 与 harness。
5. `ppt_deck` 仍被显式写成直接映射 `Presentation Ops`。
6. `xiaohongshu` 在 OPL 顶层仍被显式写成不自动等于 `Presentation Ops`。
7. 任何公开 wording 都不能把 domain 项目降格成 OPL 的私有实现细节。
8. governance / audit wording 仍然保持 index-only，而不是 runtime-owning。
9. publish / promotion wording 仍然保持 index-only，而不是 publish-owning 或 promotion-owning。
10. `docs/operating-model*`、`docs/shared-foundation*` 与 `docs/shared-foundation-ownership*` 都必须把 `OPL` 保持在顶层语义 / 索引 / 复用规则层，而不能把它写成单体 runtime、共享 truth store，或 domain review/publication truth owner。
11. 四个 G4 candidate index —— `shared asset index`、`shared memory index`、`shared domain registry`、`shared publication / delivery catalog` —— 在后续显式合同与 acceptance alignment 冻结 readiness boundary 之前，仍然只是 roadmap-only / future-only / reference-only / non-admitting candidate。
12. 任何公开 wording 都不能把这些 G4 candidate index 升格成当前的 public-entry、discovery-ready、routed-action-ready、execution、truth-owner、approval、publish-control 或 release-control surface。

### 验证方式

- 阅读 `../README.md`、`../README.zh-CN.md`、`docs/roadmap*.md`、`docs/operating-model*`、`docs/shared-foundation*`、`docs/shared-foundation-ownership*` 与相关 gateway 文档。
- 用定向 `rg` 检查废弃 wording 与必需的 domain-role wording。
- 用定向 `rg` 检查 rollout / acceptance wording 中四个 G4 candidate index 的表述，确认它们保持 roadmap-only / future-only / reference-only / non-admitting 边界，而没有被写成当前的 public-entry / discovery-ready / routed-action-ready / execution / truth-owner / approval / publish-control / release-control surface。
- 将 OPL 仓库中的公开 wording 与 `med-autoscience`、`redcube-ai`、`gaofeng21cn` 的 README 做交叉核对。

## H. P7 Example Corpus 完整性

### 验收标准

`P7` 只有在下面全部成立时才算通过：

1. `docs/references/opl-gateway-example-corpus.md` 与 `.zh-CN.md` 存在。
2. `examples/opl-gateway/research-ops-submission.json` 与 `examples/opl-gateway/presentation-ops-publish.json` 存在，且是合法 JSON。
3. example corpus 文档显式保持 illustrative、non-governing、non-executing 边界。
4. research example 显式保持：
   - `research_ops -> medautoscience`
   - `entry_surface = domain_gateway`
   - 受 schema 约束的 routing / handoff / governance / publish record 与已冻结 contracts 一致
5. presentation example 显式保持：
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
6. example records 仍把 domain truth 留在各自 domain，而不是上收给 `OPL`。
7. example corpus 不暗示 runtime execution、direct harness targeting，或凌驾于已冻结 contracts 之上的新 governing layer。

### 验证方式

- 使用 `json.load` 解析 example JSON 文件。
- 用已冻结的 routed-action、governance/audit、publish/promotion schemas 校验受约束的 example 子对象。
- 检查 example-corpus 文档中的 illustrative / non-governing / no-runtime wording。
- 确认 examples 保留 `ppt_deck` / `xiaohongshu` 的特殊边界。

## I. P8 Public Surface Index 完整性

### 验收标准

`P8` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/public-surface-index.json` 存在，且是合法 JSON。
2. `docs/opl-public-surface-index.md` 与 `.zh-CN.md` 存在。
3. public surface index 显式保持 machine-readable、non-executing。
4. public surface index 显式区分：
   - OPL-owned public-entry / contract / supporting surfaces
   - domain-owned public-entry surfaces
5. 这个 index 只链接 domain public-entry surface，而不索引 harness internals、runtime launch surface，或 domain canonical-truth registry。
6. 这个 index 保持当前已冻结映射：
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` 直接映射到 `presentation_ops`
   - `xiaohongshu` 可路由到 `redcube`，但不自动等于 `presentation_ops`
7. 这个 index 恰好暴露一个 `opl_candidate_domain_backlog` entry，并把它标成 `opl_supporting_surface`，且明确它位于 onboarding gate 之下。
8. 这个 index 还会各自恰好暴露一个 `opl_operating_model`、`opl_shared_foundation` 与 `opl_shared_foundation_ownership` entry，并把它们保持为 OPL-owned 的 contract/reference surface。
9. 被链接的 README / roadmap / federation / rollout / contract-hub wording 不会把 public surface index 升格成 launcher、runtime registry、truth-owner surface，或 admission-approval surface。
10. 在后续显式 readiness contract 冻结之前，当前 public-surface index 里不会出现 `shared asset index`、`shared memory index`、`shared domain registry` 或 `shared publication / delivery catalog` 的占位式 / current surface。
11. 当前 public-surface index 不会把任何 G4 candidate index materialize 成 public-entry、discovery-ready、routed-action-ready、execution、truth-owner、approval、publish-control 或 release-control surface。

### 验证方式

- 解析 `contracts/opl-gateway/public-surface-index.json`。
- 检查 category 引用、`routes_to` 目标，以及本地 `repo_path` refs 的结构完整性。
- 检查 `docs/opl-public-surface-index.md` 与 `.zh-CN.md` 中的 no-runtime / no-truth-shift / no-internal-module wording。
- 确认 `surfaces[*].surface_id` 保持唯一，且 `opl_candidate_domain_backlog` 恰好以 supporting/reference surface 身份出现，而不是 admitted domain 或 execution surface；同时 `opl_operating_model`、`opl_shared_foundation` 与 `opl_shared_foundation_ownership` 也都各自恰好出现一次，并保持为 OPL-owned 的 contract/reference surface。
- 确认当前 public-surface index 不会把 `shared asset index`、`shared memory index`、`shared domain registry` 或 `shared publication / delivery catalog` materialize 成任何当前 surface entry。
- 验证被接入的 OPL public surface 确实在应有位置链接到 public-surface index。

## J. P10 Routed-Safety Example 完整性

### 验收标准

`P10` 只有在下面全部成立时才算通过：

1. `docs/references/opl-routed-safety-example-corpus.md` 与 `.zh-CN.md` 存在。
2. `examples/opl-gateway/ambiguous-task-routing.json`、`unknown-domain-routing.json` 与 `refusal-routing.json` 存在，且是合法 JSON。
3. 每个 routed-safety example 都保持在 routed boundary 之下：
   - 不生成 `build_handoff_payload`
   - 不暗示 hidden best-effort reroute
   - 不把 domain truth 上收给 `OPL`
4. ambiguous-task example 保持 `candidate_workstreams` / `candidate_domains` 显式存在，不发明 resolved owner。
5. unknown-domain example 保持 unowned workstream 显式可见，不把请求强行塞进现有 domain。
6. refusal example 保持顶层 refusal reason 显式存在，不把 direct-harness bypass 淡化成 routed outcome。
7. routed-safety 文档与被链接 surface 仍把这组 corpus 写成 illustrative、non-governing、non-executing。

### 验证方式

- 使用 `json.load` 解析 routed-safety example JSON 文件。
- 用已冻结 schemas 校验其中的 routed-action 与 governance-audit 子对象。
- 检查 `docs/references/opl-routed-safety-example-corpus.md` 与 `.zh-CN.md` 中的 no-runtime / no-fallback / no-truth-shift wording。
- 确认 public-surface index 与 routed-action 文档在应有位置链接到 routed-safety corpus。

## K. P12 Operating Example 完整性

### 验收标准

`P12` 只有在下面全部成立时才算通过：

1. `docs/references/opl-operating-example-corpus.md` 与 `.zh-CN.md` 存在。
2. 六个独立 operating example 文件存在，且是合法 JSON：
   - `examples/opl-gateway/governance-decision-record.json`
   - `examples/opl-gateway/cross-domain-review-index.json`
   - `examples/opl-gateway/publish-readiness-signal.json`
   - `examples/opl-gateway/publish-outcome-index.json`
   - `examples/opl-gateway/promotion-candidate-signal.json`
   - `examples/opl-gateway/promotion-surface-index.json`
3. governance 侧 example 直接通过 `contracts/opl-gateway/governance-audit.schema.json` 校验。
4. publish / promotion 侧 example 直接通过 `contracts/opl-gateway/publish-promotion.schema.json` 校验。
5. operating-example corpus 文档显式保持 illustrative、non-governing、non-executing。
6. governance / audit 与 publish / promotion 文档都把该 corpus 指向为 canonical 的独立 machine-readable example surface。
7. contract hub、public-surface index 与 acceptance surface 都把该 corpus 暴露为 supporting surface，而不是 runtime。
8. examples 继续把 review、publish 与 promotion truth 留在 domain 内部，并把任何 follow-on action 保持在 `domain_gateway` 之后。
9. 该 corpus 不授权 `OPL` 直接执行 publish、release、export、submission 或 public posting。

### 验证方式

- 使用 `json.load` 解析六个 operating-example JSON 文件。
- 用 `governance-audit.schema.json` 校验三个 governance 侧 example，用 `publish-promotion.schema.json` 校验三个 publish 侧 example。
- 检查 `docs/references/opl-operating-example-corpus.md` 与 `.zh-CN.md` 中的 illustrative / non-governing / non-executing wording。
- 确认 governance / audit 文档、publish / promotion 文档、contract README、public-surface index 与 acceptance spec 都在应有位置链接到该 corpus。

## L. P13 Operating-Record-Catalog 完整性

### 验收标准

`P13` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/operating-record-catalog.json` 存在，且是合法 JSON。
2. `docs/references/opl-operating-record-catalog.md` 与 `.zh-CN.md` 存在。
3. catalog 覆盖全部已冻结 operating record kind：
   - `routing_audit`
   - `governance_decision`
   - `publish_readiness_signal`
   - `cross_domain_review_index`
   - `publish_outcome_index`
   - `promotion_candidate_signal`
   - `promotion_surface_index`
4. 每个 catalog entry 都保持 reference-level，并且只携带 `surface_layer`、`stage_boundary`、`truth_mode`、`schema_ref`、`example_refs`、`follow_on_route_surface` 这类 derived boundary field。
5. 每个 `schema_ref` 与每个 `example_ref` 都能解析到存在的本地工件。
6. 只要存在 follow-on domain action，catalog 都把 `domain_gateway` 保持为唯一 allowed route surface。
7. catalog 保持 non-executing，不会升级成 runtime manifest，也不会凌驾于 frozen schema/docs/examples 之上成为第二真相源。
8. contract README、public-surface index 与 acceptance surface 都把该 catalog 暴露为 supporting/reference surface，而不是 execution surface。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/operating-record-catalog.json`。
- 确认 catalog 覆盖且只覆盖已冻结 `P5.M1` / `P5.M2` record kind。
- 检查每个 `schema_ref` 与 `example_ref` 是否都能解析到存在的本地工件。
- 检查 `docs/references/opl-operating-record-catalog.md` 与 `.zh-CN.md` 中的 non-executing / no-truth-shift / domain_gateway-only wording。
- 确认 contract hub、public-surface index、governance/publish 文档与 acceptance surface 都在应有位置链接到该 catalog。

## M. P14 Surface-Lifecycle-Map 完整性

### 验收标准

`P14` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/surface-lifecycle-map.json` 存在，且是合法 JSON。
2. `docs/references/opl-surface-lifecycle-map.md` 与 `.zh-CN.md` 存在。
3. lifecycle map 恰好覆盖下面这些当前已冻结 surface：
   - `opl_operating_model`
   - `opl_shared_foundation`
   - `opl_shared_foundation_ownership`
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_candidate_domain_backlog`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_public_surface_index_doc`
   - `opl_gateway_acceptance_spec`
4. 每个 lifecycle entry 都保持 derived/reference-only，并且只携带 `layer_id`、`control_mode`、`truth_mode`、`requires_surfaces`、`enables_surfaces`、`follow_on_route_surface`、`governing_refs` 这类 surface-boundary field。
5. 每个 `requires_surfaces` 与 `enables_surfaces` 目标都能解析到同一个 lifecycle map 中的已知 entry。
6. lifecycle map 覆盖的每个 `surface_id` 都同时存在于 `contracts/opl-gateway/public-surface-index.json` 中。
7. 每个 `governing_ref` 都能解析到存在的本地工件。
8. `follow_on_route_surface` 始终只能是 `null` 或 `domain_gateway`。
9. lifecycle map 保持 non-executing，不会升级成 workflow engine、transition authority，也不会升级成第二真相源或 runtime manifest。
10. contract README、public-surface index、operating-record catalog 与 acceptance surface 都把 lifecycle map 暴露为 supporting/reference surface，而不是 execution surface。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/surface-lifecycle-map.json`。
- 确认 lifecycle map 覆盖且只覆盖上面这组已冻结 surface。
- 检查每个 `requires_surfaces` / `enables_surfaces` 目标都能在同一个 map 内解析，且每个 `governing_ref` 都能本地解析。
- 确认每个 entry 都满足 `follow_on_route_surface in {null, domain_gateway}`。
- 确认 contract hub、public-surface index、operating-record catalog 与 acceptance surface 都在应有位置链接到 lifecycle map。

## N. P15 Surface-Authority-Matrix 完整性

### 验收标准

`P15` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/surface-authority-matrix.json` 存在，且是合法 JSON。
2. `docs/references/opl-surface-authority-matrix.md` 与 `.zh-CN.md` 存在。
3. authority matrix 恰好覆盖下面这组当前 authority-review surface：
   - `opl_operating_model`
   - `opl_shared_foundation`
   - `opl_shared_foundation_ownership`
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_candidate_domain_backlog`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_surface_lifecycle_map`
   - `opl_public_surface_index_doc`
   - `opl_gateway_acceptance_spec`
   - `medautoscience_public_gateway`
   - `redcube_public_gateway`
4. 每个 matrix entry 都保持 derived/reference-only，并且只携带 `owner_scope`、`surface_role`、`route_authority`、`execution_authority`、`truth_authority`、`review_authority`、`publication_authority`、`allowed_follow_on_surface`、`forbidden_actions`、`governing_refs` 这类 authority-boundary field。
5. 每个 `governing_ref` 都能解析到存在的本地工件。
6. authority matrix 覆盖的每个 `surface_id` 都同时存在于 `contracts/opl-gateway/public-surface-index.json` 中。
7. 对每个 OPL-owned entry 来说，`execution_authority`、`truth_authority`、`review_authority` 与 `publication_authority` 都必须保持为 `none`。
8. linked domain public-entry surface 仍保持 `owner_scope = domain`，并保留 domain-local routing/execution/truth/review/publication authority。
9. `allowed_follow_on_surface` 始终只能是 `null` 或 `domain_gateway`。
10. contract README、lifecycle map 文档、public-surface index 与 acceptance surface 都把 authority matrix 暴露为 supporting/reference surface，而不是 authorization 或 execution surface。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/surface-authority-matrix.json`。
- 确认 authority matrix 覆盖且只覆盖上面这组已冻结 surface。
- 检查每个 `governing_ref` 都能本地解析，且每个 `surface_id` 都出现在 public-surface index 中。
- 确认每个 OPL-owned entry 都满足 `execution_authority = truth_authority = review_authority = publication_authority = none`。
- 确认 linked domain public-entry entry 仍保持 domain-owned，且每个 entry 都满足 `allowed_follow_on_surface in {null, domain_gateway}`。
- 确认 contract hub、lifecycle map 文档、public-surface index 与 acceptance surface 都在应有位置链接到 authority matrix。

## O. P16 Surface-Review-Matrix 完整性

### 验收标准

`P16` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/surface-review-matrix.json` 存在，且是合法 JSON。
2. `docs/references/opl-surface-review-matrix.md` 与 `.zh-CN.md` 存在。
3. surface review matrix 精确覆盖当前这些 human-review surface：
   - `opl_public_readme`
   - `opl_roadmap`
   - `opl_gateway_rollout`
   - `opl_task_map`
   - `opl_operating_model`
   - `opl_shared_foundation`
   - `opl_shared_foundation_ownership`
   - `opl_federation_contract`
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_surface_lifecycle_map`
   - `opl_surface_authority_matrix`
   - `opl_public_surface_index_doc`
   - `opl_candidate_domain_backlog`
   - `opl_gateway_acceptance_spec`
4. 每个 review entry 都保持 derived/reference-only，只携带 review-boundary 字段，例如 `owner_scope`、`surface_role`、`human_review_required`、`required_acceptance_gates`、`required_companion_surfaces`、`cross_domain_wording_check`、`publishability_stage` 与 `governing_refs`。
5. 每个 `required_acceptance_gate` 都能在 `contracts/opl-gateway/acceptance-matrix.json` 中解析。
6. 每个 `required_companion_surface` 都能在 `contracts/opl-gateway/public-surface-index.json` 中解析。
7. review matrix 覆盖的每个 `surface_id` 都存在于 `contracts/opl-gateway/public-surface-index.json` 中，且 `review_entries[*].surface_id` 保持唯一。
8. 每个 `governing_ref` 都能解析到存在的本地工件。
9. 对全部已覆盖 OPL-owned surface，`human_review_required` 都保持 `true`。
10. review matrix 保持 non-executing，不会变成 approval engine、publish controller 或 release engine，也不会把 domain review / publication authority 上收给 `OPL`。
11. contract README、public-surface index、lifecycle map docs、authority matrix docs、acceptance surfaces 与 candidate-backlog docs 都把 review matrix 暴露成 supporting/reference surface，而不是 approval surface 或 execution surface。

### 验证方式

- 使用 `json.load` 解析 `contracts/opl-gateway/surface-review-matrix.json`。
- 确认 review matrix 精确覆盖上面列出的冻结 surface 集合。
- 检查每个 `required_acceptance_gate` 都能在当前 acceptance matrix 中解析，每个 `required_companion_surface` 都能在当前 public-surface index 中解析，`review_entries[*].surface_id` 保持唯一，且每个 `governing_ref` 都能在本地解析。
- 确认所有已覆盖 OPL surface 都保持 `human_review_required = true`。
- 确认 contract hub、public-surface index、lifecycle map docs、authority matrix docs 与 acceptance surfaces 按预期链接 review matrix。

## P. P17 Task-Topology 完整性

### 验收标准

`P17` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/task-topology.json` 存在，且是合法 JSON。
2. `docs/task-map.md` 与 `docs/task-map.zh-CN.md` 都存在，且都链接到 machine-readable task-topology 工件。
3. task-topology 工件精确覆盖这些 workstream：
   - `research_ops`
   - `grant_ops`
   - `thesis_ops`
   - `review_ops`
   - `presentation_ops`
4. `research_ops` 仍保持 `registry_state = registered`、`routing_state = domain_gateway_ready`、`current_domain_id = medautoscience`、`entry_surface = domain_gateway`。
5. `presentation_ops` 仍保持 `registry_state = registered`、`routing_state = domain_gateway_ready`、`current_domain_id = redcube`、`entry_surface = domain_gateway`。
6. `grant_ops`、`thesis_ops`、`review_ops` 都仍保持 `boundary_state = under_definition`、`registry_state = not_registered`、`routing_state = unknown_domain_only`、`current_domain_id = null`、`entry_surface = null`。
7. `presentation_ops` 保持 `ppt_deck` 为 direct map，同时把 `xiaohongshu` 留在同一 RedCube family/harness 语境里，但不自动等同于 `presentation_ops`。
8. `contracts/opl-gateway/workstreams.json` 与 `domains.json` 仍只注册当前已收录 workstream / domain；task-topology 工件不会悄悄扩张 G1 registry。
9. `contracts/opl-gateway/public-surface-index.json` 把 `opl_task_map` 暴露成 `opl_public_entry` surface。
10. `contracts/opl-gateway/surface-review-matrix.json` 覆盖 `opl_task_map`，但不会把 task topology 变成 approval、onboarding、discovery 或 routing engine。
11. `contracts/opl-gateway/candidate-domain-backlog.json` 仍与同一组 under-definition workstream 对齐，不会发明 admitted domain 或 routed-ready entry surface。
12. contract README、public-surface index docs、task-map docs、candidate-backlog docs 与 acceptance surfaces 都把仍在定义中的 workstream 写成语义候选，而不是正式收录 domain。

### 验证方式

- 用 `json.load` 解析 `contracts/opl-gateway/task-topology.json`。
- 确认上面列出的精确 workstream 集合，以及已注册与仍在定义中的 split。
- 确认 `workstreams.json` 仍只包含 `research_ops` 与 `presentation_ops`，`domains.json` 仍只包含 `medautoscience` 与 `redcube`。
- 确认 `opl_task_map` 能在 `public-surface-index.json` 与 `surface-review-matrix.json` 中解析。
- 确认 candidate-domain backlog（若存在）仍与同一组 under-definition state 对齐。
- 确认没有任何字段或配套 prose 把仍在定义中的 workstream 升格成正式收录 domain、handoff-ready routed target 或 runtime entry surface。

## Q. P18 Candidate-Domain-Backlog 完整性

### 验收标准

`P18` 只有在下面全部成立时才算通过：

1. `contracts/opl-gateway/candidate-domain-backlog.json` 存在，且是合法 JSON。
2. `docs/references/opl-candidate-domain-backlog.md` 与 `docs/references/opl-candidate-domain-backlog.zh-CN.md` 都存在，且都链接到 machine-readable backlog 工件。
3. candidate-domain backlog 精确覆盖这些 under-definition workstream：
   - `grant_ops`
   - `thesis_ops`
   - `review_ops`
4. 每条 backlog entry 都保持当前 task-topology state：
   - `boundary_state = under_definition`
   - `registry_state = not_registered`
   - `routing_state = unknown_domain_only`
   - `current_domain_id = null`
   - `entry_surface = null`
   - `formal_domain_required = true`
5. 每条 backlog entry 都把 discovery、routing、handoff 与 formal inclusion 的 `readiness_flags` 明确保持为 `false`，并且在真实 boundary package 出现之前不携带占位性的未来 `domain_id`、`gateway_surface` 或 `harness_surface` 字段。
6. 每条 backlog entry 都在 `required_onboarding_materials` 中把下面八类 package 记录为 `missing`：
   - `registry_material`
   - `public_documentation`
   - `truth_ownership`
   - `review_surfaces`
   - `execution_model`
   - `discovery_readiness`
   - `routing_readiness`
   - `cross_domain_wording`
7. 每条 backlog entry 都在 `missing_boundary_materials` 中把下面八项 formal-inclusion check 对齐出来：
   - `registry_complete`
   - `boundary_explicit`
   - `truth_ownership_explicit`
   - `discovery_ready`
   - `routing_ready`
   - `review_ready`
   - `execution_model_aligned`
   - `cross_domain_wording_aligned`
8. 每个 `formal_inclusion_gate` 检查项都仍保持 `status = blocked`。
9. 任何 backlog entry 都不会虚构已冻结的 admitted domain、candidate gateway surface、candidate harness surface 或 canonical truth owner。
10. `Grant Ops` 仍然保持 proposal-facing：task-topology、task-map 与 candidate-backlog 的 wording 都把作者侧模拟评审与修订写成 grant-authoring aid / artifact，而不是 reviewer-role ownership，也不是独立 reviewer surface。
11. 如果公开 wording 中出现 `Grant Foundry -> Med Auto Grant`，它也只会被写成 top-level signal / domain-direction evidence；不等于已收录 domain gateway，也不等于 `G2` discovery readiness，也不等于 `G3` routed-action readiness，更不等于 handoff-ready surface。
12. `Thesis Ops` 在 task-map 与 candidate-backlog wording 中都仍位于 onboarding gate 之下；在对应 domain-onboarding evidence 出现前，这些 wording 不会让它变成 `G2` discovery target 或 `G3` routed-action target。
13. `Thesis Ops` 的 wording 还必须把 thesis assembly 与 `Research Ops` 的 manuscript/submission flow、以及 `Presentation Ops` / `RedCube AI` 的 deck production 区分开；可复用输入或下游衍生物不会把 `Thesis Ops` 的边界转移给这些已收录 surface。
14. `Review Ops` 仍然只把 reviewer-role work 与 response / rebuttal coordination 表达为同一个 under-definition semantic bundle；这种写法不会因此自动收录成 review domain、不会把 review-truth ownership 上收到 `OPL`，也不会创造 `G2` discovery target 或 `G3` routed-action target。
15. 任何 candidate entry 或 backlog rule 都不会把 `Grant Ops`、`Thesis Ops`、`Review Ops` 折叠进 `MedAutoScience` 或 `RedCube AI`；这两个已收录 domain 仍保持独立的 gateway / harness surface。
16. `required_evidence` 与 note 文本不会在 boundary package 存在之前预先分配未来的 `domain_id`、`gateway_surface` 或 `harness_surface` 元数据。
17. `contracts/opl-gateway/public-surface-index.json`、`surface-review-matrix.json`、`surface-lifecycle-map.json` 与 `surface-authority-matrix.json` 都把 candidate-domain backlog 暴露为 supporting/reference surface。
18. 在 `public-surface-index.json` 中，`opl_candidate_domain_backlog` 恰好出现一次；在 `surface-review-matrix.json` 中，对应 review entry 也恰好出现一次。
19. contract README、task-map docs、domain-onboarding docs、public-surface index docs、review-matrix docs、lifecycle/authority docs 与 acceptance surfaces 都把这份 backlog 写成 reference-only、non-executing、non-admitting，且明确位于 onboarding gate 之下。

### 验证方式

- 用 `json.load` 解析 `contracts/opl-gateway/candidate-domain-backlog.json`。
- 确认上面列出的精确 workstream 集合，以及它与 `task-topology.json` 中 under-definition entry 的完全对齐。
- 确认每条 backlog entry 都包含上面八类 `required_onboarding_materials` package、上面八项 `missing_boundary_materials` 检查，以及一个全部 blocked 的 `formal_inclusion_gate` 对象。
- 确认所有 `readiness_flags` 都保持 `false`，并且不存在占位性的未来 `domain_id`、`gateway_surface` 或 `harness_surface` 字段。
- 确认 `Grant Ops` 在 `task-topology`、`task-map` 与 candidate-backlog 中都保持 proposal-facing，因此作者侧模拟评审 / 修订不会升级成 reviewer-role ownership。
- 确认任何 `Grant Foundry -> Med Auto Grant` wording 都继续停留在 top-level signal / domain-direction evidence，而不会被误写成 admission、`G2` discovery readiness、`G3` routed-action readiness 或 handoff-ready surface。
- 确认 `Thesis Ops` 在 `task-map` 与 candidate-backlog 中都仍位于 onboarding gate 之下，因此在对应 domain-onboarding evidence 出现前不会被误写成 `G2` discovery target 或 `G3` routed-action target。
- 确认 `Thesis Ops` 仍然区别于 `Research Ops` 的 manuscript/submission flow 与 `Presentation Ops` / `RedCube AI` 的 deck production，因此可复用输入或下游衍生物不会把 `Thesis Ops` 的边界转移给这些已收录 surface。
- 确认 `Review Ops` 在 `task-topology`、`task-map` 与 candidate-backlog 中都仍只是 under-definition semantic bundle，因此 reviewer-role work 与 response / rebuttal coordination 不会被误写成已收录 review domain、OPL-owned review-truth surface、`G2` discovery target 或 `G3` routed-action target。
- 确认 backlog rules 不会把候选 workstream 折叠进 `MedAutoScience` 或 `RedCube AI`，从而保持这两个已收录 domain 仍是独立的 gateway / harness surface。
- 确认没有任何字段或配套 prose 把 backlog 升格成 domain registry、discovery registry、routed-action surface、handoff surface、approval engine 或 publish controller。
- 确认 `required_evidence` 与 note 文本不会预先写入未来的 `domain_id`、`gateway_surface` 或 `harness_surface` 元数据。
- 确认 `opl_candidate_domain_backlog` 在 `public-surface-index.json` 与 `surface-review-matrix.json` 中都恰好解析一次，并且也能在 `surface-lifecycle-map.json` 与 `surface-authority-matrix.json` 中解析。

## R. P23.M4 / G4 Candidate-Index Rollout Boundary 完整性

### 验收标准

`P23.M4 / G4` 只有在下面全部成立时才算通过：

1. `docs/references/opl-gateway-rollout.md` 与 `docs/references/opl-gateway-rollout.zh-CN.md` 都把 `Phase G4` 保持在 candidate-index boundary，而不是把它写成当前已收录 surface。
2. `Phase G4` 精确覆盖这四个 candidate index：
   - `shared asset index`
   - `shared memory index`
   - `shared domain registry`
   - `shared publication / delivery catalog`
3. 这四个 candidate index 都被显式保持为 roadmap-only、future-only、reference-only、non-admitting，直到后续显式合同与 acceptance alignment 冻结各自的 readiness boundary。
4. 任何 G4 candidate index 都不能被写成当前的 public-entry、discovery-ready、routed-action-ready、execution、truth-owner、approval、publish-control 或 release-control surface。
5. G4 wording 必须把 canonical truth 留在拥有它的 domain，并把 `OPL` 保持在 top-level gateway / federation layer，而不是把它改写成 monolithic runtime 或 shared truth owner。
6. G4 wording 不能把 `MedAutoScience` 或 `RedCube AI` 折叠成 `OPL` 的内部模块，也不能削弱它们作为 domain gateway / harness surface 的独立性。
7. `contracts/opl-gateway/acceptance-matrix.json` 必须包含一个专门的 G4 gate，用来检查 rollout/spec boundary wording，并阻止任何 G4 candidate index 被提前写成已收录 surface。

### 验证方式

- 阅读 `docs/references/opl-gateway-rollout.md` 与 `.zh-CN.md`，确认 `Phase G4` 仍保持 future candidate boundary。
- 确认 candidate 集合精确等于上面四个 G4 index，并且在中英文里都带有 roadmap-only / future-only / reference-only / non-admitting wording。
- 确认两份 rollout 文档都没有把任何 G4 candidate index 升格成当前的 public-entry、discovery-ready、routed-action-ready、execution、truth-owner、approval、publish-control 或 release-control surface。
- 确认 G4 wording 继续把 canonical truth 留在各自 domain 内，并在 top-level `OPL` gateway 之下保持 `MedAutoScience` / `RedCube AI` 的独立性。
- 解析 `contracts/opl-gateway/acceptance-matrix.json`，确认专门的 G4 gate 覆盖 rollout/spec 文件，并明确阻止提前收录 wording。

## 标准验证命令

```bash
git diff --check
python3 - <<'PY'
import json
from pathlib import Path
for path in sorted(list(Path('contracts/opl-gateway').glob('*.json')) + list(Path('examples/opl-gateway').glob('*.json'))):
    json.load(path.open())
    print('OK', path)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker, RefResolver

contracts = Path('contracts/opl-gateway')
routed_schema_path = contracts / 'routed-actions.schema.json'
handoff_schema_path = contracts / 'handoff.schema.json'
gov_schema_path = contracts / 'governance-audit.schema.json'
pub_schema_path = contracts / 'publish-promotion.schema.json'

routed_schema = json.loads(routed_schema_path.read_text())
handoff_schema = json.loads(handoff_schema_path.read_text())
gov_schema = json.loads(gov_schema_path.read_text())
pub_schema = json.loads(pub_schema_path.read_text())

store = {
    routed_schema['$id']: routed_schema,
    handoff_schema['$id']: handoff_schema,
    str(handoff_schema_path.resolve().as_uri()): handoff_schema,
    './handoff.schema.json': handoff_schema,
    'handoff.schema.json': handoff_schema,
}
resolver = RefResolver.from_schema(routed_schema, store=store)

routed = Draft202012Validator(
    routed_schema,
    resolver=resolver,
    format_checker=FormatChecker(),
)
gov = Draft202012Validator(gov_schema, format_checker=FormatChecker())
pub = Draft202012Validator(pub_schema, format_checker=FormatChecker())

for rel in [
    'examples/opl-gateway/research-ops-submission.json',
    'examples/opl-gateway/presentation-ops-publish.json',
    'examples/opl-gateway/ambiguous-task-routing.json',
    'examples/opl-gateway/unknown-domain-routing.json',
    'examples/opl-gateway/refusal-routing.json',
]:
    data = json.loads(Path(rel).read_text())
    routed.validate(data['route_request'])
    routed.validate(data['audit_routing_decision'])
    if 'build_handoff_payload' in data:
        routed.validate(data['build_handoff_payload'])
    gov.validate(data['governance_audit_record'])
    if 'publish_promotion_record' in data:
        pub.validate(data['publish_promotion_record'])
    print('examples schema OK', rel)

for rel in [
    'examples/opl-gateway/governance-decision-record.json',
    'examples/opl-gateway/cross-domain-review-index.json',
    'examples/opl-gateway/publish-readiness-signal.json',
]:
    gov.validate(json.loads(Path(rel).read_text()))
    print('governance example OK', rel)

for rel in [
    'examples/opl-gateway/publish-outcome-index.json',
    'examples/opl-gateway/promotion-candidate-signal.json',
    'examples/opl-gateway/promotion-surface-index.json',
]:
    pub.validate(json.loads(Path(rel).read_text()))
    print('publish example OK', rel)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

schema = json.loads(Path('contracts/opl-gateway/domain-onboarding-readiness.schema.json').read_text())
Draft202012Validator.check_schema(schema)
example = json.loads(Path('examples/opl-gateway/domain-onboarding-readiness.json').read_text())
Draft202012Validator(schema, format_checker=FormatChecker()).validate(example)
print('onboarding readiness schema OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

catalog = json.loads(Path('contracts/opl-gateway/operating-record-catalog.json').read_text())
expected = {
    'routing_audit',
    'governance_decision',
    'publish_readiness_signal',
    'cross_domain_review_index',
    'publish_outcome_index',
    'promotion_candidate_signal',
    'promotion_surface_index',
}
found = {entry['record_kind'] for entry in catalog['record_kinds']}
assert found == expected, (found, expected)
for entry in catalog['record_kinds']:
    assert entry['follow_on_route_surface'] == 'domain_gateway', entry
    schema_path = Path(entry['schema_ref'])
    assert schema_path.exists(), schema_path
    for ref in entry['example_refs']:
        path = Path(ref.split('#', 1)[0])
        assert path.exists(), (entry['record_kind'], ref)
print('operating record catalog OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

lifecycle = json.loads(Path('contracts/opl-gateway/surface-lifecycle-map.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_operating_model',
    'opl_shared_foundation',
    'opl_shared_foundation_ownership',
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_candidate_domain_backlog',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
}
surface_ids = {entry['surface_id'] for entry in lifecycle['surfaces']}
assert surface_ids == expected, (surface_ids, expected)
assert set(lifecycle['covered_surface_ids']) == expected, lifecycle['covered_surface_ids']
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_lifecycle_map' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in lifecycle['surfaces']:
    for key in ['requires_surfaces', 'enables_surfaces']:
        for target in entry[key]:
            assert target in surface_ids, (entry['surface_id'], key, target)
    assert entry['follow_on_route_surface'] in (None, 'domain_gateway'), entry
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
print('surface lifecycle map OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

matrix = json.loads(Path('contracts/opl-gateway/surface-authority-matrix.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_operating_model',
    'opl_shared_foundation',
    'opl_shared_foundation_ownership',
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_candidate_domain_backlog',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_surface_lifecycle_map',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
    'medautoscience_public_gateway',
    'redcube_public_gateway',
}
surface_ids = {entry['surface_id'] for entry in matrix['authority_entries']}
assert surface_ids == expected, (surface_ids, expected)
assert set(matrix['covered_surface_ids']) == expected, matrix['covered_surface_ids']
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_authority_matrix' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in matrix['authority_entries']:
    if entry['owner_scope'] == 'opl':
        for key in ['execution_authority', 'truth_authority', 'review_authority', 'publication_authority']:
            assert entry[key] == 'none', (entry['surface_id'], key, entry[key])
    else:
        assert entry['owner_scope'] == 'domain', entry
    assert entry['allowed_follow_on_surface'] in (None, 'domain_gateway'), entry
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
shared_boundary_ids = {'opl_operating_model', 'opl_shared_foundation', 'opl_shared_foundation_ownership'}
for entry in matrix['authority_entries']:
    if entry['surface_id'] in shared_boundary_ids:
        assert entry['route_authority'] == 'none', entry
        assert entry['execution_authority'] == 'none', entry
        assert entry['truth_authority'] == 'none', entry
        assert entry['review_authority'] == 'none', entry
        assert entry['publication_authority'] == 'none', entry
print('surface authority matrix OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

review = json.loads(Path('contracts/opl-gateway/surface-review-matrix.json').read_text())
acceptance = json.loads(Path('contracts/opl-gateway/acceptance-matrix.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_public_readme',
    'opl_roadmap',
    'opl_gateway_rollout',
    'opl_task_map',
    'opl_operating_model',
    'opl_shared_foundation',
    'opl_shared_foundation_ownership',
    'opl_federation_contract',
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_surface_lifecycle_map',
    'opl_surface_authority_matrix',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
    'opl_candidate_domain_backlog',
}
surface_id_list = [entry['surface_id'] for entry in review['review_entries']]
surface_ids = set(surface_id_list)
assert len(surface_id_list) == len(surface_ids), 'duplicate review surface_id'
assert surface_ids == expected, (surface_ids, expected)
assert set(review['covered_surface_ids']) == expected, review['covered_surface_ids']
acceptance_gate_ids = {gate['gate_id'] for gate in acceptance['gates']}
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_review_matrix' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in review['review_entries']:
    assert entry['owner_scope'] == 'opl', entry
    assert entry['human_review_required'] is True, entry
    assert entry['cross_domain_wording_check'] in {'shared_gate_required', 'local_review_required'}, entry
    assert entry['publishability_stage'] in {
        'top_level_positioning_aligned',
        'contract_boundary_aligned',
        'supporting_reference_aligned',
        'acceptance_reference_aligned',
    }, entry
    for gate_id in entry['required_acceptance_gates']:
        assert gate_id in acceptance_gate_ids, (entry['surface_id'], gate_id)
    for companion in entry['required_companion_surfaces']:
        assert companion in public_surface_ids, (entry['surface_id'], companion)
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
print('surface review matrix OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

task = json.loads(Path('contracts/opl-gateway/task-topology.json').read_text())
backlog = json.loads(Path('contracts/opl-gateway/candidate-domain-backlog.json').read_text())
public = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())
review = json.loads(Path('contracts/opl-gateway/surface-review-matrix.json').read_text())
lifecycle = json.loads(Path('contracts/opl-gateway/surface-lifecycle-map.json').read_text())
authority = json.loads(Path('contracts/opl-gateway/surface-authority-matrix.json').read_text())
task_map_en = Path('docs/task-map.md').read_text()
task_map_zh = Path('docs/task-map.zh-CN.md').read_text()
backlog_doc_en = Path('docs/references/opl-candidate-domain-backlog.md').read_text()
backlog_doc_zh = Path('docs/references/opl-candidate-domain-backlog.zh-CN.md').read_text()

expected = {'grant_ops', 'thesis_ops', 'review_ops'}
task_entries = {entry['workstream_id']: entry for entry in task['workstreams']}
backlog_entries = {entry['workstream_id']: entry for entry in backlog['candidate_workstreams']}
assert set(backlog_entries) == expected, (set(backlog_entries), expected)
required_packages = {
    'registry_material',
    'public_documentation',
    'truth_ownership',
    'review_surfaces',
    'execution_model',
    'discovery_readiness',
    'routing_readiness',
    'cross_domain_wording',
}
required_checks = {
    'registry_complete',
    'boundary_explicit',
    'truth_ownership_explicit',
    'discovery_ready',
    'routing_ready',
    'review_ready',
    'execution_model_aligned',
    'cross_domain_wording_aligned',
}
banned_future_metadata = {'domain_id', 'gateway_surface', 'harness_surface'}
non_collapse_rule = 'entries do not fold candidate workstreams into MedAutoScience or RedCube AI; admitted domains remain independent gateway and harness surfaces'
grant_task_note = task_entries['grant_ops']['notes'].lower()
thesis_task_note = task_entries['thesis_ops']['notes'].lower()
review_task_note = task_entries['review_ops']['notes'].lower()
task_map_en_lower = task_map_en.lower()
thesis_task_map_en_lower = task_map_en_lower.split('## thesis ops', 1)[1].split('## review ops', 1)[0]
thesis_task_map_zh = task_map_zh.split('## Thesis Ops', 1)[1].split('## Review Ops', 1)[0]
backlog_doc_en_lower = backlog_doc_en.lower()

assert non_collapse_rule in backlog['backlog_rules'], backlog['backlog_rules']
assert 'proposal-facing' in grant_task_note, grant_task_note
assert 'proposal-side reviewer simulation and revision remain authoring aids rather than reviewer-role ownership' in grant_task_note, grant_task_note
assert 'proposal-side reviewer simulation and revision inside the grant-writing loop' in task_map_en
assert 'do not by themselves create a reviewer-role surface' in task_map_en
assert 'proposal-facing' in backlog_doc_en
assert 'author-side grant-authoring artifacts rather than standalone reviewer-role outputs' in backlog_doc_en
assert 'future thesis ops domain boundary package is still incomplete' in thesis_task_note, thesis_task_note
assert 'they do not collapse thesis ops into research ops, medautoscience, or redcube ai' in thesis_task_note, thesis_task_note
assert '- not yet a `g2` discovery target' in thesis_task_map_en_lower
assert '- not yet a `g3` routed-action target' in thesis_task_map_en_lower
assert 'not the same as `research ops` manuscript/submission delivery' in thesis_task_map_en_lower
assert 'not reducible to `presentation ops` / `redcube ai` deck production either' in thesis_task_map_en_lower
assert 'they do not yet own a thesis ops domain boundary' in thesis_task_map_en_lower
assert 'those future packages are blockers only; they do not make `thesis ops` currently `g2` discovery-ready or `g3` routed-action-ready.' in backlog_doc_en_lower
assert 'are not identical to `research ops` manuscript/submission flow' in backlog_doc_en_lower
assert 'does not collapse the workstream into `presentation ops` / `redcube ai`' in backlog_doc_en_lower
assert 'top-level semantic bundle only' in review_task_note, review_task_note
assert 'does not by itself freeze a distinct domain boundary or transfer canonical truth for review artifacts into opl' in review_task_note, review_task_note
assert 'this combined label remains a top-level semantic bundle only; it does not by itself admit a distinct review domain or make opl the canonical truth owner of review artifacts.' in task_map_en_lower
assert '- not yet a `g3` routed-action target' in task_map_en_lower
assert 'the negative conclusion frozen here is that this combined label still does not justify admission, discovery readiness, routed-action readiness, or opl ownership of review truth.' in backlog_doc_en_lower
assert '作者侧模拟评审与修订' in task_map_zh
assert '不会自动变成“站在评审方”的 surface' in task_map_zh
assert 'proposal-facing' in backlog_doc_zh
assert '作者侧的基金写作工件，而不是独立的 reviewer-role output' in backlog_doc_zh
assert '- 还不是 `G2` discovery target' in thesis_task_map_zh
assert '- 还不是 `G3` routed-action target' in thesis_task_map_zh
assert '并不等同于 `Research Ops` 里的 manuscript / submission delivery' in thesis_task_map_zh
assert '被压缩成 `Presentation Ops` / `RedCube AI` 的 deck 生产' in thesis_task_map_zh
assert '它们并不因此拥有 Thesis Ops 的 domain boundary。' in thesis_task_map_zh
assert '这些未来 package 只是 blocker，不代表 `Thesis Ops` 现在已经具备 `G2` discovery readiness 或 `G3` routed-action readiness。' in backlog_doc_zh
assert '并不等同于 `Research Ops` 的 manuscript / submission flow' in backlog_doc_zh
assert '不会把这个 workstream 压缩成 `Presentation Ops` / `RedCube AI`' in backlog_doc_zh
assert '它不会因此自动收录成独立 review domain，也不会让 OPL 成为这些评审工件的 canonical truth owner' in task_map_zh
assert '- 还不是 `G3` routed-action target' in task_map_zh
assert '这种组合语义仍不足以推出 formal admission、discovery readiness、routed-action readiness，或把 review truth ownership 上收到 OPL。' in backlog_doc_zh

for workstream_id, entry in backlog_entries.items():
    task_entry = task_entries[workstream_id]
    assert entry['task_topology_state'] == {
        'boundary_state': task_entry['boundary_state'],
        'registry_state': task_entry['registry_state'],
        'routing_state': task_entry['routing_state'],
        'current_domain_id': task_entry['current_domain_id'],
        'entry_surface': task_entry['entry_surface'],
        'formal_domain_required': True,
    }, (workstream_id, entry['task_topology_state'])
    assert entry['readiness_flags'] == {
        'discovery_ready': False,
        'routing_ready': False,
        'handoff_ready': False,
        'formal_inclusion_ready': False,
    }, (workstream_id, entry['readiness_flags'])
    assert 'candidate_domain_boundary' not in entry, (workstream_id, entry)
    lowered_entry = json.dumps(entry, ensure_ascii=False).lower()
    for token in banned_future_metadata:
        assert f'candidate_{token}' not in lowered_entry, (workstream_id, token, entry)
    package_ids = {item['package_id'] for item in entry['required_onboarding_materials']}
    assert package_ids == required_packages, (workstream_id, package_ids)
    for item in entry['required_onboarding_materials']:
        assert item['status'] == 'missing', (workstream_id, item)
        assert item['required_evidence'], (workstream_id, item)
        assert item['forbidden_shortcuts'], (workstream_id, item)
        for evidence in item['required_evidence']:
            lowered = evidence.lower()
            assert not any(token in lowered for token in banned_future_metadata), (workstream_id, evidence)
    checks = {item['maps_to_formal_inclusion_check'] for item in entry['missing_boundary_materials']}
    assert checks == required_checks, (workstream_id, checks)
    for item in entry['missing_boundary_materials']:
        assert item['status'] == 'missing', (workstream_id, item)
        assert item['required_evidence'], (workstream_id, item)
        assert item['forbidden_shortcuts'], (workstream_id, item)
        for evidence in item['required_evidence']:
            lowered = evidence.lower()
            assert not any(token in lowered for token in banned_future_metadata), (workstream_id, evidence)
    gate_ids = set(entry['formal_inclusion_gate'])
    assert gate_ids == required_checks, (workstream_id, gate_ids)
    for check_id, gate in entry['formal_inclusion_gate'].items():
        assert gate['status'] == 'blocked', (workstream_id, check_id, gate)
        assert gate['blocking_package_ids'], (workstream_id, check_id, gate)
    note = entry.get('notes', '')
    lowered_note = note.lower()
    assert not any(token in lowered_note for token in banned_future_metadata), (workstream_id, note)

assert sum(surface['surface_id'] == 'opl_candidate_domain_backlog' for surface in public['surfaces']) == 1
assert sum(entry['surface_id'] == 'opl_candidate_domain_backlog' for entry in review['review_entries']) == 1
assert sum(entry['surface_id'] == 'opl_candidate_domain_backlog' for entry in lifecycle['surfaces']) == 1
assert sum(entry['surface_id'] == 'opl_candidate_domain_backlog' for entry in authority['authority_entries']) == 1
print('candidate-domain backlog OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())
category_ids = {category['category_id'] for category in idx['surface_categories']}
surface_ids = [surface['surface_id'] for surface in idx['surfaces']]
surface_id_set = set(surface_ids)
assert len(surface_ids) == len(surface_id_set), 'duplicate surface_id'
for surface in idx['surfaces']:
    assert surface['category_id'] in category_ids
    for ref in surface['refs']:
        if ref['ref_kind'] == 'repo_path':
            assert Path(ref['ref']).exists(), ref
        elif ref['ref_kind'] == 'external_url':
            assert ref['ref'].startswith('https://'), ref
        else:
            raise AssertionError(ref)
    for target in surface['routes_to']:
        assert target in surface_id_set, (surface['surface_id'], target)
candidates = [surface for surface in idx['surfaces'] if surface['surface_id'] == 'opl_candidate_domain_backlog']
assert len(candidates) == 1, candidates
candidate = candidates[0]
assert candidate['category_id'] == 'opl_supporting_surface', candidate
assert candidate['surface_kind'] == 'candidate_backlog', candidate
expected_contract_surfaces = {
    'opl_operating_model',
    'opl_shared_foundation',
    'opl_shared_foundation_ownership',
}
for surface_id in expected_contract_surfaces:
    matches = [surface for surface in idx['surfaces'] if surface['surface_id'] == surface_id]
    assert len(matches) == 1, (surface_id, matches)
    surface = matches[0]
    assert surface['category_id'] == 'opl_contract_surface', surface
    assert surface['owner_scope'] == 'opl', surface
    assert surface['truth_mode'] == 'none', surface
for forbidden_surface in ['opl_shared_asset_index', 'opl_shared_memory_index']:
    assert forbidden_surface not in surface_id_set, forbidden_surface
print('public surface index OK')
PY
python3 - <<'PY'
from pathlib import Path

checks = {
    Path('docs/operating-model.md'): [
        'top-level gateway and federation model rather than as a static blueprint and not as a monolithic runtime',
        'owning shared-foundation control language without taking over domain-owned canonical truth',
        '`MedAutoScience` is the `Research Ops` domain gateway and harness',
        '`RedCube AI` is the visual-deliverable domain gateway and harness',
    ],
    Path('docs/operating-model.zh-CN.md'): [
        '不是静态蓝图，也不是单体 runtime，而是顶层 Gateway 与 federation model',
        '拥有 shared-foundation 的顶层控制语言，但不接管各 domain 的 canonical truth',
        '`MedAutoScience` 是 `Research Ops` 的 domain gateway 与 harness',
        '`RedCube AI` 是视觉交付的 domain gateway 与 harness',
    ],
    Path('docs/shared-foundation.md'): [
        'The shared foundation does not imply one monolithic runtime.',
        'That compatibility does not make `OPL` the canonical truth store for every shared object;',
        '`MedAutoScience` as the active research domain gateway and harness',
        '`RedCube AI` as the visual-deliverable domain gateway and harness, with `ppt_deck` as the family that most directly maps to `Presentation Ops`',
    ],
    Path('docs/shared-foundation.zh-CN.md'): [
        '共享基础结构不等于单体 runtime。',
        '这种兼容性并不让 `OPL` 自动变成所有共享对象的 canonical truth store',
        '`MedAutoScience` 作为 active 的 research domain gateway 与 harness',
        '`RedCube AI` 作为视觉交付 domain gateway 与 harness，其中 `ppt_deck` 是最直接映射到 `Presentation Ops` 的 family',
    ],
    Path('docs/shared-foundation-ownership.md'): [
        '`OPL` owns the top-level semantic, indexing, identity, and cross-domain reuse rules for shared-foundation objects',
        'each `domain gateway` and `domain harness` owns the canonical truth, mutation, audit writeback, and delivery truth for domain-local objects',
        'never an automatic transfer of canonical truth from domains into `OPL`',
        '`OPL` taking domain-owned review truth, runtime truth, or publication truth',
        'should not appear on the current `OPL` public surface until a later explicit contract freezes',
    ],
    Path('docs/shared-foundation-ownership.zh-CN.md'): [
        '`OPL` 负责 shared-foundation 对象的顶层语义、索引、身份和跨域复用规则',
        '各 `domain gateway` 与 `domain harness` 负责 domain-local 对象的 canonical truth、mutation、审计回写与交付真相',
        '绝不自动把 canonical truth 从 domain 转移到 `OPL`',
        '把 domain-owned review truth、runtime truth 或 publication truth 上收给 `OPL`',
        '在后续显式合同至少冻结下面这些条件之前，不应出现在当前 `OPL` public surface 里',
    ],
    Path('../med-autoscience/../README.md'): [
        '`Med Auto Science` is the medical `Research Ops` gateway',
        'it is not the top-level `OPL` gateway either.',
    ],
    Path('../redcube-ai/../README.md'): [
        '`RedCube AI` is the formal gateway for the visual-deliverable domain.',
        '`ppt_deck` is the family currently mapping most directly to `Presentation Ops`.',
        '`xiaohongshu` shares the same harness but is not automatically equal to `Presentation Ops`.',
    ],
    Path('../gaofeng21cn/../README.md'): [
        'is the top-level gateway for how a one-person research lab routes work into independent domain systems and framework lines.',
        'is the emerging visual-deliverable gateway under the same umbrella.',
    ],
}

for path, snippets in checks.items():
    text = path.read_text()
    for snippet in snippets:
        assert snippet in text, (path, snippet)
print('shared-foundation wording alignment OK')
PY
python3 - <<'PY'
import re
from pathlib import Path
files = [
    Path('../README.md'),
    Path('../README.zh-CN.md'),
    Path('docs/roadmap.md'),
    Path('docs/roadmap.zh-CN.md'),
    Path('docs/opl-federation-contract.md'),
    Path('docs/opl-federation-contract.zh-CN.md'),
    Path('docs/opl-read-only-discovery-gateway.md'),
    Path('docs/opl-read-only-discovery-gateway.zh-CN.md'),
    Path('docs/opl-routed-action-gateway.md'),
    Path('docs/opl-routed-action-gateway.zh-CN.md'),
    Path('docs/opl-domain-onboarding-contract.md'),
    Path('docs/opl-domain-onboarding-contract.zh-CN.md'),
    Path('docs/references/opl-governance-audit-operating-surface.md'),
    Path('docs/references/opl-governance-audit-operating-surface.zh-CN.md'),
    Path('docs/references/opl-publish-promotion-operating-surface.md'),
    Path('docs/references/opl-publish-promotion-operating-surface.zh-CN.md'),
    Path('docs/references/opl-gateway-example-corpus.md'),
    Path('docs/references/opl-gateway-example-corpus.zh-CN.md'),
    Path('docs/references/opl-routed-safety-example-corpus.md'),
    Path('docs/references/opl-routed-safety-example-corpus.zh-CN.md'),
    Path('docs/references/opl-operating-example-corpus.md'),
    Path('docs/references/opl-operating-example-corpus.zh-CN.md'),
    Path('docs/references/opl-operating-record-catalog.md'),
    Path('docs/references/opl-operating-record-catalog.zh-CN.md'),
    Path('docs/operating-model.md'),
    Path('docs/operating-model.zh-CN.md'),
    Path('docs/shared-foundation.md'),
    Path('docs/shared-foundation.zh-CN.md'),
    Path('docs/shared-foundation-ownership.md'),
    Path('docs/shared-foundation-ownership.zh-CN.md'),
    Path('docs/references/opl-surface-lifecycle-map.md'),
    Path('docs/references/opl-surface-lifecycle-map.zh-CN.md'),
    Path('docs/references/opl-surface-authority-matrix.md'),
    Path('docs/references/opl-surface-authority-matrix.zh-CN.md'),
    Path('docs/references/opl-surface-review-matrix.md'),
    Path('docs/references/opl-surface-review-matrix.zh-CN.md'),
    Path('docs/references/opl-candidate-domain-backlog.md'),
    Path('docs/references/opl-candidate-domain-backlog.zh-CN.md'),
    Path('docs/task-map.md'),
    Path('docs/task-map.zh-CN.md'),
    Path('docs/opl-public-surface-index.md'),
    Path('docs/opl-public-surface-index.zh-CN.md'),
    Path('docs/references/opl-gateway-acceptance-test-spec.md'),
    Path('docs/references/opl-gateway-acceptance-test-spec.zh-CN.md'),
    Path('contracts/opl-gateway/README.md'),
    Path('contracts/opl-gateway/README.zh-CN.md'),
]
link_re = re.compile(r'\[[^\]]+\]\(([^)]+)\)')
for path in files:
    text = path.read_text()
    for raw in link_re.findall(text):
        if raw.startswith(('http://', 'https://', 'mailto:', '#')):
            continue
        target = (path.parent / raw.split('#', 1)[0]).resolve()
        if not target.exists():
            raise SystemExit(f'missing link: {path} -> {raw}')
print('links OK')
PY
rg -n "top-level blueprint only|不是统一运行时入口|本仓库本身不承担运行时角色"   ../README.md ../README.zh-CN.md   docs/gateway-federation.md docs/gateway-federation.zh-CN.md   docs/opl-federation-contract.md docs/opl-federation-contract.zh-CN.md   docs/opl-read-only-discovery-gateway.md docs/opl-read-only-discovery-gateway.zh-CN.md   docs/opl-routed-action-gateway.md docs/opl-routed-action-gateway.zh-CN.md   docs/opl-domain-onboarding-contract.md docs/opl-domain-onboarding-contract.zh-CN.md   docs/references/opl-candidate-domain-backlog.md docs/references/opl-candidate-domain-backlog.zh-CN.md   docs/references/opl-governance-audit-operating-surface.md docs/references/opl-governance-audit-operating-surface.zh-CN.md   docs/references/opl-publish-promotion-operating-surface.md docs/references/opl-publish-promotion-operating-surface.zh-CN.md   docs/references/opl-gateway-example-corpus.md docs/references/opl-gateway-example-corpus.zh-CN.md   docs/references/opl-routed-safety-example-corpus.md docs/references/opl-routed-safety-example-corpus.zh-CN.md   docs/references/opl-operating-example-corpus.md docs/references/opl-operating-example-corpus.zh-CN.md   docs/references/opl-operating-record-catalog.md docs/references/opl-operating-record-catalog.zh-CN.md   docs/operating-model.md docs/operating-model.zh-CN.md   docs/shared-foundation.md docs/shared-foundation.zh-CN.md   docs/shared-foundation-ownership.md docs/shared-foundation-ownership.zh-CN.md   docs/references/opl-surface-lifecycle-map.md docs/references/opl-surface-lifecycle-map.zh-CN.md   docs/references/opl-surface-authority-matrix.md docs/references/opl-surface-authority-matrix.zh-CN.md   docs/references/opl-surface-review-matrix.md docs/references/opl-surface-review-matrix.zh-CN.md   docs/task-map.md docs/task-map.zh-CN.md   docs/opl-public-surface-index.md docs/opl-public-surface-index.zh-CN.md   docs/references/opl-gateway-rollout.md docs/references/opl-gateway-rollout.zh-CN.md   docs/roadmap.md docs/roadmap.zh-CN.md   contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
rg -n "roadmap-only|future-only|reference-only|non-admitting|public-entry|discovery-ready|routed-action-ready|execution|truth-owner|approval|publish-control|release-control|shared asset index|shared memory index|shared domain registry|shared publication / delivery catalog"   docs/references/opl-gateway-rollout.md docs/references/opl-gateway-rollout.zh-CN.md   docs/references/opl-gateway-acceptance-test-spec.md docs/references/opl-gateway-acceptance-test-spec.zh-CN.md   contracts/opl-gateway/acceptance-matrix.json
```

## 完成定义

只有在下面这些条件都成立时，当前 OPL gateway 文档/合同体系才算 acceptance-green：

- A-R 十八部分全部通过
- 关联的机器可读合同存在且有效
- C 节继续保持 planning-gate green，而不是 runtime-green
- discovery 与 routing 文档仍然禁止 direct harness bypass
- governance / audit 仍然保持 index-only
- publish / promotion 仍然保持 index-only，且只在 post-publish 阶段生效
- example corpus 仍然保持 illustrative、planning-level 且 schema-aligned
- routed-safety corpus 仍然保持 illustrative、planning-level，且在应当 unresolved 的地方显式 unresolved
- operating example corpus 仍然保持 illustrative，且直接通过 schema 校验
- operating-record catalog 仍然保持 reference-only，且全部 schema/example ref 都能解析
- surface lifecycle map 仍然保持 derived、reference-only、non-executing
- surface authority matrix 仍然保持 derived、reference-only、non-executing
- surface review matrix 仍然保持 derived、reference-only、non-executing
- task topology 对仍在定义中的 workstream 仍然保持 non-admitting、non-routing
- candidate-domain backlog 仍然保持 reference-only、non-executing、non-admitting，且位于 onboarding gate 之下
- public surface index 仍然保持 discoverability-only
- domain onboarding 仍然是 boundary-first
- cross-domain wording 保持稳定

只要其中任何一条不成立，这套体系就还没有达到覆盖 post-P23.M4 / G4 candidate-index boundary 与 candidate-domain backlog / task-topology / review / discoverability surfaces 的 acceptance-green 状态。

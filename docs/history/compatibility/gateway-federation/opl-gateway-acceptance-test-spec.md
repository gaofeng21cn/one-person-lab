# OPL Gateway Acceptance Test Spec

Owner: `One Person Lab`
Purpose: `legacy_gateway_acceptance_spec_provenance`
State: `history_only_compressed`
Machine boundary: 本文只保存 gateway-first acceptance / test-spec 历史。当前测试与机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、repo-native tests 与 App/workbench projection；本文不得作为 active test oracle、runtime verification gate、compatibility interface、machine contract 或旧 alias/facade 保留依据。

## 当前读法

这份文档曾冻结 2026-04 `OPL Gateway` 文档/合同体系的 acceptance / test-spec。它当时服务于 gateway-first 路线：把 federation contract、read-only discovery、routed-action planning gate、candidate-domain backlog、public-surface index、operating governance matrix 和 example corpus 变成可检查文本。

当前 OPL 主线已经转为 stage-led framework、显式 OPL activation、Codex CLI first-class executor、Temporal-backed provider、typed queue / stage runtime、selected domain-agent entry、domain-owned authority functions 与 App/workbench projection。旧 `gateway / federation / routed-action` surface 只保留为 history tombstone；不再定义 runtime path、active workflow、compatibility interface、test fixture owner 或 machine-readable contract。

## Single Source of Truth

当前同类语义的有效 owner 是：

- 当前项目 truth：`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- active progress / gaps / next owner baton：`docs/active/current-state-vs-ideal-gap.md`
- docs lifecycle policy：`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md`
- 机器真相：`contracts/`、`src/`、repo-native tests、CLI/API payload、runtime ledger、provider receipts、domain manifests / receipts、App/workbench projection
- 本路线历史入口：`docs/history/compatibility/gateway-federation/README.md`

本文故意不复制这些 owner 的当前事实。

## 历史覆盖

原长文 acceptance spec 覆盖过这些历史 gate：

| 历史 gate | 当时用途 | 当前读法 |
| --- | --- | --- |
| `G1 registry / handoff completeness` | 检查旧 workstream、domain、routing vocabulary 和 handoff material。 | 已由当前 framework contracts、descriptors、generated interfaces 和 repo-native tests 替代。 |
| `G2 discovery correctness` | 保持 gateway discovery read-only。 | 只作历史措辞；当前 discovery truth 来自 active CLI/API/read-model 行为。 |
| `G3 routing safety` | 把 routed-action planning 冻结成 handoff-only，禁止 direct harness bypass。 | 当前 routing 与 action authority 由 active framework runtime、domain entry 和 authority boundary 治理。 |
| `domain onboarding gate` | 要求 registry、public docs、truth owner、review、discovery、routing 和 wording evidence。 | 当前 admission truth 归 active specs/contracts 与 Foundry Agent conformance surfaces。 |
| `P5.M1 governance / audit operating surface` | 索引 governance/audit records，同时不成为 execution authority。 | gateway-derived operating governance 已退役；当前 authority split 归 active docs/contracts/runtime。 |
| `P5.M2 publish / promotion operating surface` | 索引 publish/promotion records，同时不成为 publish controller。 | 只作历史；domain owner 继续持有 artifact、quality/export/review 和 publication authority。 |
| `P7 / P10 / P12 example corpora` | 展示旧 gateway、routed-safety 和 operating examples。 | example corpora 已归档在本 history 目录，不持有 active fixtures。 |
| `P8 public surface index` | 对齐旧 public-surface inventory。 | 当前 product/public surface truth 归 active product docs 与 generated/read-model surfaces。 |
| `P13 operating-record catalog` | 索引历史 operating record kinds。 | 只作历史，不是 active record catalog。 |
| `P14 surface lifecycle map` | 解释旧 surface dependency / discoverability graph。 | 只作历史 provenance，不是 workflow engine 或 transition authority。 |
| `P15 surface authority matrix` | 展示旧 routing/execution/truth/review/publication boundary。 | 只作历史 provenance；当前 authority boundary 归 active contracts/source/docs。 |
| `P16 surface review matrix` | 展示 human-review 与 acceptance obligations。 | 只作历史 provenance，不是 approval engine 或 publish controller。 |
| `P17 task topology` | 关联旧 task map 与 candidate/admitted workstreams。 | 当前 task topology 与 domain admission 归 active docs/contracts。 |
| `P18 candidate-domain backlog` | 记录尚未 admitted 的 candidate workstreams。 | 当前 candidate/admission 读法归 active specs/references。 |
| `P23.M4 / G4 candidate-index rollout boundary` | 防止未来 shared indexes 被提前写成 admitted/public/routed surfaces。 | 当前 shared index 与 workspace/source/delivery boundary 归 active contracts/docs。 |
| cross-domain wording consistency | 保持旧 OPL/domain wording 对齐。 | 当前 wording owner 是核心文档和 active docs governance policy。 |

## 已退役机器面

原文内嵌大量针对旧路径和 former artifacts 的 Python 验证片段与 shell 命令，包括 `contracts/opl-framework/acceptance-matrix.json`。这些命令已经从正文压缩移除，因为它们现在只是历史考古材料，不是可执行项目真相。

重要退役读法：

- `contracts/opl-framework/acceptance-matrix.json` is a former artifact reference, not an active required contract in this repo.
- 本 history 树下的 gateway-derived operating governance matrix 文件不是 active machine contracts。
- 本 history 树下的 example corpus 文件不是 active fixtures 或当前 routing examples。
- 本子树内的旧 `gateway`、`federation`、`domain_gateway`、`follow_on_route_surface`、`G1/G2/G3/G4` 和 `routed-action` 术语只为 provenance 与链接稳定保留。
- 历史 no-bypass、read-only 和 reference-only 断言仍可作为设计 provenance，但当前 enforcement 必须从 active source、contracts、tests 和 runtime/read-model output 证明。

## No-Resurrection Rules

不得用本文：

- 重建 `acceptance-matrix.json` 或 gateway-first acceptance gate；
- 为已退役 gateway/federation surface 添加 compatibility aliases、wrappers、facades 或 tests；
- 把历史 examples 当成 active fixtures；
- 声明 runtime readiness、domain readiness、production readiness、artifact authority、quality verdict、owner receipt、typed blocker 或 App release readiness；
- 在当前 owner 已是 OPL framework runtime、selected domain-agent entry 或 App/workbench projection 时，把工作路由回 gateway-first path。

若未来迁移确实需要历史设计里的某个想法，必须先把它映射到当前 owner surface，并从 active machine truth 证明；不得把旧 surface 名称复活成兼容层。

## 历史证据

保留本路径是因为其他 history-only 文件仍链接到这里。详细 A-R checklist、长验证脚本和 former command ledger 已在 2026-06-08 主动压缩；需要考古时读取压缩前 git history。

压缩后角色：

- 旧文件角色：gateway-first acceptance / test-spec
- 压缩后角色：path-stable tombstone 与 provenance pointer
- active replacement owner：当前核心文档、active gap plan、machine contracts/source/tests/CLI/runtime/App surfaces
- 保留入站链接：history-only gateway/federation examples 与 operating-governance tombstones

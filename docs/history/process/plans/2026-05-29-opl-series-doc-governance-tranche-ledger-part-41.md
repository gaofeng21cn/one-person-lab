# OPL series docs governance tranche ledger part 41

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_41`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 candidate backlog authority、task topology contract、workstream registry、domain admission gate、routing readiness surface、domain truth、quality verdict、artifact authority 或 production readiness oracle。当前 truth 回到 `docs/references/domain-admission/opl-candidate-domain-backlog.md`、`docs/specs/opl-domain-onboarding-contract.md`、核心五件套、active gap plan、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。
Date: `2026-05-29`

## Scope

本轮处理 candidate domain backlog 的 currentness drift：

- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
- process ledger index

目标是让 candidate backlog 保持 reference-only blocker index，不再把候选 workstream 数量、active workstream 数量或 readiness 状态写成本文自有 truth。本文继续保留 IP / Award / Thesis / Review 四个当前 blocker entry，但明确这些 entry 必须与 live `task-topology.json` / `workstreams.json` / CLI read-model 对齐。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` / `TASTE.md`
  - OPL 当前主链路仍是 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain agent entry`。
  - 过时模块、接口、alias、facade、wrapper、兼容测试和过时文档在 replacement / no-active-caller / provenance 证据成立后直接退役，不保留兼容面。
- 核心五件套和 active gap plan
  - `OPL Framework -> One Person Lab App -> Foundry Agents` 是当前产品分层。
  - MAS/MAG/RCA 持有 domain truth、quality/export verdict、artifact authority、memory body、owner receipt 和 direct app skill path。
  - 未来 domain admission 不能从 candidate signal、readiness wording 或 route visibility 推导出来。
- `docs/specs/opl-domain-onboarding-contract.md`
  - 已采用 currentness rule：admitted domain、workstream 和 candidate lane 状态从 core docs、active execution map、candidate backlog、`domains.json`、`workstreams.json`、`task-topology.json`、`public-surface-index.json`、CLI/read-model 和 tests 读取。
  - Candidate lane 仍需要完整 admission package 才能正式收录。
- `docs/public/task-map.md`
  - 公开 task map 定义七类顶层 workstream 语义，并把 `IP Ops`、`Award Ops`、`Thesis Ops`、`Review Ops` 写成 under-definition candidate workstream。
  - 该文档指向 candidate backlog 作为人读配套说明。
- `contracts/opl-framework/task-topology.json`
  - Candidate visibility 的机器面来自 topology entry：`under_definition` / `not_registered` / `candidate_domain_agent_pending`，`current_domain_id=null`，`entry_surface=null`，`formal_domain_required=true`。
- `contracts/opl-framework/workstreams.json`
  - 已注册 active workstream 只从该 contract 读取；当前 active workstream 为 `research_ops`、`grant_ops` 和 `presentation_ops`。
- `tests/src/cli/cases/contracts-help.test.ts`
  - `contract workstreams` 只返回 admitted workstream。
  - 专利请求留在 `ip_ops` candidate lane，报奖请求留在 `award_ops` candidate lane，均为 `unknown_domain`。
  - grant work 选择 `medautogrant` / `grant_ops`；thesis boundary explanation 保持 under-definition 语义。

## Changes

- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
  - Added a currentness rule that points readers to core docs, task map, onboarding contract, `task-topology.json`, `workstreams.json`, `domains.json`, CLI/read-model and tests.
  - Rewrote the purpose section so the backlog indexes live topology candidate workstreams instead of owning a fixed candidate list.
  - Rewrote the Machine Boundary section so candidate status is derived from live topology entry fields, while active workstreams remain derived from `workstreams.json`.
  - Added a coverage rule requiring any future candidate addition/removal to update topology / onboarding evidence, backlog entries and related CLI/read-model tests or negative guards together.

No source, machine-readable contracts, tests, CLI behavior, runtime ledger, App repo files, domain repo files or release artifacts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
- `docs/specs/opl-domain-onboarding-contract.md`
- `docs/public/task-map.md`
- `contracts/opl-framework/task-topology.json`
- `contracts/opl-framework/workstreams.json`
- `tests/src/cli/cases/contracts-help.test.ts`
- process ledger index

Edited:

- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-41.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue checking `docs/public/task-map.md` for fixed candidate/admitted status wording if fresh contracts/tests show currentness drift; it was reviewed in this tranche but not edited.
- Continue checking remaining `docs/references/domain-admission/**`, `docs/specs/**`, and App release/package/fresh-install support docs for frozen counts, stale G1/G2/G3 wording, Gateway/frontdoor/routed-action readiness pollution, active-shell path drift, image payload assumptions or validation timing overclaims.
- Continue checking root/index docs when support documents move between `docs/specs/`, `docs/references/`, `docs/runtime/`, `docs/product/` and `docs/history/`; prose paths must not become machine interfaces.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0`, ran `npm run build`, and left the known npm audit state at 10 high severity vulnerabilities; dependency audit remediation is outside this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/contracts-help.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 59`, `pass 59`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue small evidence-backed docs governance slices. Strong candidates are `docs/public/task-map.md` currentness wording or App release/package/fresh-install support docs, but only after fresh contracts/source/tests/read-model checks in the next tranche.

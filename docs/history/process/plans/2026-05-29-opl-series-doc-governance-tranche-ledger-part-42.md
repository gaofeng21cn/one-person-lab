# OPL series docs governance tranche ledger part 42

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_42`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 task topology contract、workstream registry、domain-agent catalog、domain admission gate、routing readiness surface、domain truth、quality verdict、artifact authority 或 production readiness oracle。当前 truth 回到 `docs/public/task-map.md`、`docs/references/domain-admission/opl-candidate-domain-backlog.md`、`docs/specs/opl-domain-onboarding-contract.md`、核心五件套、active gap plan、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。
Date: `2026-05-29`

## Scope

本轮处理 public task map 的 currentness drift：

- `docs/public/task-map.md`
- process ledger index

目标是让 task map 保持 public task-family support surface，只冻结顶层工作流语义和交付对象，不把 admitted/candidate state、active workstream count、domain mapping 或 readiness 状态变成本文自有 truth。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` / `TASTE.md`
  - OPL 当前主链路仍是 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain agent entry`。
  - 过时模块、接口、alias、facade、wrapper、兼容测试和过时文档在 replacement / no-active-caller / provenance 证据成立后直接退役，不保留兼容面。
- 核心五件套和 active gap plan
  - `OPL Framework -> One Person Lab App -> Foundry Agents` 是当前产品分层。
  - MAS/MAG/RCA 持有 domain truth、quality/export verdict、artifact authority、memory body、owner receipt 和 direct app skill path。
  - Task-family public wording 不能替代 contracts、source、tests、CLI/read-model 或 domain-owned evidence。
- `docs/specs/opl-domain-onboarding-contract.md`
  - Domain-agent admission spec 已采用 currentness rule：admitted domain、workstream 和 candidate lane 状态从 core docs、candidate backlog、`domains.json`、`workstreams.json`、`task-topology.json`、`public-surface-index.json`、CLI/read-model 和 tests 读取。
- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
  - Candidate backlog 已采用 currentness rule：backlog 只保存 blocker index，不冻结候选数量、active workstream 数量或 readiness 状态。
  - Candidate visibility 来自 `task-topology.json`，active workstreams 来自 `workstreams.json`。
- `contracts/opl-framework/task-topology.json`
  - 当前 topology 同时列出 admitted workstreams 与 candidate workstreams。
  - `ip_ops`、`award_ops`、`thesis_ops`、`review_ops` 均为 `under_definition` / `not_registered` / `candidate_domain_agent_pending`，`current_domain_id=null`，`entry_surface=null`，`formal_domain_required=true`。
- `contracts/opl-framework/workstreams.json`
  - 已注册 active workstream 只包括 `grant_ops`、`research_ops` 和 `presentation_ops`。
- `contracts/opl-framework/domains.json`
  - 当前 admitted domain-agent catalog 为 `medautogrant`、`medautoscience` 和 `redcube`。
- `tests/src/cli/cases/contracts-help.test.ts`
  - `contract workstreams` 只返回 admitted workstream。
  - patent request 留在 `ip_ops` candidate lane，award request 留在 `award_ops` candidate lane，均为 `unknown_domain`。
  - grant work 选择 `medautogrant` / `grant_ops`；thesis boundary explanation 保持 under-definition 语义。

## Changes

- `docs/public/task-map.md`
  - Added a currentness rule that limits the document to top-level workflow semantics, deliverable objects and public task-family wording.
  - Repointed admitted/candidate state reads to core docs, onboarding contract, candidate backlog, `task-topology.json`, `workstreams.json`, `domains.json`, CLI/read-model and related tests.
  - Rewrote the machine-readable companion section so `task-topology.json`, `workstreams.json` and `domains.json` each own their live contract roles.
  - Marked concrete current boundary sections as live contract / topology / backlog readings rather than task-map authority.

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
- `docs/public/README.md`
- `docs/public/task-map.md`
- `docs/specs/opl-domain-onboarding-contract.md`
- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
- `contracts/opl-framework/task-topology.json`
- `contracts/opl-framework/workstreams.json`
- `contracts/opl-framework/domains.json`
- `tests/src/cli/cases/contracts-help.test.ts`
- process ledger index

Edited:

- `docs/public/task-map.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-42.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue checking remaining `docs/specs/**`, `docs/references/domain-admission/**`, `docs/public/**`, and App release/package/fresh-install support docs for frozen counters, stale G1/G2/G3 wording, Gateway/frontdoor/routed-action readiness pollution, active-shell path drift, image payload assumptions or validation timing overclaims.
- Continue checking root/index docs when support documents move between `docs/specs/`, `docs/references/`, `docs/runtime/`, `docs/product/` and `docs/history/`; prose paths must not become machine interfaces.
- Continue small cross-repo tranches after fresh contracts/source/tests/read-model checks; this tranche covers only `one-person-lab` public task-map currentness wording.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0`, ran `npm run build`, and left the known npm audit state at 10 high severity vulnerabilities; dependency audit remediation is outside this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/contracts-help.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 59`, `pass 59`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue small evidence-backed docs governance slices. Strong candidates remain remaining App release/package/fresh-install support docs, `docs/specs/**`, `docs/references/domain-admission/**`, and public support docs that still freeze dynamic read-model counters or stale admission/readiness wording.

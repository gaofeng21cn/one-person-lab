# OPL series docs governance tranche ledger part 40

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_40`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 domain-agent admission authority、domain registry、candidate backlog、routing readiness gate、runtime provider contract、domain truth、quality verdict、artifact authority 或 production readiness oracle。当前 truth 回到 `docs/specs/opl-domain-onboarding-contract.md`、candidate backlog、核心五件套、active execution map、contracts、source、tests、CLI/read-model、runtime ledger 和 domain-owned receipts。
Date: `2026-05-29`

## Scope

本轮处理 domain-agent admission spec 的 currentness drift：

- `docs/specs/opl-domain-onboarding-contract.md`
- process ledger index

目标是退役 `opl-domain-onboarding-contract.md` 开头固定 `2026-05-11` current-state anchor，并把 admitted domain、registered workstream、candidate lane 与 formal inclusion 状态改成 live-reading policy。本文继续保留 candidate admission 审查门槛，但不让 spec 自己冻结当前 candidate 清单、计数或 readiness 状态。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` / `TASTE.md`
  - 当前 OPL 主链路仍是 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain agent entry`。
  - 已被当前 owner surface 替代的旧模块、接口、alias、facade、wrapper、兼容测试和过时文档，应在 replacement / no-active-caller / provenance 证据成立后直接退役，不保留兼容面。
- `docs/specs/README.md`
  - `opl-domain-onboarding-contract.md` 是 active spec support，职责是候选 domain-agent 准入、truth ownership、entry surface、execution model 和 stage selection readiness 审阅支撑。
  - 旧 Product API / ACP / frontdoor 规格不从 `docs/specs/` 恢复。
- `docs/active/current-development-lines.md`
  - 新 domain 只按 OPL scaffold、descriptor、stage/action/memory/artifact locator、authority function ABI、stage evidence workorder policy 和 docs taxonomy 接入。
  - 旧 gateway/frontdoor/local-runtime/Hermes-first 路线已退役，不得恢复为默认入口。
  - Candidate refs 不自动关闭 route、不生成 owner receipt、不声明 domain ready 或 production ready。
- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
  - 当前 candidate 可见性来自 `task-topology.json`，backlog 只是 derived human-readable blocker reference。
  - `workstreams.json` 只收录 active registered workstream；candidate backlog 不创造 `G1` registry admission、`G2` discovery readiness 或 `G3` routed-action readiness。
- `contracts/opl-framework/domains.json`
  - 已收录 domain-agent catalog 当前是 `medautoscience`、`medautogrant` 和 `redcube`，分别持有各自 domain truth 与 authority。
- `contracts/opl-framework/workstreams.json`
  - 已注册 active workstream 当前是 `research_ops`、`grant_ops` 和 `presentation_ops`。
- `contracts/opl-framework/task-topology.json`
  - Candidate workstream 当前是 `thesis_ops`、`review_ops`、`ip_ops` 和 `award_ops`。
  - 这些 candidate entry 均为 `under_definition` / `not_registered` / `candidate_domain_agent_pending`，`current_domain_id=null`，`entry_surface=null`，`formal_domain_required=true`。
- `tests/src/cli/cases/contracts-help.test.ts`
  - `contract workstreams` 只返回 admitted workstream。
  - 专利请求留在 `ip_ops` candidate lane，报奖请求留在 `award_ops` candidate lane，均为 `unknown_domain`。
  - grant work 选择 `medautogrant` / `grant_ops`；thesis boundary explanation 保持 candidate / under-definition 语义。

## Changes

- `docs/specs/opl-domain-onboarding-contract.md`
  - Replaced the fixed `2026-05-11` current-state note with a currentness rule.
  - Named the authoritative live inputs: core docs, active execution map, candidate backlog, `domains.json`, `workstreams.json`, `task-topology.json`, `public-surface-index.json`, CLI/read-model and related tests.
  - Rewrote the machine-readable artifact section so admitted domain/workstream and candidate lane status must be read from live contracts instead of frozen prose.
  - Rewrote the cross-domain wording candidate section so `IP Ops` / `Award Ops` / `Review Ops` / `Thesis Ops` are explicitly described as current machine-backed examples, not spec-owned permanent truth.

No source, machine-readable contracts, tests, CLI behavior, runtime ledger, App repo files, domain repo files or release artifacts were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/specs/opl-domain-onboarding-contract.md`
- `docs/specs/README.md`
- `docs/active/current-development-lines.md`
- `docs/references/domain-admission/opl-candidate-domain-backlog.md`
- `contracts/opl-framework/README.md`
- `contracts/opl-framework/domains.json`
- `contracts/opl-framework/workstreams.json`
- `contracts/opl-framework/task-topology.json`
- `tests/src/cli/cases/contracts-help.test.ts`
- process ledger index

Edited:

- `docs/specs/opl-domain-onboarding-contract.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-40.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue checking remaining `docs/specs/` and `docs/references/domain-admission/**` support docs for frozen candidate counts, stale G1/G2/G3 wording, or old Gateway/frontdoor/routed-action readiness language that should be tombstone-only.
- Continue checking App release / package / fresh-install support docs for stale release, active-shell path, validation timing or image payload assumptions against current App contracts and shell carrier evidence.
- Continue checking root/index docs when support documents move between `docs/specs/`, `docs/references/`, `docs/runtime/`, `docs/product/` and `docs/history/`; prose paths must not become machine interfaces.

## Verification

Fresh verification before absorb:

- `rtk npm ci` exited `0`, ran `npm run build`, and left the known npm audit state at 10 high severity vulnerabilities; dependency audit remediation is outside this tranche.
- `rtk git diff --check` exited `0`.
- Conflict-marker scan `rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md` returned no matches.
- `rtk node --experimental-strip-types --test tests/src/cli/cases/contracts-help.test.ts tests/src/verification-command-surfaces.test.ts` passed: `tests 59`, `pass 59`, `fail 0`.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Continue small evidence-backed docs governance slices, prioritizing remaining candidate-domain / domain-admission support docs or App release support docs only after fresh contracts/source/tests/read-model checks.

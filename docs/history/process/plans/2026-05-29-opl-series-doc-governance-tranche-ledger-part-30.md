# OPL series docs governance tranche ledger part 30

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_30`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、Temporal provider contract、provider receipt、worklist ledger、domain owner receipt、App read model 或 production readiness oracle。当前 truth 回到 `contracts/opl-framework/family-runtime-online-substrate-contract.json`、`contracts/opl-framework/runtime-manager-contract.json`、`contracts/opl-framework/family-runtime-attempt-contract.json`、source、tests、核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮继续 OPL runtime-substrate support coverage，处理：

- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`

目标是把该文件从一次性落地计划 / P0-P5 checklist / provider proof closeout 口吻收敛为稳定 support reference。该文档现在只保留 Temporal-backed provider 的 owner split、语义映射、动态读取入口、retired runtime negative boundary 和剩余证据门；当前 service / worker / proof / SLO / worklist / attempt 数值必须回到 fresh contracts、source、tests、CLI/read-model 与 runtime ledger。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/family-runtime-online-substrate-contract.json`
  - `temporal` 是 production required provider；`local_sqlite` 只作为 dev/CI/offline diagnostic baseline。
  - Standard agent default runtime policy 为 `opl_temporal_hosted_autonomous`，`default_executor_kind=codex_cli`，Codex App 不驱动 long-running task loop。
- `contracts/opl-framework/runtime-manager-contract.json`
  - Runtime Manager 持有 provider selection、typed family queue、stage attempt ledger、domain task registration hydration、projection、native helper 与 state index target；不持有 domain truth、quality verdict、artifact gate 或 concrete executor。
- `contracts/opl-framework/family-runtime-attempt-contract.json`
  - Attempt projection 包括 `stage_progress_log`、`attempt_true_path_proof`、Temporal visibility 和 `temporal_webui_ref`，均为 refs-only progress / debug surface，不构成 long-soak、owner receipt、artifact authority 或 quality verdict。
- Source/tests evidence:
  - `src/family-runtime-temporal*.ts` 持有 Temporal client/workflow/query/activity/worker path。
  - `tests/src/family-runtime-temporal-provider.test.ts` 与 `tests/src/family-runtime-attempt-contract.test.ts` 覆盖 workflow、signal/query/update、typed closeout、stage progress log、Temporal visibility 和 true-path proof。
- Root main live read-model evidence:
  - `./bin/opl framework readiness --family-defaults --json` 读为 `framework_control_plane_available_with_operator_attention`，hard blocker 为 `0`，provider cadence window / capability SLO satisfied，但仍有 refs-only operator attention；该状态不授权 domain ready 或 production ready。
  - `./bin/opl runtime app-operator-drilldown --json` 读到 provider cadence/capability satisfied，同时 `next_safe_action.action_id=provider-worker:temporal:restart`、`provider_worker_lifecycle_status=worker_source_stale`；这证明 provider lifecycle 状态必须 live 查询，不能固化在本文。
  - `./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json` 读到 `open_worklist_item_count=6`、`closed_refs_only_item_count=316`、`domain_dispatch_evidence_workorder_count=6`、`domain_ready_authorized=false`、`production_ready_authorized=false`。
- Part30 worktree direct provider service/worker status commands were not used as readiness proof:
  - `./bin/opl family-runtime service status --provider temporal --json` and `worker status` failed in the new worktree because `@temporalio/client` was not installed under that checkout. This is a worktree dependency/install state, not a provider-ready or provider-unready conclusion.

## Changes

- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
  - Renamed from landing-plan wording to Temporal provider support reference wording.
  - Replaced `Purpose=development_plan`, dated `Date`, and `State=production residency proven` with stable active-support metadata and a currentness policy.
  - Removed P0-P5 `状态 / 交付 / 验收` checklist sections, including dated proof, paper-line samples, task-bound ingestion claims and current-state proof snapshots.
  - Added `支撑分层与动态证据入口` table mapping stable support lanes to contracts/source/tests/CLI/read-model owners.
  - Added compact `剩余证据门` section separating provider lifecycle freshness, MAS paper-line owner chain, MAG/RCA controlled soak, and App/operator worklist semantics.
- Portfolio / index references:
  - Updated `docs/active/development-document-portfolio.md`, `docs/docs_portfolio_consolidation.md`, `docs/references/README.md`, `docs/references/runtime-substrate/README.md`, `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`, `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`, and `docs/history/runtime-substrate/README.md` so their links describe the Temporal document as a support reference / dynamic evidence entry rather than an active landing plan.

No contracts, source, tests, package scripts, App files, Aion shell files, MAS/MAG/RCA/OMA repos, or runtime ledgers were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/development-document-portfolio.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/references/README.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/runtime/README.md`
- `docs/runtime/opl-agent-lab-control-plane.md`
- `docs/history/runtime-substrate/README.md`
- `contracts/opl-framework/family-runtime-online-substrate-contract.json`
- `contracts/opl-framework/runtime-manager-contract.json`
- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `package.json`
- prior `part-10` and `part-29` ledgers to avoid duplicate scope

Edited:

- `docs/active/development-document-portfolio.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/references/README.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md`
- `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-30.md`
- `docs/history/process/plans/README.md`
- `docs/history/runtime-substrate/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced at `d9e82fc8` before starting part30.
- Already absorbed part29 lane was confirmed gone from worktree/branch refs; no stale local branch remained.
- New worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part30`.
- New branch: `codex/opl-doc-governance-20260529-part30-temporal-provider`.

Other repo lanes retained:

- `med-autoscience`: main clean/synced; `.worktrees/dm003-ai-reviewer-record-dispatch` exists at same HEAD and must be retained unless separately classified after freshness/owner check.
- `redcube-ai`: dirty main, ahead origin/main by 1, with active native-PPT live probe processes; retained as active owner lane.
- `one-person-lab-app`: dirty main plus dirty stable-gate worktree; retained as App owner lane.
- `med-autogrant` and `opl-meta-agent`: clean/synced root worktrees.

Open PRs for the six repos were checked with `gh pr list` and returned empty.

## Remaining stale / retire candidates

- Continue scanning `docs/runtime/*` and `docs/references/runtime-substrate/*` for support docs that still mix stable support role with dated proof, current counters, receipt ids, worktree/branch status, or proof snapshot language.
- Re-check references that mention provider worker stale/current state, Developer Mode receipts, OMA production consumption, App release/user-path evidence, or evidence worklist counters; those must keep dynamic read-model wording.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered one OPL runtime-substrate support reference.

## Next tranche write scope

- Prefer another small OPL support-reference tranche backed by live contracts/source/tests/read-model evidence.
- Candidate areas:
  - `docs/runtime/*` if a section still reads as runtime completion ledger;
  - `docs/references/current-support/*` if fixed App/release/provider evidence remains;
  - `docs/source/*` / `docs/delivery/*` if they still preserve old Product API, frontdoor, local-manager or compatibility promise language.

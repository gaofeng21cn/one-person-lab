# OPL series docs governance tranche ledger part 28

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_28`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、test lane registry、CI policy、Sentrux policy、quality score、runtime contract、domain authority 或 release oracle。当前 truth 回到 `scripts/test-lanes.mjs`、`scripts/run-parallel-test-lanes.sh`, `scripts/verify.sh`, `scripts/run-structural-quality-gate.sh`, `.github/workflows/verify.yml`, `.github/workflows/sentrux-advisory.yml`, `.github/actions/quality-details/action.yml`, `.sentrux/rules.toml`, `src/quality-details/*`, tests, 核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL 当前支撑参考里的 quality details / test lane governance currentness：

- `docs/references/current-support/opl-quality-details.md`
- `docs/references/current-support/opl-test-lane-governance.md`
- 相关 currentness 句：`docs/decisions.md`、`docs/references/runtime-substrate/opl-runtime-manager-target.md`

目标是保留质量/测试治理的稳定 owner boundary，同时退役旧的 “structure lane 是 blocking Sentrux gate” 简化表述。当前脚本事实是：line budget 和 `.sentrux/rules.toml` explicit rules failure 是阻断面；`sentrux gate .` baseline regression 会输出 OPL quality details sidecar 并按 advisory 成功返回；GitHub Sentrux Advisory workflow 仍只提供非阻断可见性。

## Fresh Evidence

本轮 live evidence：

- `scripts/test-lanes.mjs`：持有 smoke、fast、fast-parallel、read-model-gates、meta、regression、integration、artifact、fresh-install lane registry；`assert-coverage` 使用 tracked `tests/**/*.test.ts` / `tests/**/*.test.mjs` 与 import closure 检查 active test file ownership。
- `package.json`：`npm test` 仍映射到 `npm run test:fast`；`test:full` 映射到 `./scripts/run-parallel-test-lanes.sh full`；`test:structure` 映射到 `./scripts/verify.sh structure`。
- `scripts/run-parallel-test-lanes.sh`：`full` lane 先并行 `test:fast:parallel`、`test:fresh-install`、`test:structure`、`typecheck`、`lint`，再串行 `test:read-model-gates`、`test:meta`、`test:regression`、`test:integration`、`test:artifact`、`test:native`。
- `scripts/verify.sh`：所有 lane 先经过 repo temp env wrapper，并先执行 `node scripts/line-budget.mjs`；`structure` lane 调用 `./scripts/run-structural-quality-gate.sh`。
- `scripts/run-structural-quality-gate.sh`：`sentrux gate .` failure 会调用 `opl quality details --root . --format markdown --limit <n> --focus <focus> --compare-ref <ref>`，输出 warning 后返回 0；`sentrux check .` failure 会同样输出 quality details，但保留 nonzero status；缺 compare ref 时回退 `HEAD^`。
- `.github/workflows/verify.yml`：Verify workflow 拆分 build/typecheck、fast、read-model-gates、regression、integration、fresh-install、native、lint-and-structure；`lint-and-structure` fetch `origin/main`、安装 Sentrux、运行 `./scripts/verify.sh lint` 和 `./scripts/verify.sh structure`。
- `.github/workflows/sentrux-advisory.yml`：continue-on-error advisory workflow 运行 Sentrux gate/check，并调用本仓 `.github/actions/quality-details` 产出 sidecar artifact。
- `.github/actions/quality-details/action.yml`：composite action 安装本仓依赖，向 step summary 写 Markdown，并把 JSON 写到 `artifacts/opl-quality-details/quality-details.json`；`origin/*` compare ref 会先 fetch 并 verify。
- `src/quality-details/*`：quality details surface kind 为 `opl_code_quality_details.v1`，支持 `json|markdown`、`focus` 枚举、`--compare-ref` baseline worktree diff、TS/JS/Python 分析和 `.sentrux/rules.toml` family reader。
- `tests/src/quality-details.test.ts`：覆盖 JSON/Markdown 输出、baseline diff、qualified method names、duplicate anonymous callback no-noise 和 `bin/opl quality details` CLI routing。
- `tests/src/verification-test-governance.test.ts`：覆盖 structural gate patterns、Verify workflow、Sentrux Advisory workflow、quality-details action、test lane script ownership和 full lane wrapper。

## Changes

- `docs/references/current-support/opl-quality-details.md`
  - Added currentness rule that blocking behavior is owned by scripts/workflows/rules, not the support reference.
  - Replaced “Sentrux remains the rules wall” with “rules source”.
  - Rewrote the body into Chinese canonical docs style for `docs/**`, while retaining command names, field names and machine-surface identifiers as literals.
  - Reframed local structure policy: baseline regression is advisory with quality-details sidecar; explicit Sentrux rules failures remain blocking.
  - Clarified GitHub Sentrux Advisory is visibility only and does not replace Verify `lint-and-structure`.
  - Changed the reusable action example from fixed `@main` to `<ref>`, so the support doc does not freeze branch state or imply current remote availability.
- `docs/references/current-support/opl-test-lane-governance.md`
  - Added `scripts/run-parallel-test-lanes.sh` and GitHub workflow to machine-truth owner list.
  - Corrected `structure` lane role to line-budget + explicit-rules blocking / baseline-advisory split.
  - Corrected `full` lane role to current parallel-then-serial wrapper order and preferred `npm run test:full` entry.
  - Clarified `test:fast:parallel` shares the fast collection and exists for full wrapper scheduling.
- `docs/decisions.md`
  - Updated the Runtime Manager decision impact sentence so current decisions no longer say local `structure` is a generic blocking Sentrux gate.
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
  - Updated related verification-entry sentence to the same current structural quality policy.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/references/current-support/README.md`
- `docs/references/current-support/opl-quality-details.md`
- `docs/references/current-support/opl-test-lane-governance.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `scripts/test-lanes.mjs`
- `scripts/run-parallel-test-lanes.sh`
- `scripts/verify.sh`
- `scripts/run-structural-quality-gate.sh`
- `.github/workflows/verify.yml`
- `.github/workflows/sentrux-advisory.yml`
- `.github/actions/quality-details/action.yml`
- `package.json`
- `src/quality-details/*`
- `tests/src/quality-details.test.ts`
- `tests/src/verification-test-governance.test.ts`

Edited:

- `docs/references/current-support/opl-quality-details.md`
- `docs/references/current-support/opl-test-lane-governance.md`
- `docs/decisions.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-28.md`
- `docs/history/process/plans/README.md`

No scripts, tests, workflows, `.sentrux` config, source behavior, App files, Aion shell files, or domain repos were modified in this tranche. This tranche only aligns support prose and history coverage with current machine behavior.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` and `docs/runtime/*` for fixed dynamic counters, dated proof snapshots, release-cohort state, provider snapshot counts, old compatibility promises, stale runner assumptions, or support prose that overspecifies script behavior.
- Re-check `docs/references/runtime-substrate/*` for test/quality references that still imply Sentrux baseline drift alone blocks merge, or that treat advisory structural output as a quality verdict.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered OPL repo quality/test support references.
- Do not edit or absorb current `one-person-lab-app`, `opl-aion-shell`, `redcube-ai`, RCA native-PPT, or other external dirty lanes unless explicitly taking ownership.

## Next tranche write scope

- Prefer another small OPL support-reference tranche backed by live scripts/contracts/read-model evidence.
- Strong candidates:
  - remaining `docs/references/current-support/*` currentness checks after fresh script/source reads;
  - `docs/runtime/*` sections that still mix durable runtime boundary with dynamic proof snapshots;
  - cross-repo active truth plan refresh only after reading the target repo's ideal-state reference, active plan, and live contracts/tests/CLI truth.

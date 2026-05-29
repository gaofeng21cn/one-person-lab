# 2026-05-30 OPL Series Doc Governance Current Support Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_current_support_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
RUN_SNAPSHOT_TS: `2026-05-29T17:15:53Z`

## Frozen Scope

本轮延续 OPL Doc Governance `/goal`，沿用 `RUN_SNAPSHOT_TS=2026-05-29T17:15:53Z` 的 frozen inventory，只接管快照内 clean/synced 的 `one-person-lab` current-support 文档治理。全局 `/goal` 仍 active，不能因本 tranche 关闭。

| Repo | Snapshot handling |
| --- | --- |
| `one-person-lab` | clean/synced `dde22435fa04`，only root worktree；选为本轮写入仓。 |
| `med-autoscience` | main clean but ahead origin/main 16，且有 recent docs/source/tests writes 与长期 verify/quality processes；保留。 |
| `med-autogrant` | clean/synced，但上一 tranche docs portfolio / local marketplace 写入在最近窗口内；保留。 |
| `redcube-ai` | dirty main、多条 dirty worktree 与 active native-PPT/Codex processes；保留。 |
| `opl-meta-agent` | clean/synced，但上一 tranche docs portfolio 写入在最近窗口内；保留。 |
| `one-person-lab-app` | dirty main 与 dirty remote-backed full-first-run worktree；保留。 |

快照后新活动只作为 `post_snapshot_activity` 记录，不扩大本轮吸收、清理或文档治理 scope。

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | OPL `AGENTS.md`/`TASTE.md`、OPL Doc Governance skill、`docs/docs_portfolio_consolidation.md`、current-support index。 |
| Support docs | `docs/references/current-support/opl-release-packages-modular-distribution.md`、fresh install、default skill ecosystem、test lane governance、Docker/WebUI、GUI shell adapter、quality details。 |
| Package / native helper truth | `package.json` scripts/files、`contracts/opl-framework/native-helper-contract.json`、`contracts/opl-framework/runtime-manager-contract.json`、`src/package-distribution.ts`、`src/cli/cases/system-public-command-specs.ts`、`tests/src/cli/cases/package-distribution.test.ts`、`tests/src/cli/cases/contracts-entry.test.ts`、`tests/src/cli/cases/system-management.test.ts`、`tests/src/cli/cases/system-install.test.ts`。 |
| Live CLI/read-model | `./bin/opl packages manifest`、`./bin/opl help` native/package/system command surfaces。 |

## Change

| File | Change |
| --- | --- |
| `docs/references/current-support/opl-release-packages-modular-distribution.md` | Retired the stale prose entry `opl native:repair`. The current public CLI trigger is `opl system repair-native-helpers` or `opl install`; the underlying lifecycle script remains `npm run native:repair` according to contracts/source/tests. |
| `docs/history/process/plans/2026-05-30-opl-series-doc-governance-current-support-ledger.md` | Added this compact coverage ledger. |
| `docs/history/process/plans/README.md` | Indexed this ledger as history provenance. |

## Retired / Preserved Surfaces

- Retired stale doc wording only: `opl native:repair`.
- Preserved public surfaces: `opl system repair-native-helpers`, `opl install`, `npm run native:repair`, `npm run native:prebuild*`, `opl packages manifest`.
- No source module, CLI command, test, workflow, branch or worktree was deleted in this tranche.

## Unreviewed Documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: README/core docs were used as context, but most docs outside current-support/package-native-helper support remain unreviewed in this tranche.
- `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`: body-level README/docs audit remains under the global `/goal`; dirty/recent/owner-backed lanes were not edited.

## Blockers / Retained Snapshot Lanes

- `med-autoscience`: ahead origin/main 16 plus recent writes/processes.
- `redcube-ai`: dirty native-PPT/source/test/docs lanes and active processes.
- `one-person-lab-app`: dirty main and dirty remote-backed full-first-run worktree.
- `med-autogrant` and `opl-meta-agent`: clean but recently written by prior tranche, so not selected for this write scope.

## Post Snapshot Activity

No post-snapshot activity was used to expand this tranche. Any new dirty file, process, branch, PR, remote ref or external owner action after `2026-05-29T17:15:53Z` belongs to the next heartbeat intake unless it directly conflicts with this OPL support-doc edit.

## Next Scope

Continue OPL support-reference cleanup from fresh live truth, prioritizing `docs/references/current-support/*`, `docs/references/operating-governance/*`, and `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` where they still risk freezing release ids, receipt refs, provider proof snapshots, branch/SHA state, local proof paths or dynamic counters. Keep MAS/RCA/App dirty lanes isolated unless explicitly assigned.

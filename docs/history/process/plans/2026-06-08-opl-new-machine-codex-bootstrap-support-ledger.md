# 2026-06-08 OPL New Machine Codex Bootstrap Support Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_new_machine_bootstrap_support_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前安装、同步、release、readiness、domain skill 和 OPL Doc / OPL Flow 行为真相继续归 `install.sh`、One Person Lab App release asset / installer evidence、`package.json` scripts、source、tests、CLI/read-model、Codex plugin registry、domain repo installer 和 repo-native 验证命令。

## Scope

本轮延续 OPL Doc Governance `/goal`，只覆盖 OPL `current-support` 里的 new-machine bootstrap 主题。全局六仓 README/docs body-level coverage 仍未关闭，本 ledger 不声明 OPL series docs governance complete。

| Item | Handling |
| --- | --- |
| Semantic theme | 新机器 Codex 全家桶安装入口：OPL Framework、App、MAS/MAG/RCA/OMA 可见面、OPL Flow、OPL Doc 与 companion tools 的一站式 bootstrap runbook。 |
| Single Source of Truth | 可执行真相归 `install.sh`、App repo installer / release evidence、`package.json` 的 `new-machine:codex-bootstrap:docker-smoke`、`scripts/new-machine-codex-bootstrap-docker-smoke.mjs`、`opl` CLI 输出、Connect skill sync source/tests、OPL Flow / OPL Doc installer verify。 |
| Support doc role | `docs/references/current-support/opl-new-machine-codex-bootstrap.md` 只保留人读 support runbook 和可复制 prompt；它不拥有 runtime readiness、domain readiness、production readiness、App release truth 或 plugin registry truth。 |
| Edited docs | 本 ledger 与 `docs/history/process/plans/README.md`。runbook 本体无需改写：它已经声明 machine boundary，并把 Full readiness、domain ready、production ready、artifact authority 与 owner receipt 边界分开。 |

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Repo governance inputs | `AGENTS.md`、`TASTE.md`、OPL Doc skill、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md`。 |
| Support references | `docs/references/current-support/README.md`、`docs/references/current-support/opl-new-machine-codex-bootstrap.md`。 |
| Canonical boundary docs | `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`。 |
| Executable / test truth | `install.sh`、`package.json`、`scripts/new-machine-codex-bootstrap-docker-smoke.mjs`、`tests/src/verification-command-surfaces.test.ts`。 |
| Related stale-surface guards | Connect sync tests and CLI surfaces that keep `opl connect sync-skills` canonical and keep retired `opl skill sync` fail-closed to the replacement command. |

## Coverage Result

- `opl-new-machine-codex-bootstrap.md` remains the canonical GitHub human entry for asking Codex to bootstrap a new machine.
- The support doc correctly delegates framework/runtime installation to OPL/App installers, domain skill exposure to `opl connect sync-skills`, workflow profile installation to OPL Flow, docs governance installation to OPL Doc, and App first-install evidence to the App repo / release artifact.
- The Docker smoke is an executable command-line bootstrap guard, not a substitute for macOS Full DMG, Desktop App first launch, Codex API key configuration, online runtime provider, GitHub permission, companion skill full install, OPL Doc usage quality, domain ready or production ready.
- No active prose conflict was found that required moving the runbook body, deleting the file, or rewriting current/core docs.

## Retired / Guarded Stale Readings

| Stale reading | Current handling |
| --- | --- |
| MAS/MAG/RCA as duplicate bare `~/.codex/skills/{mas,mag,rca}` mirrors | Retired by support doc constraints and smoke checks; domain agents use plugin-packaged / generated surfaces. |
| `opl skill sync` as current bootstrap command | Retired; current command is `opl connect sync-skills`, with negative tests guarding the old surface. |
| Developer checkout overwriting managed runtime by default | Guarded by runbook constraints; developer checkout is explicit source-development mode only. |
| Full readiness / domain ready / production ready conflation | Guarded by core invariants, status docs and the runbook completion-standard section. |
| Gateway / frontdoor / compatibility route interpretation | Remains history/provenance only; new-machine bootstrap uses OPL Framework, Connect, App, OPL Flow and OPL Doc owner split. |

## Uncovered Scope

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: README/core docs were read as context; non-new-machine support references, runtime-substrate docs, operating-governance docs, active support docs and history clusters remain under the global `/goal`.
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`: no new body-level audit in this tranche.
- Runtime/provider readiness, App release validation, domain owner receipt, quality verdict and production readiness remain outside this support-doc ledger.

## Next Write Scope

Continue OPL support-reference coverage from fresh live truth, prioritizing any remaining `docs/references/current-support/*` items that can still freeze dynamic install state, release evidence, test lane membership, package manifest state, companion skill status, local proof paths, old command names or readiness claims. If this OPL support layer is exhausted, resume the six-repo ledger with the next unreviewed semantic theme and keep stale module/interface/test/workflow retirement tied to live source/contracts/tests evidence.

## Verification

Minimum verification for this tranche:

- `git diff --check`
- conflict-marker scan over `README* docs`
- OPL Doc doctor JSON output for the OPL repo

This ledger is history/provenance only. It does not close the global `/goal`.

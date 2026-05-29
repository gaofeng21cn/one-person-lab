# 2026-05-30 OPL Series Doc Governance Memory Reference Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_memory_reference_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
RUN_SNAPSHOT_TS: `2026-05-29T17:26:52Z`

## Frozen Scope

本轮延续 OPL Doc Governance `/goal`，冻结 `RUN_SNAPSHOT_TS=2026-05-29T17:26:52Z` 的六仓 inventory。全局 `/goal` 仍 active，未关闭。

| Repo | Snapshot handling |
| --- | --- |
| `one-person-lab` | clean/synced `c6341362`，only root worktree；最近 1 小时写入来自上一 tranche 和 `.officecli/config.json`，不做 branch/worktree cleanup，本轮只做 support-doc 语义修正。 |
| `med-autoscience` | main clean but ahead origin/main 16 at `4e0ee8f4`，且 `docs/status.md`、`docs/active/mas-ideal-state-gap-plan.md`、AI reviewer tests 近期写入；保留。 |
| `med-autogrant` | clean/synced `3fc5041`，近期 `.agents/plugins/marketplace.json` 与 docs portfolio 写入；保留。 |
| `redcube-ai` | main dirty/synced at `7586ffc`，README/docs/native-PPT/source/tests dirty，多条 dirty/stale worktree；保留。 |
| `opl-meta-agent` | clean/synced `59e216d`，近期 docs portfolio 写入；保留。 |
| `one-person-lab-app` | main dirty/synced at `eadbde5`，App shell/docs/script dirty，`codex/full-first-run-stable-gate-20260525` dirty remote-backed worktree 保留。 |

Open PR check returned `[]` for all six repos after one retry for App. Process scan showed Codex/Playwright/codegraph infrastructure, One Person Lab App/Aion core, App/self-hosted runner processes, and no cleanup-safe governance worktree process for this tranche.

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | OPL `AGENTS.md`/`TASTE.md`、OPL Doc Governance skill、automation memory、OPL docs portfolio。 |
| Support docs | `docs/references/operating-governance/family-domain-memory-governance.md`、`family-product-operator-projection.md`、operating-governance index、stage-led roadmap currentness sections。 |
| Live memory read-model | `./bin/opl domain-memory list --json`、`./bin/opl domain-memory inspect --domain mas --json`、`./bin/opl help` domain-memory surfaces。 |
| Source/contracts/tests refs | `contracts/family-orchestration/family-domain-memory-ref.schema.json`、`contracts/family-orchestration/family-domain-memory-writeback.schema.json`、`src/*domain-memory*` / CLI read-model references from `rg`、runtime App/operator drilldown references in tests. |

## Change

| File | Change |
| --- | --- |
| `docs/references/operating-governance/family-domain-memory-governance.md` | Reframed current completion and next steps so runtime memory receipt evidence is read as per-domain dynamic refs-only evidence, not as stale MAS-only dated proof or apply landed. |
| `docs/history/process/plans/2026-05-30-opl-series-doc-governance-memory-reference-ledger.md` | Added this compact coverage ledger. |
| `docs/history/process/plans/README.md` | Indexed this ledger as history provenance. |

## Retired / Preserved Surfaces

- Retired stale currentness wording: the support doc no longer makes MAS DM002 dated proof the current completion anchor for family memory progress.
- Preserved machine surfaces: `opl domain-memory list|inspect|migration-plan`, `opl runtime app-operator-drilldown --detail full --json`, framework readiness and evidence-worklist read-models.
- No source module, CLI command, workflow, test, branch or worktree was deleted in this tranche.

## Unreviewed Documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most README/docs outside the operating-governance memory reference context remain unreviewed in this tranche.
- `med-autoscience`, `med-autogrant`, `redcube-ai`, `opl-meta-agent`, `one-person-lab-app`: body-level README/docs audit remains under the global `/goal`; dirty/recent/owner-backed lanes were not edited.

## Blockers / Retained Snapshot Lanes

- `med-autoscience`: ahead origin/main 16 plus recent docs/tests writes.
- `redcube-ai`: dirty native-PPT/source/test/docs lanes and multiple worktrees.
- `one-person-lab-app`: dirty main and dirty remote-backed full-first-run worktree.
- `med-autogrant` and `opl-meta-agent`: clean but recently written by prior tranche, so not selected for this write scope.

## Post Snapshot Activity

No post-snapshot activity was used to expand this tranche. Any new dirty file, process, branch, PR, remote ref or external owner action after `2026-05-29T17:26:52Z` belongs to the next heartbeat intake unless it directly conflicts with this OPL memory-reference edit.

## Next Scope

Continue OPL support-reference cleanup from fresh live truth. Good next candidates are operating-governance docs and `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` sections that still risk freezing dated proof snapshots, per-domain counters, receipt ids, branch/SHA state, or provider proof snapshots. Keep MAS/RCA/App dirty lanes isolated unless explicitly assigned.

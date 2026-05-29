# OPL series docs governance tranche ledger part 48

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_48`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 convergence-governance support reference、framework readiness oracle、family runtime worklist contract、App/operator projection truth、domain truth、artifact authority、quality verdict、owner receipt、physical-delete authorization 或 production readiness oracle。当前 truth 回到核心五件套、contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App/workbench projection 和真实 evidence。
Date: `2026-05-29`

## Scope

本轮处理 `docs/references/convergence-governance/**` 中的 dated read-model snapshot 与旧 JSON parse fail-closed 污染：

- `docs/references/convergence-governance/README.md`
- `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
- `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`
- process ledger index

目标是让 convergence-governance reference 只保留 lifecycle、定位收敛、stage adoption 和反污染方法，不再把 2026-05-28 的 counters、warning 数、旧 parse error 或单轮 App/worklist projection 写成当前事实。

## Fresh Evidence

本轮 live evidence：

- `opl agents conformance --family-defaults --json`
  - `standard_domain_agent_conformance.status=passed`
  - summary: `total_repo_count=4`、`passed_count=4`、`blocked_count=0`、`structural_conformance_status=passed`
  - authority boundary: OPL 不能写 domain truth / memory body，不能授权 quality/export，conformance report 不能 claim domain ready。
- `opl stages list --json`
  - summary: `total_projects_count=4`、`resolved_planes_count=4`、`stages_count=19`、`admitted_stages_count=19`、`blocked_stages_count=0`、`needs_contracts_stages_count=0`
  - resolved planes covered `med-autogrant`、`med-autoscience`、`redcube-ai` and `opl-meta-agent`。
- `opl stages readiness --family-defaults --json`
  - `family_stage_readiness.status=launch_warning`
  - summary: `domain_count=4`、`stage_count=19`、`admitted_stage_count=19`、`hard_blocker_count=0`、`warning_count=58`
  - authority boundary: `can_claim_domain_ready=false`、`can_claim_artifact_authority=false`、`can_claim_production_ready=false`。
- `opl agents default-callers --family-defaults --json`
  - `agent_default_caller_readiness.status=ready_domain_evidence_required`
  - summary: `total_repo_count=4`、`generated_default_caller_surface_count=32`、`blocked_surface_count=0`、`deletion_evidence_worklist_count=32`
  - migration policy says zero missing deletion evidence is not delete-ready and the report does not authorize physical delete.
- `opl framework readiness --family-defaults --json`
  - parseable JSON returned in this checkout.
  - `framework_readiness.status=framework_control_plane_available_with_operator_attention`
  - attention summary includes hard blocker 0 and warning count 3, with refs-only / operator-attention semantics.
  - authority boundary denies domain ready、production ready、artifact authority、quality/export、domain truth write、memory/artifact body access and domain action execution.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`
  - parseable JSON returned in this checkout.
  - summary: `open_worklist_item_count=19`、`closed_refs_only_item_count=341`、`worklist_item_count=360`
  - `domain_ready_authorized=false`、`production_ready_authorized=false`
  - zero open worklist is explicitly not a completion/domain-ready/production-ready claim.
- `opl runtime app-operator-drilldown --json`
  - parseable JSON returned in this checkout.
  - summary includes App/operator projection refs and provider SLO status, but `app_release_user_path_release_ready_claimed=false` and `app_release_user_path_production_ready_claimed=false`.
  - authority boundary keeps OPL as refs-only App/operator drilldown; it cannot write domain truth, memory body, artifact body, quality/readiness/export verdicts, domain actions or provider signals.

## Changes

- `docs/references/convergence-governance/README.md`
  - Replaced the 2026-05-28 frozen counter / parse-error paragraph with a currentness policy.
  - The index now points dynamic conformance/stage/default-caller/framework/worklist/App reads back to fresh CLI/read-model commands.
- `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
  - Replaced dated adoption-readiness counters with support-reference currentness policy.
  - Reframed `opl stages list|inspect|readiness` as fresh structural/admission/readiness-warning evidence only.
  - Kept the hard boundary that stage discovery/readiness does not authorize workflow-engine landed claims, domain default caller complete, owner-chain closeout, artifact authority, quality verdict or App release readiness.
- `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`
  - Replaced the dated state anchor and stale fail-closed read-model guard with support-reference currentness policy.
  - Kept the document as positioning / anti-pollution reference only, with dynamic roadmap/release/production/artifact/quality/owner-chain claims routed back to fresh core docs and read-model evidence.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-48.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 48 index row.

No source, machine-readable contracts, tests, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

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
- `docs/references/convergence-governance/README.md`
- `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
- `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`
- `docs/references/convergence-governance/docs-lifecycle-management-playbook.md`
- `docs/references/convergence-governance/series-doc-intake-template.md`
- `docs/references/convergence-governance/family-shared-release-maintenance.md`
- fresh `opl agents conformance --family-defaults --json`
- fresh `opl stages list --json`
- fresh `opl stages readiness --family-defaults --json`
- fresh `opl agents default-callers --family-defaults --json`
- fresh `opl framework readiness --family-defaults --json`
- fresh `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`
- fresh `opl runtime app-operator-drilldown --json`

Edited:

- `docs/references/convergence-governance/README.md`
- `docs/references/convergence-governance/family-stage-control-plane-adoption-plan.md`
- `docs/references/convergence-governance/opl-positioning-convergence-lessons.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-48.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, workflows, App release files, shell files or tests were archived, tombstoned or deleted in this tranche.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `7af503cd` before part48 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part48-convergence-currentness`.
- Branch: `codex/opl-doc-governance-20260529-part48-convergence-currentness`, based on root `main`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/system-update-npm-shim-repair-20260529`.
- App repo retained unrelated local modifications and was read-only in this tranche.
- `opl-aion-shell` retained unrelated local modifications and was read-only in this tranche.

## Remaining stale / retire candidates

- Continue scanning `docs/references/convergence-governance/*` for support docs that still carry fixed-date counters, old fail-closed notes or reference-layer currentness overclaims.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Verification

Fresh verification before absorb:

- `npm ci` was required because the isolated worktree lacked `node_modules`; it exited `0` and ran `npm run build`. npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' docs contracts src tests README.md .github`.
- Stale convergence-governance scan returned no matches for retired fixed snapshot / parse-error wording in `docs/references/convergence-governance`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- Focused verification-surface test passed: `node --experimental-strip-types --test tests/src/verification-command-surfaces.test.ts` reported `tests 20`, `pass 20`, `fail 0`.

## Next tranche write scope

- Prefer another small convergence-governance, specs, runtime/product or public-doc currentness tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc / contract / focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.

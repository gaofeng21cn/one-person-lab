# OPL Frontdoor Machine Field Retirement Closeout

Owner: `One Person Lab`
Purpose: `opl_frontdoor_machine_field_retirement_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL Doc / source-contract-test tranche closeout。当前机器接口真相继续归 `contracts/`、source、tests、CLI/API/read-model 和 repo-native verification；当前执行目标、gap 与下一轮 baton 继续归 `docs/active/current-state-vs-ideal-gap.md`；文档生命周期治理归 `docs/docs_portfolio_consolidation.md`。

## Semantic Theme

本轮治理主题是 `active frontdoor machine-field retirement -> command surface contract/read-model/test migration`。

上一轮 docs-only lane 已把 public/current prose 改成 `command surface` / `command spine`，但 active contract/source/test payload 仍暴露 `platform_frontdoors`、`agent_cli_frontdoor_policy`、`frontdoor_spine`、`canonical_frontdoor` 等旧机器字段。本轮把这些 active machine fields 迁移为 `command_surface` 语义，并用 tests 阻止旧 key 作为兼容面复活。

## Single Source Of Truth

| Theme | SSOT owner | Why it wins |
| --- | --- | --- |
| Brand module command surface governance | `contracts/opl-framework/brand-cli-governance.json` plus `src/contracts.ts`, `src/brand-modules.ts`, `src/brand-module-surfaces.ts` | JSON contract shape、loader validation 和 CLI/read-model payload 是 active machine interface。 |
| Foundry Agent series command spine | `contracts/opl-framework/foundry-agent-series-contract.json`, `src/foundry-agent-cli-spine.ts`, `src/opl-skills.ts`, scaffold constants and generated skeleton contract | Foundry Agent CLI, skill catalog, scaffold output and generated skeleton must share one field vocabulary. |
| No-compatibility guard | Focused CLI/skill/scaffold tests | Tests assert new payload fields and assert old `frontdoor_*` keys are absent. |
| Human support docs | `contracts/README.md`, `contracts/opl-framework/README*`, `docs/references/brand-modules/connect.md`, `docs/references/brand-modules/foundry.md` | Support docs point readers to the new machine field names without becoming machine truth. |
| Retired route vocabulary provenance | `docs/history/**` and negative guards | Old route terms remain only as history, tombstone, provenance or no-resurrection guard material. |

## Coverage Summary

| Theme | Current coverage |
| --- | --- |
| Semantic peer set | Root `README*`, `docs/**/*.md`, active machine contracts, source/read-models, focused tests and directly affected support docs were reviewed for active `frontdoor` machine-field vocabulary. Detailed path lists stay recoverable from this commit's git diff and verification output. |
| Contract/source/test migration | Brand CLI governance, Foundry Agent series, generated skeleton, CLI/read-model payloads, skill catalog, scaffold constants and focused no-resurrection tests moved to `command_surface` vocabulary. Current machine truth remains in contracts, source and tests. |
| Support docs | Affected support docs point readers to command-surface vocabulary without becoming machine truth. |
| History/provenance boundary | `docs/history/**` legacy/provenance content and active negative-guard prose that explicitly says old `frontdoor` wording is history, tombstone, diagnostic or no-resurrection context was intentionally left as provenance. |

## Edit Decision

- Renamed active brand CLI governance fields from `platform_frontdoors` / `canonical_frontdoor` to `platform_command_surfaces` / `canonical_command_surface`.
- Renamed Foundry Agent series policy fields from `agent_cli_frontdoor_policy`, `canonical_opl_frontdoor`, `ordinary_public_frontdoor_spine`, `replacement_frontdoor`, and skill sync/connect frontdoor fields to the corresponding `*_command_surface*` fields.
- Updated CLI/read-model payloads for brand modules, internal agent modules, Foundry Agent series, Foundry Agent list/inspect, and `opl connect skills` skill catalog.
- Updated scaffold constants and generated skeleton contract so new standard agents receive the same command-surface vocabulary.
- Added focused no-resurrection assertions that old `frontdoor_*` payload keys are absent from key CLI and skill catalog read models.
- Updated support docs and public command summaries to use human-readable `command surface` wording while preserving JSON field names where they are the actual machine interface.

## Unreviewed Docs

This tranche did not re-audit every root `README*` and `docs/**/*.md` section. It covered the semantic peer set for active `frontdoor` machine fields and the directly affected support docs. The six-repo `/goal` remains open until every repo ledger has no unreviewed docs or unresolved stale/retire candidates.

## Remaining Stale Or Retire Candidates

- `frontdoor` still appears in non-history docs as explicit retired-route / negative-guard language. That is allowed only while the text points to history, tombstone, diagnostic, provenance, or no-resurrection context.
- Domain-owned direct CLI command names such as `mas foundry`, `mag foundry`, `rca foundry`, and OMA generated inspect remain active command surfaces; this lane only retired the old OPL machine-field vocabulary.
- Physical stale-surface deletion remains outside this closeout and still requires replacement parity, no-active-caller evidence, owner receipt or typed blocker, no-forbidden-write proof and tombstone/provenance.

## Verification

Verification was performed in the isolated worktree `codex/opl-frontdoor-field-retirement-20260608` based on fresh `origin/main`.

- Focused Node tests passed: `node --test tests/src/cli/cases/brand-modules.test.ts tests/src/opl-skills-boundary.test.ts tests/src/cli/cases/agents-scaffold-generation.test.ts tests/src/cli-codex-default-shell.test.ts` with `50/50` passing.
- Active machine-field scan found no old `frontdoor` fields in `contracts` or `src`; remaining matches in `tests` are explicit no-resurrection assertions.
- Repo-native verification passed: `./scripts/verify.sh` with `45/45` smoke tests.
- OPL Doc doctor passed: `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- `git diff --check` passed.
- Strict conflict-marker scan passed with no matches: `rg -n -I -e '^(<<<<<<< |=======|>>>>>>> |\\|\\|\\|\\|\\|\\|\\| )' README*.md docs contracts src tests`.

## Next Write Scope

Next safe scope should continue with a fresh six-repo inventory and choose the next semantic docs/source retirement lane from the current safe write set. Do not treat this closeout as completion of the six-repo docs lifecycle goal.

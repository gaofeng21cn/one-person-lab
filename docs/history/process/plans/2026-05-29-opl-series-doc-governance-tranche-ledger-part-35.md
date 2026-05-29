# OPL series docs governance tranche ledger part 35

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_35`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 skill catalog、companion sync contract、Codex plugin registry、recommended skill status、tool readiness、Full runtime payload、App first-run evidence 或 user Codex config oracle。当前 truth 回到 `contracts/`、source、tests、核心五件套、CLI/read-model 和真实 filesystem evidence。
Date: `2026-05-29`

## Scope

本轮继续 OPL current-support reference cleanup，处理：

- `docs/references/current-support/opl-default-skill-ecosystem.md`

目标是把默认 skill 生态支撑文档从安装手册 / 固定推荐顺序 / 不完整 companion 清单收窄为 stable support reference：明确 currentness policy、机器入口读法、domain plugin-only boundary、Superpowers profile boundary、OfficeCLI / MinerU tool readiness 和 Full runtime packaged payload 读法，避免后续把 prose 命令或列表读成当前本机 skill 状态、tool version、Codex config 或 App 首启结果。

## Fresh Evidence

本轮 live evidence：

- `src/install-companions/catalog.ts`
  - `buildOplRecommendedSkillSpecs()` 当前推荐 companion 包含 `superpowers`、`officecli`、`ui-ux-pro-max`、`mineru-document-extractor`、`officecli-docx`、`officecli-pptx`、`officecli-xlsx` 和 Codex bundled Office detection surface。
  - Packaged source 可通过 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 暴露。
- `src/install-companions.ts`
  - `skill companion status` / observe 只读构造 `opl_companion_skill_sync`，不修改用户 skill path。
  - `managed` mode 才会 symlink companion skills、clone/update full Superpowers、materialize OfficeCLI / ui-ux-pro-max / MinerU sources，或使用 packaged source。
  - Superpowers `lite` 指向 `~/.skills-manager/skills/superpowers-lite`，`full` 指向 full `~/.codex/superpowers/skills` 或 packaged source。
- `src/install-companions-parts/tools.ts`
  - Companion tools 当前是 `officecli` 与 `mineru-open-api`。
  - Tool detection reads env override, `OPL_FULL_RUNTIME_HOME/bin`, PATH, and `~/.local/bin`; managed install can install unless `OPL_COMPANION_DISABLE_REMOTE_INSTALL=1`.
- `src/opl-skills.ts`
  - Family skill pack specs are MAS/MAG/RCA repo plugin installers plus OMA `opl_generated_plugin_surface`.
  - MAS/MAG/RCA codex skill mirrors are removed instead of written to `~/.codex/skills`.
  - OMA generated Codex plugin is materialized under OPL state / generated plugin cache, not as default companion skill mirror.
- `src/system-installation/codex-plugin-registry.ts`
  - Registry specs cover `mas@mas-local`, `mag@mag-local`, `rca@rca-local`, and `opl-meta-agent@opl-meta-agent-local`.
  - Registry removes old standalone family MCP server tables while preserving unrelated MCP servers.
- Focused tests reviewed:
  - `tests/src/opl-skills-boundary.test.ts`
  - `tests/src/cli/cases/system-install-superpowers.test.ts`
  - `tests/src/cli/cases/system-install.test.ts`
  - `tests/src/cli-codex-default-shell.test.ts`
  - `tests/src/skill-catalog.test.ts`
- Fresh CLI/read-model probes:
  - `./bin/opl skill companion status --json` exited `0`; output had `surface_id=opl_companion_skill_sync`, `mode=observe`, `superpowers_profile=keep`, `summary.total=8`, `summary.ready=7`, `summary.tools_ready=2`, `summary.tools_total=2`, and item ids `superpowers` / `officecli` / `ui-ux-pro-max` / `mineru-document-extractor` / `officecli-docx` / `officecli-pptx` / `officecli-xlsx` / `openai_primary_runtime_office`.
  - `./bin/opl skill list --json` exited `0`; output had `surface_id=opl_skill_catalog`, four packs, `summary.ready_to_sync=4`, MAS/MAG/RCA from repo plugin installer, and OMA from `opl_generated_plugin_surface`.
  - `./bin/opl system initialize --json` exited `0`; `recommended_skills` had `summary.total=8`, `summary.ready=7`, `summary.missing=1`, and `recommended_skills` checklist read `ready`. The same output also showed dynamic provider/module maintenance state, which is not frozen by this ledger or the support doc.

## Changes

- `docs/references/current-support/opl-default-skill-ecosystem.md`
  - Added currentness policy for recommended companion status, tool readiness, plugin registry, generated plugin surface, packaged payload and user environment.
  - Updated the three-layer model to include MinerU document extractor / `mineru-open-api` and to keep Docker/WebUI payload claims evidence-bound.
  - Replaced Superpowers clone / symlink commands with profile boundary rules that point to fresh CLI/source evidence.
  - Added a machine-entry table covering companion catalog, companion status/apply, tool readiness, family skill plugin sync, Codex plugin registry and `system initialize`.
  - Rewrote OfficeCLI section into a current recommended companion category list, including MinerU and Codex bundled Office availability.
  - Replaced the numbered App recommendation order with durable maintenance rules for `observe`, `ask_to_apply`, `managed`, packaged Full runtime source, Codex bundled detection, MDS/MAS-internal exclusion and plugin-only domain skill boundary.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-35.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 35 index row.

No contracts, source, tests, package scripts, workflows, App files, MAS/MAG/RCA/OMA repos, runtime ledgers or provider state were modified.

## Verification

Fresh verification:

- `rtk npm ci` exited `0` and ran `npm run build`; npm audit reported 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- `rtk git diff --check` exited `0`.
- `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md contracts scripts src tests .github` returned no conflict markers.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- `rtk node --experimental-strip-types --test tests/src/opl-skills-boundary.test.ts tests/src/cli/cases/system-install-superpowers.test.ts tests/src/cli/cases/system-install.test.ts tests/src/cli-codex-default-shell.test.ts` passed: `tests 45`, `pass 45`, `fail 0`.
- After fast-forward / push from root, repeat static checks and focused skill/install tests from `main`.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/current-support/opl-default-skill-ecosystem.md`
- `src/install-companions.ts`
- `src/install-companions/catalog.ts`
- `src/install-companions-parts/tools.ts`
- `src/opl-skills.ts`
- `src/system-installation/codex-plugin-registry.ts`
- `src/skill-catalog.ts`
- `src/cli/cases/private-command-specs.ts`
- `src/cli/cases/public-command-specs.ts`
- `tests/src/opl-skills-boundary.test.ts`
- `tests/src/cli/cases/system-install-superpowers.test.ts`
- `tests/src/cli/cases/system-install.test.ts`
- `tests/src/cli-codex-default-shell.test.ts`
- `tests/src/skill-catalog.test.ts`
- prior process ledger index entries, especially part 34, to avoid duplicate scope

Edited:

- `docs/references/current-support/opl-default-skill-ecosystem.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-35.md`
- `docs/history/process/plans/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was synced with `origin/main` at `ab82dc7e` before part35 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part35`.
- Branch: `codex/opl-doc-governance-20260529-part35-skill-ecosystem`, tracking `origin/main`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/codex/opl-stage-log-observability-closure`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/dm003-default-executor-single-flight`.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots, stale version anchors, head SHA examples and old support assumptions.
- Strong next candidate:
  - `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS notes start acting as current truth instead of support reference.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered one OPL current-support skill ecosystem reference.

## Next tranche write scope

- Prefer fresh install / GUI first-launch / Docker WebUI support currentness, backed by App release/testing contracts, fresh-install smoke source, Dockerfile / shell evidence and current package/support docs.

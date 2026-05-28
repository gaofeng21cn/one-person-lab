# OPL series docs governance tranche ledger part 26

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_26`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、package manifest、App release oracle、updater metadata、release evidence bundle 或 domain authority。当前 truth 回到 `docs/references/current-support/opl-release-packages-modular-distribution.md`、核心五件套、contracts、source、CLI/API、runtime ledger、App release evidence、`one-person-lab-app` release contracts 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL current-support 支撑文档里的 release/package 分发 currentness：

- `docs/references/current-support/opl-release-packages-modular-distribution.md`

目标是保留稳定的 Release / Packages / Full 首次安装包 / domain module owner 边界，同时退役旧版本号、日期、包体积和 manifest 样例被误读成当前 release truth 的风险。动态 release candidate、manifest 版本、package size、sha256、branch/SHA、App release evidence cohort 和 readiness counters 不写回长期 support doc。

## Fresh Evidence

本轮 live evidence：

- `opl packages manifest --json`：manifest 读取为 OPL `26.5.28`；`module_install_update_source=git_checkout`；`package_consumption_status=packages_defined_not_consumed_by_install_update`；release automation 为 `prepared_not_consumed_by_module_install_update`；channel manifest kind 为 `opl_release_channel_manifest.v1`；latest source until packages consumed 仍是 `git_checkout_upstream_default_branch`；module keys 为 `medautogrant`、`medautoscience`、`oplmetaagent`、`redcube`；WebUI image 为 `ghcr.io/gaofeng21cn/one-person-lab-webui:26.5.28`；native helper image 为 `ghcr.io/gaofeng21cn/one-person-lab-native-helper`。
- `npm run packages:release-discipline -- --manifest /tmp/opl-package-manifest-part26.json`：用 `opl packages manifest --json` 抽取的临时 manifest 验证通过，modules 为 `medautoscience`、`medautogrant`、`redcube`、`oplmetaagent`；release automation 继续要求 channel manifest、artifact build workflow、sha256、previous manifest rollback 和 retain-latest cleanup strategy。
- `scripts/package-release-discipline.mjs`：gate 明确要求 manifest/package consumption 仍为 git checkout / defined-not-consumed，模块 release discipline 必须含 `sha256_recorded` 与 `channel_manifest_written`，source archive size 必须为正数，source git head 必须是 40 位 SHA。
- `scripts/package-module-archives.mjs` 与 `src/package-distribution.ts`：manifest build 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json`、`SHA256SUMS` 和 module source archive，并写入 `source_archive.size`、`source_archive.sha256`、`checksum` 与 `source_git.head_sha`；本轮没有运行生成命令，避免在 repo checkout 写入 dist/package outputs。
- `opl runtime app-operator-drilldown --json` summary：projection available，policy 为 refs-only；App release/user-path claim flags 为 `release_ready_claimed=false`、`production_ready_claimed=false`；gate count 5、open gate count 0。
- `opl runtime app-operator-drilldown --json` detail scan：`status=app_release_user_path_evidence_refs_observed`、`production_user_path_ready=true`、all gates observed、ledger refs verified、selected cohort 为 `app-release-cohort:26.5.28-draft.20260527235839`，selection policy 为 single cohort or newest complete candidate without cross-cohort gate mixing；该状态仍不授权 release ready 或 production ready claim。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`、`can_claim_domain_ready=false`、`can_claim_production_ready=false`。
- `one-person-lab-app/docs/release/README.md` 与 `one-person-lab-app/contracts/app-release-channel.json`：App repo owns standard macOS arm64 package、Full first-install DMG、updater metadata、release upload、GUI smoke、user release notes 和 stable release proof gates；OPL Framework 只是 Full DMG runtime/CLI/contracts payload source，不拥有 App release workflow。
- `/Users/gaofeng/workspace/one-person-lab-app` live status：repo 在 `main...origin/main`，head 与 origin 均为 `d6f60d2`，但有 5 个外部本地修改文件：`.github/workflows/opl-first-run-vm.yml`、`scripts/README.md`、`scripts/plan-release-candidate.ts`、`scripts/validate-release-boundary.ts`、`tests/release/app-release-boundary.test.ts`。本轮只读 App repo，不修改、不验证、不吸收该 dirty lane。

## Changes

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - Added a currentness policy that freezes owner/distribution boundary only, not dynamic package/release/App readiness facts.
  - Removed the fixed MB archive-size table; current archive size, sha256, version and source git must come from release-time manifest generation or release evidence.
  - Replaced hard-coded `26.4.27` / `26.4.26` / `1.9.21` / `2026-04-27T00:00:00Z` sample values with explicit shape placeholders, and reshaped the sample around the live `packages.modules` manifest structure.
  - Clarified that the bundled Codex default profile in the package manifest is a product-default projection, not a secret, user-local Codex config or executor policy.
  - Kept the stable boundary that Releases remain the user download surface, Packages are only the machine channel once install/update consumes them, Full DMG is an App-owned first-install asset, and MDS is not part of default manifest / Full payload.

## Coverage

Reviewed:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/references/current-support/README.md`
- `docs/status.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `scripts/package-release-discipline.mjs`
- `scripts/package-module-archives.mjs`
- `src/package-distribution.ts`
- `one-person-lab-app/docs/release/README.md`
- `one-person-lab-app/contracts/app-release-channel.json`

Edited:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-26.md`
- `docs/history/process/plans/README.md`

No docs, modules, interfaces, tests or App release files were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning current-support docs for fixed release candidate IDs, receipt refs, branch/SHA snapshots, local proof paths, old package sizes, old provider status and compatibility wording.
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md` remains a strong next candidate because it can mix stable fresh-install policy with dated VM/release evidence.
- `docs/references/current-support/opl-docker-webui-deployment.md` remains a next candidate for Docker/WebUI release/currentness and App-owned release evidence boundary.
- Do not edit or absorb the current `one-person-lab-app` dirty lane unless explicitly taking ownership.

## Next tranche write scope

- Continue OPL support-reference cleanup in small verified slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable owner boundary with dated counters, release candidate IDs, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics, old compatibility promises or stale current anchors.

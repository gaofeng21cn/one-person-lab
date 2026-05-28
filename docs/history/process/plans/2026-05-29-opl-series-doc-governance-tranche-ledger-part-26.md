# OPL series docs governance tranche ledger part 26

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_26`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、package manifest、release oracle、App release evidence、runtime contract 或 domain authority。当前 truth 回到 `docs/references/current-support/opl-release-packages-modular-distribution.md`、`src/package-distribution.ts`、`scripts/package-module-archives.mjs`、`scripts/package-release-discipline.mjs`、`.github/workflows/packages.yml`、相关测试、CLI/API 行为和 App-owned release evidence。
Date: `2026-05-29`

## Scope

本轮处理 OPL current-support 支撑文档里的 release / Packages / modular distribution currentness drift：

- `docs/references/current-support/opl-release-packages-modular-distribution.md`

目标是退役固定版本号、固定 archive size、固定 rollback target、module head SHA 示例和本机构建快照，把长期文本改成稳定 release / Packages / App / module owner boundary。动态 package 坐标、archive size、sha256、module head SHA、workflow run、GHCR digest、App release asset 和 Full DMG evidence 继续归 fresh manifest、source、tests、workflow 或 `one-person-lab-app` release evidence。

## Fresh Evidence

本轮 live evidence：

- `opl packages manifest`：`module_install_update_source=git_checkout`，`package_consumption_status=packages_defined_not_consumed_by_install_update`，release automation status 为 `prepared_not_consumed_by_module_install_update`；manifest 投影 WebUI image、native helper、bundled Codex default profile 与 MAS/MAG/RCA/OMA module package 坐标，但当前 module install/update 仍不是 Packages/GHCR 消费路径。
- `src/package-distribution.ts#buildOplPackageManifest`：manifest version、release channel、rollback、cleanup、module specs、fallback git、current/future source discipline 与 package refs 的 source owner。
- `scripts/package-module-archives.mjs`：release-time archive builder 用 `git archive --format=tar.gz HEAD` 生成 module source tarball，并写入 `source_archive.size`、`source_archive.sha256`、`checksum`、`source_git.head_sha`、`opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`。
- `scripts/package-release-discipline.mjs`：CI gate 强制当前 install/update source 仍为 `git_checkout`，package consumption status 仍为 `defined_not_consumed_by_install_update`，并检查 channel manifest、checksum、rollback 和 cleanup discipline。
- `.github/workflows/packages.yml`：中央 workflow 产出 module archives / release manifest / channel manifest / SHA256SUMS 并推送 GHCR package refs；WebUI image 从 App repo AionUI shell context 构建。
- `tests/src/cli/cases/package-distribution.test.ts`：覆盖 manifest shape、Codex default profile secret boundary、package refs、current install/update source、archive manifest、checksum、source git 和 release discipline gate。

## Changes

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - Added a currentness policy for release/package fields that must not be frozen in long-lived prose.
  - Removed fixed archive size snapshots and fixed release-version examples from the stable reference.
  - Made the stable current state explicit: Releases are the user download surface, Packages/GHCR are the machine artifact channel, and module install/update still uses git checkout until manifest consumption lands.
  - Reframed JSON as shape-only example with placeholders for version, archive size, sha256, module head SHA and rollback target.
  - Clarified that bundled Codex default profile is a manifest projection and not a secret or user-local executor policy.

## Coverage

Reviewed:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/references/current-support/README.md`
- `docs/README.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md`, `docs/active/current-state-vs-ideal-gap.md`
- `src/package-distribution.ts`
- `scripts/package-module-archives.mjs`
- `scripts/package-release-discipline.mjs`
- `.github/workflows/packages.yml`
- `tests/src/cli/cases/package-distribution.test.ts`

Edited:

- `docs/references/current-support/opl-release-packages-modular-distribution.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-26.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning current-support docs for fixed release counters, package evidence snapshots, local binary diagnostics and App release wording.
- `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md` remains the next high-value current-support candidate.
- App release / Full DMG / Docker WebUI claims must be refreshed from `one-person-lab-app` release evidence and App-owned validation before editing App release prose.

## Next tranche write scope

- Continue OPL support-reference cleanup in small verified slices with fresh CLI/source/test/read-model evidence.
- Prioritize current-support and runtime docs that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics, old compatibility promises or stale current anchors.

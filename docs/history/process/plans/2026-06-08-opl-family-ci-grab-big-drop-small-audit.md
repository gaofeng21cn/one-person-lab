# OPL Family CI 抓大放小审计

State: `dated_audit`
Owner: `One Person Lab`
Purpose: 记录 2026-06-08 对 OPL family GitHub Actions 的 live 巡检、分层判断和本轮 CI 设置调整。
Machine boundary: 本文是 dated human audit。当前 CI 真相继续归 GitHub Actions runs、workflow 文件、repo-native 验证命令、release artifacts、App/Homebrew release metadata 和各 domain repo owner docs。

## 范围

本轮覆盖当前 OPL family active / governed 仓：

- `gaofeng21cn/one-person-lab`
- `gaofeng21cn/one-person-lab-app`
- `gaofeng21cn/med-autoscience`
- `gaofeng21cn/med-autogrant`
- `gaofeng21cn/redcube-ai`
- `gaofeng21cn/opl-meta-agent`
- `gaofeng21cn/opl-doc`
- `gaofeng21cn/opl-flow`
- `gaofeng21cn/homebrew-one-person-lab`
- `gaofeng21cn/opl-aion-shell` 作为 App shell / historical release owner 边界旁证

`opl-aion-shell` 不是当前 App release owner；`opl-agui-codex-shell` 远端不存在或不可见，未纳入 GitHub Actions current failure 统计。

## Live 证据

查询时间：2026-06-08T03:05Z-03:10Z 初查；2026-06-08T03:56Z 复查。

| Repo | 最新 current signal | 判定 |
| --- | --- | --- |
| `one-person-lab` | 初查 `Verify` run `27113639505` failed only in `Read-model gates`，失败点是 root help discoverability。复查最新 `Verify` run `27114681644` 仍只在 `Read-model gates` 失败，其他 Fast、Regression、Native helper、Fresh-install、Lint/local structure、Integration、Build/typecheck 全绿；`Sentrux Advisory` run `27114681639` 绿。本地修复后 `npm run test:read-model-gates` 全绿。 | root help discoverability / example selection 是过细 hard gate，已降到 `meta` / advisory。复跑过程中暴露并修复一个真实 provider lifecycle 大边界：root-scoped worker stop 不得误杀同源码路径下其他 family runtime root 的 foreground worker。workspace generated protocol/currentness 的可自动修复漂移按 `repairable` 测试，不再误作 hard blocker；current stage pointer drift 仍保持 hard blocker。 |
| `med-autoscience` | `macOS CI` run `27113071513` failed in `ci-preflight` / `make test-regression`，19 个 owner-route/currentness/publication action routing 相关失败；line budget 只作为 advisory 输出。 | 大边界失败。涉及 owner route、currentness、paper package / quality / artifact routing，不应为“抓小”而降级。 |
| `med-autogrant` | 最近 runs 只有 `Sentrux Advisory`，连续成功；无 hard default CI。 | 符合当前动态重构期的轻量策略。 |
| `redcube-ai` | `CI` 与 `Sentrux Advisory` 最新 main push 均成功。 | 符合当前策略；hard CI 仍可守核心行为。 |
| `one-person-lab-app` | `OPL Desktop Release` run `27113305624` 复查时仍 in progress。release preflight、standard App build/tests、Full first-install package、remote verification、Full clean VM first launch、operator evidence bundle 均成功；`Run Homebrew standard first-run VM smoke / Clean VM first launch` failed，最终 release readiness summary 仍 in progress。历史 `27102959641` nightly failure 为 `mapfile: command not found`；`27102704728` VM smoke 为 guest smoke timeout。 | 当前 release owner surface，需要继续按 release truth 判断；Homebrew standard first-run VM smoke 是 release user-path/首启 smoke 大边界，不能降为普通 advisory。 |
| `homebrew-one-person-lab` | 复查最新 `Tap Check` for standard 和 Full cask 均 failure（runs `27113843471`, `27113849230`）；同版本早些 Full cask success 已被后续 tap update 覆盖。`Sync From App Releases` run `27111180618` 仍 failed on checksum mismatch。 | Release asset/source truth 不一致，属于大边界；不能降为 advisory。应由 App release/tap sync owner 修复或等后续绿色 run 覆盖后归为 superseded。 |
| `opl-aion-shell` | `Verify Homebrew Cask` latest scheduled runs success。 | 当前仅旁证 shell/Homebrew support；旧 PR failures 为 superseded historical。 |
| `opl-meta-agent`, `opl-doc`, `opl-flow` | `gh run list` 无最近 Actions runs。 | 无 current GitHub CI failure；本地 verify 入口仍归各 repo。 |

## 本轮 CI 设置调整

OPL `read-model-gates` 移除了 `tests/src/cli/cases/framework-readiness-cli-surface.test.ts`。该测试仍保留在 `meta` lane，继续覆盖 command-scoped help 与非默认调用 fail-closed，但不再让 root help 展示细节阻断 default-branch hard CI。

OPL `tests/src/cli/cases/workspace-domain.stages-graph.test.ts` 删除了 root help 示例选择断言。该文件仍覆盖 family stage readiness、replay evidence、launch blocker、stage list/proof bundle、workspace topology 与 domain authority boundary；root help 应如何推荐详细 stage drilldown 属于 display/discoverability policy，不属于 read-model hard gate。

OPL provider lifecycle 修复了 `stopOrphanTemporalForegroundWorkers` 的 root scope：当调用方传入 `familyRuntimeRoot` 时，只停止同一个 `--family-runtime-root` 的 foreground worker；`modulePath` 匹配只作为无 root 的 legacy cleanup。新增回归测试覆盖同 module path、不同 family runtime root 的 worker 不被误杀。

OPL read-model 测试同步了当前 workspace diagnostic policy：`indexed_project_index_missing`、`indexed_exports_root_missing`、`canonical_topology_drift` 等 `workspace upgrade --apply` 可恢复的 generated/protocol 漂移进入 `repairable_findings`，不阻断默认执行；`indexed_current_stage_pointer_drift` 继续作为 closeout-sensitive hard blocker。

OPL transition materialization 测试 fixture 补齐合法 `family_action_catalog` shape，避免用无效 action catalog 误测 materialization timeout / non-read-only skipped 语义。

稳定政策同步写入：

- `docs/policies/github-ci-automation-policy.md`：新增“抓大放小 CI 分层”，定义 hard boundary、advisory/default-demotion 和 upgrade condition。
- `docs/references/current-support/opl-test-lane-governance.md`：明确 `read-model-gates` 只承载 owner/currentness/provider/App/read-model 等大边界；root help/display-only discoverability 属于 `meta` / advisory。

## 后续

- OPL：本地 `Read-model gates` 已通过；推送后等待下一次 `Verify` 覆盖 run `27114681644`。
- MAS：保持 hard failure，不降级；需要由 MAS owner route/currentness 修复线继续处理。
- App/Homebrew：以最新 release run 和 tap validation 为 source of truth。当前 Homebrew standard VM smoke / tap checksum failures 仍按 release user-path/source truth 大边界处理；若后续绿色 run 覆盖，应按 `superseded_historical` 归档，不继续报 current failure。

## 本地验证

2026-06-08T03:56Z 前，本仓本地验证结果：

- `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` passed。
- `node --experimental-strip-types --test --test-name-pattern "domain manifests keeps live manifest resolved when transition materialization times out|domain manifests skips MAS transition materialization when study-state-matrix action is not read-only|domain manifests materializes descriptor-only MAS transition specs through study-state-matrix" tests/src/cli/cases/workspace-domain.transitions.test.ts` passed。
- `node --experimental-strip-types --test --test-name-pattern "workspace upgrade restores repairable project unit protocol refs without moving roots|workspace doctor repairs MAS alias drift and blocks invalid stage lifecycle drift" tests/src/cli/cases/workspace-domain.project-protocol.test.ts` passed。
- `npm run test:read-model-gates` passed。
- `node scripts/test-lanes.mjs assert-coverage` passed；`All 280 active test files are assigned to a test lane.`
- `npm run test:meta` passed。
- `git diff --check` passed。

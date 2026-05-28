# OPL series docs governance tranche ledger part 25

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_25`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、App/operator read model、release oracle、GUI shell contract 或 domain authority。当前 truth 回到 `docs/references/current-support/opl-gui-shell-adapter-boundary.md`、`docs/product/README.md`、`docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、App release evidence 和 live read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL current-support 支撑文档里的 GUI shell / App boundary dated anchor：

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`

目标是退役固定 `2026-05-28` 状态锚点，把长期文本改成 currentness policy 与稳定 GUI/App/OPL runtime owner boundary；动态 release artifact、App state counter、operator route count、provider proof snapshot、branch/SHA state 和本机 GUI smoke 结果继续留在 live read-model、App release evidence 或 history ledger。

## Fresh Evidence

本轮 live evidence：

- `opl app state --profile fast --json`：`schema_version=opl_app_state.v1`、`profile=fast`、`read_policy=bounded_local_read_no_network_no_repair`；runtime source 声明 normal GUI state surface 为 `opl app state --profile fast --json`，full GUI state surface 为 `opl app state --profile full --json`，action boundary 为 `opl app action execute --json`，full drilldown exception 为 `opl runtime app-operator-drilldown --detail full --json`，`shell_must_not_use_full_drilldown_as_normal_state=true`。默认 executor 为 `codex_cli`，executor selector not visible，Developer Mode status ready。
- `opl app state --profile full --json`：`schema_version=opl_app_state.v1`、`profile=full`、`read_policy=bounded_local_read_full_detail_no_mutation`；同样声明 fast/full/action/full-drilldown boundary，默认 executor 为 `codex_cli`，executor selector not visible。
- `opl runtime app-operator-drilldown --json`：projection available，policy 为 refs-only/no domain truth/memory body/artifact body/verdict；summary 读到 stage attempt 25、operator action route 317、`codex_app_drives_long_running_tasks=false`、App release / production ready claim false。Authority boundary 禁止 OPL 写 domain truth、读/写 memory body、读 artifact body、mutate artifact、授权 quality/submission/export verdict 或执行 domain action/provider signal。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`、hard blocker 0，provider cadence/capability SLO satisfied，`can_claim_domain_ready=false`、`can_claim_production_ready=false`、`can_claim_artifact_authority=false`。

## Changes

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
  - Replaced fixed `状态锚点：2026-05-28` with a currentness policy.
  - Preserved the stable three-way boundary: `one-person-lab` owns OPL app state/action and refs-only operator drilldown protocol; `one-person-lab-app` owns GUI product truth, release packaging, runtime bridge/page contracts and active shell validation; `opl-aion-shell` remains the current AionUI implementation carrier.
  - Made explicit that App state / drilldown read models prove GUI-ready state/action and refs-only operator detail only; they do not make GUI shell, AionUI, App repo or release artifact the owner of runtime truth, domain truth, artifact body, memory body, quality/export verdict, App release ready or production ready.

## Coverage

Reviewed:

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md` metadata, conclusion, current division of responsibility and maintenance rules.
- `docs/references/current-support/README.md` current-support index.
- `docs/product/README.md` App state/action and full-drilldown boundary.
- Fresh App fast/full state, App/operator drilldown and framework readiness outputs.

Edited:

- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-25.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned or deleted in this tranche.

## Remaining stale / retire candidates

- Continue scanning current-support docs for fixed receipt ids, branch/SHA snapshots, local proof paths, old provider status, fixed App/release counters and compatibility wording.
- `docs/references/current-support/opl-release-packages-modular-distribution.md` and `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md` remain good next small-slice candidates.
- App release / Full DMG / Docker WebUI claims must be refreshed from `one-person-lab-app` release evidence and App-owned validation before editing release/package support prose.

## Next tranche write scope

- Continue OPL support-reference cleanup in small verified slices with fresh CLI/read-model evidence.
- Prioritize documents that still mix durable target state with dated counters, receipt ids, provider proof snapshots, branch/SHA state, local binary diagnostics, old compatibility promises or stale current anchors.

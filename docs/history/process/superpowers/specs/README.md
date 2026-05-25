# Superpowers Specs 归档

Owner: `One Person Lab`
Purpose: `history_process_superpowers_specs_index`
State: `history_only`
Machine boundary: 本目录是人读历史设计归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录中的 design specs 是早期 Superpowers worker 设计草稿。正文保留当时的设计背景、目标、非目标和验证想法，只用于 provenance、migration review 和 stale wording guard；不得作为当前 active spec、runtime/provider contract、domain truth owner、App/workbench owner 或 readiness/proof oracle 读取。

| 文件 | 历史主题 | 当前 owner |
| --- | --- | --- |
| `2026-04-13-medautoscience-action-graph-design.md` | MAS action graph consumer coverage design | 当前 domain action/stage truth 归 MAS，OPL 只做 refs/projection/consumer verification。 |
| `2026-04-17-multica-family-reuse-program-design.md` | Multica-inspired family reuse design | 当前 external-learning 只保留 vocabulary / product semantics；runtime/provider/executor truth 回到 OPL contracts/read models。 |
| `2026-04-18-family-runtime-task-skill-automation-full-absorb-design.md` | family runtime/task/skill/automation absorb design | 当前 shared boundary 和 generated surface 规则回到 active gap、shared contracts、domain onboarding 和 runtime boundary。 |
| `2026-04-18-workspace-inbox-design.md` | old `opl web` workspace inbox design | 当前 App/workbench 归 `docs/product/`、One Person Lab App repo 和 App/operator drilldown；旧 `opl web` / frontdoor wording 只作历史。 |

当前 specs 入口只看 `docs/specs/` 下仍生效的规格；本目录不会定义 machine-readable behavior。

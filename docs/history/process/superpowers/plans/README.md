# Superpowers Plans 归档

Owner: `One Person Lab`
Purpose: `history_process_superpowers_plans_index`
State: `history_only`
Machine boundary: 本目录是人读历史计划归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录中的 implementation plans 是早期 Superpowers worker 任务包。正文保留当时的步骤、文件列表、checkbox、命令和预期结果，只用于追溯某条实现 lane 的来源；不得按整份继续执行，也不得用其中的通过/完成措辞声明当前 readiness、domain ready、App release ready 或 production ready。

| 历史主题组 | 覆盖内容 | 当前 owner / 读法 |
| --- | --- | --- |
| MAS action graph consumer coverage | MAS action graph fixture、CLI consumer coverage 和 domain projection plan。 | 当前 MAS action/stage/domain truth 归 MAS owner surfaces；OPL 只消费 refs、projection 和 read-model evidence。 |
| Frontdoor readiness / App drilldown | 旧 frontdoor-readiness surface plan。 | 当前 App/operator drilldown 与 product/workbench 边界回到 `docs/product/`、runtime read model 和 App repo；旧 frontdoor 只作历史词。 |
| Multica / shared runtime-task-skill automation learning | Multica-inspired family helper implementation、shared runtime/task/skill/automation absorb plan。 | 当前 shared boundary、generated/hosted surface、domain pack 和 retirement tail 回到 active gap、runtime boundary、shared contracts 和 machine contracts。Multica 只是产品语义学习来源。 |
| Domain-agent entry spec v1 | domain-agent entry implementation plan。 | 当前 domain-agent admission / descriptor owner 是 `docs/specs/opl-domain-onboarding-contract.md`、domain descriptors 和 `opl agents descriptors` live surface。 |

This index does not maintain a file-by-file current-owner table. Exact worker plans remain in this directory for provenance and searchability; read the original file or git history only when the compact theme row is insufficient. Any still-current conclusion must be folded into the current owner before citing this directory.

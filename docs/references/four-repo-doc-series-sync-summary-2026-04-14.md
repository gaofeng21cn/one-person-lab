# 四仓文档系列同步摘要（2026-04-14）

## 目的

这份摘要记录 `One Person Lab`、`Med Auto Science`、`Med Auto Grant`、`RedCube AI` 在本轮文档治理收口中的统一落点，作为后续 cross-repo docs intake 的参考基线。

## 本轮统一落地项

- 四仓统一采用同名清单：`docs/references/series-doc-governance-checklist.md`
- `OPL` 中央新增 `npm run audit:doc-series`，用于巡检四仓 docs surface 是否漂移
- `OPL` 中央新增 `docs/references/four-repo-doc-intake-template.md`，作为后续 cross-repo docs intake 的统一起手模板
- 四仓默认 docs 入口继续收口为 `README*` + `docs/README*` + 核心五件套
- 四仓都把 docs governance 从“只在 AGENTS 里描述”推进到“有 repo-tracked checklist + meta audit”
- 四仓都把 `Hermes-Agent` 的命名边界继续冻结为“上游外部 runtime 项目 / 服务”，不把 repo-local shim / pilot / adapter 写成真实接入

## 四仓当前对齐面

### One Person Lab

- 系列定位：顶层 gateway / federation / shared substrate contract surface
- 公开骨架：四层公开文档体系 + 核心五件套
- 内部对齐重点：Layer 3 reference-grade supporting docs 与 admitted-domain delta intake
- 默认 docs 审计：`scripts/verify.sh meta`

### Med Auto Science

- 系列定位：`Research Ops` domain gateway 与 `Domain Harness OS`
- 公开骨架：双语 `README*` / `docs/README*` + 核心五件套
- 内部对齐重点：`docs/runtime/`、`docs/program/`、`docs/capabilities/`、`docs/references/`、`docs/policies/`
- 默认 docs 审计：`scripts/verify.sh meta`

### Med Auto Grant

- 系列定位：医学 `Grant Ops` author-side / proposal-facing `Domain Harness OS`
- 公开骨架：双语 `README*` / `docs/README*` + 核心五件套
- 内部对齐重点：`docs/specs/` current truth、`docs/references/` 内部参考、`schemas/v1/` 与 `contracts/runtime-program/`
- 默认 docs 审计：`scripts/verify.sh meta`

### RedCube AI

- 系列定位：visual-deliverable domain gateway 与 `Domain Harness OS`
- 公开骨架：双语 `README*` / `docs/README*` + 核心五件套
- 内部对齐重点：`docs/program/` mainline / provenance、`docs/references/`、`docs/policies/` 与 typed boundary audit
- 默认 docs 审计：`scripts/verify.sh meta`

## 后续巡检口径

- 先跑 `npm run audit:doc-series`，看四仓默认入口、核心五件套、checklist section 与中央 intake surface 是否仍然齐平
- 先看四仓是否都还保留同一份 checklist 路径与同型 section 结构
- 再看 `README*`、`docs/README*` 与核心五件套是否继续显式链接、显式分层
- 再看 docs truth、contract surface、program/current-truth pointer、历史档案是否仍被诚实分层，而不是重新混成第二真相源
- 若四仓中任何一仓的 formal entry、runtime owner、product-entry truth、federation admission wording 发生变化，应同步触发中央 intake，而不是只在单仓局部漂移

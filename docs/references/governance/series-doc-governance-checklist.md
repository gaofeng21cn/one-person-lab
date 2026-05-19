# 系列项目文档治理清单

Owner: `One Person Lab`
Purpose: `references_governance_series_doc_governance_checklist`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 目标

本清单用于把 `One Person Lab` 放进 `One Person Lab`、`Med Auto Science`、`Med Auto Grant`、`RedCube AI` 这组系列项目的统一文档管理口径里做巡检。
它服务跨仓 docs intake、回归与持续对齐，不替代核心五件套、公开主线或 machine-readable contracts。

## 一、默认入口

- 根层 `README*` 是产品分发与公开首页入口；是否继续保留双语由 public/product 需求单独判断。
- `docs/README.md` 是默认 docs 索引，承载中文 canonical 文档入口。
- 外部读者先走公开入口；AI / 维护者先走核心五件套与 `contracts/README.md`。

## 二、核心五件套

- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`

这五件套必须位于 `docs/` 根目录，并被 `docs/README.md` 显式链接。
任何涉及当前主线、formal entry、runtime ownership、OPL framework positioning、OPL-hosted path 或 legacy gateway / federation 语境的变化，都不能只改 Layer 3 reference 或历史材料，必须同步更新对应核心文档。

## 三、公开层与内部层

- `docs/**` 默认只维护中文 canonical 内容；稳定路径优先使用无语言后缀 `.md`。
- 根层 `README*` 的公开语言策略单独由产品分发和 public 需求决定，不要求 `docs/**` 维护双语镜像。
- `contracts/` 只保留 machine-readable contract surface，不承载 narrative 规则。
- `docs/references/` 承担 reference-grade sync、审计、样例与 supporting-surface 文档；默认中文维护，不承担 active owner。
- `docs/specs/`、`docs/history/process/` 与 `docs/history/` 继续严格分层，不能重新混回默认公开入口。
- 长期规则应冻结到核心文档、reference surface 或 contract surface；不要把 `AGENTS.md` 继续当第二真相源。

## 四、系列一致性检查

- 文档必须把 `OPL` 写成完整的 stage-led、以 Agent executor 为最小执行单位的智能体运行框架：它可以使用外部 provider，按接近人类专家工作方式组织 Stage，并把 `Codex CLI` 作为默认最小执行单元；不得把 `OPL` 退回旧顶层 gateway / federation surface，也不得写成任何单一 domain runtime owner。
- 系列项目名称与角色要与 admitted domain 当前真相同步：`Med Auto Science` 对应 `Research Ops`，`Med Auto Grant` 对应 `Grant Ops` 业务仓，`RedCube AI` 对应 visual-deliverable / `Presentation Ops`。
- 若提到 `Hermes-Agent`，只能指上游外部 runtime 项目 / 服务；repo-local shim、pilot、helper、adapter 都不能被写成“已接入 Hermes-Agent”。
- 根层公开入口、docs 中文 canonical 层、reference-grade supporting docs、machine-readable contracts 与历史档案必须保持分层，不得重新挤回同一阅读面。旧 gateway/frontdoor/federation/Hermes-first 计划只能在 history、compatibility、diagnostic 或 superseded reference 语境中出现，并指向当前 OPL framework owner。
- 修改 docs skeleton、默认入口、公开 boundary、framework contract、OPL-hosted path 或 admission wording 时，必须同步更新相关 contract/test；但不得用测试固定 README/docs prose、标题或状态文案。

## 五、默认验证

- 默认快速入口：`npm test` / `npm run test:fast`
- 秒级核心入口：`npm run test:smoke`
- 宽回归入口：`npm run test:regression`
- runtime、install 与 retired surface 守护入口：`npm run test:integration`
- 若验证命令、docs index 或 contract/document surface 有变化，继续同步 `package.json`、`scripts/verify.sh`、`scripts/test-lanes.mjs` 与 `tests/src/*`

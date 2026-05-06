# 系列项目文档治理清单

## 目标

本清单用于把 `One Person Lab` 放进 `One Person Lab`、`Med Auto Science`、`Med Auto Grant`、`RedCube AI` 这组系列项目的统一文档管理口径里做巡检。
它服务跨仓 docs intake、回归与持续对齐，不替代核心五件套、公开主线或 machine-readable contracts。

## 一、默认入口

- `README.md` / `README.zh-CN.md` 是默认公开首页。
- `docs/README.md` / `docs/README.zh-CN.md` 是默认 docs 索引。
- 外部读者先走公开入口；AI / 维护者先走核心五件套与 `contracts/README.md`。

## 二、核心五件套

- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`

这五件套必须位于 `docs/` 根目录，并被 `docs/README*` 显式链接。
任何涉及当前主线、formal entry、runtime ownership、top-level gateway / federation positioning 的变化，都不能只改 Layer 3 reference 或历史材料，必须同步更新对应核心文档。

## 三、公开层与内部层

- 第一层与第二层公开文档保持双语，同步表达 `OPL` 的 public mainline、gateway contract 与 shared-foundation boundary。
- `contracts/` 只保留 machine-readable contract surface，不承载 narrative 规则。
- `docs/references/` 承担 reference-grade sync、审计、样例与 supporting-surface 文档；内部维护默认中文，只有已公开 companion 才维持双语。
- `docs/specs/`、`docs/history/process/` 与 `docs/history/` 继续严格分层，不能重新混回默认公开入口。
- 长期规则应冻结到核心文档、reference surface 或 contract surface；不要把 `AGENTS.md` 继续当第二真相源。

## 四、系列一致性检查

- 文档必须把 `OPL` 写成顶层 gateway / federation surface，而不是任何单一 domain runtime owner。
- 系列项目名称与角色要与 admitted domain 当前真相同步：`Med Auto Science` 对应 `Research Ops`，`Med Auto Grant` 对应 `Grant Ops` 业务仓，`RedCube AI` 对应 visual-deliverable / `Presentation Ops`。
- 若提到 `Hermes-Agent`，只能指上游外部 runtime 项目 / 服务；repo-local shim、pilot、helper、adapter 都不能被写成“已接入 Hermes-Agent”。
- 默认公开入口、reference-grade supporting docs、machine-readable contracts 与历史档案必须保持分层，不得重新挤回同一阅读面。
- 修改 docs skeleton、默认入口、公开 boundary、gateway contract 或 admission wording 时，必须同步更新相关测试。

## 五、默认验证

- 默认 docs 审计入口：`scripts/verify.sh meta`
- 默认 smoke：`scripts/verify.sh`
- 若验证命令、docs index 或 contract/document surface 有变化，继续同步 `package.json`、`scripts/verify.sh` 与 `tests/src/*`

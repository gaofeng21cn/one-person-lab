# OPL 硬约束

## 顶层定位

- `OPL` 是顶层 gateway 与 federation surface，不是 domain runtime owner。
- `OPL` 不是第四个 `Domain Harness OS`。

## 文档分层

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 是 AI / 维护者核心工作集。
- `docs/README*` 维护的四层文档体系继续有效：公开主线、公开合同配套、参考级配套、历史 specs/plans。
- 参考级与历史文档不得反向改写公开主线。

## 合同面

- `contracts/` 只保留 machine-readable truth，不承载 narrative 规则。
- 修改 gateway contracts、admission wording 或公开边界时，必须同步更新 docs 与测试。

## 目标优先级

- 一旦系列项目的目标形态已经明确，新增投入默认服务该目标形态，而不是继续深磨已放弃路线。
- 旧执行形态只能作为迁移桥、兼容层、回归基线或对照面存在，不得再被误写为长期产品方向。
- 如果当前可运行基线与长线目标并存，必须在 `docs/status.md` 与 `docs/README*` 中显式拆开，禁止混写。

## 语言规则

- 第一层和第二层公开文档必须双语同步。
- 内部技术、参考、维护、历史与规划文档默认中文。

## OMX

- OMX 已退场。
- `docs/history/omx/` 只作为历史入口，不承担当前 workflow。

## 本地工具状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库的本地状态入口。
- 如需保留历史 session、prompt、log、hook 或执行痕迹，应迁入用户级 `~/.codex/` 归档。

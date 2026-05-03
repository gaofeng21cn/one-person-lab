# OPL 硬约束

## 顶层定位

- `OPL` 是顶层 `Codex-default session runtime` 与共享接口层。
- `OPL` 的默认 runtime 只有一个：`Codex`。
- `Codex CLI` 是 OPL 的受管 runtime dependency：OPL 必须检测实际命中的 binary、版本、最低版本策略和 PATH 候选；同版本兼容 wrapper / alias 归并到当前有效入口，低于当前最低版本或当前命中版本无法解析的 Codex CLI 只能进入 `attention_needed`，不得被报告为 ready。
- 只有显式 domain activation 或显式 runtime switch，才允许离开 Codex-default 语义。
- `OPL Runtime Manager` 只能是产品级薄管理/投影层，不得被写成 scheduler、session store、memory store、domain truth owner 或 concrete executor。
- `Hermes-Agent` 继续是外部 runtime substrate owner；OPL 可以管理、pin、诊断和投影它，但不得 fork/vendor 成 OPL 私有 runtime kernel。
- `OPL native helper` 与高频状态索引只能加速系统探测、artifact discovery、session/progress/artifact projection，不得替代 admitted domain 仓自己的 durable truth。
- `OPL` 的 shared contract、graph、gate、index、scorecard 与 projection 只能携带证据、provenance、状态和路由信号；不得替 MAS/MAG/RCA 或未来 domain 持有 AI-first 作者判断、审稿判断、质量裁决或 ready verdict。
- MAS v2 wording 必须保持 `MAS` 为独立 `domain agent` 与单一 domain app skill owner；`OPL` 只能消费 MAS-owned entry/projection truth，不得把 MAS runtime、controller truth、quality authority 或 publication gate 收归 OPL。
- `MDS` 只能作为 `MAS` 的隐藏 runtime/backend companion 被安装、检查和修复；不得进入 OPL 顶层 domain-agent 入口，也不得被写成独立 OPL-managed domain agent。
- `OPL` 不持有领域运行时所有权。
- `OPL` 不替代各个领域仓的智能体逻辑。

## 当前公开产品模型

- 当前主线公开模型固定为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `OPL` 的 session runtime 是这组资源的 canonical truth。
- `opl`、`opl exec`、`opl resume` 与 OPL-branded AionUI GUI/WebUI 必须围绕这组资源组织当前产品语义。
- `agents` 资源必须指向 admitted domain 仓的稳定 capability surface，而不是重新发明第二套 domain 协议。

## 文档分层

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 是 AI / 维护者核心工作集。
- `docs/README*` 维护的四层文档体系继续有效：公开主线、公开合同配套、参考级配套、历史规格与计划。
- 参考级与历史文档不得反向改写公开主线。

## 合同面

- `contracts/` 只保留机器可读真相，不承载叙事规则。
- 修改网关合同、公开边界或已收录领域表述时，必须同步更新文档与测试。
- admitted domain 仓对外应继续暴露本地 CLI、程序/脚本与 repo-tracked contract；`OPL` activation 只消费这些稳定 surface。

## 目标优先级

- 一旦系列项目的目标形态已经明确，新增投入默认服务该目标形态。
- 旧执行形态只能作为迁移桥、兼容层、回归基线或历史记录存在。
- 当前主线禁止重新把旧本地 Product API / UI-adapter 公开语义拉回产品入口。
- 当前主线禁止恢复 `MAS` 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS/MDS 的分发与安装表述必须继续落在 OPL module / Packages / git checkout / sibling repo 更新路径上。

## GUI 主线约束

- `OPL` 主仓跟踪 family-level session runtime、`opl` shell / TUI、release distribution 与 activation contracts，不跟踪外部 GUI 外壳实现。
- 本地 8787 `Product API` / `opl web` 模块已退役，不再作为 projection surface 或用户入口保留。
- 外部壳不得反向定义 `workspace / session / agent / progress / artifacts` 的 canonical truth。
- 外部壳不得反向改写默认 runtime 合同；GUI 定制只能建立在 Codex-default 路径之上。
- 外部产品名只能在基准、上游参考或规划中的界面目标语境出现。

## 语言规则

- 第一层和第二层公开文档必须双语同步。
- 内部技术、参考、维护、历史与规划文档默认中文。

## 本地工具状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库的本地状态入口。
- 如需保留历史 session、prompt、log、hook 或执行痕迹，应迁入用户级 `~/.codex/` 归档。

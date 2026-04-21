# OPL 关键决策

## 2026-04-21

### 决策：活跃 domain 仓对外统一写成独立 `domain agent`

原因：在 `OPL` 已经收敛为 family-level `session runtime` 之后，`MAS`、`MAG`、`RCA` 的公开主语更准确地应是“可被 `Codex`、`OPL` 或其他通用 agent 直接调用的独立 `domain agent` 仓”。继续把 `domain gateway / domain harness` 当成仓库对外第一身份，容易把内部边界层语言和公开产品角色混在一起。

影响：

- `MAS`、`MAG`、`RCA` 当前公开主语统一收口为独立 `domain agent`
- `agent entry / direct entry` 成为对外更优先的入口语言
- `domain gateway / domain harness` 继续保留为各仓内部的边界层与执行层术语

### 决策：`OPL` 继续持有 shared modules / contracts / indexes，但不制造 OPL-only domain semantics

原因：系列项目必须有一层承接跨仓共享模块、共享合同和共享索引；这层归属继续属于 `OPL / UHS`。但共享模块的存在，不应把 domain-specific 行为语义绑成“只有经过 `OPL` 才成立”的特殊工作流。

影响：

- `OPL` 继续持有 family-level shared modules、shared contracts、shared indexes
- `MAS`、`MAG`、`RCA` 通过 `OPL` 调用或被 `Codex` 直接调用时，领域语义保持一致
- 顶层 session/runtime/projection 与 domain-specific truth/logic 继续分层

### 决策：`OPL` 主线切换为 `ACP-native session runtime`

原因：对开发者和一线使用者来说，`OPL` 的一等使用路径不是直接调用 API，而是进入本地 `opl` shell / TUI、在 `Codex` 中显式调用 `OPL` 与其 domain agent，或让外部壳通过兼容层消费同一套 session runtime。继续把 `Product API` 作为主语，会把交互主线与真实用户路径写反。

影响：

- `OPL` 主仓当前主线以 family-level `session runtime` 为中心，而不是以 GUI 或 API 壳为中心
- canonical truth 收敛到：workspace binding、session lifecycle、progress / artifact projection、agent entry dispatch、runtime mode
- `Product API`、`opl web` 与未来 GUI / Web shell 都降为这套 session runtime 的 projection / compatibility surface
- `AionUI` 是第一外部壳和验证目标，但不是 runtime owner

### 决策：GUI 主线切换到 `AionUI`，`Onyx` 降为备线

原因：在 `OPL` 已经明确走 `ACP-native session runtime` 主线之后，当前最贴近这条运行时形态的现成外部壳是 `AionUI`。它更适合作为第一外部壳验证“目录绑定 + 会话 + 对话/任务主屏 + progress / artifacts 侧栏”这条路径；`Onyx` 更适合作为备线和参考。

影响：

- `OPL` 主仓继续保留 family-level session runtime、`opl` shell / TUI、projection surfaces 与 `opl web`
- 当前第一外部壳按 `AionUI` 主线推进
- 仓内已有 `Onyx` 计划、benchmark 和 overlay 材料只保留在参考层或历史层，不再作为当前实现依据

## 2026-04-20

### 决策：公开产品模型重置为 `Product API`

原因：历史 `frontdesk` 体系把 GUI 启动、环境管理、工作空间、任务、进度、文件、领域接线和 hosted 试验语义揉在了一层，已经不适合当前 `OPL + 独立界面仓` 目标形态。

影响：

- 当前公开模型统一收敛为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `opl` shell / TUI、GUI 外壳、CLI 与 `Product API` projection 共同消费这组产品资源
- 历史 `frontdesk` 公开语义退出当前主线

### 决策：Domain Agents 与 OPL 保持松耦合

原因：`MAS`、`MAG`、`RCA` 等仓的专业逻辑需要继续独立演进，而 `OPL` 需要保持顶层共享运行时和统一入口。

影响：

- `OPL` 负责共享运行时、shared modules/contracts/indexes 与 `Product API`
- 各个领域仓继续持有智能体入口、领域逻辑、运行规则与交付物
- 通过 `OPL` 调用领域智能体，与直接在 `Codex` 里调用该智能体，工作逻辑保持一致

### 决策：`frontdesk` 相关公开语义进入退役清单

原因：这些语义属于上一阶段的公开设计，继续保留在主线里会污染当前开发和文档。

影响：

- 当前主线不再把下面这些概念作为公开产品主语：
  - `frontdesk`
  - `readiness`
  - `entry-guide`
  - `domain-wiring`
  - `hosted-bundle`
  - `hosted-package`
  - `local_frontdesk`
- 相关文档只留在参考层或历史层

## 2026-04-19

### 决策：GUI 主线冻结为“OPL 主仓共享运行时 + 独立界面仓”

原因：GUI 壳与 `OPL` 运行时需要保持分仓演进；`OPL` 主仓只保留运行时真相与接口面，真正的 GUI 主线放在独立界面仓里推进。

影响：

- `OPL` 主仓只保留 CLI 产品入口、`opl web` API 服务、工作空间 / 会话 / 进度 / 交付物真相，以及 Codex / Hermes mode config
- 独立界面仓负责真正的 GUI 外壳
- `opl web` 根路由只返回机器可读根载荷，不再伪装产品 GUI

### 决策：外部 GUI 基座只在“当前主线 / 基准 / 参考 / 备线”语境出现

原因：必须持续区分“上游参考对象”和“当前已经真实集成的对象”。

影响：

- `AionUI` 可以作为当前 GUI 主线基座出现在 current status / implementation planning
- `Onyx`、`Open WebUI` 等外部产品名只能用于基准、参考或备线语境
- 只有真实集成发生后，才允许在 current status / current implementation 里写成已集成事实

## 2026-04-11

### 决策：`Hermes-Agent` 只指上游外部 runtime substrate

原因：避免把仓内 shim、helper 或 scaffold 误写成“已接入 Hermes-Agent”。

### 决策：统一 runtime substrate，不强制统一具体执行器

原因：`Hermes-Agent` 更适合承担长期在线 runtime substrate，`Codex CLI` 当前仍是家族默认执行器，默认模式是 `autonomous`。

影响：

- `Hermes Kernel` 统一负责 session、memory、scheduler、interrupt / resume、gateway 等 substrate 能力
- `OPL` 与各领域仓继续负责 gateway、authority、object contract、audit truth
- 具体任务执行继续通过领域内部的执行路径完成

### 决策：家族默认执行器正式名称冻结为 `Codex CLI`

原因：这是当前最成熟、质量最可控、并且已经在医学研究线证明可行的默认路线；把正式名称、默认模式与路线状态分开表达，更适合跨仓共享合同长期维护。

影响：

- 家族默认执行器正式名称统一写作 `Codex CLI`
- 家族默认执行模式统一写作 `autonomous`
- `Hermes-Agent` 继续保留正式名称，当前路线状态统一写作 `experimental`
- 默认模型与默认 reasoning effort 继续继承本机 `Codex` 默认配置

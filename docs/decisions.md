# OPL 关键决策

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
- GUI 外壳与 CLI 共同消费这组产品资源
- 历史 `frontdesk` 公开语义退出当前主线

### 决策：Domain Agents 与 OPL 保持松耦合

原因：`MAS`、`MAG`、`RCA` 等仓的专业逻辑需要继续独立演进，而 `OPL` 需要保持顶层共享运行时和统一入口。

影响：

- `OPL` 负责共享运行时与 `Product API`
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

原因：`Onyx` 保持独立上游应用，`OPL` 主仓只保留运行时真相与接口面，真正的 GUI 主线放在独立界面仓里跟随上游。

影响：

- `OPL` 主仓只保留 CLI 产品入口、`opl web` API 服务、工作空间 / 会话 / 进度 / 交付物真相，以及 Codex / Hermes mode config
- `opl-onyx-shell` 或同等独立界面仓负责真正的 GUI 外壳
- `opl web` 根路由只返回机器可读根载荷，不再伪装产品 GUI

### 决策：外部产品名只能在“基准 / 上游参考 / 规划中的界面目标”语境出现

原因：必须持续区分“上游参考对象”和“当前已经真实集成的对象”。

影响：

- `Onyx`、`Open WebUI` 等外部产品名只能用于基准、上游、参考或计划中的界面目标
- 只有真实集成发生后，才允许在 current status / current implementation 里写成已集成事实

## 2026-04-11

### 决策：`Hermes-Agent` 只指上游外部 runtime substrate

原因：避免把仓内 shim、helper 或 scaffold 误写成“已接入 Hermes-Agent”。

### 决策：统一 runtime substrate，不强制统一具体执行器

原因：`Hermes-Agent` 更适合承担长期在线 runtime substrate，`Codex CLI autonomous` 当前仍是家族默认执行器。

影响：

- `Hermes Kernel` 统一负责 session、memory、scheduler、interrupt / resume、gateway 等 substrate 能力
- `OPL` 与各领域仓继续负责 gateway、authority、object contract、audit truth
- 具体任务执行继续通过领域内部的执行路径完成

### 决策：家族默认执行器冻结为 `Codex CLI autonomous`

原因：这是当前最成熟、质量最可控、并且已经在医学研究线证明可行的默认路线。

影响：

- 家族默认执行器统一写作 `Codex CLI autonomous`
- 默认模型与默认 reasoning effort 继续继承本机 `Codex` 默认配置

# 退役 runtime / gateway / GUI 决策历史

Owner: `One Person Lab`
Purpose: `retired_decisions_history`
State: `history_only`
Machine boundary: 本文只保留从 `docs/decisions.md` 迁出的历史 provenance、tombstone 和 no-resurrection 边界。当前机器真相继续归 contracts、source、CLI/API、runtime ledger、provider receipt、domain-owned manifest、App-owned release evidence 和核心五件套。

本文承接 `docs/decisions.md` 中已被 supersede 的旧路线叙事。正文里的“当前”“目标”“readiness”“Gateway”“Product API”“Hermes online-management”“frontdoor”“hosted”等词，只按对应日期的历史语境阅读，不恢复为 active topology、兼容接口、provider path、readiness gate 或默认 worklist。

当前读法统一回到：

- `docs/decisions.md` 的 active decision 入口；
- `docs/runtime/opl-runtime-naming-and-boundary-contract.md` 的 runtime 命名边界；
- `docs/architecture.md`、`docs/invariants.md`、`docs/status.md` 的当前 framework / domain / App split；
- `docs/history/runtime-substrate/README.md` 的 runtime substrate 历史归档索引。

## 2026-05-08：Hermes-first online substrate 回滚历史

### Hermes 恢复为 OPL family 默认在线 substrate

状态：已被 2026-05-10 的 Temporal-backed provider 决策 supersede。本段只作为已退役 Hermes-first 回滚背景和迁移期实现口径，不作为当前默认 topology、安装纪律或 readiness 目标。

历史判断来源：OPL 曾把 24h online product capability 寄托在上游 `Hermes-Agent`，并据此写过默认安装、Gateway、cron/webhook wakeup、Full package payload、system initialize readiness 和 hybrid provider adapter 口径。

当前处置：Temporal-backed provider 是 production online runtime 的必需 substrate；`Codex CLI` 是默认且第一公民 executor；`hermes_agent`、`claude_code`、`antigravity_cli` 只能作为显式非默认 executor adapter/backend。旧 Hermes online runtime、Gateway、provider/readiness、cron/webhook bridge、Full package Hermes payload 和 hybrid provider compatibility 只保留为 history / provenance / diagnostic / negative guard，不恢复为安装路径、readiness 目标、default executor、provider fallback、compatibility interface 或 current worklist。历史 `intake` / `hydrate` 中仍有效的 typed queue 语义已由 OPL/Temporal provider owned path 承接。

### Hermes 从默认安装依赖降为显式 hosted/runtime adapter

状态：先被 2026-05-08 已退役 Hermes-first online substrate 决策取代，又被 2026-05-10 Temporal-backed provider 决策 supersede。本段用于解释 2026-05-08 前后的中间回滚语境，不作为当前实现口径。

历史判断来源：OPL 一度把默认运行时收敛到 `Codex CLI + domain entries`，并把 Hermes hosted / online-management 作为非阻塞或显式 adapter 语境读取。当前安装、首启、Full package 和 readiness 口径不从本段继承；它们回到 Temporal-backed provider 决策、App release owner 和 live install/readiness contracts。`hermes_agent` 继续只按 canonical 显式非默认 executor adapter/backend 读取。

## 2026-05-02：Hermes online-management 首启 readiness 历史

状态：先被 2026-05-08 的 Hermes-first online substrate 决策取代，又被 2026-05-10 的 Temporal-backed production runtime 决策 supersede。当前 Full OPL readiness 要求 Temporal-backed family runtime provider ready；本段只保留迁移背景。

历史判断来源：迁移期曾把 Hermes online-management gateway 当作非阻塞渐进就绪项。当前该层已经被 family runtime provider readiness 取代。

当前处置：`opl install`、`opl system initialize`、App 首启和公开 README 的当前读法是 Core、Domain modules、Temporal-backed family runtime provider 和 App release/user-path evidence 分层；不得把 Hermes gateway、online-management pending 或 provider adapter 写回当前安装行为、首屏层级、readiness blocker 或 compatibility surface。`hermes_agent` 只作为显式非默认 executor adapter/backend 保留。

## 2026-04-26：Runtime Manager / sidecar 历史

### 冻结 `OPL Runtime Manager` 为 provider-backed 产品控制面，而不是自有完整 runtime sidecar

状态：Runtime Manager 作为产品控制面继续有效；“Hermes 上”这一目标 substrate 已被 2026-05-10 的 Temporal-backed provider 决策 supersede。当前细节 SSOT 已转到 runtime manager contract、runtime support docs、source/tests 和 fresh CLI/read-model。

历史判断来源：曾计划把长跑托管任务注册到外部 `Hermes-Agent` online runtime substrate，由它负责 session、scheduler、wakeup、interrupt/resume、memory、delivery、approval、cron 与 webhook。当前这一路线已被 Temporal-backed provider 取代。

保留的当前边界：`OPL Runtime Manager` 是 provider-backed family runtime 之上的产品控制面与 typed dispatch / diagnosis / projection 层；它不是自有 runtime kernel、domain scheduler、concrete executor、domain truth owner、quality verdict owner 或 artifact authority。Runtime Manager 可持有 provider selection、typed family queue、domain task registration hydration、diagnostics/repair entry、optional native helper catalog 和 state-index projection。Temporal 是 production required provider；`local_sqlite` 只作 dev/CI/offline diagnostic baseline；旧 Hermes provider / Gateway / readiness 只保留为 history provenance、诊断语料或负向 guard。

## 2026-04-23：gateway-first / federation 合同历史

### gateway-first 合同语料退到 reference / history 层

状态：gateway-first / federation / routed-action 语料不再是 active compatibility 或默认公开集成合同。

历史判断来源：当时 OPL 的一等主线已经明确为 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`。继续把 `gateway-federation`、`opl-federation-contract`、`opl-routed-action-gateway` 与旧 `contracts/opl-framework/*` 语料写成默认公开集成合同，会制造第二真相。

当前处置：

- gateway-first 语料只按 reference / history / negative-guard surface 读取，不作为兼容接口；
- 当前真相优先回到 `README*`、核心五件套与 `contracts/README.md`；
- 已收录 domain 的实际接入单元继续写成 repo-owned capability surface 与单一 app skill。

## 2026-04-20：Product API / 旧本地 UI adapter 历史

### 公开产品模型曾重置为 `Product API`

状态：旧 Product API 和旧本地 UI adapter 公开模型已退出当前主线。

历史判断来源：旧本地 UI adapter 体系曾把 GUI 启动、环境管理、工作空间、任务、进度、文件、领域接线和 hosted 试验语义揉在一层；迁移期曾把公开模型收敛为 `system`、`engines`、`modules`、`agents`、`workspaces`、`sessions`、`progress`、`artifacts` 这组产品资源，由 `opl` shell / TUI、GUI 外壳与 CLI 共同消费。

当前处置：当前产品与 GUI 边界回到 OPL Framework、One Person Lab App、AionUI mainline shell、runtime/product docs 和 App-owned release/user-path evidence。旧本地 UI adapter、entry-guide、domain-wiring、hosted bundle/package 只作为 provenance 阅读，不作为公开产品主语。

## 2026-04-19：frontdoor-era GUI 分仓历史

### GUI 主线冻结为“OPL 主仓共享运行时 + 独立界面仓”

状态：已被 2026-05-15 App clean 产品仓、2026-06-03 GUI shell owner surface 和 App-owned contracts 吸收。

历史判断来源：当时需要把 GUI 壳与 OPL 运行时分仓演进；OPL 主仓只保留运行时真相与接口面，真正的 GUI 主线放在独立界面仓里推进。配套口径曾写作：OPL 主仓只保留 CLI 产品入口、工作空间 / 会话 / 进度 / 交付物真相、release distribution surface 和 Codex-default runtime config；Hermes mode config 只保留历史语境；独立界面仓负责 GUI 外壳。

### 外部 GUI 基座只在“当前主线 / 基准 / 参考 / 备线”语境出现

历史判断来源：需要持续区分“上游参考对象”和“当前已经真实集成的对象”。AionUI codebase 可以作为当前 GUI 主线基座出现在当时的 current status / implementation planning，但必须明确用户交付物是 OPL 品牌壳；外部 GUI 产品名只能用于基准或参考语境。

当前处置：AionUI mainline shell 是 App 当前 GUI 主线；Hermes Desktop 是 App-owned 唯一 foreground alternative；AGUI/CopilotKit 只作为 archived technical proof / explicit replay provenance。

## 2026-04-11：Hermes 命名 / runtime substrate 早期历史

### `Hermes-Agent` 命名只指上游外部项目 / 服务

状态：命名边界仍有效，但 runtime substrate 目标已被 Temporal-backed provider 决策 supersede。当前 `Hermes-Agent` 文案可用于上游项目 / 服务本体，以及 `hermes_agent` canonical 显式非默认 executor adapter/backend 的标签；旧 Hermes provider / Gateway / readiness / compat 文案只属于历史 provenance、诊断语料或负向 guard。

历史判断来源：避免把仓内 shim、helper 或 scaffold 误写成“已接入 Hermes-Agent”，同时避免把当前 canonical `hermes_agent` executor adapter/backend 误删为旧 Hermes provider/Gateway 残留。

### 统一 runtime substrate，不强制统一具体执行器

状态：历史决策，已被 2026-05 的 provider-backed family runtime / Temporal production required substrate 口径吸收。

历史判断来源：早期 OPL 曾把 family runtime provider 写成统一负责 stage attempt、signal/query/history、receipt 和 operator projection 等 substrate 能力；历史 `Hermes Kernel` / online-management gateway 说法只作为迁移期背景。

当前处置：Temporal-backed family runtime provider 承担 production online substrate；`Hermes-Agent` 不再是 runtime provider / Gateway / readiness path，但 `hermes_agent` 仍可作为显式非默认 executor adapter/backend。`Codex CLI` 当前仍是家族默认且第一公民的具体执行器，默认模式是 `autonomous`。旧 `gateway` 只作为历史词汇保留，不恢复为 active compatibility surface。

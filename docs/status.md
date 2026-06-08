# OPL 当前状态

Owner: `One Person Lab`
Purpose: `status`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。
更新时间：`2026-06-07`

Plugin native profile pointer: `contracts/opl-native-profile.json` 只声明 OPL Flow / OPL Doc 插件同步与 drift 检查所需的 repo-native profile；它不是 framework truth、runtime truth、domain truth、artifact authority、owner receipt 或 production-ready 证据。

## 读法

本文只保存当前角色、当前成熟度、完成边界、动态真相入口和仍未闭合的缺口类别。它不冻结 receipt id、attempt id、workorder 数字、open/closed counter、branch/SHA、provider tick、ledger verify 流水或某轮 closeout 细节。

需要当前事实时，先读本文给出的 live 命令、contracts/source/tests、runtime ledger、provider receipt、domain-owned manifest、App release/user-path evidence 和真实 workspace evidence。需要历史过程时，读 `docs/history/**`、runtime ledger、提交历史或 domain-owned receipt/provenance。

## 品牌模块成熟度

OPL 顶层设计按九个品牌模块管理：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Stagecraft`、`OPL Runway`、`OPL Vault`、`OPL Console`、`OPL Foundry Lab` 和 `OPL Connect`。品牌模块是 Framework 内部 bounded context 和成熟度语言，不是新的 runtime、第二 truth source 或 production-ready 证明。

成熟度读法固定为五级：

| 等级 | 含义 |
| --- | --- |
| `L1 conceptual` | 主要是理念或目标态。 |
| `L2 emerging` | 已有局部 docs/contracts/source。 |
| `L3 structural` | 合同、read model、conformance 或结构边界已经成型。 |
| `L4 executable baseline` | 具备品牌边界、schema/contract、CLI/App action、validate/doctor、docs foldback 和测试。 |
| `L5 production operating maturity` | 真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance 能持续证明。 |

当前九模块都达到 `L4 executable baseline` 的 structural/read-only baseline：`contracts/opl-framework/brand-module-registry.json` 持有品牌 registry，`contracts/opl-framework/brand-cli-governance.json` 持有 module-owned CLI frontdoor 和 `opl agents modules` 内部 branding spine，非 Workspace 模块走 `opl <brand-module> status|inspect|interfaces|validate|doctor --json`，Workspace 只新增 `opl workspace status|inspect --json` 品牌读面，`opl brand-modules validate --json`、`opl agents modules validate --json` 与 `opl contract validate --json` 提供机器守门。L5 evidence gate 已由 `contracts/opl-framework/brand-module-l5-operating-evidence.json`、`opl brand-modules l5-status|l5-validate|l5-interfaces --json`、`opl <brand-module> l5-status --json` 和 `opl runtime brand-module-l5-evidence record|verify|list --json` 落地；runtime ledger 只记录/验证本地 refs-only 证据并回投到 L5 status 计数。当前没有模块声明 `L5`；L5 不能由 docs foldback、contract validation、CLI governance pass、conformance pass、verified ledger、provider completion 或 App projection 单独关闭。

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

| 层 | 当前职责 | 不拥有 |
| --- | --- | --- |
| `OPL Framework` | Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated/hosted surface、safe action shell 和跨仓治理。 | domain truth、memory/artifact body、quality/export verdict、owner receipt authority、App release verdict。 |
| `One Person Lab App` | 面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source/artifact/memory refs、SLO、repair、workorder 和 owner-aware action。 | OPL runtime/provider implementation、domain truth、artifact authority、quality/export verdict、长跑任务外围驱动。 |
| `Foundry Agents` | MAS/MAG/RCA/OMA 及后续 domain agent，持有 domain pack、stage semantics、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt、typed blocker 和 direct/generated skill path。 | Framework runtime、generic queue/attempt ledger、App release truth、跨 domain shared primitive。 |

普通用户 App 形态按 `Codex App wrapper` 读取：固定 `Codex CLI` executor，内置 MAS/MAG/RCA/OMA task entry。AionUI 原生多 backend、多 Agent 选择、非默认 executor adapter 和 shell implementation 细节只能进入显式 developer/operator diagnostic，不是普通用户 product truth。`one-person-lab-app` 是 GUI product truth、active-shell contract、validator 和 release/user-path evidence owner；`opl-aion-shell` 与 `opl-agui-codex-shell` 是 App-owned implementation carrier / candidate，不是 OPL runtime owner。

`Codex CLI` 是当前第一公民 executor。标准 OPL Agent 的默认长跑路径是 `opl_temporal_hosted_autonomous`：任务启动后进入 OPL/Temporal 托管的 stage attempt runtime，由 OPL provider scheduler / typed queue / wakeup / resume-requery / retry-dead-letter / attempt ledger 持久在线推进；Codex App 只承担启动、观察、介入和投影入口。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code` 与 `antigravity_cli` 同属显式非默认 executor adapter/backend，以 request/stage binding、receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

OPL 已具备 framework 主干：

- domain descriptor / stage / action / memory discovery；
- Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout、retry/dead-letter、human gate 和 execution authorization / closeout binding guard；
- evidence worklist read model、provider proof / SLO projection、runtime snapshot、safe runtime action shell、App/operator drilldown read model 和 refs-only external evidence ledger；
- State Index Kernel、Stage Artifact / Workspace topology、workspace ensure/validate/doctor/adopt/upgrade/export-map/health/inspect/inventory surfaces；
- Agent Lab、Foundry Agent series contract、standard domain-agent scaffold / conformance、generated/hosted interface 和 default-caller / cleanup / no-resurrection guard；
- OPL-owned refs-only intake / projection for domain-dispatch、stage-production evidence、memory/artifact/lifecycle/no-regression receipt refs。

这些 surface 只证明 Framework 的 transport、ledger、projection、guard、recovery、admission 和 diagnostic 基础可用。它们不读取 memory/artifact body，不写 domain truth，不接受或拒绝 memory writeback，不授权 artifact/package/export readiness，不生成 owner receipt / typed blocker，也不声明 domain ready、App release ready 或 production ready。

Agent Lab、observability eval 和 mechanism improvement 继续是 refs-only control plane。OPL 只消费 refs，不写入 body、truth、artifact、owner receipt 或 quality verdict；domain truth、quality/export verdict、artifact authority、memory body 和 owner receipt 仍归 MAS/MAG/RCA。

当前状态摘要：

| 面 | 当前读法 |
| --- | --- |
| Framework runtime | `Codex CLI` first-class executor + Temporal-backed production online substrate + local/dev diagnostic baseline。 |
| App/operator | 默认 owner-delta-first；App 只启动、观察、介入和展示，不驱动外围长跑任务。 |
| Foundry Agent structure | MAS/MAG/RCA/OMA 通过 contracts / descriptors / conformance 暴露标准 pack、stage、quality gate、authority function 和 direct/generated skill path。 |
| StageRun / owner answer | OPL 可签发 provider attempt、active lease、execution authorization decision 和 closeout binding refs；合法 closeout 仍必须来自 domain owner receipt、quality gate receipt、typed blocker、human gate 或 route-back evidence。 |
| Workspace / State Index | OPL 维护 workspace topology、workspace inspection、resource inventory、workspace report、Stage Artifact Unit、stage outputs index/current pointer 和 refs-only SQLite sidecar；workspace governance v2 把 canonical generated roots 固定到 `control/opl/projections` 与 `control/opl/reports`，根层 `workspace_*.json` 只作兼容 mirror；新 workspace 的 Project Unit 默认物理集合是 `projects/<project-id>`，MAS `studies` 与 RCA/MAG/OMA `deliverables` 只作为 display / legacy alias；完成状态继续由 stage folder、manifest validity、owner receipt / typed blocker、current pointer 和 lineage 推导。 |
| External evidence | OPL 可记录/验证 body-free refs-only receipts；`runtime brand-module-l5-evidence` 同样只记录九模块 L5 evidence refs。verified ledger 只证明 refs transport 与 preflight 可用，不关闭 domain verdict、L5 completion 或 production evidence。 |

## 未闭合项

具体数量和 drilldown 以 live CLI/read-model 为准，本文只保留类别和完成口径。

| 类别 | 仍缺什么 | 完成口径 |
| --- | --- | --- |
| `App release / user path` | 同 cohort passed readiness summary、remote verification、standard / Full clean-VM、Homebrew checksum / remote asset digest coherence、one-shot installer、Docker/WebUI、GHCR、Full diagnostics/telemetry 和 operator evidence bundle validation。 | App repo release evidence、release-owner receipt / typed blocker 和真实 user-path evidence 关闭；OPL Framework 不替 App 声明 release-ready。 |
| `Domain owner-chain scaleout` | MAS paper、MAG grant、RCA visual、OMA target-agent stage 在 OPL-hosted path 下持续返回 owner receipt、typed blocker、human gate、quality/export/review receipt 或 no-regression evidence。 | Domain-owned receipt / typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `StageRun closeout currentness` | 当前 owner delta、StageRun identity、manifest、current pointer、source fingerprint、idempotency、provider attempt、active lease 和 execution authorization decision 必须绑定到同一个合法 owner answer。 | 缺 provider / lease / authorization 时默认 owner 是 OPL runtime blocker；只缺 owner answer / closeout binding 时默认 owner 回到 domain owner。OPL 不借用旧 blocker 或 study-level decision 伪闭合。 |
| `Memory / artifact / lifecycle apply` | 真实 memory retrieval/writeback、accepted/rejected receipt、artifact mutation receipt、package/export lifecycle receipt、cleanup/restore/retention 对账。 | Domain-owned surface 产生真实 receipts；OPL 只 intake / verify / project refs。 |
| `Provider long-soak` | Temporal service/worker、provider cadence/capability、domain owner-chain dispatch、retry/dead-letter 和 repair loop 在更长窗口内持续满足。 | Long-soak refs、provider state linkage、operator evidence refs 或 typed blocker refs 可重复 record/verify；不外推为 production ready。 |
| `Private platform retirement` | 已被 OPL primitive、generated surface 或 App product contract 替代的 wrapper、facade、alias、compat test、repo-local scheduler/queue/attempt/workbench/status shell 需要 no-active-caller、replacement parity、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance。 | 满足删除门后退役或 tombstone；classification closed、descriptor ready、conformance passed 或 cleanup ledger ready 不能替代物理退役授权。 |
| `Brand module L5` | 九个品牌模块的 L5 evidence matrix、可执行 read/validate surface 和 refs-only runtime evidence ledger 已落地；真实 L5 运营证据仍缺。 | 各模块用真实用户路径、跨 agent scaleout、long-soak、release/install、owner acceptance 和运营闭环证明；L4/L3、contract validation、provider completion、verified ledger 和 App projection 只能作为输入。 |
| `Workspace governance L5` | v2 已建立 profile binding、profile fingerprint、migration history、topology events、canonical generated projections/reports、root mirror 兼容、workspace report 用户检查面、workspace_norm 全量 projection drift gate 和 active/paused/archived/superseded/locked lifecycle。 | 当前只声明 `L4_structural_baseline`：合同、初始化/ensure/upgrade/adopt 物化、validate/doctor drift gate 和用户检查面可用。L5 仍需真实 App user path、跨 MAS/MAG/RCA/OMA scaleout、长跑迁移/恢复证据、release/install evidence 与 owner acceptance，不能由 workspace_norm pass 或 generated projection currentness 单独关闭。 |

## Live 真相入口

当前状态、计数、receipt、attempt、workorder 和 owner-delta 必须从 live readout 读取：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl stages readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl runtime app-operator-drilldown --detail full --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl app state --profile fast --json
rtk opl brand-modules validate --json
rtk opl brand-modules l5-status --json
rtk opl runtime brand-module-l5-evidence list --json
rtk opl charter status --json
rtk opl runway doctor --json
rtk opl agents modules validate --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
rtk opl index doctor --json
rtk opl workspace interfaces --json
rtk opl workspace inspect --workspace <path> --json
rtk opl workspace inventory --workspace <path> --json
rtk opl workspace health --workspace <path> --json
```

默认阅读顺序是 owner-delta-first：先从 `current_owner_delta` 看等待哪个 owner、需要什么 deliverable delta / receipt / typed blocker，以及该等待是否阻断 readiness。OPL provider / transport safe action 只有在没有 current owner delta 时才可成为默认下一步。raw refs-only counters、provider worker / redrive / scheduler route、evidence envelope、stage replay packet、typed blocker group、private residue inventory 和历史 receipt 计数都只作 drilldown。

`family-runtime provider-worker supervisor` 现在提供 provider worker process 的本机监督面：macOS 上安装 LaunchAgent 后由 `KeepAlive` / `RunAtLoad` 托管 resident Temporal foreground worker，并把 `--family-runtime-root` 绑定到当前 OPL state root。这个 supervisor 对齐 Temporal 的部署分层：Temporal Service 持有 workflow history、task queue、retry 和 activity timeout；Worker process 的存活由 deployment / supervisor 层保证，云端目标是 Kubernetes / systemd / container supervisor，本机目标是 launchd。旧 `provider-slo watchdog` 的 5 分钟 `StartInterval` tick 安装面已退役，安装新 supervisor 时会清理旧 `ai.opl.family-runtime.provider-slo` LaunchAgent。`provider-slo tick` 继续作为显式 health-check / production proof / fallback repair receipt，不作为主调度器、不消费 domain queue、不写 MAS/MAG/RCA truth、不生成 owner receipt 或 typed blocker，也不把 provider 恢复解释成 paper/grant/visual 进展。默认读面仍必须先看 current owner delta；supervisor 只负责让 OPL provider worker 不因进程退出而静默停止。

## 当前默认入口

- 默认前门是 `opl`；`opl --help` / `opl help` 展示 OPL Framework 自有命令树，`opl exec` 负责一次性请求，`opl exec --help` 保留 Codex-compatible 执行器帮助边界，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、OPL Meta Agent、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` / `opl system startup-maintenance` 管理 Codex CLI、provider profile/readiness、Connect module install/update、Connect skill sync、managed environment freshness、plugin cache freshness、reload prompt 和 local runtime state。
- `opl framework readiness --family-defaults --json` 是 family readiness 动态真相入口；它只输出 framework/operator 读面，不授权 domain ready、artifact authority 或 production ready。
- `opl stages readiness --family-defaults --json` 是 stage readiness family drilldown 入口；单仓诊断继续使用 `opl stages readiness --domain <domain> --json`。
- `opl runtime app-operator-drilldown --json` 与 `opl runtime app-operator-drilldown --detail full --json` 是 App/operator drilldown 入口。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 是 runtime safe-action evidence worklist、stage evidence workorder packet、stage replay missing receipt attention packet 与 domain-dispatch evidence workorder packet 入口；cache-derived attention 仍不授权 domain truth、owner receipt、artifact authority 或 production ready。`family-runtime production-closeout` 已退役，不再是 active interface 或兼容 alias。
- `opl work-order execute --work-order <developer-patch-work-order.json> --json` 是 owner-gated developer patch work order 的唯一 canonical OPL 执行原语；Agent Lab 只消费该原语产出的 execution receipt、execution plan/report refs 与 re-evaluation refs，旧 `opl agent-lab execute-work-order` 兼容 alias 已退役。

## 当前不能声明

- 不能声明 OPL 已全量生产可用。
- 不能声明 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能把 StageRun authorization、stage evidence workorder、domain-dispatch evidence workorder、refs-only receipt verified、provider/SLO satisfied、ledger closed 或 open worklist 为 0 写成 domain owner-chain、App 用户路径、release/dist、artifact authority、expected receipt instance、monitor freshness、long-soak evidence、domain ready、App release ready 或 production ready。
- 不能声明 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 owner-delta summary、`next_forced_delta`、`goal_oracle_missing`、selected cohort 或 typed blocker verified 写成完成。
- 不能把 `agents legacy-cleanup apply` 的 dry-run / apply / verify ready 状态写成 OPL 已删除 domain repo 文件或 production evidence 已闭合。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 参考入口

- [文档索引](./README.md)
- [项目概览](./project.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)

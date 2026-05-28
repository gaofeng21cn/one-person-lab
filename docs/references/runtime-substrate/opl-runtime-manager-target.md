# OPL Runtime Manager 目标形态

Owner: `One Person Lab`
Purpose: `references_runtime_substrate_opl_runtime_manager_target`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 定位

`OPL Runtime Manager` 是 OPL 的产品级 runtime 管理与投影层。
它不替代 family runtime provider，也不把 OPL 改写成自有长期在线 runtime kernel。
目标形态是 provider-backed family runtime：Temporal-backed provider 是 production online runtime 的必需 substrate，负责 durable stage attempt、retry/timeout、signal/query 与 workflow history；没有显式 provider 选择时默认读模型必须选择 `temporal`，Temporal service / worker / production proof 未就绪时 fail-closed 为 blocker，不回退成 `local_sqlite` production ready。`local_sqlite` 只作为显式 dev/CI/offline diagnostic baseline；Hermes 不再是 provider、默认 executor、readiness path 或兼容接口，保留引用只属于 history/provenance/diagnostic source ref、fixture 或负向 guard；`hermes_agent`、`claude_code` 与 `antigravity_cli` 属于当前 canonical executor backend set，并由 executor registry / receipt gate 管理，只能作为显式非默认 executor adapter 使用。OPL 管理产品级安装、检查、typed queue 和投影，不拥有 domain truth 或 concrete executor authority；Temporal service / worker lifecycle 作为 OPL 平台依赖被安装、检测、修复和监控。

目标链路是：

`OPL CLI / GUI / Product Entry -> OPL Runtime Manager / family-runtime queue -> configured family runtime provider -> Domain Adapter -> MAS / MAG / RCA domain logic`

## Owner Split

- `OPL`：产品入口、bootstrap、version pin、profile wiring、typed family queue、domain task registration hydration、诊断、恢复入口、native helper catalog、state index catalog，以及 provider readiness 的触发、检查和报告
- `Temporal-backed provider`：production online runtime 的必需 substrate；承接 stage attempt workflow、Codex/domain dispatch activity、retry/timeout、human gate signal、progress query、workflow history 与 replay/audit
- `hermes_agent`、`claude_code` 与 `antigravity_cli`：canonical 显式非默认 executor adapter/backend，必须独立 receipt / audit / fail-closed，不承诺与 `Codex CLI` 行为或质量等价
- 旧 Hermes provider/Gateway 面：非 provider、非 readiness path、非兼容 fallback，只可作为 history/provenance/diagnostic source ref、fixture 或负向 guard
- `MAS / MAG / RCA`：domain-owned truth、gate、artifact、progress、review / publication / submission 判断
- concrete executor：由 domain route contract 选择，默认仍可继承本机 `Codex CLI`

MAS domain route 的 owner split 更窄：OPL 持有 wakeup、queue、attempt、retry、dead-letter、scheduler 与 workbench lifecycle；MAS 只暴露 `domain_route/reconcile-apply`、`publication_aftercare/analysis-queue-progress`、`publication_aftercare/reviewer-refresh` 这类 route ref、owner receipt、typed blocker、SLO/readiness ref 与 safe action ref。`safe_reconcile_hint` 是路由提示，不是 OPL 写入 MAS truth 或启动 MAS-owned scheduler 的授权。

Domain task hydration 是另一个显式授权面：domain sidecar export 可以输出 `pending_family_tasks[]`，OPL 只把这些任务按 `dedupe_key` 写入 family queue，再调用对应 domain sidecar dispatch。OPL 不从 read-only status 自行生成 domain action。MAS 的当前 active route task kinds 是 `domain_route/reconcile-apply`、`publication_aftercare/analysis-queue-progress` 与 `publication_aftercare/reviewer-refresh`，OPL 队列与 dispatch 文件只保留 route ref、action ref、source refs、source fingerprint 与 idempotency key；实际 repair、AI reviewer、gate replay、route decision、truth mutation 或 owner receipt 仍由 MAS owner surface 执行和落账。App/operator drilldown 只消费同一 Runtime Manager route-support projection，展示 supported task/action refs 与 non-authority boundary，不把 support catalog 解释成 owner-chain closure、domain ready 或 publication aftercare verdict。

本文不冻结 Runtime Manager 的某次落地状态、receipt 数量、provider proof、domain worklist 或本机 readiness 计数。当前状态只能从 `contracts/opl-framework/runtime-manager-contract.json`、`contracts/opl-framework/family-runtime-online-substrate-contract.json`、`contracts/opl-framework/native-helper-contract.json`、source/tests、`opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 读取。read-model 中的 provider SLO、route support、stage attempt、worklist、blocked envelope、typed blocker、receipt 和 App/operator 计数都按动态 refs-only projection 阅读，不是本文维护的完成表。

## 当前读法与机器入口

Runtime Manager 的支撑内容按下列入口读取：

| 面 | 当前 owner | 读取入口 | 边界 |
| --- | --- | --- | --- |
| Runtime Manager 合同 | OPL framework | `contracts/opl-framework/runtime-manager-contract.json` | 冻结 provider 选择、typed family queue、stage attempt ledger、domain registration hydration、projection、native helper target 与 state index target；不替代 domain truth。 |
| Provider-backed online runtime | OPL provider layer | `contracts/opl-framework/family-runtime-online-substrate-contract.json`、`opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json` | Temporal 是 production online runtime 必需 substrate；provider completion、SLO satisfied 或 attempt running 不能写成 domain ready。 |
| Runtime route support | OPL App/operator projection | `opl runtime app-operator-drilldown --json` 的 `runtime_manager_route_support` | 只展示 supported task/action refs 和 non-authority boundary；不关闭 owner-chain、publication aftercare 或 quality/export verdict。 |
| Evidence worklist | OPL derived attention lens | `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` | open/closed worklist 和 zero-open 状态只解释 operator attention；不授权 domain ready、production ready、artifact authority 或 domain physical delete。 |
| Native helper lifecycle | OPL package/runtime helper layer | `contracts/opl-framework/native-helper-contract.json`、`package.json` 的 `native:*` scripts、`scripts/verify.sh native` | Rust helper 只能做 JSON stdio/CLI 边界内的检查、索引、缓存和 repair；不成为 scheduler、session/memory store、domain truth owner 或 Python domain logic replacement。 |
| Stage progress 与 true path proof | OPL attempt projection | `contracts/opl-framework/family-runtime-attempt-contract.json`、`opl family-runtime attempt query|inspect`、`opl runtime app-operator-drilldown --detail full --json` | 只证明 attempt/progress/Temporal visibility 可追踪；不构成 long-soak、owner receipt、artifact authority 或质量 verdict。 |

首启与 readiness 口径：

- `opl install` 默认安装/复用 family runtime provider；`--no-online-runtime` 只用于开发/离线 degraded diagnostics。
- Codex CLI、已准入 domain modules 与 family runtime provider 三层都 ready 时，Full OPL readiness 才完整通过。
- provider 未 ready 表示 Full online runtime degraded；本地 CLI/status/manifest 可继续输出诊断。
- 旧 Hermes cron bridge 只按 history/provenance/negative-guard 阅读；Temporal-backed provider 已是 required production substrate，后续不得把 Hermes cron bridge 扩展为 provider、readiness path、兼容 fallback 或长期 wakeup substrate。

## Domain Registration Registry

v1 registry 只登记 MAS、MAG、RCA 已声明的 projection surface：

- `skill_catalog.domain_projection.opl_stage_runtime_registration`
- `runtime_continuity` / runtime-control projection
- `domain_route_projection` read-only projection：route ref、action ref、owner receipt / typed blocker refs、SLO state、safe reconcile hint、domain-owned source refs 与 read-only authority boundary
- artifact / attention / runtime health index input
- domain-owned resume、progress、approval 或 review/publication truth ref

这些 registration 只是 OPL 侧索引入口；执行前仍必须回到 domain 仓暴露的 durable truth surface。

## OPL Native Helper

`OPL native helper` 只允许是小型、可替换、JSON stdio/CLI 边界清楚的 Rust helper。

候选：

- `opl-sysprobe`：系统、工具链、runtime dependency 检查
- `opl-doctor-native`：本机 doctor 输入聚合与协议级健康快照
- `opl-runtime-watch`：runtime / workspace watched roots 的 snapshot 与变更 fingerprint
- `opl-artifact-indexer`：workspace artifact discovery
- `opl-state-indexer`：session / progress / artifact projection index 与 large JSON validation

这些 helper 不持有 domain truth，不直接执行 MAS/MAG/RCA 任务，不替代 family runtime provider。所有 helper 使用 `contracts/opl-framework/native-helper-contract.json` 冻结 JSON stdin/stdout 边界，由 TypeScript / Python 调用方通过 contract 消费。

当前 package lifecycle：

- `npm run native:build`：构建 Rust helper binaries
- `npm run native:doctor`：输出 helper package、discovery 与 runtime invocation 的 JSON doctor
- `npm run native:prebuild`：把匹配平台与 crate version 的 prebuild binaries 安装进 `OPL_STATE_DIR` cache
- `npm run native:prebuild-pack`：把本地已构建的 helper binaries 打包成带 manifest 的 prebuild 目录
- `npm run native:prebuild-check`：验证 prebuild manifest；没有 prebuild 时报告 skipped，不阻断源码构建路线
- `npm run native:repair`：优先恢复 prebuild cache，失败或缺失时重建 helper binaries 后再次运行 doctor
- `npm run native:test`：运行 Rust helper workspace 测试

相关验证入口：

- `npm run test:integration` 覆盖 ACP/session runtime、install/configure 以及 retired Product API fail-closed 守护
- `./scripts/verify.sh native` 覆盖 native helper lifecycle
- `./scripts/verify.sh structure` 是本地 blocking Sentrux gate；GitHub Sentrux Advisory workflow 只提供非阻断结构信号

## 高频文件与状态索引

候选索引：

- workspace registry index
- managed session ledger index
- artifact projection index
- attention queue index
- runtime health snapshot index

索引规则：

- index 可以缓存与加速 OPL projection
- domain route index 只能缓存 `domain_route_projection` 的只读 projection 与 freshness 判断；修复必须回到 domain-owned route/action receipt
- 高频扫描、artifact manifest、session ledger/file state、目录 snapshot 与 large JSON validation 优先落在 Rust helper
- index lifecycle 必须记录 TTL、diff history、failure log、last-success snapshot 与 freshness 状态；当前 helper 不可用时，OPL 需要明确报告是否还能临时信任上次成功快照
- index 不得成为 domain-owned durable truth
- domain 仓仍以各自 repo-tracked contract、workspace state 与 artifact record 为权威

## 完整 Sidecar Promotion Gate

当前不做 OPL 自有完整长期常驻 runtime sidecar。

只有满足下面任一条件，才进入 sidecar 评估：

- Temporal/provider abstraction 无法表达 OPL 需要的 task registration / wakeup / approval / interrupt / audit contract
- Temporal/provider abstraction 无法满足本地/托管版的产品隔离与权限要求
- OPL GUI 需要在 provider 未运行时持续维护本地 outbox、通知或恢复队列
- 上游升级、许可、稳定性或平台适配成为产品级风险
- 跨 domain 事务性编排无法通过 external runtime provider 合理表达

在这些 gate 出现前，正确路线是 `external provider, managed by OPL product packaging`。Temporal-backed provider pilot / abstraction cutover 已落地为当前 required production substrate；后续优先补真实 long-run SLO、domain owner-chain receipt、workspace memory/lifecycle receipt 和 App/operator drilldown evidence，不升级为 OPL 自有完整长期常驻 sidecar。

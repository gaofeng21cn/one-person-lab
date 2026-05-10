# OPL Runtime Manager 目标形态

## 定位

`OPL Runtime Manager` 是 OPL 的产品级 runtime 管理与投影层。
它不替代 `Hermes-Agent`，也不把 OPL 改写成自有长期在线 runtime kernel。
Hermes 是 Full OPL family 的默认 online runtime substrate 与 online-management gateway；OPL 管理产品级安装、检查、typed queue 和投影，不拥有 gateway system service lifecycle。

目标链路是：

`OPL CLI / GUI / Product Entry -> OPL Runtime Manager / family-runtime queue -> required external Hermes-Agent online substrate / Hermes gateway system service -> Domain Adapter -> MAS / MAG / RCA domain logic`

## Owner Split

- `OPL`：产品入口、bootstrap、version pin、profile wiring、typed family queue、domain task registration hydration、诊断、恢复入口、native helper catalog、state index catalog，以及 Hermes gateway readiness 的触发、检查和报告
- `Hermes-Agent`：长期在线 session、scheduler、wakeup、interrupt/resume、memory、delivery/cron 与 online-management gateway；gateway system service 由 Hermes installer/gateway command 管理
- `MAS / MAG / RCA`：domain-owned truth、gate、artifact、progress、review / publication / submission 判断
- concrete executor：由 domain route contract 选择，默认仍可继承本机 `Codex CLI`

Family runtime supervision 的 owner split 更窄：domain 仓持有 wakeup / supervision truth、lease、SLO 与 repair command；`OPL Runtime Manager` 只读取 `family_runtime_supervision` surface 做 discovery、export、parity 与产品投影。`safe_reconcile_hint` 是路由提示，不是 OPL 写入 runtime truth 或启动 scheduler 的授权。

## 当前要落地的最小面

1. `opl runtime manager`
   输出当前 owner split、Hermes readiness、domain registration registry、native helper lifecycle、native helper target、state index target 与 sidecar promotion gate。
2. `contracts/opl-gateway/runtime-manager-contract.json`
   冻结 Runtime Manager 的 machine-readable 合同，以及三类 domain registration surface 的必需字段。
3. 核心 docs 对齐
   `project / architecture / invariants / decisions / status` 共同说明 Runtime Manager 是薄层，不是 kernel。
4. Native helper lifecycle
   `native:build`、`native:doctor`、`native:repair`、`native:prebuild*` 与 `native:test` 成为 OPL package surface 的一部分；npm package 必须带上 Cargo workspace、Rust helper source、doctor/repair/prebuild 脚本与可选 prebuild manifest 目录。
5. Production verification
   CI 与本地验证都必须覆盖 native helper doctor、prebuild manifest check、package dry-run、Rust test/build、state cache 与 family smoke。CI 用 fixture family smoke 保持可复现；本地集成机可加 `--require-real-workspaces` 对真实 MAS/MAG sibling repo 做端到端 indexing。

首启 readiness 口径：

- `opl install` 默认安装/复用 Hermes online runtime；`--no-online-runtime` 只用于开发/离线 degraded diagnostics。
- Codex CLI、已准入 domain modules 与 Hermes online runtime 三层都 ready 时，Full OPL readiness 才完整通过。
- Hermes gateway 未 loaded、starting 或 pending 表示 Full online runtime degraded；本地 CLI/status/manifest 可继续输出诊断。

## Domain Registration Registry

v1 registry 只登记 MAS、MAG、RCA 已声明的 projection surface：

- `skill_catalog.domain_projection.opl_runtime_manager_registration`
- `runtime_continuity` / runtime-control projection
- `family_runtime_supervision` read-only projection：adapter_id、cadence、last_success / last_tick、lease_freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 read-only authority boundary
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

这些 helper 不持有 domain truth，不直接执行 MAS/MAG/RCA 任务，不替代 `Hermes-Agent`。所有 helper 使用 `contracts/opl-gateway/native-helper-contract.json` 冻结 JSON stdin/stdout 边界，由 TypeScript / Python 调用方通过 contract 消费。

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
- runtime supervision index 只能缓存 `family_runtime_supervision` 的只读 projection 与 freshness 判断；修复必须回到 domain-owned repair command
- 高频扫描、artifact manifest、session ledger/file state、目录 snapshot 与 large JSON validation 优先落在 Rust helper
- index lifecycle 必须记录 TTL、diff history、failure log、last-success snapshot 与 freshness 状态；当前 helper 不可用时，OPL 需要明确报告是否还能临时信任上次成功快照
- index 不得成为 domain-owned durable truth
- domain 仓仍以各自 repo-tracked contract、workspace state 与 artifact record 为权威

## 完整 Sidecar Promotion Gate

当前不做 OPL 自有完整长期常驻 runtime sidecar。

只有满足下面任一条件，才进入 sidecar 评估：

- `Hermes-Agent` 无法表达 OPL 需要的 task registration / wakeup / approval / interrupt / audit contract
- `Hermes-Agent` 无法满足本地/托管版的产品隔离与权限要求
- OPL GUI 需要在 Hermes 未运行时持续维护本地 outbox、通知或恢复队列
- 上游升级、许可、稳定性或平台适配成为产品级风险
- 跨 domain 事务性编排无法通过外部 runtime substrate 合理表达

在这些 gate 出现前，正确路线是 `external kernel, managed by OPL product packaging`。

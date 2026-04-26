# OPL Runtime Manager 目标形态

## 定位

`OPL Runtime Manager` 是 OPL 的产品级 runtime 管理与投影层。
它不替代 `Hermes-Agent`，也不把 OPL 改写成自有长期在线 runtime kernel。

目标链路是：

`OPL CLI / GUI / Product Entry -> OPL Runtime Manager -> external Hermes-Agent runtime substrate -> Domain Adapter -> MAS / MAG / RCA domain logic`

## Owner Split

- `OPL`：产品入口、bootstrap、version pin、profile wiring、domain task registration hydration、诊断、恢复入口、native helper catalog、state index catalog
- `Hermes-Agent`：长期在线 session、scheduler、wakeup、interrupt/resume、memory、delivery/cron
- `MAS / MAG / RCA`：domain-owned truth、gate、artifact、progress、review / publication / submission 判断
- concrete executor：由 domain route contract 选择，默认仍可继承本机 `Codex CLI`

## 当前要落地的最小面

1. `opl runtime manager`
   输出当前 owner split、Hermes readiness、native helper target、state index target 与 sidecar promotion gate。
2. `contracts/opl-gateway/runtime-manager-contract.json`
   冻结 Runtime Manager 的 machine-readable 合同。
3. 核心 docs 对齐
   `project / architecture / invariants / decisions / status` 共同说明 Runtime Manager 是薄层，不是 kernel。

## OPL Native Helper

`OPL native helper` 只允许是小型、可替换、JSON stdio/CLI 边界清楚的便携 helper。

候选：

- `opl-sysprobe`：系统、工具链、runtime dependency 检查
- `opl-artifact-indexer`：workspace artifact discovery
- `opl-state-indexer`：session / progress / artifact projection index

这些 helper 不持有 domain truth，不直接执行 MAS/MAG/RCA 任务，不替代 `Hermes-Agent`。

## 高频文件与状态索引

候选索引：

- workspace registry index
- managed session ledger index
- artifact projection index
- attention queue index
- runtime health snapshot index

索引规则：

- index 可以缓存与加速 OPL projection
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

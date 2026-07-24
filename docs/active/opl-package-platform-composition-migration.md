# OPL Package 平台组合迁移

Owner: `One Person Lab Framework`
Purpose: `framework_package_platform_composition_migration`
State: `planned`
Status: `review_ready`
Decision date: `2026-07-24`
Machine boundary: 本文只维护 Framework 的兼容现状、仓内迁移责任和删除证明。跨仓
目标架构、用户功能等价矩阵、总体顺序和 App/Shell 验收的唯一计划是
[`one-person-lab-app/docs/active/opl-package-platform-composition-migration.md`](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/active/opl-package-platform-composition-migration.md)。
当前机器真相继续归 contracts、source、tests、native carrier inventory 和 fresh CLI/App
readback。

## 结论

Framework 支持下面的开放生态，但不再自建完整 Package Manager：

```text
OPL Base    ≈ R
OPL App     ≈ RStudio / 可替换 GUI 与部署载体
OPL Package ≈ R Package

owner bytes
  -> Base OCI download / verify / handoff
  -> configured carrier or Package runtime adapter
  -> native installed / callable readback
  -> Framework aggregation
  -> App projection
```

Package 是安装单元；Skill、Tool、Plugin、MCP、workflow 和 entrypoint 是 descriptor
可发现 capability。标准 Agent 只是 `kind=agent` 的普通 Package。Package identity、
physical carrier 和 executor route 相互独立；GHCR 是 first-party publication store，
不是本机 carrier 或 installed truth。

普通 dependency 只声明 required/optional identity。缺 required dependency 时，薄操作只
ensure 当前 root 的 required closure，例如显式 `mas` 只处理 MAS 与 ScholarSkills；
不比较 SemVer、ABI、lock、payload 或 digest，也不选择其他 installed roots。breaking
interface 通过新 identity 或 owner-side compatibility adapter 演进。

## Framework 目标边界

Framework 只保留：

- owner descriptor 的 carrier-neutral discovery；
- OCI bytes 的 download、integrity verification 和 handoff；
- configured carrier / Package runtime adapter 的委托；
- native carrier fresh readback 的 installed/callable aggregation；
- required/optional presence 与 declared entrypoint callability；
- executor route readiness，且 route unavailable 不改变 Package identity；
- Agent Work Item inventory、Temporal execution refs 和 typed-view proxy；
- compact status、通用 actions 和局部故障聚合。

Framework 不再拥有：

- 固定 Package、Agent、Plugin、Module 或 Skill 清单；
- 中央版本/ABI resolver 或跨 Package latest-compatible 求解；
- OPL installed lock、payload/content lock、generation/LKG、lifecycle receipt；
- materializer、scope activation、rollback 或 durable Package transaction；
- App Official Profile、Home preference、GUI renderer 或 domain view schema；
- shared manifest 对普通 Package currentness 的解释权。

一次 release artifact 的 checksum、digest、SBOM、attestation 和 exact ref 继续由 release
owner保留。Temporal Worker Versioning 与 domain artifact/evidence digest 也继续有效；
它们不属于普通 Package composition。

## 当前兼容面

当前 `opl packages`、first-party manifests、registry cache、installed lock、receipt、
payload/materialization、LKG/rollback、scope activation 和 Release Set bridge 仍可能有
active consumer。它们是 compatibility-to-delete，不是目标架构。

迁移期规则：

1. 旧 reader 可以 dual-read，但不得新增 writer 或 consumer。
2. native carrier fresh readback 优先；descriptor、App metadata、旧 lock 或 Codex cache
   不能覆盖实际物理状态。
3. `opl packages install|update|remove` 只可逐步收缩为 carrier 委托和聚合；不能把旧状态机
   改名后继续扩张。
4. explicit root update 必须保持 Package-local。required dependency 失败只影响该 root；
   无关 Package、Base 和 App 继续。
5. developer/local source 不被后台覆盖。外部 mutation 结果 unknown 时只做有界 fresh
   inspect；在 readback 前不重试、不虚报成功。
6. shared `one-person-lab-manifest:latest-stable` 只保留 Full/offline/integration/QA
   snapshot；普通 install/update/currentness 读取 owner 的 per-Package source。

## 仓内执行顺序

### 1. 冻结复杂性

- 禁止新增 resolver、lock、payload、LKG、receipt、materializer、scope activation、
  rollback 或 durable-intent 字段和公共动作。
- 为 retained producer/consumer 建立精确清单；无 active consumer 的旧字段、fixtures 和
  命令直接删除。
- 分开 Package installed、executor route 和 domain/runtime readiness，避免一个状态轴
  推导另一个。

### 2. 最小 descriptor 与 carrier adapters

- owner descriptor 只表达 stable identity、kind、required/optional identity、
  entrypoints、runtime/task refs 和 typed-view refs。
- Codex-specific plugin id、marketplace、home/path、config/cache 和 manifest shape 只留在
  Codex adapter。
- OCI adapter 只 download/verify/handoff；Git/local、Codex Plugin Manager、offline seed
  或 Package runtime adapter 各自执行其 native lifecycle 并返回 fresh readback。
- 至少一个 Git/local 中性 proof 证明公共 descriptor 不依赖 Codex 私有字段；不并行建设
  第二套正式 executor 产品。

### 3. Compatibility dual-read

- 将 native readback 归一为 compact installed/callable/status/actions。
- 缺新 descriptor 时只读旧 manifest 并投影到同一内部 shape；禁止双写。
- required dependency 只做 root-local presence ensure；更新单包不得选择其他 roots。
- App/Shell 消费通用 projection 后，删除它们对旧 registry、lock、receipt 和 Codex 字段的
  镜像。

### 4. 删除旧 Manager

- 停止旧 lock/receipt/payload/LKG writer，迁移必要的用户 preference 后证明 bytes 不再
  变化。
- 删除中央 resolver、materializer、activation、rollback、transaction engine 和 retired
  public commands。
- 删除普通 currentness 对 shared Release Set 的 reader；保留 snapshot producer/consumer。
- 重新执行完整用户功能矩阵和 fresh carrier readback，再声明迁移完成。

## 功能不降级证明

Framework 删除旧 lifecycle 前至少要提供：

- first-party owner GHCR 完整 runtime 与独立 `latest-stable` 匿名 readback；
- OCI download/verify/handoff 和 configured carrier install/list/update/remove readback；
- MAS 安装/更新只 ensure MAS + ScholarSkills required closure；
- 一个 Package 更新失败不连坐无关 Package、Base 或 App；
- 用户删除后普通 maintenance 不回装；
- dynamic `kind=agent` discovery、Work Item/Temporal join 和 unknown typed-view fallback；
- developer/local source 不被覆盖；
- executor route 切换不重装 Package，不丢 preference、Work Item 或 typed view；
- 唯一 physical carrier 移除后报告 `physical_unavailable`，无 cache/metadata 虚假 installed；
- ordinary currentness 不消费 shared manifest；
- 旧 registry/resolver/lock/payload/LKG/receipt/materializer/activation/rollback/transaction
  无 active caller且物理删除。

docs、schema、tests、dry-run、candidate、旧 writer “不再默认调用”或兼容数据静止都不是
terminal proof。

## Durable 调研裁决

2026-07-23 的 Durable 轻量调研正确拒绝通用 filesystem transaction 和跨独立 Package
原子事务，也正确强调幂等 mutation、fresh inspect、external drift 保护、unknown result
不盲重试以及 Package-local failure isolation。这些原则保留。

其 `Package intent + installed lock + receipt + LKG/generation + reconcile state machine`
仍会在 native platform 之外建立第二 truth，已被本计划取代。只有 fresh production
evidence 证明某个具体 carrier 缺口会导致用户功能降级时，才允许增加 adapter-local、
无第二真相的最小补丁；不能据此恢复统一 Package Manager。

历史裁决见
[`2026-07-24-package-manager-superseded-designs.md`](../history/process/plans/2026-07-24-package-manager-superseded-designs.md)。

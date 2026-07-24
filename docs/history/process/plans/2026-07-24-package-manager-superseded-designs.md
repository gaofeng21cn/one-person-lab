# Package Manager 被取代设计归档

Owner: `One Person Lab`
Purpose: `package_manager_superseded_designs_history`
State: `historical_archive`
Date: `2026-07-24`
Machine boundary: 本文只记录已被取代的 Package Manager 设计及仍应保留的安全原则，不是当前实现合同、迁移任务板或恢复旧状态机的授权。

## 裁决

2026-07-23 的 Durable 轻量调研已经正确拒绝通用 filesystem transaction engine、跨独立 Package 原子事务和任意外部路径自动回滚，并提出比旧大型候选更小的 Package-local intent。随后生态前提进一步收敛为：

```text
Package identity/capability/dependency intent -> Package owner descriptor
install/update/remove/currentness            -> configured native carrier
installed/callable aggregate                 -> Framework fresh discovery
GUI/preference/task/view                     -> App + domain owner projections
```

在这个前提下，即使是小型 Package intent、Framework installed lock、receipt ledger、LKG generation、closure digest/CAS 和统一 lifecycle manager，也不再是普通 Package 组合的必要能力。它们会让 Framework 再次成为所有 carrier 的第二状态机，增加新 Package、新 carrier 和 executor 切换的开发与运维成本。因此 Durable 轻量方案作为整体被取代，不进入目标架构。

当前真相回到：

- [架构](../../../architecture.md)
- [硬约束](../../../invariants.md)
- [关键决策](../../../decisions.md)
- [OPL Package 平台组合迁移计划](../../../active/opl-package-platform-composition-migration.md)

## 被否决的设计

- 通用 path transaction / snapshot / rollback engine。
- 跨独立 Package 的原子 transaction、统一 generation 或 shared closure CAS。
- Framework-owned Package intent、installed lock、lifecycle receipt ledger 和 LKG。
- 用 version、ABI、payload、digest、Release Set 或固定 cohort 作为普通 dependency/readiness 门禁。
- 同时镜像 Package、Agent、Plugin、Skill 清单的中央 Manager。
- 用盲重试、自动倒放外部脚本或覆盖 external drift 来伪造恢复成功。

这些设计不得从历史文档、旧候选分支、compatibility fixture 或现有 CLI 字段反向恢复为新架构。

## 继续保留的安全原则

删除统一 Manager 不等于删除安全性。下面原则继续属于对应 owner：

- **幂等 mutation**：carrier/runtime adapter 的同一 install/update/remove 重放必须得到可解释结果。
- **局部失败**：一个 Package 或一条 executor route 失败，只局部阻止依赖它的 root/route；不得拖入其他独立 roots。
- **fresh inspect/reconcile**：超时、进程中断或外部结果不确定时，先读 native carrier 的真实状态，再决定前向补齐；不盲重试。
- **external drift 保护**：用户配置、外部 checkout、未知 bytes 或第三种状态不得被静默覆盖。
- **用户数据保护**：对单个 owner-owned 文件继续使用 temp + atomic rename、备份、权限/路径边界和明确冲突处理。
- **不可变发布证据**：单次 release artifact 的 checksum、attestation、exact ref/digest 和 Full/QA snapshot 继续由 release owner 保留；它们不进入普通 Package dependency gate。
- **领域证据边界**：Stage/Artifact manifest、owner receipt、typed blocker 和 content digest 继续服务领域真实性；它们不是 Package lock。

## 目标操作语义

普通 Package lifecycle 只需要：

```text
selected root
  -> read owner descriptor
  -> ensure missing required identities through configured carrier
  -> fresh installed/callable readback
  -> aggregate per-root result
```

Package owner 独立推进自己的 GHCR `latest-stable`。OPL Base 只下载、校验并 handoff OCI bytes；配置的 carrier/runtime adapter 执行实际生命周期。Codex Plugin Manager 只拥有 Plugin/config/cache。Full/offline/QA snapshot 可以记录精确 bytes，但不得成为普通更新权威。

## 不降级门

只有下列结果都由新路径证明后，旧 Manager compatibility 实现才可物理删除：

1. 首次安装和显式恢复能按 App Official Profile 安装必要 roots，并补齐每个 root 的 required presence。
2. 单包安装/更新只选择该 root 与缺失 required identity，不带入其他 roots。
3. 已安装 Package 能由自身 carrier 独立静默更新，Settings 能看到 fresh installed/callable/currentness。
4. Home preference、enabled/visible 状态、业务 Work Item、Temporal execution 与 typed views 不因 carrier/executor 切换丢失。
5. 完整 Package runtime 仍存在；Plugin-only 不得冒充 installed。
6. native carrier 结果不确定时遵循 fresh inspect、幂等前向 reconcile 和 external drift 保护。

上述证明必须来自真实 carrier 和最终 public readback；docs、candidate、fixture 或 dry-run 不能代替终态。

# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface
- 当前执行口径：`Codex-default host-agent runtime`
- 当前开发口径：Codex-only
- OMX 状态：已退场，仅保留历史入口

## 当前公开主线与 repo-tracked follow-on

- 当前公开主线：已 admitted domain federation 的公开边界，加上本地 `TypeScript CLI`-first / read-only gateway baseline
- 当前 repo-tracked follow-on：`S1 / shared runtime substrate v1 contract freeze`
- 当前 formal entry：本地 `TypeScript CLI`-first / read-only gateway baseline
- 当前 supported protocol layer：`MCP`
- 当前 `controller` 语义：internal control surface only

## 当前 domain surfaces

### 已 admitted domains

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops`
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops`

### Signal-only / future-direction surface

- `Grant Foundry -> Med Auto Grant`：top-level signal / future direction evidence，不是已 admitted 的 domain gateway，也不满足 `G2` discovery readiness、`G3` routed-action readiness 或 handoff-ready surface

## 当前 tranche 状态

- 当前阶段：`S1` 顶层冻结已经在 `OPL` 内完成 truth sync、substrate language freeze、adoption board freeze 与 activation package freeze
- 已完成项：
  - 阶段 A：公开入口、核心 working set 与合同说明回收口到同一条 `S1` 主线
  - 阶段 B：shared runtime substrate v1 的 6 组对象冻结到公开文档与 reference-grade 文档
  - 阶段 C：三个业务仓的 adoption board 冻结为统一推广顺序
  - 阶段 D：`S1` activation package 冻结为可直接复用的下一棒说明
- 剩余待办：
  - 把 `S1` 语言压入 `med-autoscience`、`med-autogrant` 与 `redcube-ai` 的真实 domain tranche
  - 证明哪些对象可以升级成 gateway-owned machine-readable surface
  - 证明至少一个 domain 的成熟本地产品 runtime pilot
- 真实 blocker：
  - 当前还没有被严格证明属于 `OPL Gateway` 所有权的 `shared runtime substrate v1` JSON surface
  - 当前还没有跨 domain 验证过的 shared runtime substrate 实现
  - `redcube-ai` 仍受 `source-readiness / research-mainline` 稳定性约束，不能和前两条 lane 同步推进

## 当前文档骨架

- AI / 维护者核心工作集：`project / architecture / invariants / decisions / status`
- 对外公开 docs：继续沿用 `docs/README*` 定义的四层结构
- 机器合同：`contracts/opl-gateway/*.json`

## 当前优先事项

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 在不把 `OPL` 提升成 runtime owner 的前提下，冻结 shared runtime substrate v1 的统一语言。
3. 避免 reference-grade 文档继续挤占公开主线，同时让它们足够指导后续 domain 推进。

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`

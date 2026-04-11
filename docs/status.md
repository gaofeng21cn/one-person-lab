# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface，不是独占 runtime owner
- 当前开发宿主：`Codex` 长线自治会话
- 当前产品边界：`OPL` 只负责顶层 gateway / federation / shared substrate contract，不直接拥有三个 domain 仓的产品 runtime
- 历史执行面：OMX 已退场，仅保留历史入口

## 当前 admitted domains

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops`
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops`
- `Grant Foundry -> Med Auto Grant`：future-facing public signal

## 当前基线（repo-tracked）

- AI / 维护者核心工作集：`project / architecture / invariants / decisions / status`
- 对外公开 docs：继续沿用 `docs/README*` 定义的四层结构
- 机器合同：`contracts/opl-gateway/*.json`
- 历史执行与迁移材料：只从 `docs/history/omx/` 进入，不再作为当前入口

## 当前阶段

- 当前顶层主线：central sync、surface authority convergence、admitted-domain state alignment
- 当前重点：把三个 domain 仓已经 absorbed 的 delta 收进顶层参考面与公开边界，不编造新的平台能力
- 当前约束：`OPL` 仍然不是 runtime owner，不把开发宿主或历史执行面误写成产品 runtime

## 下一阶段

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 继续把 shared substrate wording 收紧到支持 domain-level `Hermes-backed runtime substrate`，但不提前宣称 `OPL` 自己拥有 runtime。
3. 避免 reference-grade 与历史迁移文档继续挤占公开主线。

## 长线目标（规划层）

- 形成面向系列项目的顶层 federation / gateway / contract layer。
- 让三个 domain 仓在同一 shared substrate 语义下运行，但仍保留各自 domain boundary。
- 随着 domain runtime substrate 逐步迁向 `Hermes-backed` 形态，`OPL` 继续保持顶层协调与发现层，而不是下沉成独占执行 runtime。

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`

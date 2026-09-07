# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和验收方法的未完成工作。长期职责、例行维护和未验证的猜测不作为 gap；执行进度留在对应 Issue。

## Foundry 真实模型托管构建验收

当前代码已将 provider workspace scope、source bytes、review snapshot 和 durable observation 接入正常构建链。确定性验收使用 fixture gateway，运行真实 Kernel、compiler、object store 和 ledger，到达 `evaluating`；它没有运行真实模型完成所有 OMA Stage，也没有证明 qualification 或 activation。

- **证据**：[`foundry-agent-package-acceptance.test.ts`](../../tests/src/foundry-agent-package-acceptance.test.ts)、[`foundry-provider-stage-run.ts`](../../src/adapters/execution/foundry-provider-stage-run.ts)。可重复检查见 [构建验收](../delivery/foundry-package-construction-acceptance.md)。
- **负责人**：Framework Foundry 运行实现与 OMA provider owner；任务见 [#181](https://github.com/gaofeng21cn/one-person-lab/issues/181)。
- **完成标准**：在隔离且已安装的运行环境，经公开 `engineer-agent` 入口完成真实模型构建；回读同一 FoundryRun 的 candidate event、materialization record 和 exact artifact bytes。资格、激活和领域采用仍由各自 owner 独立验收。

历史失败 Run 的恢复属于原运行环境的独立任务。缺少原 cursor、终局产物和 owner recovery receipt 时，不能由源码修复推断历史任务已恢复；原 Run 的终态不得重写。

## 维护方式

新增条目前必须给出当前断点证据、负责人和可观察完成条件。完成后删除条目，并仅在对应当前说明中更新行为；不追加完成区、测试总数或发布快照。

App、Cloud、Package 的部署验收与专业质量属于各 owner，本页未列出它们不表示已就绪。通用证据限制见 [当前状态](../status.md#production-evidence)。

# 兼容性历史归档

Status: `retired`
Owner: `One Person Lab`
Purpose: `legacy_compatibility_tombstone_index`
State: `history_only`
Machine boundary: 本目录只保存旧 compatibility / gateway / federation / routed-action 语料的人读 provenance 与 tombstone。当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文档树不得作为 active runtime、compatibility interface、machine-readable contract、test oracle 或保留旧 alias/facade 的依据。

本目录收纳已经退役的兼容性语料。这里的文件只用于审计、迁移回顾、schema archaeology 和来源追溯。
兼容语料不是当前产品方向。本目录中的 gateway、federation、routed-action 和旧 public-surface 示例都按 tombstone 理解，除非当前 contract 或核心文档明确把某个窄的机器可读兼容面保留下来。

当前真相统一回到：

- [文档索引](../../README.md)
- [项目概览](../../project.md)
- [当前状态](../../status.md)
- [架构](../../architecture.md)
- [关键决策](../../decisions.md)
- [合同目录说明](../../../contracts/README.md)

## 分区

- [Domain Foundry CLI 历史 tombstone](./domain-foundry-cli-tombstone.md)
- [Gateway / federation 兼容语料](./gateway-federation/README.md)

当前 runtime/framework 规划统一回到 [OPL stage-led agent framework roadmap](../../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)。

# OPL Framework 合同

[English](./README.md) | **中文**

Owner: `OPL Framework`
Purpose: `opl_framework_contract_support_index`
State: `active_support`

本文帮助维护者定位 Framework 机器合同。JSON contract 与 schema 定义接口，源码和 caller 证明实际实现。产品范围、架构和当前证据分别从[文档入口](../../docs/README.md)进入。

## 按问题定位

先选择主题，再沿合同声明的 schema、source 和 consumer 引用阅读。下表是阅读导航，不是完整文件清单或已安装 Package registry。

| 要查的问题 | 机器入口 |
| --- | --- |
| 哪个公开 surface 持有接口？ | [Public surface index](./public-surface-index.json)、[CLI command registry](./cli-command-registry.json) |
| 家族能力与 authority owner 如何对应？ | [Capability-domain registry](./family-capability-domain-registry.json)、[目标运行架构](./target-operating-architecture-contract.json) |
| Framework 与 Application Host 在哪里协作？ | [Cordis architecture profile](./cordis-architecture-profile.json)、[source module map](./source-module-map.json)、[Package topology](./package-topology.json) |
| 已安装 Package 如何发现和托管？ | [Package host contract](./capability-package-host-contract.json)、[Standard Agent admission](./standard-agent-admission-gates.json)、[hosted action runtime](./standard-agent-hosted-action-runtime-contract.json) |
| domain pack 如何生成可调用接口？ | [Domain pack compiler](./domain-pack-compiler-contract.json)、[Standard Agent interface](./standard-agent-interface.schema.json)、[implementation profile](./standard-agent-implementation-profile.schema.json) |
| Workspace 与 Work Item identity 如何绑定？ | [Agent workspace norm](./agent-workspace-norm-contract.json)、[workspace index](./workspace-index.schema.json)、[execution scope snapshot](./execution-scope-snapshot.schema.json) |
| StageRun identity、启动和跨 Stage 路由如何运输？ | [StageRun kernel](./stage-run-kernel-contract.json)、[route transport](./stage-route-transport-contract.json)、[family runtime attempts](./family-runtime-attempt-contract.json) |
| Stage Review role 与质量策略如何声明？ | [Stage quality cycle](./stage-quality-cycle-contract.json)、[quality policy schema](./stage-quality-cycle.schema.json)、[official quality profile](./official-knowledge-deliverable-quality-profile.json)、[review currentness](./epistemic-review-currentness-contract.json) |
| artifact、owner answer 与状态索引分别归谁？ | [Stage artifact runtime](./stage-artifact-runtime-contract.json)、[owner answer](./owner-answer.schema.json)、[state index kernel](./state-index-kernel-contract.json) |
| runtime service 与 executor 的边界是什么？ | [Runtime Manager](./runtime-manager-contract.json)、[online substrate](./family-runtime-online-substrate-contract.json)、[executor adapters](./family-executor-adapter-defaults.json) |
| App 消费哪些投影？ | [App operator projection](./family-product-operator-projection.json)、[bounded Work Item projection](./app-runtime-fast-work-item-projection-contract.json)、[current owner delta](./current-owner-delta.schema.json) |
| evidence 与参考上下文如何交换？ | [Evidence ledger event](./evidence-ledger-event.schema.json)、[observability conventions](./observability-semantic-conventions-contract.json)、[advisory knowledge boundary](./advisory-knowledge-boundary-contract.json)、[OKF context bundle](./okf-context-bundle-contract.json) |
| Foundry 构建与演进接口在哪里？ | [Foundry Agent series](./foundry-agent-series-contract.json)、[scaffold materialization](./agent-scaffold-materialization-contract.json)、[evolution proposal](./foundry-evolution-proposal.schema.json) |
| 通用 helper 与 source material 接口在哪里？ | [Native helper execution](./pack-native-helper-execution-contract.json)、[source material ingest](./source-material-ingest-contract.json)、[submission resource request](./submission-resource-provision-request.schema.json) |
| generated bundle 与 release consumer 如何绑定？ | [Pack bundle](./pack-bundle-contract.json)、[release operation event](./release-bundle-operation-event.schema.json)、[release consumer envelope](./release-bundle-consumer-envelope.schema.json) |
| 公开白皮书从哪里取得构建输入？ | [Whitepaper registry](./public-whitepaper-registry.json)、[Profile schema](./public-whitepaper-profile.schema.json) |

## Consumer 读法

schema 描述 payload，descriptor 声明能力，runtime receipt 记录一次已观察操作。任一项都不能单独证明已安装、领域接受、已发布或 release ready。应结合合同的 authority boundary 和所引用 consumer 阅读。

[Family orchestration 目录](../family-orchestration/README.zh-CN.md)持有与领域 Package 交换的 companion payload 形状。domain truth、artifact 和 memory body、专业 verdict 及 owner receipt 仍归声明的 domain owner；App 产品与发布决策仍归 App owner。

## 详细说明

- [共享领域行为](../../docs/specs/shared-domain-contract.md)与 [Standard Agent 接口](../../docs/specs/standard-agent-interface.md)解释领域接入边界。
- [共享运行合同](../../docs/specs/shared-runtime-contract.md)与 [Stage graph 和路由运输](../../docs/runtime/stage-graph-route-transition-runtime.md)解释执行与路由语义。
- [Artifact 与 Package 生命周期](../../docs/delivery/artifact-package-lifecycle-boundary.md)解释交付分工。
- [源码模块维护](../../docs/references/source-module-boundary.md)说明源码边界变更方法。
- [文档生命周期](../../docs/policies/docs-lifecycle-policy.md)将本索引与英文版作为同一语义文档管理。

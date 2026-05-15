# Gateway / Federation 兼容语料归档

Status: `retired`
Owner: `One Person Lab`

本目录是早期 `gateway / federation / routed-action` 定位的 tombstone 与归档入口。

当前 OPL 主线是：

- `Codex-default session/runtime`
- 显式 OPL activation
- 选定 domain-agent entry
- shared modules / contracts / indexes

这里的文件只解释历史设计意图和兼容合同来源。它们不能作为当前实现依据，也不能作为旧接口、旧 alias、旧测试或旧文档入口的兼容保留理由。

机器可读兼容 surface 仍在 [`contracts/opl-framework/`](../../../../contracts/opl-framework/)。人读文档仍是人读文档；代码和测试应读取 contracts、schema、source、生成产物、CLI/API 行为或语义化 `human_doc:*` id。

## 归档文件

- `gateway-federation*`
- `opl-federation-contract*`
- `opl-read-only-discovery-gateway*`
- `opl-routed-action-gateway*`
- gateway rollout、acceptance 与 activation-package references
- [Gateway / Federation 样例语料归档](./examples-corpora/README.md)
- [Gateway-Derived Operating Governance 归档](./operating-governance/README.md)

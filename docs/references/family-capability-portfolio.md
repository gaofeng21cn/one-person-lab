# OPL Family Capability Portfolio

本文把 `contracts/opl-framework/family-capability-domain-registry.json` 转为人读认知地图。contract 是字段和成员的唯一 machine owner；本文不维护安装状态、成熟度、测试计数或 release 状态。

## 读法

capability domain 是用户和产品理解 OPL 能力的标签，不是源码目录、Package、Cordis plugin 或独立发布单元。一个 domain 可以跨 Framework、App、Cloud 和 Package owner，由真实 authority surface 分担责任。

| Domain | 品牌 | 核心责任 | 主要 authority |
| --- | --- | --- | --- |
| `policy` | Charter | 产品与运行边界 | Framework contracts、App profile、Cloud policy |
| `workspace` | Workspace | 工作材料、绑定与恢复位置 | Framework workspace、file carrier、Cloud workspace |
| `catalog-discovery` | Atlas | 发现可用 Agent 与 capability | owner descriptors、domain manifests、App catalog |
| `package-platform` | Pack | 安装单元、descriptor 与 carrier ABI | Package owner、native carrier、Framework adapter |
| `stage-policy` | Stagecraft | Stage 边界、上下文与责任 | stage contracts、domain quality owner |
| `execution` | Runway | executor、provider 与 Attempt 运行 | Temporal history、Attempt ledger、executor route |
| `evidence` | Ledger | refs、lineage 与可审计 receipt | evidence ledger、owner receipts |
| `integration` | Connect | 外部来源、carrier、credential 和 release operation | native carrier、provider credential、source discovery |
| `experience` | Console | 用户与 operator 读写面 | App、Cloud Console、Framework read model |
| `evolution` | Foundry | Agent 设计、评测、版本和激活 | OMA/Foundry owner、evaluation verdict、activation CAS |
| `cloud-resource` | Fabric | managed resource 生命周期 | OPL Cloud 和 provider readback |

## 物理边界

每个 capability 依次判断：

1. **authority surface**：谁能写这项事实；
2. **source unit**：实现由哪个责任模块持有；
3. **Package**：是否需要独立安装和 descriptor；
4. **Cordis contribution**：是否需要进入某个 Host/Client composition；
5. **publication**：是否存在独立 consumer、release cadence 或回滚边界。

这五层不能互相替代。尤其不能因为一个能力有品牌名称，就为它创建源码 root、Package 或独立 repo。

## 当前 Framework 映射

Framework source unit 由 `source-module-map.json` 维护；当前 Cordis profiles 为 `base-headless`、`app-full` 和 `foundry-dev`。`brand-module-registry.json` 和相关 CLI 只提供 Framework surface projection，不能冻结整个 Family 的 domain 数量或 owner。

Fabric 的实现和 publication 主要属于 Cloud，不要求 Framework 创建对称模块。App 的 Client contribution 也由 App product owner 持有。

拓扑晋升条件由 [Package 拓扑](../project.md#package-拓扑) 统一定义。

## Currentness

查看成员、authority surface 和 contribution 时直接读取：

```bash
jq '.domains' contracts/opl-framework/family-capability-domain-registry.json
./bin/opl brand-modules list --json
./bin/opl cordis inspect --json
```

installed/effective 状态使用 `opl packages status --json` 和 `opl app state --profile fast --json`，不能由本页推断。

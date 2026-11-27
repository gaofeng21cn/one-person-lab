# OPL Family Capability Portfolio

本文把 OPL Family 各通用服务的职责边界映射为认知地图，不维护安装状态、成熟度、测试计数或 release 状态。四层产品定位见 [项目概览](../project.md#产品分层)。

## 读法

capability domain 是用户和产品理解 OPL 能力的标签，不是源码目录、Package、Cordis plugin 或独立发布单元。一个 domain 可以跨 Framework、App、Cloud 和 Package owner，由真实 authority surface 分担责任。

| Domain | 模块 | 核心责任 | 主要 authority |
| --- | --- | --- | --- |
| `policy` | Charter | 产品与运行边界 | Framework contracts、App profile、Cloud policy |
| `workspace` | Workspace | 工作材料、来源绑定与快照 | `packages/workspace`、file carrier、Cloud workspace |
| `package-platform` | Pack | 安装单元、descriptor 与 carrier 同步 | Package owner、native carrier、`packages/pack` |
| `execution` | Runway | executor、StageRun、Attempt 与调度 | `packages/runway`（`opl.db`）、executor route |
| `evidence` | Ledger | refs、lineage 与可审计 receipt | `packages/ledger`、owner receipts |
| `integration` | Connect | 外部来源、授权、credential handle 与通道 | `packages/connect`、provider credential |
| `experience` | Daemon / App | 用户与 operator 读写面、RPC 与桌面交互 | App、Studio、Cloud Console、`packages/daemon` |
| `evolution` | Foundry | Agent 脚手架、评测、比较与 CAS 激活 | `extensions/foundry`、evaluation verdict、activation CAS |
| `cloud-resource` | Fabric | managed resource 生命周期 | OPL Cloud 和 provider readback |

## 物理边界

每个 capability 依次判断：

1. **authority surface**：谁能写这项事实；
2. **source unit**：实现由哪个责任模块持有；
3. **Package**：是否需要独立安装和 descriptor；
4. **Cordis contribution**：是否需要进入某个 Studio Host/Client composition；
5. **publication**：是否存在独立 consumer、release cadence 或回滚边界。

这五层不能互相替代。尤其不能因为一个能力有品牌名称，就为它创建源码 root、Package 或独立 repo。

## 当前 Framework 映射

Framework v2 的实际包拓扑由 [`packages/`](../../packages/) 维护，包依赖方向由 [`scripts/check-v2-import-guard.mjs`](../../scripts/check-v2-import-guard.mjs) 校验。App、Studio 与领域 Agent 的组合分别由各自 owner 仓库持有，入口来自 installed descriptor 与 `opld` 动态投影。

拓扑晋升条件由 [Package 拓扑](../project.md#package-拓扑) 统一定义。

## Currentness

查看当前安装、运行与任务状态时直接读取：

```bash
./bin/opl daemon doctor --include-first-run --json
./bin/opl pack list --json
./bin/opl runway list --json
```

installed/effective 状态以动态 CLI/RPC readback 为准，不能由本页推断。

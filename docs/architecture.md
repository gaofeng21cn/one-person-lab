# OPL 架构

本文描述稳定的静态结构、owner 和依赖方向，不记录计划、里程碑或运行计数。

## 顶层结构

```text
User
  -> OPL App / CLI / Cloud
  -> selected product carrier
       -> Framework Cordis profiles for runtime, Package graph and App projection
       `-> Studio DSH Application Host for plugin, Codex and delivery composition
  -> public App state/action/authentication/channel contracts
  -> Framework authority + adapters + read models
  -> Package entrypoints / runtime providers / native carriers
  -> domain-owned facts, artifacts and verdicts
```

产品、composition、Package、carrier、executor 和 domain authority 是不同维度，不能用一个 registry 或状态机统一替代。

## Source topology

`contracts/opl-framework/source-module-map.json` 是源码责任图：

- `src/authority`：contracts、Workspace 和 Package 等 canonical rules。
- `src/adapters`：native carrier、provider、external service 和 execution adapter。
- `src/read-models`：面向 operator/App 的只读 projection。
- `src/host`：Cordis composition、plugin lifecycle 和 Host services。
- `src/entrypoints`：CLI 与公开调用入口，只做装配和 dispatch。
- `src/kernel`：少量跨层稳定类型和基础能力，保持 brand-neutral。

跨 unit 调用使用对方公开 entrypoint；源码身份和职责从责任图读取，entrypoint 只导出实际能力。entrypoint 不反向持有业务状态，adapter 不成为 authority，read model 不写 owner truth。

## Family capability portfolio

`family-capability-domain-registry.json` 描述 OPL Family 的 capability domain、authority surface、Package unit 和 Cordis contribution。它是跨产品认知地图，不是物理源码目录、安装清单或固定插件数量。

人读映射见 [Family capability portfolio](./references/family-capability-portfolio.md)。

## Package architecture

```text
owner descriptor
  -> configured native carrier
  -> installed/enabled/callable readback
  -> Framework aggregation
  -> Host contribution or public entrypoint
  -> App/operator projection
```

- Package identity 由 owner descriptor 持有。
- native carrier 持有物理安装与启停。
- Framework 只做薄 adapter、presence/callability 和统一投影。
- executor route 只决定一次调用怎么执行，不决定 Package 是否安装。
- Package publication 属于 owner release 面，不由 Framework catalog 推导。

能力只有在真实 consumer、owner 或 release cadence 要求时才从仓内模块晋升为 workspace Package、独立 repo 或独立 publication。

## Cordis architecture

Cordis 是进程内 composition 层。Framework 在自己的 scope 内提供三个受控 profile：

- `base-headless`：Framework CLI 和 headless 默认 profile。
- `app-full`：App/Client contribution 与 managed companion profile。
- `foundry-dev`：Foundry 开发和评测 profile。

Host service 通过显式依赖注入、typed event 和可撤销 effect 组合。运行开始后使用冻结的 composition identity；Cordis 不承担 durable workflow、证据账本、Package currentness、领域判断或安全沙箱。

### Host scope boundary

`contracts/opl-framework/cordis-architecture-profile.json#host_scope_boundary`
冻结两个可以并存、但 authority 不重叠的 Host：

| Host | 唯一 scope | 不拥有 |
| --- | --- | --- |
| Framework Host | `framework_runtime_package_graph_and_app_projection` | App product/release truth、domain verdict、Studio plugin/Codex lifecycle |
| Studio Application Host | `dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition` | OPL runtime、Package registry/currentness、App state/action、domain/product/release authority |

Studio Host 位于 `opl-studio` 仓，负责固定 DSH profile、插件生命周期、
`opl-codex-native` 和 Electron/WebUI/OCI transport。它通过 App state/action、
authentication 与 channel callback 公开合同消费 Framework，不加载或复制
Framework registry、currentness、session、Package graph 或内部 service graph。
因此“Framework Host 在其 scope 内唯一”与“Studio 是独立 DSH Application Host”
同时成立。

## Runtime control chain

```text
Stage contract
  -> Stage/Attempt request
  -> executor/provider adapter
  -> provider-owned durable execution
  -> Attempt projection
  -> owner receipt / typed blocker / artifact refs
  -> App and operator read model
```

Stage 决定工作边界，AI/executor 决定阶段内方法，provider 保存 durable execution，domain owner 决定专业结果。Framework 可以呈现、路由和恢复，不能替任何一层伪造完成。

## Evidence and state

- Workspace 文件和绑定归 Workspace owner。
- Temporal workflow history 归 Temporal service。
- Attempt projection 归 Framework runtime/read model。
- Evidence ledger 只保存 refs、lineage 和 receipt projection。
- artifact body、quality verdict、owner acceptance 和 human gate 归 domain owner。
- App product state 和 release verdict 归 App。
- Cloud resource truth 归 Cloud/provider owner。

任何 cache、generated report、Markdown 或 UI 都只能投影这些 owner，不得成为第二 writer。

## Product boundary

Framework 提供稳定的 runtime/Package Host graph 和 machine-readable surface；App 选择用户体验、starter profile、renderer 与 release carrier；Studio 可以在不转移 authority 的前提下组合自己的 DSH/Codex/delivery Host；Cloud 提供远端资源与协作；Package owner 独立演进自己的实现和发布。

跨仓变更先修改实际 owner contract，再更新 consumer。不得用 Framework README、App profile 或固定 family registry 反向定义其他 repo 的成员资格或专业事实。

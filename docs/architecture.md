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

## Agent 原生应用组合

Agent tool 与必要 UI 是同一领域能力的两个入口。Framework 的共享 MCP App 提供通用协作视图，专用 MCP App 保留领域编辑器，Studio 通过标准 MCP Apps 和 DSH/Cordis 接入。Connect 提供连接授权、provider 保管凭证；知识 owner 提供来源绑定与运行冻结，用户或领域 owner 持有知识正文。MiniApp 不新增应用注册表或独立 runtime。设计规则由[Agent 原生应用标准](./policies/agent-native-app-policy.md)持有，实际共享接口由 [MCP Apps SPEC](./mcp-apps/SPEC.md)持有。

### 共用基座的物理归属

`one-person-lab` 是通用基座的源码与合同维护中心。消费者通过安装的 Framework、公开模块和 CLI 复用能力；各领域仓维护自己的产品逻辑。SSOT 按事实归属确定，不以所有文件是否位于同一目录判断。

| 内容 | 物理维护位置 | 消费方式与归属 |
| --- | --- | --- |
| 通用规则与机器合同 | 本仓 `contracts/opl-framework/`；人读入口为 `docs/README.md` | 标准与接口在唯一主题 owner 维护，各仓链接、声明依赖；契约变更同步真实 caller |
| 通用运行代码与组件 | 本仓 `src/`、`packages/`、`python/opl_framework/`；共享 UI 为 `src/mcp-app/` | 使用 `package.json` 的公开 export、`opl` CLI 或已有 Python 支持投影；领域仓不复制 Framework runtime |
| 已安装的可执行基座 | 当前 carrier 选择的 Framework 安装；managed locator 入口为 `~/.opl/one-person-lab` | `opl framework locate --json` 回读本次调用的实际 root、bin、contracts 和 state；开发 checkout、CLI 安装与 App 所带安装可位于不同位置，各宿主按自己的安装合同选择 |
| 本机运行状态与连接授权 | `OPL_STATE_DIR` 指定位置；默认 `~/Library/Application Support/OPL/state`；使用 `OPL_DATA_DIR` 时为其下 `opl/state` | Framework 管理连接引用、grant、任务投影等状态；凭证由 provider、Account & Access 或原生 carrier 保管，消费者只使用公开执行入口 |
| 私人知识控制信息 | Profile/Workspace 的私有来源 registry，以及 `<workspace>/shared/memory/knowledge-bindings.json` | 多个获授权工作区引用同一来源，Framework 核对范围与接受版本；具体文件布局由[知识来源接口](./specs/knowledge-sources.md)定义 |
| 知识正文与领域数据 | 用户的 Obsidian、普通资料目录或业务工作区；邮件、照片、设备记录等保留原业务库 | 正文原处编辑、按共同生命周期接受；运行快照保存在 Framework state，业务数据不因共用知识而迁库 |
| 专业应用与宿主 | 各领域仓、`one-person-lab-app` 与 `opl-studio` | 领域 owner 管业务逻辑和质量，App/Studio 管产品与宿主；通过公开接口复用基座 |

定位代码、选择运行状态和选择知识来源是三个独立操作。开发者使用现有 Framework locator，部署者沿 carrier 安装与升级路径维护代码，用户在 Profile/Workspace 选择知识来源。显式选择的来源无效时应修复该选择，不能静默换成另一套身份或默认个人目录。实际路径随宿主和安装方式变化，公共合同不写入开发者机器的绝对路径；跨设备的来源同步与凭证续期继续由各自 owner 承担。

## Source topology

`contracts/opl-framework/source-module-map.json` 是源码责任图：

- `src/authority`：contracts、Workspace 和 Package 等 canonical rules。
- `src/adapters`：native carrier、provider、external service 和 execution adapter。
- `src/read-models`：面向 operator/App 的只读 projection。
- `src/host`：Cordis composition、plugin lifecycle 和 Host services。
- `src/entrypoints`：CLI 与公开调用入口，只做装配和 dispatch。
- `src/kernel`：少量跨层稳定类型和基础能力，保持 brand-neutral。

跨 unit 调用使用对方公开 entrypoint；源码身份和职责从责任图读取，entrypoint 只导出实际能力。entrypoint 不反向持有业务状态，adapter 不成为 authority，read model 不写 owner truth。

通用 Python 文件能力归 `python/opl_framework`：Profile Workspace 根定位与无覆盖初始化、
Package 内容锁字节编码和流式文件摘要由基座维护。已有 Framework 运行依赖的 consumer 直接导入；
独立 carrier 通过 `scripts/materialize-python-support.mjs` 逐字生成私有模块，并在验证时用
`--check` 核对同源。投影不引入注册表、版本状态或领域裁决，领域模板和业务状态仍归各自 owner。

## Family capability portfolio

`contracts/opl-framework/family-capability-domain-registry.json` 描述 OPL Family 的 capability domain、authority surface、Package unit 和 Cordis contribution。它是跨产品认知地图，不是物理源码目录、安装清单或固定插件数量。

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
- Codex 的物理 Package descriptor 通过原生 `plugin/list` 的本地 marketplace 范围发现，安装状态和可用项来自同次原生回读。该目录不依赖远端目录刷新；原生未提供物理路径的远端 Plugin 不合成 Framework descriptor。
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

## Knowledge ownership and execution context

用户、团队、长期主题和项目的知识正文由各自 owner 维护。Framework 将知识归属、内容性质、物理来源和访问范围分别解析；领域 Agent 使用获授权内容，不因执行任务而拥有用户的长期知识。

```text
owner-maintained Markdown source (personal vault or business workspace)
  -> authorized source binding + accepted revision + task applicability
  -> exact StageRun knowledge snapshot
  -> producer / reviewer / repairer context
  -> domain-owned update proposal and semantic acceptance
  -> revision-checked writeback to the same source
```

来源登记复用 Profile/Workspace 控制面，冻结快照复用 Framework 运行状态存储，项目工程继续保存业务产物。个人库无需生成第二套可编辑正文，工作区也不以中间全文投影充当来源。共同规则由[知识来源与记忆政策](./policies/knowledge-source-and-memory-policy.md)持有，字段与执行行为归知识生命周期合同及其源码。

## Evidence and state

- Workspace 文件和绑定归 Workspace owner。
- Temporal workflow history 归 Temporal service。
- Attempt projection 归 Framework runtime/read model。
- Evidence ledger 只保存 refs、lineage 和 receipt projection。
- artifact body、quality verdict、owner acceptance 和 human gate 归 domain owner。
- App product state 和 release verdict 归 App。
- Cloud resource truth 归 Cloud/provider owner。

Framework 的 cache、generated report、运行说明与 UI 只投影这些 owner，不得成为第二 writer。用户或领域维护的 Markdown 正文可以是知识主源，其归属由来源绑定与知识合同明确。

## Product boundary

Framework 提供稳定的 runtime/Package Host graph 和 machine-readable surface；App 选择用户体验、starter profile、renderer 与 release carrier；Studio 可以在不转移 authority 的前提下组合自己的 DSH/Codex/delivery Host；Cloud 提供远端资源与协作；Package owner 独立演进自己的实现和发布。

跨仓变更先修改实际 owner contract，再更新 consumer。不得用 Framework README、App profile 或固定 family registry 反向定义其他 repo 的成员资格或专业事实。

# OPL Standard Agent Interface

本文描述 Standard Agent 对 Framework 暴露的稳定人读接口。machine shape 以当前 descriptor 和 schema 为准。

## Identity

- `package_id`：安装单元；
- `agent_id`：Agent identity；
- `kind`：`agent`；
- `owner`：domain/repo owner；
- `home`：用户或开发者入口。

## Discovery

Framework 从 native carrier 的 installed descriptor 动态发现 Agent，校验 identity、schema 和 entrypoint。App profile 和 Framework source 不维护成员白名单。

包内 `plugin_selector` 声明分发入口，平台实际安装入口可为 registry 推导的 canonical local wrapper。安装状态与托管启动统一使用 `acceptedConfiguredCodexPluginIds`，只接受声明入口或该包的官方本地包装入口，不能按同名或任意 `-local` 后缀放行。启动必须选中唯一启用来源，并保持实际 selector、物理路径、版本和 installed carrier 回读一致；停用历史副本不算第二个启动来源。运行 provenance 记录实际 selector，包内声明通过 owner manifest 保留。启用/停用修改实际安装 selector 的配置表，不创建未安装的分发入口表。

绑定 StageAttempt 的 `OPL_WORKSPACE_ROOT` 表示 work-item 执行目录，不重定位机器的开发包目录。此时模块来源解析沿用持久化 workspace preference，保留显式 module override 和 carrier 来源一致性校验；无绑定调用仍接受 workspace 环境覆盖。

## Entry points

entrypoint 声明稳定 id、调用方式、输入、输出和 authority boundary。public CLI、MCP、Skill、Host contribution 和 App view 都消费同一 owner entrypoint或projection。

## Workspace and runtime

Agent 声明 workspace requirement、locator、Stage/capability contracts 和 runtime registration。Framework 传递明确 scope，创建 StageRun/Attempt，并读取 progress、artifact refs 和 owner answer。

`workspace_binding.shared_resources` 可由 Agent 声明工作区共享目录及其角色，Framework 只校验相对路径并按声明创建。已有工作区的普通 `init/ensure` 沿用索引内的资源拓扑；显式 `adopt` 才按当前 Agent 声明迁移。

Hosted action 的重启原因码由 action catalog 的 `lifecycle_admission_contract.reactivation_reason_code` 声明。Framework 校验请求与该声明一致，持有重放、身份和物化安全边界；新合同的领域原因由 Agent 决定。

## Capability map

每项 capability 声明：

- stable capability id 和 kind；
- owner/source ref；
- inputs/outputs；
- verification ref；
- forbidden writes；
- owner closeout boundary。

capability map 不规定 AI 的阶段内推理步骤，也不复制 skill 正文。

## Authority

Agent 保留 domain truth、artifact body、quality/export verdict、owner receipt、typed blocker 和 human gate。Framework 只做发现、调用、runtime、refs 和 projection。

## Evolution

Framework 按当前包 descriptor 和 schema 执行；领域字段由 owner 显式声明。旧版缺字段的默认值和 Framework 代算逻辑不作为兼容入口保留。

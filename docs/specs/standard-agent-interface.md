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

绑定 StageAttempt 的 `OPL_WORKSPACE_ROOT` 表示 work-item 执行目录，不重定位机器的开发包目录。此时模块来源解析沿用持久化 workspace preference，保留显式 module override 和 carrier 来源一致性校验；无绑定调用仍接受 workspace 环境覆盖。

## Entry points

entrypoint 声明稳定 id、调用方式、输入、输出和 authority boundary。public CLI、MCP、Skill、Host contribution 和 App view 都消费同一 owner entrypoint或projection。

## Workspace and runtime

Agent 声明 workspace requirement、locator、Stage/capability contracts 和 runtime registration。Framework 传递明确 scope，创建 StageRun/Attempt，并读取 progress、artifact refs 和 owner answer。

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

接口以新增 stable identity 或不改变既有语义的增量字段演进。没有 active consumer 的字段、entrypoint 和测试直接删除；breaking behavior 使用新的 identity，不在 Framework 中保留永久 alias。

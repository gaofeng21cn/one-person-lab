# OPL 标准智能体接口

Owner: `OPL Pack / Atlas / Workspace / Stagecraft / Runway`
Purpose: `standard_agent_domain_owned_interface_boundary`
State: `active`
Machine boundary: `contracts/opl-framework/standard-agent-interface.schema.json`

## 结论

标准 OPL Agent 通过 domain-owned `contracts/domain_descriptor.json#/standard_agent_interface` 声明基座需要消费的差异数据。OPL 只持有统一 schema、解析、命令模板安全展开、路由投影、workspace binding、progress projection 与 conformance gate；领域仓持有 locator 形态、direct-entry 模板、runtime dispatch/registration、progress aliases 和显式 routing signals。

这条边界不改变 package 安装与更新 owner。`OPL Connect` 继续按当前 agent package registry、lock、physical materialization、managed update source 和 lifecycle receipt 管理安装；标准接口不新增 installer、plugin lifecycle、legacy `install.sh` 或第二份 package identity。

## 标准字段

- `workspace_binding`：locator kind、required/optional locator fields，以及可选 argv 模板。没有 repo-owned direct CLI 的 Agent 必须把模板声明为 `null`，不能虚构私有 wrapper。
- `runtime`：domain runtime id、可选 dispatch argv 与 registration ref。OPL 持有 provider/runtime transport，领域仓只声明 handler/registration 差异。
- `progress`：领域对 OPL canonical progress delta 字段的 aliases。canonical classification 与 `deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta` 仍归 OPL。
- `routing`：显式 aliases、workstream ids、normalized intent signals 与 ambiguity policy。Atlas 只匹配显式规范化信号，不从自由文本关键词推断领域语义。

## 发现与校验

接口可以直接内嵌在 `domain_descriptor.json`，也可以用 repo-contained `repo_json_pointer` 指向领域仓内独立 JSON SSOT。OPL 拒绝目录逃逸、失效 JSON pointer、未知 locator 字段、required/optional 重叠、未知占位符和不安全 literal command token。

允许的模板占位符只有：`{workspace_root}`、`{workspace_path}`、`{profile_ref}`、`{input_path}`。模板由领域仓声明，OPL 逐 token 展开并负责 shell quoting；domain descriptor 缺失时 Workspace 只保留通用 workspace root locator 或用户显式提供的 command，不重建历史 MAS/MAG/RCA materializer。

## Authority Boundary

标准接口不得携带或授予 domain truth、quality/fundability/review/export/publication verdict、artifact body mutation、memory body accept/reject、owner receipt signer、typed blocker signer 或 human gate authority。接口/schema/conformance 通过也不能单独声明 domain ready、App ready、release ready 或 production ready。

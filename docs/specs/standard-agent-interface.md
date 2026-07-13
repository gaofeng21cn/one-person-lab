# OPL 标准智能体接口

Owner: `OPL Pack / Atlas / Workspace / Stagecraft / Runway`
Purpose: `standard_agent_domain_owned_interface_boundary`
State: `active`
Machine boundary: `contracts/opl-framework/standard-agent-interface.schema.json`

## 结论

标准 OPL Agent 通过 domain-owned `contracts/domain_descriptor.json#/standard_agent_interface` 声明基座需要消费的差异数据。OPL 只持有统一 schema、解析、路由投影、workspace binding、progress projection 与 conformance gate；领域仓持有 locator 形态、runtime registration、progress aliases 和显式 routing signals。可执行 action/stage binding 由 OPL hosted runtime ABI 承担，不在这个差异接口中携带命令字符串。

这条边界不改变 package 安装与更新 owner。`OPL Connect` 继续按当前 agent package registry、lock、physical materialization、managed update source 和 lifecycle receipt 管理安装；标准接口不新增 installer、plugin lifecycle、legacy `install.sh` 或第二份 package identity。

## 标准字段

- `workspace_binding`：locator kind 与 required/optional locator fields。Workspace 只投影结构化 locator，不从 descriptor 生成 direct-entry 或 manifest command。
- `runtime`：domain runtime id 与可选 registration ref。OPL 持有 provider/runtime transport；handler/stage 的可执行 binding 进入 hosted action/stage ABI。
- `progress`：领域对 OPL canonical progress delta 字段的 aliases。canonical classification 与 `deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta` 仍归 OPL。
- `routing`：显式 aliases、workstream ids、normalized intent signals 与 ambiguity policy。Atlas 只匹配显式规范化信号，不从自由文本关键词推断领域语义。

## 发现与校验

接口可以直接内嵌在 `domain_descriptor.json`，也可以用 repo-contained `repo_json_pointer` 指向领域仓内独立 JSON SSOT。OPL 拒绝目录逃逸、失效 JSON pointer、未知 locator 字段、required/optional 重叠和任何未声明字段。

`workspace_binding.entry_command_template`、`workspace_binding.manifest_command_template` 与 `runtime.dispatch_command` 已退役，并因 closed-object 校验 fail closed。domain descriptor 缺失时 Workspace 只保留通用 workspace root locator 或用户显式提供的 command，不重建历史 MAS/MAG/RCA materializer。

## Authority Boundary

标准接口不得携带或授予 domain truth、quality/fundability/review/export/publication verdict、artifact body mutation、memory body accept/reject、owner receipt signer、typed blocker signer 或 human gate authority。接口/schema/conformance 通过也不能单独声明 domain ready、App ready、release ready 或 production ready。

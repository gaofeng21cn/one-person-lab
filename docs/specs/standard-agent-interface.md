# OPL 标准智能体接口

Owner: `OPL Pack / Connect / Atlas / Workspace / Stagecraft / Runway`
Purpose: `standard_agent_domain_owned_interface_boundary`
State: `active`
Machine boundary: `contracts/opl-framework/standard-agent-interface.schema.json`

## 结论

标准 OPL Agent 通过 domain-owned `contracts/domain_descriptor.json#/standard_agent_interface` 声明基座需要消费的差异数据。OPL 只持有统一 schema、解析、路由投影、workspace binding、progress projection 与 conformance gate；领域仓持有 locator 形态、runtime registration、progress aliases 和显式 routing signals。可执行 action/stage binding 由 OPL hosted runtime ABI 承担，不在这个差异接口中携带命令字符串。

这条边界不改变 package 安装与更新 owner。`OPL Connect` 继续按当前 agent package registry、lock、physical materialization、managed update source 和 lifecycle receipt 管理安装；标准接口不新增 installer、plugin lifecycle、legacy `install.sh` 或第二份 package identity。

## 标准字段

- `workspace_binding`：locator kind 与 required/optional locator fields。Workspace 只投影结构化 locator，不从 descriptor 生成 direct-entry 或 manifest command。
- `stage_catalog`：可选的 agent-repo-relative JSON catalog 声明，由 `relative_path`、`items_pointer` 与 `stage_id/display_name/display_names` field map 组成。声明且可读时，catalog 是用户默认完整 Stage Map 的 canonical 列表与顺序；workspace stage index 只按同一 `stage_id` 叠加 status、owner、action 和展示字段，且 workspace 展示字段优先。catalog 不授予 stage state、执行或领域 authority。
- `runtime`：domain runtime id 与可选 registration ref。OPL 持有 provider/runtime transport；handler/stage 的可执行 binding 进入 hosted action/stage ABI。
- `progress`：领域对 OPL canonical progress delta 字段的 aliases。canonical classification 与 `deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta` 仍归 OPL。
- `routing`：显式 aliases、workstream ids、normalized intent signals 与 ambiguity policy。Atlas 只匹配显式规范化信号，不从自由文本关键词推断领域语义。

## 发现与校验

接口可以直接内嵌在 `domain_descriptor.json`，也可以用 repo-contained `repo_json_pointer` 指向领域仓内独立 JSON SSOT。OPL 拒绝目录逃逸、失效 JSON pointer、未知 locator 字段、required/optional 重叠和任何未声明字段。

未声明 `stage_catalog` 的旧 Agent 继续按既有 workspace stage index 投影，不产生 catalog diagnostic。声明后 catalog 文件缺失、非法 JSON、items pointer 无法解析、stage entry 缺少 id 或 id 重复都会产生结构化 diagnostic；结构不完整的 catalog 不作为 canonical 骨架。有效 catalog 未包含的 migration/internal workspace stage 不进入默认 `stage_map`，只保留在 stage-index source evidence 和 diagnostic 中。

descriptor discovery 必须消费 `OPL Connect` module source selector 的 canonical checkout。Developer Mode 或显式 path override 已选中 sibling/env checkout 时，只解析该 selected source，inactive managed mirror 不再作为第二 active source 被读取；selected source 自身 descriptor 非法时仍直接 fail closed。selected source 是 managed root 时，package dependency/runtime-source readiness 继续作为门禁，并要求 readiness checkout 与 selected checkout 指向同一位置。

`opl app state` 是跨 Agent 聚合读面：单个 package status 因 stale/invalid contract 失败时，该 package 投影为结构化 `unavailable` 和 attention diagnostic，其余 Agent、project inventory 与 Runtime 页面继续生成。`opl packages status --package-id ...` 等直接 package status/doctor/repair 命令不使用这层聚合隔离，仍对所选 package 的真实 contract 错误 fail closed。

`workspace_binding.entry_command_template`、`workspace_binding.manifest_command_template` 与 `runtime.dispatch_command` 已退役，并因 closed-object 校验 fail closed。domain descriptor 缺失时 Workspace 只保留通用 workspace root locator 或用户显式提供的 command，不重建历史 MAS/MAG/RCA materializer。

## Authority Boundary

标准接口不得携带或授予 domain truth、quality/fundability/review/export/publication verdict、artifact body mutation、memory body accept/reject、owner receipt signer、typed blocker signer 或 human gate authority。接口/schema/conformance 通过也不能单独声明 domain ready、App ready、release ready 或 production ready。

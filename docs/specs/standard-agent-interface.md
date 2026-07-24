# OPL 标准智能体接口

Owner: `OPL Pack / Connect / Atlas / Workspace / Stagecraft / Runway`
Purpose: `standard_agent_domain_owned_interface_boundary`
State: `active`
Machine boundary: `contracts/opl-framework/standard-agent-interface.schema.json`

## 2026-07-24 planned supersession

标准 Agent 目标态只是 installed descriptor 中的 `kind=agent` Package；Skill、Tool、
Plugin 和 entrypoint 是其可发现 capability。发现必须从实际 carrier 平台的 installed
inventory 动态产生，不再由 Framework 固定 Agent/Package registry 或 OPL lock、
materialization、LKG、receipt 决定。依赖只检查 presence/callability；MAS ->
ScholarSkills 保持 required。当前 schema、package readiness 和 hosted materialization
段落只作 dual-read compatibility，迁移与删除门见
[`OPL Package 平台组合迁移计划`](../active/opl-package-platform-composition-migration.md)。

当前机器合同的 `domain_detail_views` 仍只接受兼容用的
`scientific_reasoning_map`，Framework locator/read model 与 Shell renderer 仍携带
MAS-specific shape；这是真实 current compatibility，不是通用 typed-view 已落地。
Phase 2 目标是在 owner descriptor/data 与 Framework 之间建立通用 typed-view
envelope，未知 `view_kind` 只局部降级，再删除 Framework/App/Shell 的 MAS schema
镜像。该目标不由本文单独授权，顺序和验收仍归 App 迁移 SSOT。

## 结论

标准 OPL Agent 通过 domain-owned `contracts/domain_descriptor.json#/standard_agent_interface` 声明基座需要消费的差异数据。OPL 只持有统一 schema、解析、路由投影、workspace binding、progress projection 与 conformance gate；领域仓持有 locator 形态、runtime registration、progress aliases 和显式 routing signals。可执行 action/stage binding 由 OPL hosted runtime ABI 承担，不在这个差异接口中携带命令字符串。

迁移期这条边界不直接执行 package 安装与更新；现有 `OPL Connect` registry/lock/materialization/readiness 只能作为兼容输入。目标 install/update/remove owner 是 Codex Plugin Manager、Git 或实际 carrier 平台；标准接口不新增 installer、第二 package identity 或第二状态机。

## 标准字段

- `workspace_binding`：locator kind 与 required/optional locator fields。Workspace 只投影结构化 locator，不从 descriptor 生成 direct-entry 或 manifest command。
- `stage_catalog`：可选的 agent-repo-relative JSON catalog 声明，由 `relative_path`、`items_pointer` 与 `stage_id/display_name/display_names` field map 组成。声明且可读时，catalog 是用户默认完整 Stage Map 的 canonical 列表与顺序；workspace stage index 只按同一 `stage_id` 叠加 status、owner、action 和展示字段，且 workspace 展示字段优先。catalog 不授予 stage state、执行或领域 authority。
- `runtime`：domain runtime id 与可选 registration ref。OPL 持有 provider/runtime transport；handler/stage 的可执行 binding 进入 hosted action/stage ABI。
- `progress`：领域对 OPL canonical progress delta 字段的 aliases。canonical classification 与 `deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta` 仍归 OPL。
- `routing`：显式 aliases、workstream ids、normalized intent signals 与 ambiguity policy。Atlas 只匹配显式规范化信号，不从自由文本关键词推断领域语义。

## 发现与校验

接口可以直接内嵌在 `domain_descriptor.json`，也可以用 repo-contained `repo_json_pointer` 指向领域仓内独立 JSON SSOT。OPL 拒绝目录逃逸、失效 JSON pointer、未知 locator 字段、required/optional 重叠和任何未声明字段。

未声明 `stage_catalog` 的旧 Agent 继续按既有 workspace stage index 投影，不产生 catalog diagnostic。声明后 catalog 文件缺失、非法 JSON、items pointer 无法解析、stage entry 缺少 id 或 id 重复都会产生结构化 diagnostic；结构不完整的 catalog 不作为 canonical 骨架。有效 catalog 未包含的 migration/internal workspace stage 不进入默认 `stage_map`，只保留在 stage-index source evidence 和 diagnostic 中。

descriptor discovery 目标从 selected carrier 的 fresh inventory 读取 installed
`kind=agent` Package。Developer Mode 或显式 path override 选择 Git/local checkout 时，只
解析该 carrier source，inactive managed mirror 不再作为第二 active source；descriptor
identity 非法、required Package 缺失、entrypoint/handler/schema 不可调用时只隔离该
Agent 并 fail closed。现有 managed-root tree digest、lock、scope closure 和
`runtime_source_readiness` 是 dual-read compatibility，不再是目标 composition gate。

`opl app state` 是跨 Agent 聚合读面：单个 Package descriptor/carrier readback 因
unavailable/invalid contract 失败时，该 Package 投影为结构化 `unavailable` 和
attention diagnostic，其余 Agent、project inventory 与 Runtime 页面继续生成。对单个
Package 的 direct inspect/action 仍对所选 Package 的真实 identity、presence 或
callability 错误 fail closed，但不能以跨包 version/ABI/lock closure 阻止合法组合。

当前 owner-channel source selection 已进入 Framework 主线，但 ordinary App Package
projection 仍从 installed lock 和旧 status读取 ABI/digest、dependency closure、
materialization、receipt/rollback与 LKG。Phase 2 的第一个 producer migration固定为
`src/modules/console/app-state-agent-packages.ts` 及其
`package-status-projection.test.ts`，先把该投影收敛为 fresh
presence/callability/status/actions；`app-state.ts`不预先纳入写集。

`workspace_binding.entry_command_template`、`workspace_binding.manifest_command_template` 与 `runtime.dispatch_command` 已退役，并因 closed-object 校验 fail closed。domain descriptor 缺失时 Workspace 只保留通用 workspace root locator 或用户显式提供的 command，不重建历史 MAS/MAG/RCA materializer。

## Authority Boundary

标准接口不得携带或授予 domain truth、quality/fundability/review/export/publication verdict、artifact body mutation、memory body accept/reject、owner receipt signer、typed blocker signer 或 human gate authority。接口/schema/conformance 通过也不能单独声明 domain ready、App ready、release ready 或 production ready。

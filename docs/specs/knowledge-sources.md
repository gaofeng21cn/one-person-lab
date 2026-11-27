# 知识来源与运行上下文接口

本文说明本地 Markdown 来源、接受版本、阶段快照和写回接口。知识归属与生命周期规则由[知识来源与记忆政策](../policies/knowledge-source-and-memory-policy.md)持有；字段以对应 schema 与 `opl help` 为准。

## 一个 Profile 的物理布局

已有 Profile 可以复用以下控制面，正文继续留在原库或业务目录。路径是既有 Profile 的典型落位；普通单工作区也可保存自己的来源 registry，无需另建 Profile。

```text
<Profile Workspace>/
├── profile/、policies/、context/     可选本地正文；外部 Obsidian 正文无需复制
├── data/
│   ├── knowledge-sources.json       来源 registry 的一种落位，由 binding 明确引用
│   ├── persona/                    语义提案、角色知识 ID、派生摘要与 owner 回执
│   └── relay/                      邮件证据、邮件领域记忆、草稿、同步与派生索引
└── shared/memory/
    ├── knowledge-bindings.json      来源、scope 和必要知识的显式绑定
    ├── knowledge-writeback/         Framework 写回提案、审阅与回执
    ├── knowledge-registrations/     已有正文的登记意图与回执
    └── knowledge-source-reviews/    原处编辑接受证据

<用户选定的 Obsidian 或业务目录>/   唯一可编辑正文
${OPL_STATE_DIR}/snapshots/           由 WorkspaceService 管理的阶段只读上下文快照
```

Persona 的 `data/persona/knowledge-inputs.json` 只按角色选择知识 ID；笔记 Resource Binding 只解析允许操作的资源。Relay 的邮件记忆、Persona 的派生摘要与 Framework 的 registry 分别承担领域证据、语义上下文和知识生命周期职责。 Relay 记忆可保留 `knowledge_id`、`source_versions`、`scope`、`content_kind`、`canonical_target`、`writeback_status`、`observed_at` 和 `next_review_at`，但这些是链接与复核元数据，不是新的 registry。Relay 的 export/link/promote 只能输出证据或 review-gated proposal；正文写回仍走 Framework。来源权限和接受版本以 registry 为准，磁盘上的目录或索引不产生授权。

## App 共享资源与来源配置

App／Studio 的“设置 → 资料与连接 → 资料库”读取 `app_state.settings_control_center.app_settings_read_model.resource_sources`，同一摘要进入 `application_management.shared_resources`。来源 owner 从已选 Profile 和已有工作区绑定读取真实 registry；只返回来源身份、名称、权限、接受版本与检查结果，不返回资料库路径或正文。

连接资料库时优先使用宿主原生目录选择器（网页端保留服务器目录输入），通过 `scope_options` 与 `default_scope_ids` 由用户明确选择绑定范围。软件中心展示可用性与缺失授权并携带焦点导航到该设置页。来源名称保存在原 registry 的 `source.label`，`source-configure --label` 以精确 revision 原处改名而不修改 scope 或绑定；没有名称时投影使用工作区名称和来源序号，保留稳定 `source_id`。

用户在同一入口选择资料目录，或通过高级入口接入已有 registry，并明确选择使用范围与可使用的应用。首次接入复用 `<workspace>/data/knowledge-sources.json` 和既有 binding；它不自动登记、接受或复制库中的正文。`OPL_PROFILE_WORKSPACE` 的显式选择无效时直接报告错误，不换用默认个人目录。工作区以已有 registry 的不透明 ID 选择。

`opl workspace sources list|add|remove`、`opl workspace snapshot`、`opl workspace writeback` 与 `knowledge_source_*` App actions 共用 [`WorkspaceService`](../../packages/workspace/src/service.ts)。配置、授权修改和断开绑定要求确认及精确 revision，写后立即回读。断开只移除当前工作区对此来源的选择，保留原文、registry、其他工作区授权及必要知识声明；重新连接沿原来源身份完成。

来源是否可用与知识条目是否仍适合召回分别呈现。授权正常、原文字节与接受版本一致的来源，不因其中历史记录到达复核期限而显示来源故障。`knowledge_health` 保留当前可用、待复核、已退役和正文不可用的数量，以及待复核条目的知识 ID 与原因；详情可据此显示“6 项可用，2 项待复核”。正文漂移、文件不可读及无效接受记录仍要求处理。来源检查不延长复核日期，不修改正文；过期条目继续被原召回流程排除，必要知识或行动前复核缺口仍阻止对应执行。

简单表单保留现有授权边界：多条项目/领域/范围 grant 由来源 owner 管理；同 registry 绑定多个来源时，不允许通过编辑一个来源扩大其他来源的 scope。UI 根据 `access_editable`、`scope_expansion_allowed` 和现有范围选项说明可执行动作。机器字段与安全边界由 [`packages/workspace/src/`](../../packages/workspace/src/index.ts) 持有。

## 文件与身份

| 表面 | 位置或合同 | 作用 |
| --- | --- | --- |
| 产品知识 catalog | Agent 包的 `contracts/durable_knowledge_catalog.json` | 仅登记 `product` scope 的包内 Markdown |
| 工作区来源绑定 | `<workspace>/shared/memory/knowledge-bindings.json` | 引用来源 registry，显式选择 `source_ids`、`scope_ids` 和必要知识 ID |
| 来源 registry | 绑定所引用的私有本地 JSON | 一份权威来源登记，持有来源根、授权、可写状态、知识项和已接受正文哈希；可位于已有 Profile 或 Workspace 控制区 |
| 原文 | registry 中的 `root` 加条目相对 `ref` | 用户已有个人库或工作目录内的唯一正文；无需中间全文投影 |
| 冻结快照 | `WorkspaceService` 管理的阶段快照（`${OPL_STATE_DIR}` 工作区快照存储） | 运行时保存本次实际消费的私有正文，binding 只引用该快照 |
| 正文登记证据 | `<workspace>/shared/memory/knowledge-registrations/` | 新知识登记的精确身份、接受依据、意图与回执 |
| 知识退役证据 | `<workspace>/shared/memory/knowledge-retirements/` | 已审阅退役的原文字节、原 registry、原因、恢复阶段与回执；不作为新知识候选 |
| 正文迁移证据 | `<workspace>/shared/memory/knowledge-relocations/` | 精确源/目标位置、原文字节、原 registry、目标身份、恢复阶段与回执；不作为新知识候选 |
| 提案修订证据 | `<workspace>/shared/memory/knowledge-writeback/` | 提案、审阅、基础版本、恢复意图与应用回执 |
| 原处编辑接受证据 | `<workspace>/shared/memory/knowledge-source-reviews/` | 审阅时的正文、registry 基础版本、接受意图与回执 |

条目使用 `scope: {kind, id}`、`content_kind`、`body_ref`、`applicability`、接受状态与复核时间。包内正文使用 `repo_path`；私有正文使用 `source_path`，由 `source_id` 找到已绑定来源，再以相对 `ref` 和 `sha256` 核验已接受版本。Blueprint 的 `memory_policy.knowledge_requirements` 描述语义需求；如需将语义 owner 绑定到精确条目，使用控制面提供的 `requirement_bindings: [{requirement_id, semantic_owner_ref, owner_id, knowledge_ids}]`，不把 Blueprint 逻辑引用当作来源授权。

`source_id` 标识来源，`knowledge_id` 标识知识对象，`scope.id` 标识所属用户、主题或项目，domain 标识消费者。来源授权同时核对工作区、domain，以及声明的项目与 scope 限制。工作区 binding 不自动扩大 registry grant。项目身份从 `workspace_index.projects` 解析；未知项目不能通过目录命名获得项目知识。

来源的 `include_globs` 和 `exclude_globs` 可进一步收窄可用正文路径；这些过滤由源 owner 维护，发现与已接受来源读取遵守相同路径边界。

来源 grant 的 `domains` 授予读取范围，`write_domains` 授予其中一部分 domain 维护权限；后者须为前者的子集，缺省为空。写回链还要求 `source.writable: true`，并重新核对工作区、项目和 scope 授权。不能仅凭来源可写就让所有读者更新正文或接受版本。

需求匹配同时核对 scope、内容性质、来源模式和语义 owner。语义 owner ref 与条目 `owner` 完全相同时可以直接匹配；逻辑引用需要映射到实际 owner 时，使用显式需求绑定。以下是示意配置，路径和身份均应替换为实际授权对象：

```json
{
  "surface_kind": "opl_knowledge_source_bindings",
  "version": "knowledge-source-bindings.v2",
  "registries": [
    {
      "registry_ref": "/private/example-profile/control/knowledge-registry.json",
      "source_ids": ["personal-notes"],
      "scope_ids": ["person.example"]
    }
  ],
  "requirement_bindings": [
    {
      "requirement_id": "owner-disclosure-policy",
      "semantic_owner_ref": "opl://owner/project-owner",
      "owner_id": "example-person",
      "knowledge_ids": ["person.disclosure-policy"]
    }
  ]
}
```

这把蓝图中的披露政策需求绑定到实际 owner 的指定知识，不能用另一位用户的同类型政策填补必要输入。需求绑定只连接语义身份与条目，来源 grant、scope 选择、适用性和有效性仍独立核验。

相关机器接口由 [`packages/workspace/src/types.ts`](../../packages/workspace/src/types.ts) 和 `opl workspace sources` / `snapshot` / `writeback` 命令族持有。

## 接入与召回

首次接入由有权维护者确认原文、归属、授权、适用任务与接受版本，并建立来源 registry 和工作区绑定。绑定之后，`knowledge register` 可在其中登记一个已存在的 Markdown 正文；它不会新建 registry、来源或授权，也不复制正文。同一个 registry 可以被多个明确获授权的工作区引用，无需复制正文或接受记录。已有 Obsidian 和工作目录内的 Markdown 采用相同 schema；是否位于工作区内不影响 scope。

已有业务项目目录通过 `workspace adopt`、`workspace init` 或 `workspace ensure` 的 `--project-id <id> --project-root <absolute-existing-path>` 登记；typed API 对应 `projectRoot`，App action 对应 `project_root`。该目录须是工作区内已存在的真实子目录，不能是工作区自身、符号链接或普通文件。Framework 维护 `workspace_index`，拒绝同一 ID 指向不同 root、同一 root 绑定不同 ID，以及覆盖非 OPL 项目元数据。同一 ID 未提供 root 时复用已登记位置；新项目未提供 root 时采用既有默认项目集合目录。登记建立控制信息，不移动或复制业务正文。

项目 root 与知识来源 root 是两件事：项目在工作区内获得稳定执行身份，个人库原文仍可位于工作区外并通过来源绑定使用。知识需求的 `workspace` 来源模式包含 root 等于工作区或位于其内部的来源；外部个人库使用 `external`，产品包内正文使用 `product`。来源模式不替代 scope 或访问授权。

| 命令 | 输入 | 输出与边界 |
| --- | --- | --- |
| `knowledge list` / `knowledge inspect` | 产品包路径；inspect 另带知识 ID | 产品 catalog 元数据，不返回私有全文 |
| `knowledge sources` | 工作区、domain、可选项目与知识 ID | 当前获授权且字节与接受版本一致的来源条目、定位引用及可写标记；不返回正文 |
| `knowledge search` | 同一范围，另带 query 与可选结果／摘录长度限制 | 由授权来源正文产生的字面匹配候选与短摘录；语义相关性由调用者判断 |
| `knowledge discover` | 绑定来源、query 与摘录限制 | 发现候选；`candidate:true`、`accepted:false`，不进入召回或派生上下文，逐项审阅后才能登记 |
| `knowledge recall` | 包、domain、stage、可选 action 与工作区／项目 | 已选择知识身份、正文哈希、选择理由与缺口 |
| `knowledge prepare` | 与 recall 相同的范围，另带新的 output 路径 | 私有快照的 binding；不覆盖已有 binding |
| `knowledge read-context` | binding 路径 | 核对快照身份及当前来源访问后返回冻结正文 |
| `knowledge read-source` | 工作区、domain、知识 ID、可选项目 | 返回当前获授权且已接受的原文及哈希 |
| `knowledge resolve-target` | 工作区、domain、正文绝对路径、可选项目 | 判断是否已注册及其身份、接受正文哈希与 `registry_sha256`；保留已注册但失效、退役或撤权的识别，防止普通 writer 绕过生命周期 |
| `knowledge inspect-source` | 工作区、domain、知识 ID、可选项目 | 返回待审阅原文字节、当前与接受版本哈希；不接受或激活修订 |
| `knowledge revalidate --for-action` | binding 路径 | 复核当前访问、关键知识版本及新增适用的必要或关键知识，不产生业务行动授权 |
| `knowledge verify-dependencies` | 工作区、domain、依赖 JSON、可选项目 | 核对派生摘要所依赖知识的版本、有效性与访问范围 |

直接入口与托管 StageRun 共用同一快照存储和校验。命令通过 [`opl workspace`](../../packages/daemon/src/cli/main.ts) 提供：

```text
opl workspace sources list --workspace <workspace> --json
opl workspace snapshot --workspace <workspace> --stage-run <stage-run-id> [--source <source-id>] --json
opl workspace writeback propose|commit ... --json
```

`snapshot` 的输出绑定私有正文引用与当次校验结果；公开回读保留引用与回执。冻结正文不会因普通源文修订而悄悄变化，但后续读取仍核对访问授权。任务声明为必要的知识失效时，依赖它的工作不得通过静默默认值继续。

## 来源查询与修订写回

`opl workspace sources` 管理工作区与知识来源绑定，`opl workspace snapshot` 生成当次任务只读快照，`opl workspace writeback` 管理审阅门控的正文修订提案与提交；具体参数与返回结构以 [`packages/workspace/src/service.ts`](../../packages/workspace/src/service.ts) 与 `opl workspace --help` 为准。

来源版本检查和本机写入锁用于协调遵守同一协议的本机写者，不构成跨设备文件系统事务。云同步冲突或其他编辑器并发写入需要保留并核对版本；不以最后写入覆盖解决。语义接受与业务结果仍由原 owner 依据决定。

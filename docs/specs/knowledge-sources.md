# 知识来源与运行上下文接口

本文说明本地 Markdown 来源、接受版本、阶段快照和写回接口。知识归属与生命周期规则由[知识来源与记忆政策](../policies/knowledge-source-and-memory-policy.md)持有；字段以对应 schema 与 `opl help` 为准。

## 文件与身份

| 表面 | 位置或合同 | 作用 |
| --- | --- | --- |
| 产品知识 catalog | Agent 包的 `contracts/durable_knowledge_catalog.json` | 仅登记 `product` scope 的包内 Markdown |
| 工作区来源绑定 | `<workspace>/shared/memory/knowledge-bindings.json` | 引用来源 registry，显式选择 `source_ids`、`scope_ids` 和必要知识 ID |
| 来源 registry | 绑定所引用的私有本地 JSON | 一份权威来源登记，持有来源根、授权、可写状态、知识项和已接受正文哈希；可位于已有 Profile 或 Workspace 控制区 |
| 原文 | registry 中的 `root` 加条目相对 `ref` | 用户已有个人库或工作目录内的唯一正文；无需中间全文投影 |
| 冻结快照 | `<OPL state>/family-runtime/review-transport/knowledge-context/` | 运行时保存本次实际消费的私有正文，binding 只引用该快照 |
| 提案修订证据 | `<workspace>/shared/memory/knowledge-writeback/` | 提案、审阅、基础版本、恢复意图与应用回执 |
| 原处编辑接受证据 | `<workspace>/shared/memory/knowledge-source-reviews/` | 审阅时的正文、registry 基础版本、接受意图与回执 |

条目使用 `scope: {kind, id}`、`content_kind`、`body_ref`、`applicability`、接受状态与复核时间。包内正文使用 `repo_path`；私有正文使用 `source_path`，由 `source_id` 找到已绑定来源，再以相对 `ref` 和 `sha256` 核验已接受版本。Blueprint 的 `memory_policy.knowledge_requirements` 描述语义需求；如需将语义 owner 绑定到精确条目，使用控制面提供的 `requirement_bindings: [{requirement_id, semantic_owner_ref, owner_id, knowledge_ids}]`，不把 Blueprint 逻辑引用当作来源授权。

`source_id` 标识来源，`knowledge_id` 标识知识对象，`scope.id` 标识所属用户、主题或项目，domain 标识消费者。来源授权同时核对工作区、domain，以及声明的项目与 scope 限制。工作区 binding 不自动扩大 registry grant。项目身份从 `workspace_index.projects` 解析；未知项目不能通过目录命名获得项目知识。

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

相关机器合同：

- [知识条目](../../contracts/opl-framework/durable-knowledge-item.schema.json)
- [来源 registry](../../contracts/opl-framework/knowledge-source-registry.schema.json)
- [工作区绑定](../../contracts/opl-framework/knowledge-source-bindings.schema.json)
- [消费回执](../../contracts/opl-framework/durable-knowledge-recall-receipt.schema.json)

## 接入与召回

首次接入由有权维护者确认原文、归属、授权、适用任务与接受版本，并建立来源登记和工作区绑定。同一个 registry 可以被多个明确获授权的工作区引用，无需复制正文或接受记录。已有 Obsidian 和工作目录内的 Markdown 采用相同 schema；是否位于工作区内不影响 scope。

已有业务项目目录通过 `workspace adopt`、`workspace init` 或 `workspace ensure` 的 `--project-id <id> --project-root <absolute-existing-path>` 登记；typed API 对应 `projectRoot`，App action 对应 `project_root`。该目录须是工作区内已存在的真实子目录，不能是工作区自身、符号链接或普通文件。Framework 维护 `workspace_index`，拒绝同一 ID 指向不同 root、同一 root 绑定不同 ID，以及覆盖非 OPL 项目元数据。同一 ID 未提供 root 时复用已登记位置；新项目未提供 root 时采用既有默认项目集合目录。登记建立控制信息，不移动或复制业务正文。

项目 root 与知识来源 root 是两件事：项目在工作区内获得稳定执行身份，个人库原文仍可位于工作区外并通过来源绑定使用。知识需求的 `workspace` 来源模式包含 root 等于工作区或位于其内部的来源；外部个人库使用 `external`，产品包内正文使用 `product`。来源模式不替代 scope 或访问授权。

| 命令 | 输入 | 输出与边界 |
| --- | --- | --- |
| `knowledge list` / `knowledge inspect` | 产品包路径；inspect 另带知识 ID | 产品 catalog 元数据，不返回私有全文 |
| `knowledge recall` | 包、domain、stage、可选 action 与工作区／项目 | 已选择知识身份、正文哈希、选择理由与缺口 |
| `knowledge prepare` | 与 recall 相同的范围，另带新的 output 路径 | 私有快照的 binding；不覆盖已有 binding |
| `knowledge read-context` | binding 路径 | 核对快照身份及当前来源访问后返回冻结正文 |
| `knowledge read-source` | 工作区、domain、知识 ID、可选项目 | 返回当前获授权且已接受的原文及哈希 |
| `knowledge inspect-source` | 同上 | 返回待审阅原文字节、当前与接受版本哈希；不接受或激活修订 |
| `knowledge revalidate --for-action` | binding 路径 | 复核当前访问、关键知识版本及新增适用的必要或关键知识，不产生业务行动授权 |
| `knowledge verify-dependencies` | 工作区、domain、依赖 JSON、可选项目 | 核对派生摘要所依赖知识的版本、有效性与访问范围 |

直接 Skill 与托管 StageRun 共用同一快照存储和校验。直接入口示例中的路径、身份和输出文件名应替换为本次实际值：

```text
opl knowledge prepare --repo <package> --domain <domain> --stage <stage> --task-intent <action> --workspace <workspace> --project <project> --output <new-binding.json> --json
opl knowledge read-context --binding <new-binding.json> --json
opl knowledge revalidate --binding <new-binding.json> --for-action --json
```

`read-context` 的输出是私有正文，只进入获授权执行上下文；公开回读保留引用与回执。冻结正文不会因普通源文修订而悄悄变化，但后续读取仍核对访问授权。任务声明为必要的知识失效时，依赖它的工作不得通过静默默认值继续。

## 用户编辑与智能体提案

用户直接编辑原文后，已授权维护者先运行 `knowledge inspect-source` 读取候选正文和哈希，结合此前接受版本核对差异，再运行 `knowledge review-source --expected-sha256 <sha256:reviewed-source-digest>`，并提供 reviewer、review ref、reviewed at 和 next review at。接受动作只更新与实际审阅字节一致的版本；源文在审阅后改变时拒绝接受。该命令不重写正文。复核时间与底层事实的观察时间分别记录。

智能体提出修订时，先准备完整替换 Markdown 和结构化提案。提案包含 `source_refs`、`target_scope`、`content_kind`、`proposed_rule_or_mechanism`、`evidence_class` 和 `review_requirement`。提案不能借修订正文静默改变知识归属或类型。

1. `knowledge propose` 绑定知识 ID、原文与 registry 版本，生成明确的提案身份。
2. `knowledge review --proposal-id <digest>` 记录 `accepted` 或 `rejected`，并绑定精确提案的摘要、reviewer、实际 review ref、复核时间和下次复核期限；提案证据或基础原文、registry 漂移时拒绝审阅。
3. `knowledge apply` 只应用获接受的精确提案；原版本漂移时拒绝覆盖，保留恢复证据并回读结果。
4. 下一次任务重新 prepare；历史 binding 保留其当次上下文，真实行动前另做关键知识复核。

上述写回命令都指定工作区和 domain；涉及项目授权时同时指定项目，并满足独立的写回 grant。产品知识由产品仓库的审阅发布流程维护，不经私有来源 writer 修改。

来源版本检查和本机写入锁用于协调遵守同一协议的本机写者，不构成跨设备文件系统事务。云同步冲突或其他编辑器并发写入需要保留并核对版本；不以最后写入覆盖解决。

提案、审阅与应用合同分别见[提案 schema](../../contracts/opl-framework/knowledge-writeback-proposal.schema.json)、[审阅 schema](../../contracts/opl-framework/knowledge-writeback-review.schema.json)和[回执 schema](../../contracts/opl-framework/knowledge-writeback-receipt.schema.json)。命令成功证明机械操作已完成，语义接受与业务结果仍由其 owner 的依据决定。

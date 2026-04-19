[English](./opl-read-only-discovery-gateway.md) | **中文**

# OPL Gateway 契约面

## 目的

这份文档冻结 `OPL Gateway` 的 `G2` 目标。

`G2` 是 `OPL` 第一次成为真实入口表面，但仅限于只读 discovery。
截至 `2026-04-07`，`OPL` 公开主线仍是 `Phase 1`，且当前仓库已具备可运行的本地 `TypeScript CLI`-first / gateway contract baseline；当前重点是把它收口成稳定、单一、repo-tracked 的 `G2 stable public baseline`。

目标不是 mutation domain state。
目标是让人类和 Agent 能先问顶层 gateway：我该用哪个系统、这个 workstream 是什么、这个请求应该落到哪个 domain。

## 与 G1 的关系

`G2` 直接消费 `G1` 契约。

也就是说，这个 discovery gateway 建立在下面这些东西之上：

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [workstream registry](../contracts/opl-gateway/workstreams.json)
- [domain registry](../contracts/opl-gateway/domains.json)
- [routing vocabulary](../contracts/opl-gateway/routing-vocabulary.json)
- 当前仓库中已落地的机器可读工件：[`../contracts/opl-gateway/README.zh-CN.md`](../contracts/opl-gateway/README.zh-CN.md)

如果 `G1` 没冻结，`G2` 不应继续推进。

## 核心承诺

在 `G2`，Agent 应该可以先问：

- 当前有哪些 workstream？
- 这个 workstream 由哪个 domain system 承接？
- 哪些 family 直接映射这个 workstream？
- 这个任务应该进 `MedAutoScience`、`RedCube AI`，还是都不是？
- 下一步正式入口应该是什么？

并得到稳定、机器可读、且不触碰 domain 内部的答案。

## 非目标

`G2` 不负责：

- 创建 deliverable
- 修改 workspace
- 启动 run
- 绕过 domain gateway
- 拥有 canonical runtime truth

它只负责 discovery。

## 必需的只读操作

最小 discovery gateway 应暴露这些操作：

这些操作既是 `G2` 的最小合同，也是当前 `Phase 1` CLI baseline 已暴露的公开 discovery surface。

- `list_workstreams`
- `get_workstream`
- `list_domains`
- `get_domain`
- `list_surfaces`
- `get_surface`
- `resolve_request_surface`
- `explain_domain_boundary`

## 操作定义

### `list_workstreams`

目的：

- 返回所有已注册 workstream 及其顶层 owner 和状态

建议响应：

```json
{
  "version": "g2",
  "workstreams": [
    {
      "workstream_id": "research_ops",
      "label": "Research Foundry",
      "status": "active",
      "domain_id": "medautoscience"
    },
    {
      "workstream_id": "presentation_ops",
      "label": "Presentation Foundry",
      "status": "emerging",
      "domain_id": "redcube"
    }
  ]
}
```

### `get_workstream`

目的：

- 返回某一个 workstream 的完整注册含义

建议响应：

```json
{
  "version": "g2",
  "workstream": {
    "workstream_id": "presentation_ops",
    "label": "Presentation Foundry",
    "status": "emerging",
    "domain_id": "redcube",
    "primary_families": [
      "ppt_deck"
    ],
    "top_level_intents": [
      "presentation_delivery",
      "lecture_materials",
      "defense_materials"
    ],
    "notes": "ppt_deck maps directly; xiaohongshu does not automatically equal Presentation Foundry."
  }
}
```

### `list_domains`

目的：

- 返回所有已注册 domain gateway 及其承接的 workstream

建议响应：

```json
{
  "version": "g2",
  "domains": [
    {
      "domain_id": "medautoscience",
      "gateway_surface": "Research Foundry Gateway",
      "owned_workstreams": [
        "research_ops"
      ]
    },
    {
      "domain_id": "redcube",
      "gateway_surface": "Visual Deliverable Gateway",
      "owned_workstreams": [
        "presentation_ops"
      ]
    }
  ]
}
```

### `get_domain`

目的：

- 返回某一个 domain gateway 的正式含义

建议响应：

```json
{
  "version": "g2",
  "domain": {
    "domain_id": "redcube",
    "project": "redcube-ai",
    "gateway_surface": "Visual Deliverable Gateway",
    "harness_surface": "Visual Deliverable Domain Harness OS",
    "standalone_allowed": true,
    "owned_workstreams": [
      "presentation_ops"
    ],
    "non_opl_families": [
      "xiaohongshu"
    ]
  }
}
```

### `list_surfaces`

目的：

- 返回当前已索引的顶层 public surface 摘要

建议响应：

```json
{
  "version": "g2",
  "surfaces": [
    {
      "surface_id": "opl_public_readme",
      "category_id": "opl_public_entry",
      "surface_kind": "readme",
      "owner_scope": "opl"
    },
    {
      "surface_id": "opl_read_only_discovery_gateway",
      "category_id": "opl_contract_surface",
      "surface_kind": "contract_doc",
      "owner_scope": "opl"
    }
  ]
}
```

### `get_surface`

目的：

- 返回某一个 public surface 的完整注册含义

建议响应：

```json
{
  "version": "g2",
  "surface": {
    "surface_id": "opl_read_only_discovery_gateway",
    "category_id": "opl_contract_surface",
    "surface_kind": "contract_doc",
    "owner_scope": "opl",
    "routes_to": [
      "medautoscience_public_gateway",
      "redcube_public_gateway"
    ]
  }
}
```

### `resolve_request_surface`

目的：

- 把一个顶层请求解析成最可能的 workstream 和 domain surface

必需输入：

- `intent`
- `target`
- `goal`
- 可选 `preferred_family`

建议响应：

```json
{
  "version": "g2",
  "resolution": {
    "request_kind": "discover",
    "workstream_id": "presentation_ops",
    "domain_id": "redcube",
    "entry_surface": "domain_gateway",
    "recommended_family": "ppt_deck",
    "confidence": "medium",
    "reason": "The goal is a defense-oriented presentation deliverable."
  }
}
```

说明：

- `confidence` 在当前 `Phase 1` 只作为示意性字段，不单独冻结成需要逐字逐值匹配的公开契约

特殊规则：

- 如果请求是 `xiaohongshu`，domain 仍可能解析到 `redcube`
- 但除非顶层语义真的匹配，否则 workstream 不能自动标成 `presentation_ops`

### `explain_domain_boundary`

目的：

- 解释为什么一个任务属于某个 domain，而不是另一个 domain

建议响应：

```json
{
  "version": "g2",
  "boundary_explanation": {
    "request_summary": "Prepare a defense-ready slide deck for a thesis committee.",
    "resolved_domain": "redcube",
    "rejected_domains": [
      {
        "domain_id": "medautoscience",
        "reason": "Research evidence may feed the task, but the requested output is a visual deliverable."
      }
    ]
  }
}
```

## Source-Of-Truth 规则

在 `G2`，gateway 只读：

- `G1` federation contract
- 顶层 workstream / domain registry

它不能把 domain private runtime state 当作顶层真相。

它可以链接 domain surface。
但不能 mutation domain truth。

## Surface 形态

当前 `Phase 1` 的交付目标，是继续用本地 `TypeScript CLI` 作为当前只读 gateway surface 的 discovery transport。
在开发控制面上，当前活跃路径已经收口为 Codex-only：标准 Codex 会话直接承担规划、实现、验证与评审，并对冻结的 gateway contracts 负责。
但这个开发宿主选择并不意味着 Codex 就是 `OPL` 的产品 runtime substrate owner；任何诚实的上游 `Hermes-Agent` rollout，仍必须先在某个 domain 仓里落地。
历史上的 `Codex Host` / `OMX` 分工现在只保留在第三层历史迁移参考文档中，不再定义这份公开 gateway 文档的当前语义。
在这条基线里，discovery contract 通过下面这些命令暴露：

- `opl contract workstreams`
- `opl contract workstream <workstream_id>`
- `opl contract domains`
- `opl contract domain <domain_id>`
- `opl contract surfaces`
- `opl contract surface <surface_id>`
- `opl domain resolve-request`
- `opl domain explain-boundary`

配套 transport 命令还包括：

- `opl help`
- `opl contract validate`

docs-site navigation 与未来的 MCP discovery tools 仍然可以作为兼容 transport，只要共享同一份 contract。

重要的是 contract，不是 transport。
在概念上，discovery 之后的下一层 formal entry 仍然是 domain gateway；但 `G2` 本身**不授予 route authority**，它只负责识别正确边界。
当前不把 `OPL` 提升成统一 runtime owner，也不抽共享执行内核；CLI 在这里只承载只读 discovery。
因此，当前实现目标是本地 CLI discovery surface，而不是 web/server runtime。

## 完成定义

只有满足下面条件，`G2` 才算完成：

- discovery 请求能通过机器可读输出回答
- 顶层 gateway 能在不靠 prose-only 推理的前提下解析 domain ownership
- discovery workflow 不依赖 mutation path
- 在 discovery 之后，domain gateway 仍是下一层正式入口

下面这些情况说明 `G2` 还没完成：

- gateway 仍只会返回自由 prose
- domain ownership 仍模糊
- gateway 开始 mutation domain state

`G2` 收口之后，下一棒仅进入 `G3 thin handoff planning` 冻结，而不是进入统一 routed-action runtime。

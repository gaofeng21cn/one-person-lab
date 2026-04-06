[English](./opl-read-only-discovery-gateway.md) | **中文**

# OPL 只读 Discovery Gateway

## 目的

这份文档冻结 `OPL Gateway` 的 `G2` 目标。

`G2` 是 `OPL` 第一次成为真实入口表面，但仅限于只读 discovery。

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
      "label": "Research Ops",
      "status": "active",
      "domain_id": "medautoscience"
    },
    {
      "workstream_id": "presentation_ops",
      "label": "Presentation Ops",
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
    "label": "Presentation Ops",
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
    "notes": "ppt_deck maps directly; xiaohongshu does not automatically equal Presentation Ops."
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
      "gateway_surface": "Research Ops Gateway",
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
    "harness_surface": "Visual Deliverable Harness OS",
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
    "confidence": "high",
    "reason": "The goal is a defense-oriented presentation deliverable."
  }
}
```

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

当前 `Phase 1` 的交付目标是一条本地 `TypeScript CLI`-first surface。
在这条基线里，discovery contract 通过下面这些命令暴露：

- `list-workstreams`
- `get-workstream`
- `list-domains`
- `get-domain`
- `list-surfaces`
- `get-surface`
- `resolve-request-surface`
- `explain-domain-boundary`

docs-site navigation 与未来的 MCP discovery tools 仍然可以作为兼容 transport，只要共享同一份 contract。

重要的是 contract，不是 transport；但当前实现目标是本地 CLI surface，而不是 web/server runtime。

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

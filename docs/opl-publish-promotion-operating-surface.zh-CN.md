[English](./opl-publish-promotion-operating-surface.md) | **中文**

# OPL Publish / Promotion Operating Surface

## 目的

这份文档冻结 `OPL` 顶层最小化的 publish / promotion operating surface。

它的目标是定义：在 domain-owned publish gate 与 domain-owned release / export / submission outcome 已经存在之后，`OPL` 在顶层还能合法索引哪些 publish / promotion record。

目标不是顶层 publish runtime。
目标是一个薄的顶层 operating layer：只索引 publish outcome、promotion candidate 与 public-surface reference，而 publish truth 仍然留在 domain system 内部。

## 与前置 Gateway 层的关系

这层 operating surface 建立在已冻结的几层之上：

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- 当前机器可读合同目录：[`../contracts/opl-gateway/README.zh-CN.md`](../contracts/opl-gateway/README.zh-CN.md)

如果这些层还不稳定，这层 operating surface 就不应被视作已冻结。

## 与 P5.M1 的边界

`P5.M1` 里的 `publish_readiness_signal` 截止在这个问题：

- 一个顶层请求是否看起来已经具备进入 domain-owned publish gate 的条件？

这份 `P5.M2` 文档只在 domain-owned publish / release / export / submission outcome 已经存在之后才开始生效。

一句话说：

- `P5.M1` = domain-owned publish truth 形成之前的 readiness
- `P5.M2` = domain-owned publish truth 形成之后的顶层索引与 promotion signal

## 核心承诺

在这一层，`OPL` 只允许拥有**顶层 publish-outcome index、promotion-candidate signal 与 promotion-surface index**。

它不允许：

- 成为 domain publish truth 的 owner
- 成为 domain release / export / submission truth 的 owner
- 成为 domain public-channel posting truth 的 owner
- 直接执行 publish、submit、export、release 或 promote
- 绕过 domain gateway 直接控制 harness execution

一句话说：

- `OPL` 只拥有**顶层 publish / promotion index 与 signal**
- 各 domain 继续拥有**publish truth、release truth、export truth、submission truth、artifact truth 与 public-channel posting truth**

## 非目标

这层 operating surface 不负责：

- 直接执行 domain publish 或 promotion 操作
- 存储某个 domain 的 canonical publish truth
- 用顶层副本替代 domain 的 release / export / submission record
- 变成所有 publish flow 的统一 public-runtime entry
- 把 domain gateway 降格成实现细节

## 允许的顶层 Record Kind

最小顶层 operating surface 只允许记录下面几类对象：

### 1. `publish_outcome_index`

目的：

- 为 domain-owned publish / release / export / submission outcome 记录一个顶层 index entry
- 暴露稳定引用或 public reference，但不宣称自己拥有 outcome truth

它只是对 domain-owned outcome 的索引。
它不是 canonical publish、release、export 或 submission record 本身。

### 2. `promotion_candidate_signal`

目的：

- 记录一个 domain-owned outcome 是否看起来已经具备进入 domain-owned 或 human-owned promotion gate 的条件
- 暴露的是顶层 promotion-readiness signal，而不是 promotion truth

它只是 readiness signal。
它不代表已经 promoted、announced、distributed，也不代表已经正式出现在 public surface 上。

### 3. `promotion_surface_index`

目的：

- 暴露一个顶层请求或一个 indexed outcome 关联哪些 public surface
- 说明 promotion 卡在哪个 surface，或者还缺哪个 human approval

它仍然只是 index / reference layer，而不是 public-channel posting truth 的复制。

## Source-Of-Truth 规则

### 这一层里 OPL 可以拥有的东西

`OPL` 可以拥有：

- 顶层 publish-outcome index
- 顶层 promotion-candidate signal
- 顶层 promotion-surface index

### 必须继续留在 Domain 里的东西

下面这些必须继续作为 domain-owned canonical truth：

- publish gate truth
- publish execution truth
- release result
- export result
- submission result
- artifact truth
- public-channel posting truth
- domain-private performance / metrics truth
- 已 publish / promoted artifact 的 revision history

`OPL` 可以通过稳定 pointer 引用这些 truth。
但不能悄悄把它们吸收到顶层真相里。

## 最小 Operating Record Shape

最小 machine-readable envelope 应包含：

- `version`
- `record_kind`
- `record_id`
- `request_id`
- `workstream_id`
- `domain_id`
- `summary`
- `status`
- `evidence_refs`
- `domain_truth_refs`
- `recorded_at`

不同 `record_kind` 可以再带各自的 kind-specific field，但整个 envelope 必须保持顶层、协调型，而不是 publish runtime state container。

## 必需边界语义

### `domain_truth_refs` 必须存在

每条顶层 publish / promotion record 都必须回指 domain-owned truth。

这样才能防止外界把 `OPL` 误读成 publish 或 promotion state 的 canonical owner。

### `publish_outcome_index` 不等于 publish truth

`publish_outcome_index` 只能索引 domain-owned `publish`、`release`、`export` 或 `submission` outcome。

它不能被当成：

- canonical publish record
- canonical release record
- canonical export record
- canonical submission record

### Promotion record 也必须建立在已索引的 domain-owned outcome 之上

`promotion_candidate_signal` 与 `promotion_surface_index` 只能建立在 domain-owned 的 publish / release / export / submission outcome 之上。

它们不能被用来描述 pre-publish intention。

### `promotion_candidate_signal` 不等于 promotion truth

`promotion_candidate_signal` 只能表达：某个 indexed outcome 是否看起来已经具备进入 promotion gate 的条件。

它不能被当成：

- public posting event
- announcement event
- distribution result
- 已经完成 promotion 的证明

### 后续动作仍然必须经过 `domain_gateway`

如果后续还需要执行 publish 或 promotion action，`OPL` 仍然必须 route 到 domain gateway。

这一层可以索引 outcome 或 target surface。
但不能直接 submit、export、release 或 post。

### `public_refs` 只是 reference，不等于顶层 ownership

顶层 record 可以携带 public reference，例如 URL 或稳定 surface ref。

这些 reference 仍然只是 index layer。
它们不把对应 publish / promotion truth 的 ownership 转移给 `OPL`。

## 示例 Record Shape

### 示例：`publish_outcome_index`

```json
{
  "version": "p5.m2",
  "record_kind": "publish_outcome_index",
  "record_id": "opl-publish-2026-04-05-001",
  "request_id": "opl-2026-04-05-020",
  "workstream_id": "research_ops",
  "domain_id": "medautoscience",
  "summary": "Indexed the domain-owned manuscript submission outcome at the top level.",
  "status": "recorded",
  "evidence_refs": [
    "publish_gate=complete",
    "submission_package=sealed"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "submission_record",
      "ref": "medautoscience://submissions/study-002"
    }
  ],
  "recorded_at": "2026-04-05T07:10:00Z",
  "publish_outcome_index": {
    "outcome_kind": "submitted",
    "public_refs": []
  }
}
```

### 示例：`promotion_candidate_signal`

```json
{
  "version": "p5.m2",
  "record_kind": "promotion_candidate_signal",
  "record_id": "opl-promo-2026-04-05-001",
  "request_id": "opl-2026-04-05-021",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "The released deck appears ready to enter the domain-owned promotion gate.",
  "status": "ready_for_next_gate",
  "evidence_refs": [
    "release_record=complete",
    "human_review=complete"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "release_record",
      "ref": "redcube://releases/deck-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "artifact_record",
      "ref": "redcube://artifacts/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T07:11:00Z",
  "promotion_candidate_signal": {
    "promotion_readiness": "ready_for_promotion_gate",
    "target_surfaces": [
      "project_landing",
      "announcement_post"
    ]
  }
}
```

### 示例：`promotion_surface_index`

```json
{
  "version": "p5.m2",
  "record_kind": "promotion_surface_index",
  "record_id": "opl-surface-2026-04-05-001",
  "request_id": "opl-2026-04-05-021",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "Indexed the public surfaces and blockers for promoting the released deck.",
  "status": "needs_human_review",
  "evidence_refs": [
    "landing_page=ready",
    "announcement_copy=pending"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "release_record",
      "ref": "redcube://releases/deck-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "public_channel_record",
      "ref": "redcube://channels/project-landing/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T07:12:00Z",
  "promotion_surface_index": {
    "target_surfaces": [
      "project_landing",
      "announcement_post"
    ],
    "required_human_approval": true,
    "blocking_surface": "announcement_post",
    "public_refs": [
      {
        "surface_id": "project_landing",
        "ref": "https://example.org/decks/deck-002"
      }
    ]
  }
}
```

## Surface 形态

第一版顶层 publish / promotion surface 可以体现为：

- docs-side operating reference
- CLI-side operating query
- MCP-side operating record

与前几层一样，真正重要的是 contract，而不是 transport。

## 硬性禁止项

不要把这一层写成或做成：

- `OPL owns publish truth`
- `OPL owns promotion truth`
- `OPL executes publish or promotion`
- `OPL is the unified publish runtime entry`
- `OPL manages all public posting directly`
- 把 domain gateway 降格成实现细节

也不要新增这些操作：

- 直接向外部 venue 提交
- 直接 export 或 release
- 直接向 public channel 发帖
- 直接修改 domain publish state
- 直接修改 domain artifact truth
- 直接调用 harness executor

## 完成定义

只有当下面这些条件都成立时，这层 operating surface 才算冻结完成：

- 允许的顶层 record kind 已显式定义
- domain-owned truth 边界已显式定义
- machine-readable schema 与公开 wording 保持一致
- 没有任何顶层字段会被误读成 canonical publish 或 promotion truth ownership
- no-bypass 语义仍然完整

# OPL Governance / Audit Operating Surface

Owner: `One Person Lab`
Purpose: `legacy_governance_audit_operating_surface_provenance`
State: `history_only`
Machine boundary: 本文只保存旧 gateway-derived governance / audit operating surface 的人读 provenance。当前机器真相继续归 active contracts、schemas、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts、生成产物或语义化 `human_doc:*` id；本文不得作为 active operating contract、runtime control plane、truth surface、test oracle 或 compatibility interface。

## 目的

这份文档历史上冻结 `OPL` 顶层最小化的 governance / audit operating surface。

它的目标是定义：在 routing、onboarding 与 acceptance evidence 已经存在之后，`OPL` 还能合法索引哪些 operating record。

目标不是单体 runtime。
目标是一个薄的顶层 operating layer：只记录 governance signal、routing audit trace 与 readiness index，而 runtime truth 仍然留在 domain system 内部。
本文中的 legacy `gateway` wording 只是来自已归档 surface id 与 example corpus 的 provenance vocabulary，不是 active compatibility interface。当前 topology 是 stage-led、以 Agent executor 为最小执行单位。

## 与前置 Gateway 层的关系

这层 operating surface 最初建立在以下已归档历史层之上：

- [OPL Federation Contract](../opl-federation-contract.md)
- [OPL Gateway 契约面](../opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../../../../specs/opl-domain-onboarding-contract.md)
- [OPL Gateway Acceptance Test Spec](../opl-gateway-acceptance-test-spec.md)
- 当前机器可读合同目录：[`../../contracts/opl-framework/README.md`](../../../../../contracts/opl-framework/README.md)

这些层只作为 provenance input。当前 topology 与 owner boundary 仍以核心五件套、当前 contracts、source、CLI/API 行为、runtime ledger、domain-owned manifest 和 stage-led framework roadmap 为准。

## 核心承诺

在这一层，`OPL` 只允许拥有**顶层治理记录、routing audit trace 与 readiness index**。

它不允许：

- 成为 domain runtime audit truth 的 owner
- 成为 domain review truth 的 owner
- 成为 artifact truth 或 publish truth 的 owner
- 绕过 domain-owned capability entry 直接控制 harness execution

一句话说：

- `OPL` 只拥有**顶层治理信号、路由审计、readiness 索引**
- 各 domain 继续拥有**runtime audit truth、review truth、publish truth 与 artifact truth**

## 非目标

这层 operating surface 不负责：

- 直接执行 domain review 或 publish
- 存储某个 domain 的 canonical audit truth
- 用顶层副本替代 domain review state
- 变成所有执行的统一 runtime entry
- 把 domain-owned capability entry 降格成实现细节

## 允许的顶层 Record Kind

最小顶层 operating surface 只允许记录下面几类对象：

### 1. `routing_audit`

目的：

- 记录 `OPL` 如何把一个请求路由到某个 domain-owned capability entry
- 在顶层保留 routing evidence 与 routing outcome

它是顶层对 routing step 的审计痕迹，不是 domain runtime audit record。

### 2. `governance_decision`

目的：

- 记录顶层治理决策，例如：
  - `continue`
  - `stop`
  - `reframe`
  - `gate`

这是 shared foundation 中已经合法存在的顶层治理语言。
它记录的是顶层治理结果，并不把 continue/stop/reframe 的决定权从 human 或 domain-owned review signal 上收给 `OPL` 自身。

### 3. `publish_readiness_signal`

目的：

- 记录一个请求是否**看起来已经具备进入 domain-owned publish gate 的条件**
- 暴露的是顶层 readiness signal，而不是 domain publish truth

它只是 readiness index。
它不代表已经正式 published、exported、submitted，也不代表 domain 内部已经形成 canonical approval truth。

### 4. `cross_domain_review_index`

目的：

- 暴露一个顶层请求跨 domain 需要依赖哪些 review surface 和 gate
- 说明当前卡在哪个 gate，或者还缺哪个 human review

它仍然只是 index / reference layer，而不是 domain review truth 的复制。

## Source-Of-Truth 规则

### 这一层里 OPL 可以拥有的东西

`OPL` 可以拥有：

- 顶层 routing audit trace
- 顶层 governance decision record
- 顶层 publish-readiness signal
- 跨 domain review / gate index

### 必须继续留在 Domain 里的东西

下面这些必须继续作为 domain-owned canonical truth：

- runtime audit truth
- run logs
- event logs
- rerun history
- domain review state
- artifact truth
- publish execution truth
- release / export / submission result
- domain-private quality-regression truth

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

不同 `record_kind` 可以再带各自的 kind-specific field，但整个 envelope 必须保持顶层、协调型，而不是 runtime state container。

## 必需边界语义

### `domain_truth_refs` 必须存在

只要相关 domain truth 已存在，每条顶层 governance / audit record 都必须回指这些 domain-owned truth。

这样才能防止外界把 `OPL` 误读成 runtime 或 publish state 的 canonical owner。

### Legacy `domain_gateway` 只保留 provenance 语义

已归档示例中可以为了 reviewability 保留 legacy literal `domain_gateway`。当前 prose 与新增机器可读 surface 必须使用当前 domain-owned capability entry 语义，不能把这个 literal 继续保留成 compatibility interface。

### Publish readiness 不等于 publish truth

`publish_readiness_signal` 只能表达：这个顶层请求是否已经具备进入 domain-owned publish gate 的条件。

它不能被当成：

- publication event
- submission result
- release result
- export result
- domain approval truth

## 示例 Record Shape

已冻结 governance / audit record 的 canonical machine-readable example 也同步落在 [OPL Operating Example Corpus](../examples-corpora/opl-operating-example-corpus.md) 与其链接的 JSON 文件中。
全部已冻结 operating record kind 的跨层 reference map 也同步落在 [OPL Operating Record Catalog](../examples-corpora/opl-operating-record-catalog.md)。
下面这些 inline shape 仍然是本 governing surface 的 prose-side illustration。

### 示例：`routing_audit`

```json
{
  "version": "p5.m1",
  "record_kind": "routing_audit",
  "record_id": "opl-audit-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "Routed a defense-deck request into the RedCube domain-owned capability entry.",
  "status": "recorded",
  "evidence_refs": [
    "intent=presentation_delivery",
    "family=ppt_deck"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "routing_handoff",
      "ref": "redcube://handoffs/opl-2026-04-05-010"
    }
  ],
  "recorded_at": "2026-04-05T06:20:00Z",
  "routing_audit": {
    "routing_status": "routed",
    "entry_surface": "legacy_domain_gateway_identifier",
    "routing_decision_ref": "opl://routed-actions/opl-2026-04-05-010",
    "handoff_ref": "opl://handoffs/opl-2026-04-05-010"
  }
}
```

### 示例：`governance_decision`

```json
{
  "version": "p5.m1",
  "record_kind": "governance_decision",
  "record_id": "opl-gov-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "research_ops",
  "domain_id": "medautoscience",
  "summary": "Top-level decision is to reframe before further domain execution.",
  "status": "needs_human_review",
  "evidence_refs": [
    "human_review=pending",
    "governance_signal=reframe"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "review_record",
      "ref": "medautoscience://reviews/study-001"
    }
  ],
  "recorded_at": "2026-04-05T06:21:00Z",
  "governance_decision": {
    "decision": "reframe",
    "decision_source": "human"
  }
}
```

### 示例：`publish_readiness_signal`

```json
{
  "version": "p5.m1",
  "record_kind": "publish_readiness_signal",
  "record_id": "opl-publish-2026-04-05-001",
  "request_id": "opl-2026-04-05-010",
  "workstream_id": "presentation_ops",
  "domain_id": "redcube",
  "summary": "The request appears ready to enter the domain-owned publish gate.",
  "status": "ready_for_next_gate",
  "evidence_refs": [
    "human_review=complete",
    "baseline_review=complete"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "redcube",
      "ref_kind": "publish_gate_record",
      "ref": "redcube://publish-gates/deck-001"
    }
  ],
  "recorded_at": "2026-04-05T06:22:00Z",
  "publish_readiness_signal": {
    "readiness": "ready_for_domain_publish_gate"
  }
}
```

### 示例：`cross_domain_review_index`

```json
{
  "version": "p5.m1",
  "record_kind": "cross_domain_review_index",
  "record_id": "opl-review-2026-04-05-001",
  "request_id": "opl-2026-04-05-011",
  "workstream_id": null,
  "domain_id": null,
  "summary": "The request spans research and presentation gates and still requires final human review.",
  "status": "needs_human_review",
  "evidence_refs": [
    "research_review=complete",
    "presentation_baseline=complete",
    "final_human_review=pending"
  ],
  "domain_truth_refs": [
    {
      "domain_id": "medautoscience",
      "ref_kind": "review_record",
      "ref": "medautoscience://reviews/study-002"
    },
    {
      "domain_id": "redcube",
      "ref_kind": "publish_gate_record",
      "ref": "redcube://publish-gates/deck-002"
    }
  ],
  "recorded_at": "2026-04-05T06:23:00Z",
  "cross_domain_review_index": {
    "required_human_review": true,
    "blocking_gate": "final_human_review",
    "review_surface_refs": [
      "medautoscience://reviews/study-002",
      "redcube://publish-gates/deck-002"
    ]
  }
}
```

## Surface 形态

第一版顶层 governance / audit surface 可以体现为：

- docs-side operating reference
- CLI-side operating query
- MCP-side operating record

与前几层一样，真正重要的是 contract，而不是 transport。

## 硬性禁止项

不要把这一层写成或做成：

- `OPL stores canonical audit truth`
- `OPL owns publish state`
- `OPL executes domain review or publish`
- `OPL is the unified runtime entry`
- `OPL manages all runs directly`
- 把 domain-owned capability entry 降格成实现细节

也不要新增这些操作：

- 直接启动/停止 domain run
- 直接写 domain review state
- 直接批准 publish / export / submission
- 直接调用 harness executor
- 直接修改 domain artifact truth

## 完成定义

只有当下面这些条件都成立时，这层 operating surface 才算冻结完成：

- 允许的顶层 record kind 已显式定义
- domain-owned truth 边界已显式定义
- machine-readable schema 与公开 wording 保持一致
- 没有任何顶层字段会被误读成 domain runtime truth ownership
- no-bypass 语义仍然完整

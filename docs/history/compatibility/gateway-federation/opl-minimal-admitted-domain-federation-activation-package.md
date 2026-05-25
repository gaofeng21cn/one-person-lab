# OPL Minimal admitted-domain federation activation package

Owner: `One Person Lab`
Purpose: `legacy_minimal_admitted_domain_activation_package_provenance`
State: `history_only`
Machine boundary: 本文只保存旧 admitted-domain federation activation package 的历史记录。当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection；本文不得作为 active activation package、domain admission authority、runtime owner、compatibility interface 或 readiness gate。

## 目的

这份 reference-grade package 历史上用来冻结在先前 `Phase 1 exit activation package` 之后、当时最小且诚实的 follow-on。

它现在可以被激活，是因为 `2026-04-08` 的 repo-tracked 四仓同步面已经显示：至少两个 admitted domain surface 终于稳定到足以支撑更强的顶层 federation 表达：

- `research_ops` -> `MedAutoScience`
- `presentation_ops` -> `RedCube AI`

这份 package **不会**激活 runtime。
它**不会**把 `OPL` 提升成 runtime owner。
它也**只**适用于已 admitted domain。

曾经规划过的 machine-readable 工件 `contracts/opl-framework/minimal-admitted-domain-federation-activation-package.json` 未保留为当前 active contract；本文只作为历史 activation package 记录。

## 为什么门槛现在满足

前序的 `Phase 1 exit activation package` 当时仍 blocked 在 external readiness。
这份历史 freeze 继续保留为 repo-tracked truth。

当前重评估只改变了一件事：

- `MedAutoScience` 已把 repo-side `integration harness activation baseline` absorb 到 `main`
- `RedCube AI` 已把 repo-side `source intake + shared source truth baseline` absorb 到 `main`

因此，这两条 admitted domain surface 现在已经稳定到足以支撑此前已预冻结的最小 stronger federation wording。

## 这份 Package 实际激活了什么

它只激活最小的 contract-first federation follow-on：

- 只针对已 admitted domain 收紧顶层 federation wording
- 把当前两条已 admitted domain surface 显式写成更强 federation 表达的依据
- 保持 `OPL` 的 formal entry 仍然是当前本地 `TypeScript CLI`-first / framework contract surface

换句话说，这是一份 docs+contracts+tests activation package，不是 runtime package。

## 当前已激活的 Admitted Domain Surface

当前被激活进这份 package 的 admitted domain surface 只有两条：

1. `research_ops` -> `MedAutoScience`
2. `presentation_ops` -> `RedCube AI`

这**不**代表每个 family、每个下游 deliverable 都已经完全成熟。
它只表示：顶层 admitted domain surface 已经稳定到足以支撑更强的 federation 表达。

## 明确不被纳入的对象

这份 package **不会**改变 candidate domain 的 blocked truth：

- `Grant Foundry -> Med Auto Grant` 仍然只是 signal-only / domain-direction evidence
- `Review Ops` 仍是 blocked 于 onboarding 之下的 under-definition bundle
- `Thesis Ops` 仍是 blocked 于 onboarding 之下的 under-definition bundle

因此，这份 package **不会** admission `Grant Ops`、`Review Ops` 或 `Thesis Ops`。

## 继续保持的硬边界

当前 activation 继续显式保持这些硬边界：

- 不实现 routed-action runtime
- 不新增 mutation entry
- 不新增 run launch
- 不新增 workspace write
- 不实现 shared execution core
- 不实现 managed web runtime
- 不把 `OPL` 提升成 runtime owner

任何未来 successful handoff 仍然只能 targeting `domain_gateway`，并继续遵守不得直达 harness 的 no-bypass 规则。

## 当前最诚实的状态

在当前 repo-tracked freeze 下，最小的 stronger-federation follow-on **当前已激活**。

但它**不会**制造一个更大的 runtime phase。
它只记录：此前的 `Phase 1 exit activation package`，现在已经被当前 `Minimal admitted-domain federation activation package` 这份仅面向已 admitted domain 的最小激活包诚实接续。

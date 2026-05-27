# OPL Family Directory Governance

Owner: `One Person Lab`
Purpose: `references_operating_governance_opl_family_directory_governance`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

owner: `OPL maintainers`
purpose: 冻结 OPL family 仓库目录归属和 hygiene baseline，避免把源码、合同、叙述文档与运行态输出混放。
state: active reference
machine boundary: 叙述性治理参考；机读约束由 repo hygiene 测试和 `.gitignore` 承担。

## 范围

这份规则适用于 OPL family 的 shared workbench 仓和 domain agent 仓。它描述目录归属，不改变 domain repo 当前 source tree，也不把 domain runtime truth 搬到 OPL。

## 共享目录规则

- 源码、产品实现、脚本和测试留在对应仓库的 source tree 中，由该仓维护。
- 机读合同、schema、registry、manifest 和 stable machine surface 留在 `contracts/` 或已声明的机读 source surface 中。
- 叙述性项目文档、治理材料、参考材料和历史说明留在 `docs/`，并按 lifecycle index 归入 active、public、references 或 history。
- 运行态状态、build output、package output、cache、临时执行痕迹和本地 agent 状态只允许作为 ignored transient 存在，不进入 tracked tree。
- Domain repo 保持自己的 current source tree、runtime truth、quality authority 和 deliverable ownership。OPL 可以消费 shared contracts 和 projections，但不搬迁 domain repo 的当前实现树。

## 禁止 tracked 的目录和文件

OPL family 仓库不应 track 下列本地或生成态路径：

- `dist/`
- `build/`
- `out/`
- `__pycache__/`
- `*.egg-info/`
- `.DS_Store`
- `.codex/`
- `.omx/`
- `.runtime-program/`
- `runtime-state/`
- `.agent-contract-baseline.json`

如果某个仓库确实需要发布构建产物，应通过 release artifact、package manifest、archive 或可再生成的 contract 描述，而不是把 build output 放进 tracked source tree。

## Repo-specific allowlist

Hygiene audit 只检查明确的路径段和 root 文件，不做字符串子串匹配。`src/cli/modules/*` 这类源码模块目录属于正常 source tree，不应被 `modules` 字样或 package/module 语义误拦。

如果未来出现 repo-specific 例外，例外必须在对应仓库的 hygiene 测试中显式列出，并写明 owner、purpose、state 和退役条件。

## 2026-05-28 目录标准化状态

当前 OPL 读模型证明的是 standard domain-agent conformance、descriptor / memory discovery 和 App/operator refs-only projection 可读：`opl agents conformance --family-defaults --json` 读为 4 个 repo structural conformance passed、blocked_count=0；`opl domain-memory list --json` 读为 `resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`；`opl runtime app-operator-drilldown --json` 能看到 lifecycle refs、memory writeback refs 和 App release/user-path evidence refs；functional privatization active residue 仍为 0。但 `framework readiness` 仍有 open production tail，`family-runtime evidence-worklist` 仍有 12 条 payload-required stage-evidence workorder。这表示 OPL 能读取 standard pack / descriptor / authority boundary 和 MAS/MAG/RCA memory descriptor；它不表示物理目录已经全部重组、domain ready、production ready、App release ready、artifact authority 或 memory body/writeback apply 已完成。

目录治理的当前目标仍是降低多重语义污染：repo-source 只保存 source、contracts、builder、policy 与 docs；真实 workspace/runtime artifact、receipt instance、memory body、中间产物和最终交付物继续留在 workspace / runtime artifact root，并通过 locator、receipt ref、restore proof 或 provenance proof 被 OPL 读取。

标准 domain repo 的目标 repo-source 边界保持为：

- `agent/`：stage 定义、prompt、skill、knowledge refs 与 quality gate refs。
- `contracts/`：domain descriptor、stage/action/sidecar/receipt schema 与 artifact locator contract。
- `runtime/`：sidecar、projection builder、lifecycle adapter；只放源码和 builder，不放运行态 receipt 实例。
- `docs/`：项目、状态、架构、不变量、决策、policy 与 reference。

真实论文、基金、PPT/PDF/PNG、运行日志、memory body、proposal instance、receipt instance、中间产物和最终交付物继续只属于 workspace / runtime artifact root，并通过 locator、receipt ref、restore proof 或 provenance proof 被 OPL 读取。

物理目录移动前必须逐仓满足五个门槛：direct skill path 可用、OPL-hosted path 可用、restore/provenance proof 可回放、no-forbidden-write proof 明确、focused repo-native tests 通过。未满足这些门槛时，只允许维护 descriptor / manifest / adapter 层对齐，不做大规模搬目录。

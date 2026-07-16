# OPL Family Directory Governance

Owner: `One Person Lab`
Purpose: `references_operating_governance_opl_family_directory_governance`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。
Currentness policy: 本文冻结 OPL family 仓库目录归属和 hygiene baseline，不冻结日期、conformance count、memory descriptor count、worklist counter、App/operator route count、functional privatization residue count、branch/SHA 或本机 proof snapshot。当前目录标准化状态必须从 fresh `opl agents conformance --family-defaults --json`、`opl agents default-callers --family-defaults --json`、`opl domain-memory list --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`、repo hygiene tests 和 domain-owned manifests 读取。

## 范围

这份规则适用于 OPL family 的 shared workbench 仓和 domain agent 仓。它描述目录归属，不改变 domain repo 当前 source tree，也不把 domain runtime truth 搬到 OPL。

## Family Morphology

OPL family 代码组织的目标不是把所有仓库硬套成同一个目录模板，而是让同类职责使用同一种可识别形态：

- `one-person-lab` 是 framework / shared governance owner。它可以持有 `src/`、`contracts/`、`docs/`、`scripts/`、`tests/`、`python/`、`native/` 等 shared runtime / installer / CLI / governance surface，但入口应保持薄，复杂逻辑按 framework runtime、provider、App read-model、Foundry Kernel、install 或 generated/source boundary 拆分。
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent` 是标准 / Foundry Agent 形态。它们应一眼能看出 `agent/`、`contracts/`、`runtime/`、`src` 或 `packages`、`docs/`、`scripts/verify.sh` 的职责分工；domain truth、quality/export verdict、artifact authority 和 owner receipt 留在 domain owner，通用 stage attempt、queue、projection、index 和 App/operator shell 上收给 OPL。
- `one-person-lab-app` 是 App product / release / shell-candidate owner。它不需要伪装成 domain agent，但应把 product contracts、release scripts、active-shell validator、package builder、tests 和 user-path evidence 分开；外部 shell carrier 不反向定义 App product truth。
- `opl-doc` 与 `opl-flow` 是 plugin / workflow support repos。它们可以比标准 agent repo 更轻，但应通过 `.codex-plugin`、`skills/`、`scripts/`、`tests/`、`docs/` 或 repo-native profile 指针表达 source truth；当它们承担 active maintenance 或 validator 职责时，应提供薄 `scripts/verify.sh`。

Family morphology 审计时先判断 repo 类型，再判断是否自然。`parts/`、`*_parts`、`cases/`、`modules/` 这些目录名本身不违规；只要它们命名真实 owner 子域、调用方不需要按编号或文件顺序重新拼回单个巨型文件，就可视为语义拆分。`chunk_*`、`part_001`、`split_002`、嵌套 `*_parts/*_parts`、巨型 `shared.*` 或单个 script/test 同时承担多个 owner boundary 时，才进入不自然拆分或结构 design-pass。

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

## 目录标准化状态读法

当前 OPL 读模型能证明的是 standard pack、descriptor、authority boundary、memory descriptor 和 App/operator refs-only projection 是否可读。即使 fresh output 显示 conformance passed、default caller readiness clean、memory descriptors resolved、worklist open count 为零或 functional privatization residue 清零，也只表示对应 read-model / evidence transport 当前可读；它不表示物理目录已经全部重组、domain ready、production ready、App release ready、artifact authority、memory body migration 或 writeback apply 已完成。

目录治理判断应按以下 live surface 分层读取：

- `opl agents conformance --family-defaults --json` / `opl agents default-callers --family-defaults --json`：只证明 standard descriptor、generated/default caller replacement evidence 和 deletion-evidence gate 可读；不授权 domain repo 物理删除。
- `opl domain-memory list --json`：只证明 domain-owned memory descriptor、locator、receipt projection 和 runtime memory refs 可读；不读取 memory body，不执行 retrieval/apply。
- `opl runtime app-operator-drilldown --json` 与 `opl family-runtime evidence-worklist ... --detail summary --json`：只证明 refs-only operator projection、worklist accounting、blocked envelope 和 safe-action route 可读；不能把 closed counter 或 zero-open worklist 写成 production closure。
- `.gitignore`、`scripts/repo-hygiene.sh`、`scripts/verify.sh` 和 repo-native focused tests：只约束 tracked source hygiene 和 generated/local state 边界；它们不替代 domain owner receipt、quality verdict 或 release evidence。

目录治理的当前目标仍是降低多重语义污染：repo-source 只保存 source、contracts、builder、policy 与 docs；真实 workspace/runtime artifact、receipt instance、memory body、中间产物和最终交付物继续留在 workspace / runtime artifact root，并通过 locator、receipt ref、restore proof 或 provenance proof 被 OPL 读取。

标准 domain repo 的目标 repo-source 边界保持为：

- `agent/`：stage 定义、prompt、skill、knowledge refs 与 quality gate refs。
- `contracts/`：domain descriptor、stage/action/sidecar/receipt schema 与 artifact locator contract。
- `runtime/`：sidecar、projection builder、lifecycle adapter；只放源码和 builder，不放运行态 receipt 实例。
- `docs/`：项目、状态、架构、不变量、决策、policy 与 reference。

真实论文、基金、PPT/PDF/PNG、运行日志、memory body、proposal instance、receipt instance、中间产物和最终交付物继续只属于 workspace / runtime artifact root，并通过 locator、receipt ref、restore proof 或 provenance proof 被 OPL 读取。

物理目录移动前必须逐仓满足五个门槛：direct skill path 可用、OPL-hosted path 可用、restore/provenance proof 可回放、no-forbidden-write proof 明确、focused repo-native tests 通过。未满足这些门槛时，只允许维护 descriptor / manifest / adapter 层对齐，不做大规模搬目录。

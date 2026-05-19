# 文档分层与生命周期管理 Playbook

Purpose: `references_convergence_governance_docs_lifecycle_management_playbook`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

Status: `active reference`
Date: `2026-05-07`
Owner: `One Person Lab`

## 用途

这份 playbook 是后续开发新增、更新、归档文档时的判断清单。它服务整个 OPL family，但不接管各 domain 仓自己的 truth。OPL 只提供文档治理经验、生命周期语言和反历史污染规则。

## 四个准入问题

新增或继续扩写一份文档前，先回答四个问题：

1. `owner`：这份文档当前由谁负责维护真相？
2. `purpose`：它是入口、当前真相、合同支撑、参考、执行计划、历史记录，还是 tombstone？
3. `state`：它处在 active、support、snapshot、superseded、retired，还是 provenance-only？
4. `machine boundary`：它能不能被代码、测试、合同或 runtime 直接读取？

只要有一个问题答不清，先不要扩写正文。先补入口、归类或归档。

## 新增文档

- 面向用户安装、启动、产品叙事：进入仓库 `README*` 或 `docs/public/`。
- 当前项目角色、状态、架构、约束、决策：更新 core five，不新增平行文档。
- 当前 runtime / activation / shared-boundary 支撑：进入 `docs/active/`。
- 当前可执行规格：进入 `docs/specs/`，并在完成或被取代后移入 history。
- 背景、审计、样例、迁移材料：进入 `docs/references/<purpose>/`。
- 完成计划、旧设计、过期 activation package、过程稿：进入 `docs/history/`。

## 更新文档

- 先从当前 truth surface 开始更新：core five、active specs、contracts、domain-owned docs。
- 如果只是补来源、解释或审计材料，更新 reference，不改 active truth。
- 如果 reference 开始承担执行队列或决策权，把真正约束上升到 active doc、contract、schema 或 code surface。
- 如果文档超过约 500 行且仍在扩写，先拆成 index + modules，或把历史轮次移入 archive。

## 归档文档

归档不是删除信息，而是移除默认阅读路径中的历史定位污染。

归档步骤：

1. 判断它是 `dated_snapshot`、`superseded`、`retired` 还是 `tombstone`。
2. 用 `rg` 查 inbound links。
3. active docs 改成指向当前 truth；reference docs 改成指向新归档位置或语义 id。
4. 目标历史目录补 README，说明 retired reason、current truth、禁止复活条件。
5. 如果机器面引用了 prose path，先迁移机器引用到 contract/schema/source 或 `human_doc:*`。

## Tombstone 写法

tombstone 必须短，不能写成新的执行手册。它只回答：

- 这条路线叫什么？
- 为什么退役？
- 当前真相在哪里？
- 哪些文件只作历史审计？
- 什么情况下不能继续引用它作为当前依据？

## 防止历史定位污染

- 物理隔离：退役材料进入 `history/`，不留在 root 或 active support。
- 入口收口：root 只保留 allowlist，references root 只保留 README。
- 命名诚实：active docs 只使用当前主语；旧词只写成历史词。
- 机器解耦：测试、脚本、runtime dashboard 不钉 Markdown path。
- 指向当前 owner：历史文档可以解释来源，但 active docs 必须指向当前 owner surface。
- 归档有 tombstone：读者知道这份材料为什么还在、为什么不能照做。

## 示例

### Gateway / federation

旧 `gateway / federation / routed-action` 文档曾经是 OPL 的顶层公开集成语言。当前主线已经是 `Codex-default session/runtime + explicit activation + domain agent skill entry`，所以旧语料进入 `docs/history/compatibility/gateway-federation/`。active 文档只把它称为历史来源材料或负向 guard，并指向当前 core truth；不得恢复 machine-readable compatibility surface。

### Frontdoor

旧 `frontdoor` 和本地 Product API / UI-adapter 时代材料容易误导读者以为 OPL 仍维护前台服务主线。它们进入 `docs/history/frontdoor-legacy/`，由 tombstone 说明当前 GUI/WebUI 真相回到 OPL-branded AionUI shell 和 Codex-default runtime。

### MAS 经验

MAS 的 `docs/docs_portfolio_consolidation.md` 值得复用：它把 `owner / purpose / state / machine boundary` 写成准入信号，并把 `runtime / policies / program / capabilities / references / history` 分成不同职责。OPL family 借鉴这套治理语言，但不把 MAS 的目录结构强套给 MAG、RCA、MDS。

## 验收清单

- `docs/` root 是否只保留 allowlist？
- 新文件是否有明确目录角色？
- references root 是否只保留 README 和少量治理例外？
- retired 定位是否离开 active 层？
- active docs 是否只指向当前 truth？
- 机器面是否不再依赖 prose path？
- 目标历史目录是否有 tombstone？
- `git diff --check` 是否通过？

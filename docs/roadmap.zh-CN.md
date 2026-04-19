[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前阶段

当前阶段的重点，不是同时启动所有工作流。
而是先冻结 `OPL Gateway` 语言，并把已经真实存在的 domain federation 站稳。

截至 `2026-04-10`，`OPL` 公开主线仍停留在已 absorbed 的 `Phase 2 / Minimal admitted-domain federation activation package`。
这条表述保留的是 formal-entry / activation-package 层最近一次完成的顶层 freeze。
截至 `2026-04-10`，已 absorbed 的 `Phase 2 / Minimal admitted-domain federation activation package` 继续作为 `OPL` 下方最近一次完成的顶层 activation package 保留。
在这层之上，`OPL` 公开主线已经进入 `family-level front desk / hosted runtime hardening / domain lightweight direct-entry alignment`。

当前已明确的状态：

- `OPL` 是一人课题组的顶层 Gateway 与 federation model
- `OPL` 之下共享的 Harness Engineering 上位语言，当前统一命名为 `Unified Harness Engineering Substrate`
- `UHS` 之下最重要的共享部分，当前正收敛为 `Shared Runtime Contract` 与 `Shared Domain Contract`
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) 是当前 active 的 `Research Ops` domain gateway 与 harness
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) 是当前已 admitted 的视觉交付 domain gateway 与 harness
- `ppt_deck` 是当前最直接映射到 `Presentation Ops` 的 family
- `Thesis Ops`、`Review Ops` 仍处于定义阶段
- [`MedAutoGrant`](https://github.com/gaofeng21cn/med-autogrant) 已经是当前活跃且已收录的 `Grant Ops` domain gateway 与 harness
- `OPL` 顶层的统一目标执行范式是 `Agent-first`：当前 domain 仓统一按 `Auto-only` 主线理解，而未来 `Human-in-the-loop` 产品应作为兼容 sibling 或 upper-layer product 复用同一 substrate，而不是把当前仓强行改成同仓双模
- 当前活跃开发宿主是 Codex-only 本地会话，而优选的未来产品 runtime substrate 方向，仍然是先在某个 domain 仓里诚实证明真实的上游 `Hermes-Agent` 集成
- `OPL` 现在已经有了以 `opl` 为默认前台的本地 direct product-entry shell；`opl <request...>` 可直接作为 quick ask，而已落地的 grouped CLI matrix 已统一整理为 `opl start|doctor|ask|chat|web`、`opl contract ...`、`opl domain ...`、`opl status ...`、`opl workspace ...`、`opl frontdesk ...`、`opl session ...` 与 `opl runtime repair-gateway`
- `OPL` 现在也已经落下本地 web front desk pilot，以及可写 workspace registry、managed session ledger 和 machine-readable family handoff bundle
- hosted / web 前台的选型现已冻结：短期最快路线是 `LibreChat-first` pilot，而且真实的 hosted shell pilot package 已落地；长期仍回到 `OPL` 自有 web front desk
- 当前已经冻结的顶层 integration choice 是 `external kernel, managed by OPL product packaging`：不 fork `Hermes-Agent`，也不把用户自管 Hermes 安装变成产品前置条件
- 生态当前已经不再是一刀切阶段：`Med Auto Grant` 已有真实上游 substrate，并已经承接已收录的 `Grant Ops` domain entry，`Med Auto Science` 已进入 real adapter cutover 前态，`RedCube AI` 已把 route / managed execution 收口到本地 `Codex CLI` host-agent runtime，同时保留 repo-verified product-entry federation，而 `OPL` 现在已经拥有本地 product-entry shell
- 当前 repo 已有可运行的本地 `TypeScript CLI`-first / gateway contract baseline
- 这条 repo-tracked 的 CLI-first / gateway contract baseline 也仍然是 `OPL` 在 `Phase 1` 的 formal entry contract 与 public system surface
- 当前 OPL 层的 top-level formal entry 仍然就是这条本地 `TypeScript CLI`-first / gateway contract surface，而不是 launcher 或 runtime-owner 入口
- 这条 formal entry 之上的当前用户前台，已经是本地 `opl` shell、`opl web` pilot 以及围绕它们的 machine-readable discovery / handoff surface
- 已吸收的 `Phase 1 exit + next-stage activation package freeze` 现在已经转化成当前 `Minimal admitted-domain federation activation package` 的前序门槛
- `MedAutoScience` 与 `RedCube AI` 现在已经构成支撑这次最小 stronger federation activation 的两条 admitted domain surface；但这次 activation 仍然只作用于已 admitted domain
- 当前 repo 在顶层并行持有两层：稳定的 `Phase 1` gateway contract surface，以及其上的本地 direct product-entry shell
- 在 gateway-contract 这一层当前没有新的 active follow-on tranche 打开；最诚实的顶层状态仍是中央同步停车，只有 admitted-domain 仓出现新的 absorbed delta，或中央 reference surfaces 发生真实漂移时，才重开下一棒

当前阶段的工作边界：

- 保持每条 workstream 对应清楚的 domain boundary
- 保持 `OPL` 位于 gateway / federation 层
- 让 planned workstream 继续沿定义与 onboarding 路径推进，直到对应 domain evidence 齐备
- 让共享执行内核的抽取继续服从 domain maturity 与 contract convergence 的节奏

## 下一阶段

下一阶段应优先做这些事：

- 把已完成的 `Phase 1 / G2 release-closeout` 继续固定为 `G2 stable public baseline`，同时把已完成的 repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` 保持在 planning-contract closeout 边界
- 冻结 `OPL Gateway -> domain gateway -> domain harness` 这条控制语言
- 只把 `route_request`、`build_handoff_payload`、`audit_routing_decision` 冻结为 planning-level contract 操作
- 把唯一允许的成功 handoff 目标固定为 `domain_gateway`，并把禁止直达 domain harness 的 no-bypass 规则写成硬边界
- 在当前 domain 仓库之上冻结 `UHS` 这套共享语言，并把共享代码回抽决策继续放在 domain maturity 之后
- 把 `Shared Runtime Contract` v1 需要统一的对象先冻结清楚，至少包括 `runtime profile`、`session substrate`、`gateway runtime status`、`memory hook`、`delivery / cron`、`approval / interrupt`
- 把 `Shared Domain Contract` v1 需要统一的对象先冻结清楚，至少包括 formal-entry matrix、`per-run handle`、durable report、audit trail、gate semantics 与 no-bypass 规则
- 保持 `MedAutoScience` 明确为 `Research Ops` 的 domain surface
- 保持 `RedCube AI` 明确为视觉交付的 domain surface
- 把 `Hermes-native` 备选执行器继续锁在显式的 full-agent-loop proof lane 里，不把 generic `chat_completions`、单步 relay 或 repo-local chat 包装层误写成真实等价路线
- 把 `Agent-first` 加“当前 `Auto-only` 主线 + 未来 `HITL` 分层”这套原则带入后续候选 domain 的定义
- 把已 absorb 的 `Phase 1 exit + next-stage activation package freeze` 继续显式保留为当前 `Minimal admitted-domain federation activation package` 的前序门槛，并让所有 candidate path 持续处在 admission、discovery、routing 与 handoff 的显式审查轨道中
- 用清楚的任务边界与交付对象定义下一个候选 domain，并优先沿用当前 `task-topology + candidate-domain-backlog + domain-onboarding` 这条路径
- 继续把已经落地的本地 product-entry shell 硬化为 service-safe、并与 gateway contract 清楚分层、同时对 external-kernel ownership 保持诚实的真实入口层
- 继续冻结 `OPL bootstrap / launcher` 的职责边界，确保未来即使 kernel 继续外置，产品入口仍由 `OPL` 自己持有
- 把 hosted / web 前台路线固定为 `LibreChat-first pilot -> OPL 自有 web front desk`，不把任何通用聊天壳误写成最终产品身份

`Phase 1` candidate-domain closeout 的顺序已冻结为：

- `Review Ops`
- `Thesis Ops`

这个顺序本来就只表示边界定义的先后，现在已经被吸收到当前 `Phase 1 exit + next-stage activation package freeze` 中。`Grant Ops` 已经进入已收录的 `MedAutoGrant` domain gateway，不再停留在 candidate-definition 路径上。
`Review Ops` 继续作为 under-definition semantic bundle 推进，review truth 保持 domain-owned，并沿 `execution_model`、`discovery_readiness`、`routing_readiness` 与 `cross_domain_wording` 四类 package 收口。
`Thesis Ops` 也沿同一组 package 推进，同时保持自身的 dissertation / defense 角色，与 `Research Ops` 的 manuscript flow 以及 `Presentation Ops` / `RedCube AI` 的 deck production 清楚分层。
当前已 absorb 的前序 follow-on 是 `Phase 1 exit + next-stage activation package freeze`；也正是这个前序门槛在“两条 admitted domain surface 已稳定”之后允许当前 `Minimal admitted-domain federation activation package` 被激活。
任何未来的 successful handoff 也仍然只能 targeting `domain_gateway`，并继续受不得直达 harness 的 no-bypass 规则约束。

在当前 `2026-04-10` 的重评估下，这个前序 freeze 已经完成它的使命，而 `Minimal admitted-domain federation activation package` 也已经被吸收到当前顶层真相里。
当前最诚实的顶层状态是中央同步停车：除非 admitted-domain 仓再次落下新的 absorbed delta，或中央 reference surfaces 被证实发生真实漂移，否则当前没有新的 active follow-on tranche 打开。
这份已 absorbed 的 federation package 继续针对当前 admitted domain set 收紧顶层 federation wording，同时保持 formal entry 不变，仍然是本地 `TypeScript CLI`-first / gateway contract surface；`Review Ops` 与 `Thesis Ops` 继续沿各自的 candidate-definition 路径推进。
而在这份已 absorbed package 之上，当前真正活跃的公开主线已经转到围绕本地 `opl` shell、`opl web` 与 machine-readable handoff surface 的 family-level front desk / hosted-entry hardening 工作。

## 更后续阶段

只有当至少两个 domain surface 真正稳定，并且至少一个 domain 已经证明真实的上游 `Hermes-Agent` pilot 成立后，`OPL` 才适合进入更完整的生态表达阶段，例如：

- 更正式的跨 domain 状态维护
- 更强的顶层 gateway 公共入口
- 更清楚的跨 domain 共享协议
- 共享 runtime substrate 的回抽
- 跨 domain 正式行为合同的回抽
- 面向垂类场景的在线产品入口
- 由 `OPL` 直接暴露、并通过 `OPL` 产品层托管 external kernel 的产品入口
- 由 `OPL` 自己持有品牌与交互语义的 hosted / web front desk

进入这一阶段的前提，是多个 domain surface 已经拥有清楚且独立的边界。

关于 gateway 如何逐步落地成真实入口，详见：

- [OPL Gateway 落地路线](./references/opl-gateway-rollout.zh-CN.md)
- [OPL Federation Contract](opl-federation-contract.zh-CN.md)
- [OPL Public Surface Index](opl-public-surface-index.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
- [OPL Routed Action Gateway](opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](opl-domain-onboarding-contract.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.zh-CN.md)
- [生态四仓统一状态总表](./references/ecosystem-status-matrix.md)
- [OPL 垂类在线 Agent 平台演进蓝图](./references/opl-vertical-online-agent-platform-roadmap.md)

如果要查看这些已冻结 layers 如何以 contract-level composition 的方式拼起来，可参考 [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.zh-CN.md)。

## 当前判断标准

如果要判断 `OPL` 是否在向正确方向推进，可以看这些问题：

- 外界是否能理解 `OPL` 是整个生态的顶层产品与 gateway 语言？
- 外界是否能理解 `OPL` 负责 gateway / federation，而各个 admitted surface 继续负责自己的 domain？
- 外界是否能理解 `MedAutoScience` 仍是独立的 `Research Ops` domain gateway 与 harness？
- 外界是否能理解 `RedCube AI` 仍是独立的视觉交付 domain gateway 与 harness？
- 外界是否能理解 `ppt_deck` 直接映射 `Presentation Ops`，而 `xiaohongshu` 在 OPL 顶层保留独立 visual family 语义？
- 新工作流是否正被定义成 domain surface，而不是零散 feature？

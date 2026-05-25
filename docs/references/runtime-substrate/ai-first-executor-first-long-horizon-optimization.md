# AI-first / executor-first 长期优化调研入口

Owner: `One Person Lab`
Purpose: `ai_first_executor_first_long_horizon_research_prompt_and_audit_entry`
State: `support_reference`
Machine boundary: 本文是人读调研提示词、长期优化目标和审计入口。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App evidence 与各 domain owner receipt。
Date: `2026-05-26`

## 当前结论

OPL 的长期目标继续固定为 `AI-first / executor-first / Codex-first`：OPL 只准入、启动、托管、恢复、审计和投影 stage；默认由 `Codex CLI` 作为 Agent executor 执行；domain agent 持有 truth、quality、artifact authority、memory body 与 owner receipt。

这意味着 OPL 的设计上限来自 executor aperture，而不是越来越厚的流程引擎。框架应把最先进 AI executor 放到清晰、可恢复、可审计、可回放、可人工接管的工作台上，让模型、工具、prompt、skill、knowledge 与独立 reviewer 能力进步直接变成 MAS、MAG、RCA、OMA 和未来 agent 的能力进步。

合同、schema、read model、scorecard、checklist、provider proof、generated-surface proof 和 cleanup ledger 只提供下限：owner boundary、权限、安全、receipt、audit、replay、route-back、human gate、projection 与 fail-closed。它们不能替代开放式专家判断，也不能写成 publication / fundability / visual / export / artifact / production ready verdict。

## 长期优化目标

长期优化目标不是把 OPL 做成第二个 LangGraph、AutoGen、CrewAI、OpenHands 或 Agents SDK 包装层，而是把 OPL 做成 Codex-first 的薄 framework：

1. 增强 executor aperture：给 Codex CLI 和显式 selected executor 提供清楚 workspace、source refs、artifact refs、memory refs、test/verify入口、diff、replay、tool boundary 和 closeout receipt，而不是限制其内部推理、拆解、创作、评审和修订策略。
2. 保持 framework surface 节制：新增 surface 默认先作为 reference、diagnostic lens、advisory ref 或 App detail drilldown；只有服务 launch safety、authority boundary、evidence / audit / replay / route-back，或被 App/runtime 反复消费时，才进入默认入口。
3. 统一 stage pack conformance：每个标准 OPL Agent stage 都应同构暴露 prompt/tools/knowledge/evaluation、selected executor、executor binding ref、expected receipt refs、requires/ensures、independent gate policy 和 route-back receipt。
4. 统一 privatization audit envelope：MAS/RCA/MAG/OMA 的私有功能审计最终应投影到同一组 bucket：`standard_pack_inventory`、`authority_function_inventory`、`private_platform_residue_inventory`、`bridge_exit_gate`、`evidence_gap`；repo 可以有扩展字段，但 OPL/App 默认读法必须稳定。
5. 推进真实 evidence，而不是继续堆合同：2026-05-26 live read-model 读到 App user-path production user path ready，但 `app_release_user_path_release_ready_claimed=false`、`app_release_user_path_production_ready_claimed=false`；OMA production-consumption follow-through ready 只关闭 OMA production-consumption gate，不授权 MAS/MAG/RCA/domain production ready；`opl agents conformance --family-defaults --json` 读为四仓 structural conformance passed、blocked_count=0，production evidence tail 单独读取；`opl family-runtime evidence-worklist ... --detail full --json` 读为 `open_worklist_item_count=0`，但仍有 `zero_open_worklist_blocked_refs_only_envelope_count=213`，所以 zero-open worklist 不能写成 domain ready 或 production ready。MAG/RCA 的主缺口是 live owner-chain、App/default caller、workspace / artifact / memory receipt scaleout 和 controlled soak；MAS 的主缺口是 physical thinning tail、真实 paper-line receipt parity 与 no-active-caller / tombstone proof。

## 调研提示词

```text
调研成熟 agent/framework/AI coding 工程项目时，必须按 OPL 的 AI-first / executor-first 目标过滤：OPL 不是替代 Codex、Claude Code、OpenHands、LangGraph、AutoGen、CrewAI、Agents SDK 的上层机械 planner，而是给最先进 AI executor 搭台的薄框架。请优先阅读官方文档、论文、主仓库 README，并把每个外部项目拆成两类输出：

1. 可借鉴为 OPL framework surface 的模式：executor aperture、stage attempt、durable state、replay/audit、human gate、tool boundary、permission/roots、observability、handoff receipt、artifact/workspace/source refs、operator projection、repair/route-back。
2. 不应引入为 OPL runtime truth 的内容：外部框架的 planner、graph semantics、role-play crew、hosted workflow editor、SDK object model、agent hub、domain verdict、quality authority、memory body、artifact authority、publication/fundability/visual judgment。

输出必须保持 OPL 自身特色：Codex CLI 是当前第一公民 executor；非默认 executor 只能通过显式 adapter 接入；Temporal-backed provider 是 production online durable substrate；OPL 合同只保边界、安全、权限、审计、receipt、恢复、replay 和 projection 下限；开放式专家判断、研究路线、写作、审稿、修订和质量裁决继续交给 selected AI executor、独立 reviewer attempt 或 domain-owned agent。
```

## 外部经验吸收规则

| 项目 / 模式 | 可借鉴为 OPL surface | 不进入 OPL truth 的部分 |
| --- | --- | --- |
| OpenAI Agents SDK | agents、tools、handoffs、guardrails、sessions、tracing 的边界拆分；handoff / guardrail / trace 作为 receipt / audit / route-back 语言 | SDK object model、hosted orchestration、质量 verdict 或 domain authority |
| Codex CLI | 本地读写运行、repo-native verification、workspace-aware execution、review/patch workflow 作为 Codex-first executor aperture | 把某个 Codex profile、模型配置或单次 task 结果写成全局 production truth |
| Temporal | Workflow/Activity/Signal/Query/History 对 stage attempt、executor activity、human gate、projection、audit 的 durable substrate 映射 | domain idea、质量判断、artifact authority、memory body 或 executor 行为等价 |
| LangGraph | checkpoint、thread state、interrupt、human-in-the-loop、time travel / replay 语言 | graph semantics、node planner 或 LangGraph runtime 作为 OPL provider |
| MCP | tools/resources/prompts/roots 的显式 capability boundary；roots / tool refs / prompts refs 作为 launch 与 audit surface | 把 roots 当成权限强制真相，或把 MCP server 能力当成 domain verdict |
| AutoGen | agents/teams/tools/workbench/state/human handoff 的分层经验；typed handoff 和 termination 条件的 UX 语言 | 固定 manager/worker/critic 剧本、role-play crew 或聊天拓扑作为 OPL runtime truth |
| CrewAI | agents/tasks/tools/knowledge/flows 的声明式 UX 和 onboarding 词汇 | crew/process/flow 成为 OPL 控制平面或 domain truth |
| SWE-agent / ACI | agent-computer interface、lint/test feedback、repo-native command/result/diff aperture | 把测试通过或机械 score 写成 domain ready |
| OpenHands | coding-agent platform 的 secure execution、UI/workbench、agent SDK 与 task environment 经验 | OpenHands agent hub / task model / SDK 成为 MAS/MAG/RCA truth owner |
| Aider | lint/test loop、repo-native verification aperture | 把 lint/test exit code 升级为 publication / fundability / visual / export verdict |

## 当前系统评估

### 已成立

- OPL 当前三层读法已经成立：`OPL Framework` 持有 framework/runtime/activation/projection；`One Person Lab App` 是用户工作台；`Foundry Agents` 持有 domain truth、quality verdict、artifact authority、memory body 与 owner receipt。
- `Codex CLI` 是默认且第一公民 executor；`hermes_agent`、`claude_code`、`antigravity_cli` 等非默认 executor 只能以显式 adapter/backend 接入，并以 binding ref、receipt、audit 和 fail-closed 证明连接，不承诺行为、工具语义、质量或 resume 等价。
- Temporal-backed provider 是 production online durable substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。
- 核心 docs、contracts 与 CLI/read model 都已反复防止 `provider proof / readiness / generated surface / cleanup ledger = domain ready` 的误读。
- 2026-05-26 live `framework readiness` 读为 `framework_control_plane_available_with_blocked_refs_only_attention`：hard blocker 为 0，provider cadence/capability SLO satisfied，但 `domain_blocked_attention_tail_count=226`、`evidence_envelope_blocked_count=213`，且 authority boundary 仍禁止 OPL 声明 domain ready、production ready、quality/export verdict 或 artifact mutation authority。

### 主要冗余和污染风险

- AI-first / executor-first 叙述在 README、核心五件套、active gap 和 contracts 中重复较多；重复可接受，但后续维护必须让 `docs/invariants.md` 持有规范定义，`docs/project.md` 持有项目读法，`docs/architecture.md` 持有运行结构，`status/gap` 只保当前状态和差距。
- closeout、readiness、proof、tail、workorder、evidence ledger 术语密度高。默认入口应优先写清 `framework_control_plane_available` 或 `open accounting = 0` 只表示 OPL 控制面当前无待执行框架动作，不表示 App release、domain owner-chain、expected receipt instance、monitor freshness、artifact authority 或 long-soak evidence 完成。
- conformance 继续变厚后可能形成“合同完整性崇拜”。所有 conformance 只能检查启动边界、refs 完整性、authority boundary、receipt/audit/replay/route-back 下限，不检查 AI executor 的内部策略，不产生 quality verdict。

## Family agent 审计重点

| 对象 | 当前读法 | 长期优化重点 |
| --- | --- | --- |
| OPL | 职责边界清楚，但 surface 多 | 新增能力全部走 Surface Budget；默认 diagnostic/ref，只有 launch safety、authority、audit/replay/route-back 或 App/runtime 反复消费才升级 |
| MAS | ownership 方向正确，但仍是最大 residual 风险源 | 继续写成 `physical thinning tail`：runtime transport、sidecar、SQLite/lifecycle 等只可作为 domain bridge、receipt/typed-blocker、refs-only adapter 或 diagnostic；验收必须是 no-active-caller、OPL parity、domain receipt parity、tests 和 tombstone refs |
| MAG | 结构边界较干净 | 主要缺口归测试/证据差距：live OPL-hosted grant-stage receipt、App/production caller receipt、long soak、workspace receipt scaleout |
| RCA | 旧 managed runtime 退役较彻底 | 防止 artifact-heavy helper、product sidecar、native helper、artifact lifecycle 被复制成通用 runtime scaffold；RCA 只提供 visual pack、authority function 和 refs-only adapter |
| OMA | 语义深度已够，不再是空壳；MAS/MAG real-target scaleout refs 已能进入 OPL registry / App drilldown，默认 summary 和 full detail 都可审计 owner receipt / typed blocker、Agent Lab result、no-forbidden-write 与 cleanup counters；production-consumption follow-through 已消费 managed install/update、App live path、owner receipt / typed blocker scaleout 和 verified long-soak 四类 gate。 | 继续增加真实 target patch/rerun/owner receipt 样本；防止 scripts 增长成 meta-runtime 或默认 promotion authority；任何 OMA counter 或 OMA production-consumption ready 都不能授权目标 domain ready、family production ready 或默认 promotion。 |

## 下一轮可执行方向

当前优先级继续从 live gate 倒推，而不是继续增加相似 conformance surface：App user-path evidence 与 OMA production-consumption 这轮已经各自观察到 verified long evidence refs，下一轮应转向仍能被 fresh read-model 证明的 MAS paper-line parity / physical thinning、MAG/RCA owner-chain 与 controlled hosted stage soak、Developer Mode non-owner fork/PR owner acceptance、以及 App release-ready owner boundary；只有当新 surface 能防止 authority 污染、App/default caller 漏读或 refs-only evidence 误关 gate 时，才进入前 3 类结构优化。

1. `standard_stage_pack_v2_conformance`
   统一 `stage_control_plane` 的必备字段和读法：prompt refs、tool/skill refs、knowledge refs、evaluation / quality gate refs、selected executor、executor binding ref、expected receipt refs、requires/ensures、independent gate policy、route-back receipt。

2. `pack_compiler_cross_ref`
   保持 `pack_compiler_input` 轻量，但增加 canonical cross-ref：stage graph source、quality gate source、executor policy source、privatization audit source 和 generated surface handoff source。

3. `privatization_audit_envelope`
   统一 MAS/RCA/MAG/OMA 的 functional privatization audit 顶层 envelope，减少 App/operator drilldown 的 repo-specific adapter。

4. `evidence_after_contract`
   在 conformance 收敛后，优先投入真实 evidence：MAS paper-line parity 和 physical thinning、MAG/RCA controlled hosted stage soak、Developer Mode non-owner fork/PR owner acceptance，以及 MAG/RCA/OMA owner receipt / typed blocker scaleout。App user-path 和 OMA production-consumption 的 verified refs 只关闭对应 refs-only gate；它们不替代 MAS/MAG/RCA 的 domain ready、artifact authority、family production ready、App release ready 或默认 promotion evidence。每次引用这些 evidence 时都必须重跑 live read-model，并把 zero-open worklist 与 blocked refs-only envelope 分开写。

## 不能写成

- 不能写成 OPL 要引入外部 agent framework 作为 runtime truth、planner、executor、workflow compiler、proof assistant 或 domain authority。
- 不能写成 Codex profile、provider proof、generated interface ready、contract completeness、cleanup ledger verified 或 open workorder accounting 为 0 等于 production ready。
- 不能写成 stage conformance 越完整，AI executor 内部策略就越应该被合同枚举。
- 不能写成 MAG/RCA/OMA 的主要剩余缺口仍是功能/结构大方向错误；它们更多是 live evidence、App/default caller 和 owner-chain scaleout。
- 不能把 MAS 当前仍存在的 runtime / sidecar / lifecycle bridge 写成长期 generic runtime owner；它仍是 physical thinning tail。

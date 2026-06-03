# OPL Family Purpose-First Current Design Audit

Owner: `One Person Lab`
Purpose: `purpose_first_current_design_audit`
State: `active_support`
Machine boundary: 本文是人读跨仓顶层设计审计，记录从目的反推的当前设计优化建议。机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、owner receipt、typed blocker、release artifact 和 domain-owned evidence。
Date: `2026-06-03`

## 审计问题

本轮只回答一个问题：按 `AI-first / executor-first / purpose-first` 和当前 `TASTE.md`，OPL 相关 repo 的顶层设计里，还有哪些东西从目的反推其实不必成为长期默认设计面，应该合并、收薄、下沉到诊断、归档或删除。

本轮是 read-only 设计审计。它不覆盖 production readiness、domain ready、App release ready、真实 long-soak、owner receipt 成功或物理删除授权。需要这些结论时必须读取 live 机器面。

## 审计范围

本轮过了 8 个本机 repo。审计开始时这些 checkout 均在 `main` 且 worktree clean：

| repo | 角色 |
| --- | --- |
| `one-person-lab` | OPL Framework，持有 runtime / provider / queue / generated surface / Agent Lab / App/operator read model。 |
| `one-person-lab-app` | App product/release/user-path owner，消费 OPL runtime state 和 domain-owned projection。 |
| `med-autoscience` | MAS Research Foundry，持有医学研究 truth、publication quality、artifact/memory authority 和 owner receipt。 |
| `med-autogrant` | MAG Grant Foundry，持有 grant truth、fundability / quality / export / submission gate、package authority 和 owner receipt。 |
| `redcube-ai` | RCA Presentation Foundry，持有 visual truth、review/export verdict、artifact authority、visual memory authority 和 owner receipt。 |
| `opl-meta-agent` | OMA Agent Foundry，持有 agent-building semantics、developer work order、candidate / mechanism proposal 和 typed blocker。 |
| `opl-aion-shell` | App 当前 AionUI shell implementation carrier。 |
| `opl-doc` | OPL-native developer docs lifecycle steward。 |

## Source Of Truth Read

| repo | 本轮读取的当前 owner 面 |
| --- | --- |
| `one-person-lab` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/current-state-vs-ideal-gap.md`、`docs/active/production-framework-closure-gap-matrix.md`、`docs/active/standard-agent-private-platform-inventory.md`、`contracts/opl-framework/surface-budget-policy.json`。 |
| `one-person-lab-app` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/app-ideal-state-gap-plan.md`、`contracts/app-gui-product-contract.json`。 |
| `med-autoscience` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/mas-ideal-state-gap-plan.md`、`contracts/foundry_agent_series.json`。 |
| `med-autogrant` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/mag-ideal-state-cross-repo-gap-plan.md`、`contracts/foundry_agent_series.json`。 |
| `redcube-ai` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/rca-ideal-state-gap-plan.md`、`contracts/foundry_agent_series.json`。 |
| `opl-meta-agent` | `TASTE.md`、`docs/architecture.md`、`docs/status.md`、`docs/active/opl-meta-agent-ideal-state-gap-plan.md`、`contracts/foundry_agent_series.json`。 |
| `opl-aion-shell` | `AGENTS.md`、`docs/guides/opl-app-shell-boundary.md`、`docs/README.md`、root `README.md` 和 OPL/App boundary 相关源码/docs wording scan。 |
| `opl-doc` | `AGENTS.md`、`README.md`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/usage.md`。 |

## 总判断

当前 OPL family 的目标态已经非常清楚：

```text
OPL Framework -> One Person Lab App -> Foundry Agents
```

更具体地说：

```text
Foundry Agent =
  Declarative Domain Pack
  + OPL generated/hosted surfaces
  + minimal authority functions
```

因此，真正还值得优化的不是再发明更多总线、面板、状态机或 wrapper，而是做减法：

1. 默认读面继续压到 `owner-delta-first`：有没有 safe action、等哪个 owner、缺什么 delta / receipt / typed blocker / no-regression ref、是否阻断 readiness。
2. 把 raw worklist、stage replay、private residue inventory、lifecycle detail、long evidence ledger 和 diagnostic lens 全部保留为 full-detail / audit，不进入普通默认面。
3. Domain repo 不再维护 generic runtime、scheduler、queue、attempt ledger、session/workbench、artifact/memory lifecycle shell、status/product wrapper 或 compatibility facade 作为长期组成。
4. App 和 shell 不持有 runtime truth、domain truth、release-ready 之外的 domain verdict，也不把 upstream AionUI 多 backend / 多 agent 能力做成普通 OPL 用户默认产品面。
5. OMA 不变成第二 Agent Lab / second OPL Framework。它只把 target evidence 转成 work order、candidate、proposal 或 typed blocker。
6. OPL Doc 不变成第二 truth repo。它只给文档治理 workflow、doctor 和 profile sync，不替目标 repo 判断 runtime/domain/artifact/receipt truth。

## Cross-Repo Simplification Rules

### 1. Default Surface Budget

所有新增默认 surface 必须先回答：

- 是否影响 launch safety、authority boundary、evidence / replay / audit / route-back。
- 是否被 App / runtime / queue / provider / runtime action shell 反复消费。
- 是否能直接减少 operator 决策成本。

若答案是否定，默认只允许进入 diagnostic lens、reference、history 或 refs-only full detail。

### 2. Evidence Tail Is Not Structure Gap

`open_worklist=0`、conformance pass、generated bundle ready、verified typed blocker、single cohort evidence、provider SLO satisfied、stage replay refs observed、workspace receipt scaleout 或 no-regression refs visible，都不能写成 domain ready、App release ready、production ready 或 strict physical delete authorized。

这些状态只能说明 transport/read-model/evidence route 可用。下一步仍要回到对应 owner 的 delta、receipt、human gate、typed blocker 或 no-regression evidence。

### 3. Delete After Cutover

已被 OPL generated/hosted surface 或 App-owned contract 替代的 wrapper、alias、facade、compat path、sidecar、session/workbench shell 和 compatibility-only test，不作为长期资产。满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后，直接删除或 tombstone。

### 4. Domain Authority Stays Domain

MAS 的医学研究 judgment、MAG 的 grant quality/export/submission judgment、RCA 的 visual review/export judgment、OMA 的 target-agent owner-route boundary 都不能被 OPL/App/doctor/schema/scorecard/provider completion 机械替代。

程序只做校验、物化、索引、路由、receipt refs、projection、guard 和 fail-closed。开放式判断由 agent executor、independent reviewer、domain owner 或 human gate 产出可审计 receipt/blocker。

## Per-Repo Findings

### `one-person-lab`

当前 purpose：完整 OPL Framework，持有 provider-backed stage runtime、Temporal required substrate、typed queue、attempt ledger、safe action shell、generated surfaces、Agent Lab、App/operator read model 和跨仓 owner boundary。

已经更优的地方：

- `surface-budget-policy.json` 已把 default surface 限在 Minimal Trust Kernel 和 attention entry。
- `current-state-vs-ideal-gap.md` 已明确 owner-delta-first completion 口径。
- `standard-agent-private-platform-inventory.md` 已把 domain repo 私有平台残留分类成可上收 / refs-only / authority / tombstone。

仍可优化的设计面：

| 设计面 | 为什么不必成为默认面 | 更简洁目标 |
| --- | --- | --- |
| 多个 full drilldown / evidence lens 同时出现在默认叙事中 | operator 的目的不是先读 raw count，而是知道下一 owner 和可执行 delta。 | 默认只给 compact owner-delta；full worklist、stage replay、private inventory、lifecycle detail 全部作为 audit drilldown。 |
| active 文档容易重新积累 receipt 流水和 dated closeout | 当前事实应从 live machine truth 派生，过程 ledger 会污染下一轮判断。 | active docs 只保留 current state、gap、owner、next baton；dated proof 归 history/runtime ledger。 |
| structural closure 和 production evidence tail 容易混读 | source-purity clean 不等于 domain/App/production ready。 | 文档和 read-model 始终拆开 `功能/结构差距` 与 `测试/证据差距`。 |

下一步优化：新增 OPL Framework surface 前先过 surface budget；任何 raw diagnostic 想进默认 CLI/App summary，都必须证明它能减少 owner-delta 判断成本。

### `one-person-lab-app`

当前 purpose：Codex App wrapper + OPL family ordinary user workbench。App 持有 GUI product truth、active-shell contract、page-state、first-run、release evidence、user guides 和 App release/user-path gate；不持有 runtime truth、domain truth、owner receipt、artifact authority 或 family production ready。

仍可优化的设计面：

| 设计面 | 为什么不必成为默认面 | 更简洁目标 |
| --- | --- | --- |
| Shell candidate、PilotDeck / AG-UI / AionUI upstream details容易进入产品叙事 | 普通用户目的只是通过 Codex executor 进入 MAS/MAG/RCA task，不需要理解 shell implementation choices。 | ordinary path 固定为 Codex CLI + purpose entries；candidate detail 仅进 technical verification / release isolation。 |
| Runtime page 若默认读 full drilldown 或 provider internals | 用户要看任务是否在跑、等谁、下一步是什么；full ledger 会增加认知成本。 | 默认消费 `opl app state --profile fast --json`，full drilldown 只做用户触发诊断。 |
| Release/user-path evidence 与 family production readiness 混读 | App release cohort evidence 只证明该 cohort 的 App path，不证明 MAS/MAG/RCA ready。 | App 文档和合同只声明 release/user-path gate 状态；domain/prod verdict 回 domain/OPL owner。 |

下一步优化：继续把 App 合同收敛为 chat-first Codex wrapper。Home/ordinary conversation/settings 不暴露 backend/provider/permission/executor selector；MAS/MAG/RCA 作为目的入口而非插件/技能包装细节。

### `med-autoscience`

当前 purpose：MAS Research Foundry。MAS 持有 study truth、publication quality、source readiness、artifact/package authority、publication-route memory accept/reject、AI reviewer record、owner receipt 和 typed blocker。OPL 持有 runtime/provider/queue/lifecycle/projection。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| product-entry / progress portal / workbench / owner-route / status projection shell 仍容易被读成 MAS generic platform | 这些面只服务 refs/projection/diagnostic，长期 generic workbench/status/lifecycle 属于 OPL。 | MAS active source 只保留 domain handler target、study authority refs、AI reviewer / publication gate、artifact/memory authority function。 |
| read-model/currentness/platform repair 与 paper progress 混读 | 用户目的是真实 paper/research delta，platform repair 只能是运维进展。 | stage closeout 明确 deliverable delta、platform repair delta、typed blocker lineage 和 next forced delta。 |
| MDS / historical runtime / local scheduler provenance 仍有复活风险 | 历史 backend 只能当 provenance / fixture / audit reference。 | active docs 和 code guard 禁止把旧 runtime_transport、runner、worker lease、MDS default 写回 active owner。 |

下一步优化：真实 paper-line owner delta 优先。没有论文/证据/审核/人类 gate 的 domain delta，就返回 MAS-owned typed blocker，避免用 platform repair 或 OPL ledger closure 伪装研究进展。

### `med-autogrant`

当前 purpose：MAG Grant Foundry。MAG 持有 grant truth、fundability / quality / export / submission verdict、package authority、grant memory accept/reject、transition oracle、owner receipt 和 typed blocker。OPL 持有 Temporal runtime、typed queue、attempt ledger、generic transition runner、workspace/source/memory/package shell 和 generated/default caller。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| product-entry、status/user-loop、domain_handler、domain_runtime、lifecycle、grouped CLI shell 仍有 active caller | 它们当前有 direct path / handler 价值，但长期不是 MAG 私有平台。 | 保持 refs-only owner-delta output；满足 default caller parity 和 MAG physical delete receipt 后删除或 tombstone。 |
| pre-workspace funding discovery 容易误进已锁定 grant authoring 默认链路 | 已锁定基金任务的目的是真实 proposal delta，不是反复重选 funder。 | funding discovery 保持显式可选准备工具，不阻断指定基金 authoring。 |
| Hermes helper / non-default executor proof lane 容易被读成 MAG executor substrate | executor adapter owner 应在 OPL；MAG只消费 receipt。 | 保留 active caller 前先标成 opt-in proof lane；cutover 到 OPL executor adapter 后删除 MAG helper/tests。 |

下一步优化：围绕 `submission_ready_export_gate` 和真实 grant-stage owner receipts 走。schema completeness、grouped CLI success、manifest success、OPL ledger verification 都只能做证据 transport，不关闭 grant-ready / submission-ready。

### `redcube-ai`

当前 purpose：RCA Presentation Foundry。RCA 持有 visual truth、route truth、communication / visual direction、review/export verdict、artifact authority、visual memory accept/reject、owner receipt 和 typed blocker。OPL 持有 runtime/provider/workbench/artifact gallery shell/generated wrapper。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| product-entry / session / `domain_action_adapter` / runtimeWatch / operator evidence / stability projection / neutral route-run adapter | 这些只是 refs-only adapter、domain handler target 或 migration input；长期 generic session/workbench/runtime owner 在 OPL。 | OPL default caller cutover 后，RCA 只保留 service-safe domain entry、visual authority functions、native helper 和 refs-only return shape。 |
| `redcube` / `redcube_ai` / `redcube-ai` / `rca` 多身份 | 身份分裂会增加 readiness claim 误读风险。 | 维持 machine identity map，但 alias 不得成为 authority source、generated owner 或 readiness claim。 |
| image-first / HTML / native PPTX 多路线都写成默认能力 | 用户目的通常是可审阅视觉交付；路线多样性应服务显式需求，不应膨胀默认首屏。 | image-first 默认；HTML/native PPTX 显式可选；质量 verdict 仍回 RCA review/export gate。 |

下一步优化：production evidence tail 只按 RCA owner delta 推进：artifact-producing owner receipt、review/export receipt、visual memory/lifecycle receipt、workspace scaleout、production-like no-regression、Temporal controlled visual-stage long-soak、human review receipt 或 typed blocker。

### `opl-meta-agent`

当前 purpose：OMA Agent Foundry。OMA 读取 target agent spec/evidence/Agent Lab handoff，产出 candidate package、developer patch work order、target capability candidate、mechanism proposal 或 typed blocker。OPL Framework / Agent Lab 持有 runner、queue、attempt ledger、promotion gate、work-order execute / absorb / cleanup。Target agent 持有 domain truth 和 owner receipt。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| `scripts/` materializer / helper 继续增长 | 脚本只应物化 refs、smoke、proof 或 work order；稳定策略应回 `agent/`、`contracts/`、`runtime/authority_functions/` 或 OPL primitive。 | OMA active shape 保持 declarative agent-building pack + minimal authority functions。 |
| OMA work order 容易被读成第二 Agent Lab / second framework | OMA 只生成 work order / proposal / blocker，不执行 promotion、attempt ledger、worktree lifecycle 或 owner closeout。 | `execute:external-work-order` 保持薄委托到 OPL `work-order execute`。 |
| MAS/MAG/RCA domain vocabulary 进入 OMA 顶层命令或 suite kind | 标准消费者应该消费 target-agent generic handoff，而不是每个 domain 一套 OMA logic。 | 目标仓提供标准 handoff；OMA 顶层保持 target-agent generic vocabulary。 |

下一步优化：更多真实 target patch-loop 样本和 independent Codex reviewer evidence，而不是补更多 contract completeness。缺 owner route、target verification、no-forbidden-write 或 target owner receipt 时返回 typed blocker。

### `opl-aion-shell`

当前 purpose：One Person Lab App 的 replaceable AionUI renderer/Electron carrier。它实现 App-owned contracts；App product authority 在 `one-person-lab-app`。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| root README 仍是 upstream AionUI marketing，包含 multi-backend / Team / provider 叙事 | 对 OPL App 来说这些是 upstream implementation material，不是 ordinary product truth。 | OPL 工作只信 `docs/guides/opl-app-shell-boundary.md` 和 App contracts；README 只按 upstream provenance 读取。 |
| disabled Team、legacy invokeBridge、legacy database migration 等兼容尾项 | 它们不是 OPL ordinary user product surface，只是 active caller / release window 约束。 | 按 remaining deletion gates 逐个替换 caller 后删除；不新增 shell-local compatibility policy。 |
| shell-local backend/model/provider defaults | Shell 可以实现，但不能定义 App product defaults。 | 统一从 generated App product profile 和 App shell adapter contract 消费。 |

下一步优化：shell 改动前先改 App contract；shell 只做 renderer/profile/route receipt/bridge implementation。普通 Runtime 页面默认使用 `opl app state --profile fast`，full drilldown 和 upstream AionUI modes 只做 diagnostics。

### `opl-doc`

当前 purpose：OPL-native developer docs lifecycle steward。它提供 skill、read-only doctor、profile sync、family-plan 和模板；目标 repo truth 仍在目标 repo。

仍可优化的设计面：

| 设计面 | 为什么不必成为长期设计面 | 更简洁目标 |
| --- | --- | --- |
| doctor finding 被误当治理任务清单 | 文档语义需要 Codex 读 live source/contracts/tests/read-model/ledger/receipt 后判断。 | doctor 只做 lightweight risk map；governance 必须逐段 semantic audit。 |
| `contracts/opl-native-profile.json` 被误读成 repo truth | 该文件只服务 plugin sync / drift check。 | 明确 profile 不是 domain/runtime/artifact/quality/receipt authority。 |
| OPL series docs workflow 复制各 repo active truth | 文档仓不应成为第二 truth repo。 | family-plan 只生成工作流；current truth 折回各 repo canonical docs。 |

下一步优化：把 `opl-aion-shell` 和 `opl-doc` 明确作为 support repos，而不是 Foundry Agent core truth set。OPL Doc 默认 series governance 可以继续保持 6 个核心 repo；shell/doc 作为 implementation/support extension 显式纳入时才审计。

## 可直接优化项

| 优先级 | 优化项 | 落点 |
| --- | --- | --- |
| P0 | 所有默认 App/CLI/operator summary 只展示 compact owner-delta；raw counts 和 full refs 只进 full detail。 | `one-person-lab`、`one-person-lab-app`、`opl-aion-shell`。 |
| P0 | Domain repo 中仍有 active caller 的 product/status/workbench/session/runtime wrapper，统一标成 refs-only adapter / handler target / migration input，并绑定 deletion gate。 | MAS、MAG、RCA、OMA private inventory 和 contracts。 |
| P0 | 明确 evidence tail 不再回写成结构 gap。 | OPL current gap、MAS/MAG/RCA/OMA active plans。 |
| P1 | App 普通用户路径保持 Codex wrapper：MAS/MAG/RCA purpose entries + fixed Codex executor；shell candidate/upstream modes 不进 ordinary default UI。 | `one-person-lab-app`、`opl-aion-shell`。 |
| P1 | OMA script-to-pack hygiene：稳定 policy 迁到 `agent/` / `contracts/` / `runtime/authority_functions/`，脚本只做 materializer/helper。 | `opl-meta-agent`。 |
| P1 | RCA identity / retired alias guard 继续收紧，避免 `managed` / `gateway` / `session` / `domain_action_adapter` 重新成为 active public surface。 | `redcube-ai`。 |
| P2 | OPL Doc family-plan 将 support repos 标为 extension，防止默认 docs governance 范围被误读成 project truth owner set。 | `opl-doc`。 |

## 不建议做的事

- 不新增第二套 active plan 或跨仓大 ledger。已有 canonical active plans 已足够，fresh audit 应 fold back 到这些 owner。
- 不用 conformance pass、descriptor ready、generated surface ready、schema completeness 或 doctor clean 作为 ready verdict。
- 不为了兼容保留 alias、facade、wrapper、compat aggregate test 或旧 route success path。
- 不把 App/shell 做回通用多 backend agent launcher。OPL App ordinary path 是 Codex wrapper + Foundry Agent purpose work。
- 不把 domain private helper 一次性粗暴删除。物理删除必须等 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 成立。

## 下一轮落地顺序

若进入实现，建议不要按 repo 一个阶段一个阶段串行，而按 owner boundary 并行拆线：

1. `default_read_surface_lane`
   - 目标：把 OPL/App/shell 默认读面全部收敛到 compact owner-delta。
   - 可写：OPL read-model / App contract / shell Runtime page bridge。
   - 验证：OPL focused read-model tests、App active-shell validation、shell state-model tests。

2. `domain_adapter_thinning_lane`
   - 目标：MAS/MAG/RCA/OMA retained adapter 全部回到 private inventory gate，已满足门槛的 wrapper/alias/test 直接删除或 tombstone。
   - 可写：各 domain repo private inventory、contracts、source/tests 中有 active caller 的候选面。
   - 验证：repo-native focused tests + OPL `agents conformance` / `default-callers` / `interfaces`。

3. `production_evidence_tail_lane`
   - 目标：不补结构面，直接推进真实 owner receipt、typed blocker、human gate、long-soak、no-regression、App/user-path evidence。
   - 可写：domain production acceptance / owner-payload response / evidence ledger payloads。
   - 验证：domain owner receipt / typed blocker refs + OPL refs-only record/verify。

4. `support_repo_no_second_truth_lane`
   - 目标：shell/doc repo 只保 implementation carrier / docs steward 边界；support docs 不复制 App/Framework/domain truth。
   - 可写：`opl-aion-shell` boundary docs / deletion gates、`opl-doc` workflow docs。
   - 验证：docs-only diff check + repo-native tests if touched.

## 落地 Closeout

本轮已把上面四条 lane 中可直接落地的设计收敛吸收到各仓 `main`。这不是 production-ready / domain-ready / App-release-ready 声明；真实 owner receipt、human gate、long-soak、no-regression 和物理删除授权仍按各 domain / App / OPL owner 面继续推进。

| Lane | 落地仓库 | 当前结果 |
| --- | --- | --- |
| `default_read_surface_lane` | `one-person-lab`、`one-person-lab-app`、`opl-aion-shell` | OPL/App/shell 机器合同和 Runtime bridge 已默认暴露 compact owner-delta policy；raw evidence、full refs、runtime internals 和 drilldown body 保持 explicit/full diagnostic。 |
| `domain_adapter_thinning_lane` | `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent` | MAS/MAG/RCA 的 `foundry_agent_series.json` 增加 purpose-first adapter thinning policy；retained surface 只能作为 refs-only adapter、domain handler target、minimal authority function、migration input 或 tombstone/provenance 读取，并绑定 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。OMA 固定 script/materializer 和 work order 只产出 target-agent generic candidate / work order / proposal / typed blocker，不成为第二 Agent Lab / framework。 |
| `production_evidence_tail_lane` | OPL、MAS、MAG、RCA、OMA active plans/contracts | 结构 gap 与证据 tail 已拆开：schema/descriptor conformance、provider completion、read-model currentness、grouped CLI success、doctor clean、refs-only accounting 不升级为 domain ready、submission ready、visual ready、production ready 或 paper/grant/visual progress。 |
| `support_repo_no_second_truth_lane` | `opl-aion-shell`、`opl-doc` | Shell 只保 App-owned runtime policy 的 renderer/bridge implementation carrier；`opl-doc` doctor/native profile/family-plan 只做 workflow / risk map / profile sync，support repos 只作为 explicit extension，不进入默认 Foundry Agent truth owner set。 |

吸收后的验证：

- OPL: `rtk node --experimental-strip-types --test tests/src/cli/cases/app-state.test.ts tests/src/family-product-operator-projection.test.ts tests/src/verification-command-surfaces.test.ts`，34 passed。
- App: `rtk node --test tests/release/app-runtime-bridge-boundary.test.ts tests/release/app-release-boundary.test.ts`，78 passed；`rtk node --experimental-strip-types scripts/validate-active-shell.ts --quick` 通过。
- Shell: `rtk npm test -- tests/unit/opl-runtime/runtimeProjection.test.ts tests/unit/opl-runtime/oplRuntimeBridge.test.ts`，18 passed。
- MAS: `rtk scripts/run-pytest-clean.sh tests/test_opl_standard_pack.py -q`，5 passed。
- MAG: `rtk scripts/run-pytest-clean.sh tests/test_opl_standard_pack.py -q`，10 passed。
- RCA: `rtk npm test -- tests/opl-agent-pack-contracts.test.ts` 触发 repo `fast` lane，255 passed。
- OMA: `rtk npm run typecheck` 通过；`rtk npm test`，63 passed。
- OPL Doc: `rtk python3 -m pytest -q`，28 passed；`rtk python3 scripts/opl_doc_doctor.py doctor .` findings none。

残余开放项：

- Domain physical deletion 仍未授权。每个 wrapper / alias / adapter / compatibility test 的物理删除必须逐项满足本轮写入的 deletion gates。
- Production evidence tail 仍需真实 owner delta：paper/reviewer/human gate、grant submission human receipt、visual review/export receipt、Temporal long-soak、production-like no-regression、App/operator/release consumption 等。
- `one-person-lab` 主 checkout completion check 时曾出现并发测试拆分改动；最终已作为独立本地提交 `64445dbd test(runtime): split app action coverage below line budget` 保留在 `main`，不属于本轮 purpose-first closeout 内容。

## 2026-06-03 Fresh Re-Audit After Closeout

本节是在上面 closeout 已落地后，对当前 checkout 和机器面做的 fresh re-audit。结论是：大方向已经收敛，当前最值得修的不是再增加顶层设计，而是消除少数会让 operator / conformance / active docs 重新偏离目的的噪声源。

### Fresh Machine Snapshot

| 面 | 当前结果 | 设计含义 |
| --- | --- | --- |
| OPL default callers | `./bin/opl agents default-callers --family-defaults --json` 摘要为 `status=ready_domain_evidence_required`、`generated_default_caller_surface_count=32`、`blocked_surface_count=0`、`deletion_evidence_worklist_count=32`、各 missing count 为 `0`，但 `physical_delete_authorized_by_this_report=false`。 | OPL generated/default caller replacement 已足够作为结构替代证据；它仍不是 domain physical delete authority，也不是 domain ready / production ready / artifact authority。 |
| OPL standard conformance | `./bin/opl agents conformance --family-defaults --json` 摘要为 `status=blocked`、`passed_count=3`、`blocked_count=1`，唯一 blocker 是 OMA `active_forbidden_name_residue:app_shell_owner:tests/source-purity.test.ts`。 | 当前 blocked 点不是 MAS/MAG/RCA/OMA 目标态重新不清，而是 forbidden-name residue scan 把负向 guard / test wording 误读成 active ownership residue 的风险。 |
| App active shell | `node --experimental-strip-types scripts/validate-active-shell.ts --quick` 通过，输出 `Active shell contract is structurally valid.` | App/shell compact owner-delta boundary 当前仍可用；不需要把 provider internals 或 upstream shell modes 拉回默认产品面。 |
| OMA local source-purity | `npm test -- tests/source-purity.test.ts` 触发 repo test lane，63 passed。 | OMA 本仓测试认为 source-purity / script morphology 已通过；OPL family conformance 的 blocked 语义需要校准，而不是直接把 OMA 判成 active app shell owner。 |
| MAG checkout | `main...origin/main` 已同步到 `162b9a7`，docs conflict markers 复核无输出。 | MAG active truth 文档已恢复为可读 current-state；后续 thinning / readiness 判断仍必须按 grant owner receipt、submission gate 和 physical delete gate 逐项推进。 |
| RCA checkout | `main...origin/main` 已同步到 `6c26032e`，docs conflict markers 复核无输出。 | RCA active truth 文档已恢复为可读 current-state；visual evidence tail / lifecycle cleanup 后续仍按 review/export owner receipt、no-resurrection gate 和 physical delete gate 推进。 |

### New Purpose-First Findings

| 优先级 | repo | 发现 | 为什么是设计问题 | 更简洁目标 |
| --- | --- | --- | --- | --- |
| P0 | `one-person-lab` + `opl-meta-agent` | Standard conformance 现在被 OMA `tests/source-purity.test.ts` 中的 `app_shell_owner` token 阻塞，但 OMA 本地 source-purity lane 63 passed。 | purpose-first 的 conformance 应判断 active ownership residue；负向断言、forbidden role 清单、contract guard test 不应和 active surface 混读。否则系统会把“防复活测试”误当“复活证据”，制造无效阻塞。 | 让 residue scanner / allowlist context-aware：`contract_or_legacy_guard_test`、negative assertion、forbidden role list、policy manifest 中的 token 只作为 guard residue；只有实际 owner role、active caller、exported surface、default route 或 source path 命中才 blocker。 |
| P1 | `med-autogrant` | MAG active docs conflict 已恢复并推送；剩余是实际 thinning / evidence tail 仍重。 | active plan 已回到单一 current-state，但 status/user-loop、domain handler/runtime、lifecycle、grouped CLI shell 等还需要 owner receipt / submission gate / delete gate 逐项授权。 | 以 `submission_ready_export_gate` 和真实 grant-stage owner receipts 为中心，完成 no-active-caller / tombstone / no-resurrection 后再删除或收薄。 |
| P1 | `redcube-ai` | RCA active docs conflict 已恢复并推送；route/product/session/domain action adapter/runtimeWatch/operator projection 等 surface 仍多。 | visual truth 和 review/export authority 应留 RCA；generic session/workbench/runtime owner 应在 OPL，docs 恢复只关闭了 current-state 噪声。 | image-first + review/export owner receipt 为默认路径；HTML/native PPTX、runtimeWatch 和 drilldown 只做显式 diagnostic / route option。 |
| P1 | `opl-aion-shell` | Upstream README / multilingual README 仍保留大量 AionUI marketing、多 backend、Team mode 和 upstream runtime 叙事。 | shell 的目的只是 App-owned renderer / bridge carrier。普通 OPL 读者从 root README 进入时，仍可能把 upstream capability 当成 OPL product truth。 | 在 root README 顶部加更强 OPL boundary pointer，或把 upstream README 明确降为 provenance；OPL 工作入口只指向 App contracts 和 `docs/guides/opl-app-shell-boundary.md`。 |
| P1 | `one-person-lab` | Default caller worklist 已经 closed enough for structural replacement，但 physical delete 仍 false。 | 把 refs-only worklist close 当成 delete ready，会违反 domain-owned receipt / typed blocker / no-forbidden-write / provenance gate。 | 默认 summary 继续只说 `ready_domain_evidence_required`；delete lane 必须逐 repo、逐 surface 由 domain owner 明确授权。 |
| P1 | `med-autoscience` | MAS 结构面已收敛，剩余主要是 paper-line owner delta / evidence tail。 | 继续补 platform repair、read-model currentness 或 receipt replay 不会直接产出论文 delta。 | MAS 默认推进 paper/reviewer/human-gate 下一 owner；platform repair 只做 separate ops progress。 |
| P1 | `opl-meta-agent` | OMA scripts/materializers 已被约束为 thin helper，但 conformance blocked 说明 scanner 与 guard test 的合同仍可更优雅。 | OMA 的目标是生成 target-agent work order / candidate / proposal / typed blocker，不应因为自我约束测试而像第二 framework。 | 把 OMA negative guard tokens 放进 machine-allowed guard context，保持 top-level vocabulary target-agent generic。 |
| P2 | `one-person-lab-app` | App 边界当前健康，但 docs/contracts 仍偏长，容易解释 shell/provider/candidate 细节。 | ordinary user path 只需要 purpose entry、任务状态、下一 owner、safe action。 | release/user-path evidence 和 family production readiness 继续分离；App 默认只暴露 compact runtime state。 |
| P2 | `opl-doc` | OPL Doc 当前仍适合作 support workflow / doctor，不是 truth owner。 | doctor clean / profile readable 不能替目标 repo 做 semantic current-state 判断。 | 继续保持 support repo explicit extension；出现非平凡开发时用 change packet，而不是新增第二 active truth plan。 |

### Revised Optimization Order

按当前 fresh 状态，下一轮落地不应先开新抽象，应先清掉会污染目的判断的阻塞：

1. `conformance_residue_semantics_lane`
   - 目标：修正 OPL family conformance 对 forbidden-name residue 的语义，区分 active owner residue 与 negative guard / policy / test token。
   - 落点：OPL conformance scanner / allowance 分类，必要时同步 OMA guard test 或 contract token placement。
   - 验证：OPL `agents conformance --family-defaults --json` 从 `blocked_count=1` 回到结构 pass 或只保真实 blocker；OMA `npm test -- tests/source-purity.test.ts` 继续通过。

2. `domain_physical_thinning_lane`
   - 目标：在 conformance 和 active docs 恢复后，再逐 surface 推进 MAG/RCA/MAS/OMA 的 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 和 physical delete。
   - 原则：default caller readiness 只是结构替代输入；每个 domain 的物理删除授权仍由 domain owner gate 决定。

3. `support_entry_clarity_lane`
   - 目标：让 shell/doc 的第一入口不再误导为 product/runtime/domain truth。
   - 落点：`opl-aion-shell` root README OPL boundary pointer、`opl-doc` support extension wording。
   - 验证：docs-only check；如 touched shell runtime bridge，再跑 shell focused tests。

## 验证方式

初始审计为 docs-only read audit，最小验证：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs/active/opl-family-purpose-first-current-design-audit.md docs/active/README.md
```

若后续触及 source/contracts/runtime/App behavior，再按 owner repo 跑：

- OPL: `rtk ./scripts/verify.sh` 或 focused `rtk npm run test:fast` / `rtk npm run test:meta`。
- App: `rtk npm run test:release-boundary`、`rtk npm run validate:agent-installation`、`rtk node --experimental-strip-types scripts/validate-active-shell.ts --quick`。
- MAS: `rtk ./scripts/verify.sh` 或 focused owner-route / domain-handler / product-entry tests。
- MAG: `rtk ./scripts/verify.sh`、`rtk make test-meta` 或 focused product-entry / authority tests。
- RCA: `rtk ./scripts/verify.sh`、`rtk npm run test:fast`、`rtk npm run typecheck` 或 focused route / contract tests。
- OMA: `rtk npm test` 或 `rtk npm run verify`。
- Shell: touched shell focused `vitest`、`bunx tsc --noEmit`、`bunx oxfmt --check`。
- OPL Doc: `rtk python3 -m pytest -q`、`rtk python3 scripts/opl_doc_doctor.py doctor .`。

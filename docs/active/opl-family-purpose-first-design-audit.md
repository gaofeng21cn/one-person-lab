# OPL 系列目的优先设计审计

Owner: `One Person Lab`
Purpose: `purpose_first_design_audit`
State: `active_audit`
Machine boundary: 本文是人读顶层设计审计和优化矩阵。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/release evidence 和真实 workspace evidence。
Date: `2026-06-01`

## 审计问题

本次审计从目标反推，而不是从现有模块反推：

- OPL 的目标是完整的 stage-led 智能体开发/运行框架。
- One Person Lab App 的目标是普通用户工作台和 Codex App wrapper。
- MAS / MAG / RCA / OMA 的目标是标准 OPL Foundry Agent。
- active shell 的目标是可替换 GUI implementation carrier。

因此判断标准不是“现有 surface 是否还能跑”，而是“如果从目标态重新设计，是否还需要这个层级、这个壳、这个读面、这个证据尾项，还是可以更直接地用 domain pack、OPL hosted runtime、domain authority receipt 和 App projection 达到目的”。

本次只做顶层设计审计和优化路线，不直接修改 sibling repo。当前 sibling repos 均有本地未提交或 ahead/behind 改动，跨仓写入必须由各 repo 自己的 active plan 或独立 lane 承接。

## Fresh 机器读数

审计时点 fresh OPL 读面如下：

- `./bin/opl agents conformance --family-defaults --json`：4 个标准 agent 全部 passed，0 个 structural blocker；production evidence tail 仍单独报告。
- `./bin/opl agents descriptors --json`：4 个 descriptor 全部 resolved，0 blocked；`functional_privatization_active_private_generic_residue_count=0`，但 full-detail private platform residue audit-only inventory 仍有 38 项，且 `physical_delete_authorized=false`。
- `./bin/opl framework readiness --family-defaults --json`：hard blocker 为 0，状态是 `framework_control_plane_available_with_blocked_refs_only_attention`；`stage_replay_missing_receipt_workorder_count=14`，`evidence_envelope_blocked_count=1781`，`domain_blocked_unique_typed_blocker_ref_count=319`，`workstream_operating_loop_goal_oracle_missing_count=25`。
- `./bin/opl runtime app-operator-drilldown --json`：25 个 stage attempt，338 个 operator action route，67 个 executable route；provider cadence / capability SLO satisfied；owner receipt / typed blocker summary 计数为 0，blocked envelope 仍为 1781；App release user-path、Codex App runtime evidence 和 OMA production consumption open gate 均为 0。
- `./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：open worklist 为 0，open safe action 为 0；但 blocked refs-only attention remains，14 个 stage replay missing receipt workorder 继续存在，其中 9 个是 human gate ref。

当前结论：结构统一已经成立，真实设计负担不再是“还有没有 OPL Framework”，而是“refs-only 证据和迁移壳太多，operator 下一步不够直达目标 delta”。

## 总体判断

如果从目的反推，当前 OPL 系列最需要优化的不是新增 runtime、中转入口层、workflow compiler、proof engine、App workbench 或 domain-local helper，而是减法：

1. 把默认读面从“所有 refs 都可见”收敛到“下一步必须由哪个 owner 产出什么 delta / receipt / typed blocker”。
2. 把 domain repo 内仍暂留的 product/status/workbench/domain-handler/lifecycle projection shell 继续压成 domain pack、authority function、handler target 和 refs-only return shape。
3. 把 stage replay / evidence envelope / owner payload 这些历史防错账本从默认 operator attention 中降噪，只保留 audit drilldown 和明确 owner action。
4. 把 App 的目标固定为 chat-first Codex wrapper 和 task entry，不让 AionUI upstream、candidate shell、AG-UI/CopilotKit、PilotDeck 或 release evidence 反向定义产品真相。
5. 把 OMA 保持为 target-agent builder / repair / takeover agent，不让它变成第二个 Agent Lab runner、promotion gate、registry owner 或跨 domain 兼容层。

## 设计负担分类

| 设计负担 | 现在为什么存在 | 从目标态看是否必要 | 优化方向 |
| --- | --- | --- | --- |
| Full-detail private platform residue inventory | 用来证明旧私有平台面已分类、可追踪、默认不行动 | 默认路径不必要，audit 时必要 | 保留 drilldown；默认只显示 action-required / blocker / physical-delete-ready 三个摘要。 |
| 大量 refs-only envelope / typed blocker attention | 防止 OPL 越权，把所有缺 owner evidence 的位置暴露出来 | 审计必要，用户/普通 operator 默认不需要逐条看 | 默认面按 owner / forced delta 聚合，raw envelope 留 full-detail。 |
| Stage replay missing receipt workorder | 证明 replay / human gate / owner receipt 缺口没有被假闭合 | 在 owner/human gate 真缺时必要，但不应像普通可执行工作项 | 只显示“等待 domain/human owner receipt 或 typed blocker”，不进入 safe action 或进度完成口径。 |
| Domain repo product/status/workbench shell | direct path、迁移期、domain handler target 和 refs-only adapter | 长期不作为标准 agent 组成 | replacement parity、no-active-caller、owner receipt/typed blocker、no-forbidden-write 后删除或 tombstone。 |
| App release / runtime evidence gate | 证明 App/user path 与 Codex App runtime 证据可读 | 对 release 必要，对 domain ready 不必要 | 保持 App-owned release gate；禁止外推为 OPL family production ready。 |
| Shell candidate / upstream implementation detail | 尝试更好的 GUI implementation | 产品 truth 不必要 | App repo 持有 product contract；shell 只实现、验证、可替换。 |
| OMA materializer scripts | 当前承担 agent-building pack / work-order materialization | 只在 authority function / materializer 边界必要 | 稳定策略迁回 `agent/`、`contracts/` 或 OPL primitive；脚本不得变 runner / promotion gate。 |

## 每仓审计

### one-person-lab

目标角色：OPL Framework / runtime / contracts / generated surfaces / App operator read model owner。

当前结构是正确的：Temporal-backed provider、typed queue、stage attempt ledger、evidence ledger、descriptor、conformance、App/operator drilldown 和 Agent Lab 都已形成 framework control plane。fresh conformance 和 descriptor 也证明 MAS/MAG/RCA/OMA structural layer 已统一。

真正多余的不是框架本身，而是默认 operator 面仍过度暴露审计噪音。当前 `open_worklist=0` 但 `blocked_refs_only_attention_remains=true`，同时 framework readiness 仍显示 1792 个 total operator attention tail。目标态下普通 operator 只应先看到三个问题：

- 当前有没有 OPL 可执行 safe action。
- 当前哪个 domain/human owner 欠 receipt、quality gate、human gate 或 typed blocker。
- 下一次必须产出 deliverable delta、owner receipt、quality gate receipt 还是 stop-loss typed blocker。

优化建议：

- 将 `goal_oracle_missing` 和 `next_forced_delta` 提升为默认 readiness 的首屏主语。
- 将 blocked refs-only envelope 默认折叠成 owner/stage/action group，只在 full-detail 展开 raw item。
- 保持 `zero_open_worklist_is_completion_claim=false` 等授权边界，不再把大量 audit counters 放在普通完成判断附近。
- 不再新增新的 diagnostic lens，除非它影响 launch safety、authority boundary、audit/replay/route-back 或 App/runtime 反复消费。

### med-autoscience

目标角色：医学研究 domain truth、publication quality gate、artifact/package authority、memory body/writeback decision、owner receipt 和 typed blocker owner。

MAS 已经完成目标源码形态大方向：`agent/` semantic pack、Foundry series pin、OPL hosted runtime owner、Progress-First closeout 和 artifact/memory/lifecycle refs-only handoff 都在位。当前仍复杂的地方是 MAS 为了避免 paper-line currentness / owner-chain 漂移，保留了大量 owner-route、study_progress、domain dispatch evidence、artifact lifecycle report 和 paper-facing read-model 逻辑。

从目的态看，MAS 不应继续承担通用 currentness / dispatcher / lifecycle apply 平台；这些逻辑只应保留为医学 owner decision、paper-line delta、AI reviewer/auditor record、artifact authority receipt 或 typed blocker 的生产者。

优化建议：

- 下一轮优先减少 read-model/currentness 循环，把每个 paper-line stage 的下一步固定成 `paper/artifact/reviewer delta` 或 `stable typed blocker`，避免再用 platform repair 消耗执行预算。
- `study_progress` 继续提供 MAS-owned semantic summary，但不得成为第二 runtime controller；OPL 只消费其 refs 和 closeout semantics。
- Artifact physical thinning handoff 已经变成 OPL generic lifecycle apply 输入，后续应由 OPL apply receipt 或 MAS artifact authority receipt 推进，不再在 MAS 内补通用 cleanup executor。
- 真实证据尾项应只认 paper-line owner receipt、AI reviewer/auditor record、memory writeback receipt、artifact lifecycle receipt、human gate/resume receipt、provider long-soak 或 no-forbidden-write refs。

### med-autogrant

目标角色：grant truth、fundability / quality / export verdict、package authority、grant strategy memory accept/reject、owner receipt 和 typed blocker owner。

MAG 结构层已对齐 OPL Foundry Agent，但 active docs 明确 product-entry、domain_handler、grouped CLI、projection、lifecycle、autonomy loop 和 status/user-loop shell 仍是 direct handler、refs-only adapter、native helper target 或 migration input。它们是当前迁移成本的主要来源。

从目的态看，MAG 的标准 agent 只需要 declarative grant pack、transition oracle、authority functions、domain handler target 和 owner receipt/typed blocker return shape。产品循环、状态 shell、lifecycle shell、default caller、workbench shell 都应由 OPL generated/hosted surface 承担。

优化建议：

- 将 `submission_ready_export_gate` 人工门继续作为唯一清晰 blocker，不用更多静态 descriptor 字段解释它。
- 对 grouped CLI / product-entry / sustained-consumption payload，只保留 direct path 和 refs-only owner payload response；一旦 App/default caller sustained consumption 和 owner roundtrip 证据稳定，删除兼容壳。
- 不再用 package existence、schema completeness、stage replay projection 或 OPL ledger verification 表达 grant readiness。
- physical cleanup / no-resurrection 的完成口径必须是 explicit MAG owner receipt 或 typed blocker + no-active-caller + no-forbidden-write，而不是 OPL descriptor ready。

### redcube-ai

目标角色：visual truth、communication strategy、visual direction、review/export verdict、artifact authority、visual memory accept/reject、owner receipt 和 typed blocker owner。

RCA 的复杂性主要来自视觉交付天然需要多 route：image-first、HTML、native PPTX、review/export gate、artifact gallery、workspace receipts、memory reuse 和 long-soak。这里不能用“减少 route”代替“减少平台残留”。真正应删的是 generic runtime/session/workbench/domain_action_adapter compatibility surface，而不是 RCA 的 visual pack discipline。

从目的态看，RCA 应保留 visual pack、route policy、review/export quality gates、artifact authority functions、native helper implementation 和 owner receipt；OPL 承担 generated shell、attempt ledger、workbench projection、review/repair transport 和 lifecycle shell。

优化建议：

- 继续保留 Kami 吸收后的 visual pack discipline，因为它服务 RCA 领域质量，不是平台噪音。
- 将 `runtimeWatch`、session continuity、operator evidence/stability projection 等保持 refs-only adapter，等 OPL App/workbench parity 后继续收薄。
- Production evidence tail 的下一步应是 repeated artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout、human review receipt 或 Temporal visual-stage long soak，不是再增加 naming/compat guard。
- 已退役 `managed` / session / domain_action_adapter 旧 alias 只能留 tombstone/provenance，不恢复为 active payload alias。

### opl-meta-agent

目标角色：target-agent builder / tester / repair / takeover agent，输出 developer work order、target capability candidate、mechanism proposal 或 typed blocker。

OMA 当前已经避免了 repo-owned generic runtime / generated shell / App shell，但 `scripts/` materializer、work-order builder、agent evidence takeover 和 stage-decomposition pack draft 仍有变成“第二 Agent Lab / 第二 promotion gate”的风险。

从目的态看，OMA 应只生成 agent-building semantics 和 target patch work order；Agent Lab、runtime、registry、promotion gate、worktree lifecycle、generated interfaces 和 App shell 都归 OPL。

优化建议：

- 将稳定的 script policy 迁回 `agent/`、`contracts/` 或 `runtime/authority_functions/`，脚本只作为 materializer/helper。
- `execute:external-work-order` 应保持薄委托到 OPL work-order execute，不吸收 worktree lifecycle / absorb / cleanup。
- 新 agent consumption evidence 应继续扩真实 target cohort，但不能把 scaffold pass、suite pass 或 generated interface ready 写成 default promotion。
- 独立 reviewer attempt 必须成为真实 patch-loop 证据的一部分，不能由同一上下文自审。

### one-person-lab-app

目标角色：普通用户 GUI product truth、release/updater/user-path evidence、App-owned contracts 和 active shell validation owner。

App repo 的目标已经从“通用 AionUI 多 backend 工作台”收敛为 Codex App wrapper：固定 Codex CLI executor，内置 MAS/MAG/RCA purpose entries，Runtime 页消费 OPL projection，release evidence 和 first-run policy 归 App。

从目的态看，App 不需要持有 OPL runtime truth、domain truth、quality verdict、artifact authority、memory body 或 owner receipt。App 的设计负担来自两个方向：一是 release/user-path evidence 容易被误读为 family production ready；二是 shell candidate / upstream pattern 容易反向定义产品。

优化建议：

- Runtime 页默认显示项目进展和下一步 owner action，而不是 full evidence ledger。
- App release evidence 继续 cohort-bound；draft/verified bundle 不能外推为 stable/latest promotion 或 family production ready。
- Agent installation path 已经 contract-backed，继续保持 MAS/MAG/RCA plugin-packaged skill entry，避免 duplicate bare skill mirrors。
- Candidate shell 只通过 App contract 和 validation gate 进入，不在 App docs 里复制 shell implementation roadmap。

### opl-aion-shell

目标角色：当前活跃 GUI shell implementation carrier，可替换。

`opl-aion-shell/AGENTS.md` 已明确 App product truth 归 `one-person-lab-app`，shell 负责 renderer/process/package/tests/upstream intake。当前 shell 工作树 behind 11 且有大量未提交 GUI / first-run / settings / runtime 页面改动，因此本次只读。

从目的态看，shell repo 不应拥有产品策略、runtime truth、model-selection policy、onboarding truth、domain route authority 或 release user docs。它只实现 App-owned contracts，并在 upstream AionUI 变化冲突时保持 App 行为。

优化建议：

- 所有 GUI 产品语义继续先写 App contracts，再由 shell 实现。
- Shell 内部可以保留 AionUI implementation APIs，但不能让 upstream model/backend/team/agent selector 成为 OPL ordinary user path。
- 如果 `agui-codex` 或其他 candidate 成熟，切换也应由 App repo shell adapter contract 和 release gate 决定，而不是 shell repo 自行升级为 product owner。

## 优先级建议

### P0：不再扩大抽象层

不要新增中转入口层、workflow compiler、proof assistant、second read-model authority、domain-local scheduler 或 App-owned runtime truth。现有 OPL/Temporal + stage pack + domain authority receipt 已足够表达目标态。

### P1：默认读面改成 owner-delta-first

将普通 operator 默认问题收敛为：

- 当前是否有 OPL 可执行 safe action。
- 当前等待哪个 owner。
- owner 需要给什么：deliverable delta、quality gate receipt、human gate receipt、owner receipt、no-regression ref 或 typed blocker。
- 这个等待是否阻断 domain ready / production ready。

blocked refs-only envelope、stage replay packet、private residue inventory 和 lifecycle detail 留给 full-detail audit。

### P2：domain repo 收薄只认四类保留物

每个 domain repo 最终只保留：

- declarative domain pack。
- machine-readable contracts。
- standard/minimal authority functions and native helper implementation。
- domain handler target / direct skill path / refs-only return shape。

其他 product/status/workbench/session/queue/lifecycle/projection shell 都要证明为何不能由 OPL generated/hosted surface 承担；证明不了就进入 deletion/tombstone lane。

### P3：真实 evidence tail 替代 accounting tail

下一轮跨仓推进不应再补更多 refs-only accounting，而应直接要求真实 owner evidence：

- MAS：paper-line owner receipt、AI reviewer/auditor record、memory/artifact/lifecycle receipt、human gate/resume receipt。
- MAG：submission human-gate receipt、grant-stage owner receipt/no-regression、sustained App consumption、Temporal long-soak。
- RCA：artifact-producing owner receipt、visual review/export receipt、visual memory reuse、workspace receipt scaleout、Temporal visual-stage long-soak。
- OMA：真实 target patch-loop、independent reviewer attempt、target owner receipt/typed blocker、Agent Lab re-evaluation。
- App：cohort-bound packaged route receipt、GUI smoke、first-run / runtime page evidence、release owner promotion decision。

## 不能写成

- Structural conformance passed 等于 production ready。
- `open_worklist=0` 等于完成、domain ready 或 production ready。
- App release/user-path verified refs 等于 App release-ready 或 family production ready。
- Provider SLO satisfied 等于 MAS paper closure、MAG submission-ready 或 RCA visual ready。
- Domain-owned typed blocker 已 verified 等于 success receipt。
- Full-detail private platform residue audit-only 等于 physical delete authorized。
- Shell implementation behavior 等于 App product authority。

## 执行方式

本审计不直接开跨仓重构。推荐执行顺序：

1. OPL 先收敛默认 readiness / App operator projection 的 owner-delta-first 输出。
2. 各 domain repo 按自己的 active gap plan 删除或收薄迁移壳，但只在 no-active-caller、replacement parity、owner receipt/typed blocker、no-forbidden-write、tombstone/provenance 成立后做物理删除。
3. App repo 继续把产品语义写入 contracts，再让 shell 实现；release evidence 和 candidate shell gate 不外推 domain/runtime readiness。
4. 每轮只把 durable current truth 折回对应 repo active plan；过程 proof、receipt id、命令流水和 dated closeout 进入 history、ledger 或 release artifact。

## 验证入口

本次审计使用的最小 live inputs：

```bash
./bin/opl agents conformance --family-defaults --json
./bin/opl agents descriptors --json
./bin/opl framework readiness --family-defaults --json
./bin/opl runtime app-operator-drilldown --json
./bin/opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
```

文档变更最小验证：

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs
```

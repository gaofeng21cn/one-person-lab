# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: 对照 OPL / Foundry Agents 理想目标态，记录 OPL、MAS、MAG、RCA、One Person Lab App 与 MDS 当前实际状态、差距和需要完善的部分。
State: `active_support`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace / App 证据。
Date: `2026-05-13`

## 结论

当前 family 已经完成“目标形态的控制面骨架”：`OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品认知成立，MAS/MAG/RCA 都能被 OPL 识别为 descriptor-level aligned 的 standard domain agent，三仓 stage plane 和 domain memory descriptor 也都能被 OPL 只读解析。

离理想情况的主要差距不是概念、命名或 descriptor，而是 production closure：

- OPL 本机 fresh runtime 仍是 `local_sqlite` provider ready，`full_online_ready=false`、`durable_online_ready=false`；这不能替代 production Temporal-backed online readiness。
- MAS/MAG/RCA 都是 `descriptor_aligned`，但三仓都仍是 `descriptor_aligned_physical_layout_pending`，每仓各有同一组 production closure gaps。
- 三仓 memory descriptor 均已 resolved，但 fresh read model 显示 retrieval apply、writeback apply 和 memory body migration 都仍为 `false`。
- Runtime snapshot 已有 stage-attempt workbench 和 attention queue 投影，但当前 fresh snapshot 里 stage attempt count 为 `0`；真实 long-running provider-hosted domain activity 仍未形成连续证据。
- One Person Lab App 目前是 OPL-branded AionUI shell / workbench fork，消费 OPL runtime truth；它还不是 domain truth owner，也不是 OPL runtime owner。
- MDS 当前只是 MAS 声明的 archive/reference/diagnostic/upstream-intake surface，不是 active Foundry Agent，不需要补成 OPL 同级 domain agent。

本文对照 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.zh-CN.md)。当前状态和比例判断仍以 [OPL 当前状态](../status.md)、[OPL 架构](../architecture.md)、[OPL Stage-Led Agent Framework Roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md) 与 [OPL 生产级框架闭环差距矩阵](./production-framework-closure-gap-matrix.zh-CN.md) 为准。

## Fresh Evidence 2026-05-13

本次文档使用以下 fresh checks：

| surface | fresh result | 读法 |
| --- | --- | --- |
| `git status --short` | OPL、MAS、MAG、RCA、OPL App、MDS 均无输出，且均在 `main` | 当前 gap 文档基于 clean main 状态，不吸收未提交工作区改动。 |
| `node dist/cli.js agents list --json` | `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_audit_pending_count=3`、`production_closure_gap_count=15` | 三仓 descriptor 已对齐；物理 skeleton 和 production closure 仍未闭合。 |
| `node dist/cli.js stages list --json` | `resolved_planes_count=3`、`stages_count=18`；MAS/MAG/RCA 各 6 个 stage | Stage control plane 已成为 OPL 可读 surface。 |
| `node dist/cli.js domain-memory list --json` | `resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0` | Memory locator/descriptor 已对齐；真实 retrieval/writeback/body migration 仍由 domain owner 后续闭合。 |
| `node dist/cli.js family-runtime status --json` | `configured_provider=local_sqlite`、`provider_ready=true`、`full_online_ready=false`、`durable_online_ready=false`、`stage_attempts.total=0` | 当前本机 provider 是 dev/offline ledger ready，不是 production online ready。 |
| `node dist/cli.js runtime snapshot --json` | `attention_items=3`、`running_items=0`、`stage_attempt_workbench.attempt_count=0`、`daemon_policy.local_daemon_added=false` | Workbench 投影存在；当前没有活跃 stage attempt；OPL 没有新增本地 daemon。 |
| `node dist/cli.js agents descriptors --json` | 当前返回 Codex CLI help / unexpected argument | 统一 domain-agent descriptor 总入口不能作为当前可用命令引用；仍以 `agents list`、`stages list`、`domain-memory list` 等专题 read model 为准。 |

## 总体差距矩阵

| 维度 | 理想情况 | 当前实际 | 差距 | 要完善的部分 |
| --- | --- | --- | --- | --- |
| OPL Framework | 完整生产级智能体开发与运行框架，支撑长期在线、stage attempt、状态、记忆、文件生命周期、恢复和审计 | 控制面骨架、shared contracts、Temporal provider code、local queue/attempt ledger、native helper、runtime snapshot、stage/domain-memory discovery 已落地 | Production online readiness 和真实 domain owner receipt chain 未闭合 | 完成 production Temporal provider residency、真实 Codex/domain activity soak、owner receipt envelope、memory/lifecycle apply receipt、cross-repo closeout gate |
| Stage-led 模型 | 每个 domain stage 有输入、prompt、skill、knowledge、tool、quality gate、handoff 与 closeout | 三仓 18 个 stage plane 可读，descriptor ready | Stage 仍主要是 descriptor/projection；真实 provider-hosted stage execution 证据不足 | 用 MAS 真实 paper line、MAG grant controlled attempt、RCA visual controlled attempt 跑出 owner receipt / typed blocker / no-regression evidence |
| Agent executor | `Codex CLI` 为默认最小执行器，其他 executor 显式 adapter 接入并可审计 | 默认 Codex 口径已收口；Hermes/Claude 只作为显式 opt-in adapter/proof lane | 非默认 executor 不承诺行为等价；真实长时 Codex runner production soak 未完成 | 继续保留 non-equivalence notice；优先证明 Codex CLI long-running activity、heartbeat、typed closeout 和 domain receipt |
| Domain skeleton | MAS/MAG/RCA 使用统一 `agent/ contracts/ runtime/ docs/` repo-source 边界，runtime artifacts 不进开发仓 | 三仓 manifest/descriptor 声明 aligned；artifact locator surface declared | `physical_skeleton_audit_pending_count=3`；物理目录重组仍未完成 | 做 path compatibility audit、direct skill parity、OPL-hosted parity、restore/provenance proof、no-forbidden artifact proof，再逐仓物理迁移 |
| Domain memory | OPL 只持 locator / refs / receipts；domain 持有正文、接受/拒绝、route/quality truth | 三仓 memory descriptor resolved；MAS 有 publication-route memory workspace apply closure；MAG/RCA 有 proof contract | Fresh read model 中 retrieval/writeback/body migration 仍为 false；真实 receipt 实例不足 | 三仓产出真实 consumed/writeback accepted/rejected receipt；OPL/App 做 ref-only grouping；memory body 始终留在 workspace/runtime owner |
| File lifecycle | OPL 持 workspace/artifact locator、retention、cleanup、restore proof、migration ledger；产物在 workspace/runtime root | OPL lifecycle schema / locator 和 domain proof surface 已存在；MAG/RCA/MAS 都声明 guarded apply proof 或 locator | 跨三仓真实 cleanup/restore/retention guarded apply 仍缺生产证据 | 用 domain-owned receipt 或 typed blocker 证明 artifact mutation；OPL 只写 framework-owned ledger/locator |
| App / Workbench | 用户可以看见 Agent、workspace、stage、progress、artifact、human gate、attention queue，并能按 owner 路由 action | OPL App 是 OPL fork of AionUI；runtime snapshot 有 attention queue 和 stage-attempt workbench；Aion workbench 已有五轴 visibility | 当前 fresh snapshot 无 active attempt；App 仍需真实 domain/stage/blocker/memory drilldown 与 production evidence polish | 对接真实 provider/domain receipt；按 domain/stage/memory refs 分组；保持 App 不写 domain truth |
| Legacy retirement | Hermes-first/Gateway/frontdoor/local-manager/MDS-default 退出 active/default path | 默认语义已退役，保留项多为 adapter/provenance/diagnostic/fixture/history | 物理残留仍需 no-active-caller proof 后清理 | 逐项删除或迁入 history/tombstone；保留项必须标明 explicit adapter / diagnostic / fixture / provenance |

## OPL Framework 当前差距

### 已经成立

- 产品认知固定为 `OPL Framework -> One Person Lab App -> Foundry Agents`。
- `OPL` 已持有 family-level shared contracts、action catalog、stage control plane、runtime supervision、persistence/lifecycle/owner-route、domain memory ref/writeback 和 standard domain-agent skeleton contract。
- Runtime Manager 是 provider-backed 产品控制面，不是 domain runtime kernel。
- Native helper 已可用，本机 runtime manager 读模型显示 helper 来自 state cache，native state index freshness 为 fresh。
- `runtime snapshot` 已能投影 attention items、stage-attempt workbench、daemon policy 和 non-goals；fresh snapshot 显示 `local_daemon_added=false`。

### 主要差距

- Fresh `family-runtime status` 当前选中 `local_sqlite`，只能代表 dev/CI/offline ledger ready；production ideal 要求 Temporal-backed provider 长期 ready。
- Stage attempt 当前 fresh total 为 0；这不能证明真实长时间 online stage execution。
- `agents descriptors` 总入口尚未成为可调用命令；维护者仍需拼 `agents list`、`stages list`、`domain-memory list`、`actions` 等专题入口。
- Production closure 还缺真实 provider-hosted guarded apply、owner receipt chain、domain memory/lifecycle apply 泛化和旧面物理退役。

### 需要完善

1. Provider readiness：把 Temporal service/worker install、repair、status、restart/re-query、query/signal/history 和 operator repair 做成持续可验收的 production residency。
2. Stage execution：让 provider-backed attempt 能真实启动 Codex/domain activity，留下 heartbeat、checkpoint、typed closeout、owner receipt 或 typed blocker。
3. Unified read model：补齐稳定可调用的 domain-agent descriptor 总入口，聚合 entry、skeleton、stage、action、memory、skill、runtime/session/progress/artifact refs 与 authority boundary。
4. Closeout gate：把 owner receipt / typed blocker / no-regression evidence 做成跨仓生产闭环门禁。
5. Legacy cleanup：在 no-active-caller proof 后删除 active-path residue 或迁入 history/tombstone。

## MAS 当前差距

### 已经成立

- MAS 是活跃 `Research Foundry` / 医学研究 Foundry Agent，也是 OPL-compatible package。
- MAS 已完成 MDS default dependency 退役；MDS 只保留 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle reference。
- MAS product-entry manifest 已暴露 product positioning、family action catalog、family stage control plane、domain memory descriptor、provider runtime residency read model、guarded soak read model、legacy residue audit 和 standard domain-agent skeleton descriptor。
- Stage-Led Autonomy 已是 repo surface：stage knowledge packet、stage memory closeout packet、memory write router receipt、stage recall index、typed closeout routing、Progress/Portal visibility 和 route materialization guard 已落地。
- MAS 真实三篇 paper line 已有 read-only OPL-ingestable proof：DM002 -> `ai_reviewer_re_eval`，DM003 / Obesity -> `artifact_delta`，且 `writes_performed=false`。

### 主要差距

- MAS 仍不能声明 OPL production-hosted paper automation 已闭合。
- 真实 provider-hosted live guarded apply soak 尚未跑出连续 MAS owner chain。
- Human gate / resume 进入 MAS owner route 的运行证明仍不足。
- Publication-route memory 还需要更多真实 paper-line accepted/rejected writeback receipts。
- Legacy compatibility residue 虽有 tombstone/no-active-default-caller proof，物理删除仍需逐项执行。

### 需要完善

1. 用 DM002、DM003、Obesity 继续跑 provider-hosted guarded apply，结果可以是 artifact delta、AI reviewer update、route decision、human gate、stop-loss 或 typed blocker。
2. 每条真实 paper line 留下 attempt query、typed closeout、MAS owner receipt、progress delta / blocker 和 no-forbidden-write proof。
3. 扩展 publication-route memory 的真实 accepted/rejected receipts，保持 memory body 和 accept/reject authority 在 MAS workspace/runtime root。
4. 把 stage review locator proof 与 Portal/Workbench read-only 展示接到 production provider-hosted live apply。
5. 在 replacement proof 和 no-active-reference proof 后，物理清理旧 compatibility residue。

## MAG 当前差距

### 已经成立

- MAG 是活跃 `Grant Foundry` / medical grant domain agent，也是 OPL-compatible package。
- 单一 MAG app skill、CLI、MedAutoGrantDomainEntry、product-entry/projection commands 与 schema-backed contract 是当前默认 capability surface。
- MAG 已暴露 6-stage grant control plane、family action catalog、runtime_control、runtime_continuity、product sidecar export/dispatch、OPL stage runtime registration 和 standard domain-agent skeleton。
- MAG 已完成 owner receipt contract generalization、controlled domain-memory accepted/rejected fixture proof、lifecycle cleanup/restore/retention guarded apply proof、physical skeleton minimum anchors 和 no-forbidden-write projection。

### 主要差距

- `controlled_soak_no_regression_attempt` 仍是 `deferred_typed_blocker`；真实 OPL-hosted controlled grant-stage attempt 尚未产出 MAG domain owner receipt 或 no-regression evidence。
- 当前 accepted/rejected receipt 主要是 shape proof，不是真实 workspace/runtime receipt instance。
- Grant strategy memory 的 migration/readiness 是 descriptor 或 proof contract 层，真实 memory body / writeback apply 泛化未闭合。
- 更大范围 source path 迁移和 legacy active-path 删除仍需 path compatibility 与 no-active-caller proof。

### 需要完善

1. 让真实 OPL-hosted controlled grant-stage attempt 经 MAG sidecar / direct entry 产出 domain receipt、typed blocker 或 no-regression evidence。
2. 把 controlled memory proof 推进到真实 workspace/runtime accepted/rejected receipt instance。
3. 对 cleanup/restore/retention guarded apply 做真实 workspace 级 receipt proof。
4. 在 direct skill path 和 OPL-hosted path parity 稳定后，推进 physical skeleton 物理迁移。
5. 清理旧 Hermes/Gateway/local-manager 命名和 legacy manager 入口，保留项迁入 explicit proof/provenance/history。

## RCA 当前差距

### 已经成立

- RCA / RedCube AI 是活跃 `Presentation Foundry` / visual-deliverable Foundry Agent，也是 OPL-compatible package。
- Direct route 已 landed；OPL-hosted route 是 contract/projection landed，但 production provider soak pending。
- `ppt_deck` 与 `xiaohongshu` image-first 是当前默认视觉路线，HTML/native PPTX 是显式可选路线。
- RCA 已暴露 family action catalog、stage control projection、route equivalence、product sidecar export/dispatch、OPL runtime manager registration、standard skeleton、artifact locator contract、domain memory descriptor、controlled visual stage attempt、controlled memory apply proof、domain owner receipt contract、lifecycle guarded apply proof 和 physical skeleton follow-through。
- RCA 已把 review helper 1154 行既有 line-budget 债登记为 reviewed baseline，并阻止继续增长。

### 主要差距

- RCA 还不能声明 Temporal-backed production execution 或 OPL-hosted controlled visual stage soak 已完成。
- `controlled_soak_no_regression_attempt` 仍是 deferred typed blocker，缺真实 RCA owner receipt 或 no-regression evidence。
- 真实 reusable visual lesson body 写入、真实 accepted/rejected runtime receipt instance 和真实 artifact-producing owner receipt 仍未跑出。
- Review helper baseline 仍需按 screenshot capture、geometry audit、markdown report、summary projection 拆分。

### 需要完善

1. 跑真实 OPL-hosted controlled visual stage attempt，让 RCA 返回 domain receipt、artifact-producing owner receipt、typed blocker 或 no-regression evidence。
2. 把 visual pattern memory 从 descriptor/proof 推进到真实 runtime receipt refs，同时继续禁止 repo 保存 memory body 或 artifact blob。
3. 对 lifecycle cleanup/restore/retention 做真实 visual workspace guarded apply proof。
4. 拆分 `python/redcube_ai/native_helpers/ppt_deck/review.py` 的 reviewed baseline，删除 line-budget 例外。
5. 在 no-active-caller proof 后，继续清理旧 Hermes/Gateway/local-manager history residue。

## One Person Lab App 当前差距

### 已经成立

- 当前 App 仓是 `opl-aion-shell`，也就是 OPL fork of AionUI；OPL product mainline 是 `gaofeng/main`，upstream `origin/main` 只作为 AionUI sync source。
- App 作为 OPL-branded GUI shell，消费 Codex-default session/runtime truth、OPL runtime snapshot、stage-attempt workbench 和 domain-owned projection。
- OPL 主仓状态已明确 App 预编译包由 `opl-aion-shell` 构建，OPL 一键安装负责打开已安装 App 或下载匹配 release DMG。
- App / workbench 已有 provider completion、domain ready verdict、human gate、dead letter、rejected writeback 等 operator 状态轴的实现方向。

### 主要差距

- App 不是 runtime owner，也不是 domain truth owner；它不能替代 OPL Framework 或 MAS/MAG/RCA。
- 当前 fresh runtime snapshot 没有活跃 attempt，App 还缺真实生产运行状态下的 domain/stage/blocker/memory/artifact drilldown 证据。
- App 仓仍是 fork overlay，需要持续处理 upstream AionUI intake 与 OPL-specific overlay 边界。
- 如果界面展示 provider completion、domain ready verdict、quality verdict 或 artifact authority，需要持续防止文案越权。

### 需要完善

1. 用真实 provider/domain receipts 驱动 App drilldown，而不是只展示 fixture / empty workbench。
2. 按 domain、stage、blocker、memory refs 和 artifact locator 分组，让普通用户看见“谁负责、卡在哪里、能做什么”。
3. 所有 action button 必须路由到明确 owner：OPL CLI / provider signal / domain sidecar / direct skill。
4. 继续维护 OPL fork boundary：upstream AionUI 变化只通过显式 intake 分支吸收，OPL overlay 保持薄而清晰。
5. App 文案和状态轴持续避免把 provider completion 写成 domain ready verdict。

## MDS 当前差距

### 已经成立

- MDS 当前定位是 MAS/MDS 分层后的 frozen source archive、historical fixture、explicit legacy diagnostic target 与 upstream intake reference。
- MDS 不再是 MAS 默认 runtime backend、default diagnostic dependency、WebUI dependency 或独立 product entry。
- MDS 不作为 OPL active domain agent、默认安装依赖或 stage adapter。
- MDS 仍可作为 source provenance、historical fixture、explicit archive import、backend audit 或 parity oracle reference 被 MAS 显式读取。

### 主要差距

- MDS 不需要补成理想 Foundry Agent；它与理想目标态的差距不是“缺少 OPL skeleton”，而是“历史兼容面还需要继续收缩”。
- MDS daemon、WebUI、quest layout、connector docs、`ds` launcher、runtime home、fork-local runner 和兼容 namespace 仍作为 archive/diagnostic/fixture surface 存在。
- 物理删除必须等待 MAS source provenance、behavior fixture、explicit restore/import 或 upstream intake 替代面闭合。

### 需要完善

1. 保持 MDS archive/reference/diagnostic/upstream-intake 定位，不把它列为 OPL Foundry Agent。
2. 对每个旧兼容面标明 provenance、diagnostic、fixture 或 upstream-intake 用途。
3. 等 MAS 已有 replacement proof 后，再逐项删除或迁入 history/tombstone。
4. 保持 MDS 较早 shared pin 只作为 legacy diagnostic / archive reference，不作为 active OPL adapter 要求。

## 优先完善顺序

当前不建议再新建平行总计划。下一步应按下面顺序收口：

1. `OPL production provider readiness`
   完成 Temporal production residency、worker lifecycle、query/signal/history、restart/re-query、operator repair 和 production proof receipt。
2. `MAS paper-line provider-hosted guarded apply`
   以三篇真实 paper line 为主验收，产出 MAS owner receipt、progress delta、human gate、stop-loss 或 typed blocker。
3. `Owner receipt / typed blocker envelope`
   把 MAS/MAG/RCA 的 owner receipt、typed blocker、no-regression evidence 收敛成统一 OPL closeout gate。
4. `Domain memory and lifecycle apply`
   三仓都产出真实 consumed/writeback accepted/rejected receipt 和 cleanup/restore/retention guarded apply receipt。
5. `OPL App operator drilldown`
   用真实 receipts 做 domain/stage/memory/artifact drilldown，明确 action owner。
6. `Physical skeleton follow-through`
   在 direct/hosted parity、restore/provenance proof、focused tests 和 no-forbidden-write proof 都成立后，逐仓迁移 repo-source skeleton。
7. `Legacy physical retirement`
   对 Hermes/Gateway/frontdoor/local-manager/MDS-default residue 做 no-active-caller proof，再删除或归档。
8. `New Foundry Agent admission`
   Patent/Award/Thesis/Review 只按 standard skeleton、stage descriptor、memory locator、artifact locator、quality gate 和 authority boundary 接入，不复制旧路线。

## 当前不能写成

- 不能写成 OPL 已经全量生产可用。
- 不能写成 `local_sqlite ready` 等于 production online ready。
- 不能写成 MAS/MAG/RCA descriptor aligned 等于 physical skeleton layout 已完成。
- 不能写成 provider completion 等于 domain ready / publication-ready / fundability-ready / visual-ready。
- 不能写成 OPL 持有 MAS study truth、MAG grant truth、RCA visual truth 或 MDS archive truth。
- 不能写成 MDS 是新的 OPL Foundry Agent。
- 不能写成 One Person Lab App 是 OPL runtime owner 或 domain truth owner。

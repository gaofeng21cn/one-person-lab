# OPL 当前开发线路

Status: `active_support`
Owner: `One Person Lab`
Purpose: 在 OPL 已定位为 stage-led、以 Agent executor 为最小执行单位的完整智能体框架之后，给出当前 framework-first 的内容级开发线路。
Machine boundary: 本文是人读执行地图。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / app evidence。

## 当前结论

OPL 当前开发仍按 framework-first 执行。最近一轮 functional closeout 已经证明 MAS/MAG/RCA 都能进入 OPL task-bound stage attempt / typed closeout ledger；下一轮 production 验收仍以 MAS 真实论文 owner chain 为主，MAG/RCA 的 grant/visual long soak 继续后移，但它们的 descriptor、index、direct skill parity 和 sidecar receipt ingestion 不得退化。

2026-05-14 functional closure 更新：真实论文、基金和视觉交付的长时 soak 继续作为 production evidence gate，不把它们伪装成短期文档或单测可以关闭的事项；排除这类耗时验证后的功能性缺口已经由一次性并行计划推进并吸收到当前矩阵。统一 active owner 现在是 `docs/active/production-framework-closure-gap-matrix.md`；后续新 worktree 不应再新增平行总计划，而应直接围绕矩阵里的 provider readiness/operator SLO、owner receipt、MAS guarded-apply owner chain、typed closeout memory refs、manifest timeout fail-closed、generic transition runner / domain transition owner-receipt evidence、domain memory/lifecycle apply、physical skeleton follow-through、legacy active-path retirement、operator workbench drilldown 和 cross-repo production closeout gate 产出验证、receipt 或 typed blocker。

2026-05-15 当前校准：framework control plane、shared contracts、local queue / attempt ledger、Temporal provider code、typed closeout gate、MAS/MAG/RCA task-bound attempt bridge、typed closeout memory-ref summary、provider continuous proof projection、latest production proof persistence、runtime tray provider proof operator item、stage-attempt operator item、manifest timeout fail-closed、domain skeleton discovery、stage plane discovery、domain-memory descriptor index、unified domain-agent descriptor、MAG transition oracle ingestion / matrix smoke、runtime snapshot 和 Aion stage-attempt workbench 已经落地到可读/可测 surface。fresh `./bin/opl` run 显示 `agents list --json` 为 `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`；`stages list --json` 为 `resolved_planes_count=3`、`stages_count=18`；`domain-memory list --json` 为 `resolved_memory_descriptor_count=3`、`missing_memory_descriptor_count=0`、`runtime_receipt_evidence.closeout_count=18`；`agents descriptors --json` 是新的统一总入口，用同一 read model 聚合 entry、skeleton、stage、action、memory、skill、runtime/session/progress/artifact refs、grant transition oracle ingestion 与 authority boundary，并同样暴露 physical skeleton evidence observed / pending summary。这说明 MAS/MAG/RCA 的 descriptor-level migration 已经完成，且维护者不再需要在多个子入口之间拼接一个 domain agent 的整体状态。agents 读模型现在已拆出 `descriptor_readiness`、`physical_skeleton_layout_audit`、`physical_skeleton_evidence` 和 `production_closure_gaps`，physical skeleton anchor evidence refs / gap projection 已经成为 OPL 侧可读 surface；MAG `grant_transition_oracle` 已可被 OPL descriptor / matrix runner 只读消费；当前 MAS/MAG/RCA 均已有 repo-source anchor evidence。OPL 仍只读聚合 refs，不执行 domain repo 物理迁移，不写 domain truth。Production closeout gate 现在会汇总 stage typed closeout 的 consumed/writeback/rejected memory refs，从 runtime ledger 读取 Temporal production proof receipt，并对 stalled domain manifest command fail-closed；`family-runtime intake/tick --hydrate` 能从 active workspace binding 派生 MAS sidecar export command，并自动携带 latest persisted Temporal proof；runtime snapshot 会把 stage attempt 派生成 operator item，带 controlled apply refs、artifact locator / restore proof、memory refs、writeback receipt refs、transition bridge owner receipt / no-regression evidence / typed blocker refs 和 rejected writes；manifest timeout 只代表 read-model availability blocker。operator closeout 已返回 `functional_closure_ready_for_live_soak`，stage attempt ledger 为 `total=18`、`completed=18`，其中 MAS 有 6 条 guarded-apply closeout refs，最新 DM002 run 已观测到 MAS owner stable blocker receipt；这仍不是 paper closure 或 publication quality verdict，也不是 MAG grant-stage production soak。

同一轮 fresh MAS read-only closeout projection 已覆盖三篇真实 paper line：DM002 -> `ai_reviewer_re_eval`，DM003 -> `artifact_delta`，Obesity -> `artifact_delta`；三篇均为 `writes_performed=false`，且 closeout packet 明确 OPL 禁止写 `publication_eval/latest.json`、`controller_decisions/latest.json`、`current_package`、publication quality verdict 和 memory body。DM002 还带回 `publication_route_memory_seed__negative_result_stoploss` consumed memory ref 与两个 MAS-owned writeback receipt refs。这已经满足“OPL 可消费 MAS owner refs 的 read-only paper-line proof”，但仍不是 production provider-hosted guarded apply。

真实 Temporal residency 现在拆成两个明确口径：`--live` 是 repo-native Temporal test server + real worker proof，`--production` 是外部 Temporal service / managed worker proof，后者在未配置、不可达或 worker 未 ready 时 fail-closed。2026-05-14 fresh 本机 managed Temporal service / worker 已 ready，显式 Temporal provider view 为 `full_online_ready=true`、`durable_online_ready=true`，`--production` proof 返回 `production_residency_proven`，production closeout 已读到 `provider_continuous_proof.continuous_proof_status=all_observed_proofs_proven`，runtime snapshot 已把 provider proof 投影成 operator attention/recent item，latest proof 已持久化到 OPL state 并被 MAS binding-derived hydrate 使用。仍应等待 MAS owner-chain 成熟后再做的是长时 Codex/domain activity soak、guarded apply provider attempt、memory body apply receipt、周期性 provider SLO evidence、物理 skeleton 重组和旧面物理删除。

2026-05-15 live provider-chain 二次更新：OPL family runtime 已补齐 domain export source-fingerprint rehydrate，并在 MAS owner blocker 投影落地后重新跑通同一 task。MAS sidecar export 的 DM002 guarded-apply task 产生 `source_fingerprint=a0cdbf341fae623d`，source ref 包含 `studies/002-early-residual-risk/artifacts/controller_decisions/latest.json`，content sha256 为 `afacdd922c4db4a6c92556754f1a6baea196162ec567d16b8e11f054f18a9db3`；`family-runtime tick --hydrate --limit 10` 对同一 task `frt_54187384a4fa403abda12ce5` 生成 stage attempt `sat_df08b839ce33a33ee92974f2` / workflow `wf_ed74c076d08db7c23570f605`，provider run completed，并 ingest MAS owner receipt `artifacts/runtime/opl_family_sidecar/dispatch_receipts/e97b1c8cd25f3a019f90.json`。route impact 为 `applied` / `mas_owner_apply_receipt_observed`，`provider_attempt_state=mas_owner_receipt_present`，`typed_blocker_count=0`，`writes_performed=false`，`forbidden_write_guard_result=fail_closed_no_forbidden_writes`。这个 owner receipt 的 domain result 是 `medical_paper_readiness_missing` 的 `stable_blocker`，不是 paper closure、publication quality 或 submission readiness。

本轮 Lane F 与 Lane E 的 OPL 侧 operator closeout 只负责文档、public/help wording、residue scan 与 no-default-caller guardrail；不触碰 OPL production runtime core。当前 active path 仍是 `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime when durable orchestration is needed -> selected domain-agent entry`。目标是让旧 Hermes/Gateway/frontdoor/local-manager/default-compat surface 退出 active/default path，只保留 provenance、diagnostic、history、fixture 和负向 guard 语境。

当前顺序是：

1. 先把 OPL 做成完整智能体框架：stage attempt、provider runtime、typed queue、wakeup、retry/dead-letter、approval/human gate、receipt/projection、shared lifecycle/index primitive。
2. 立刻用 MAS 的真实论文线验证这个框架：OPL queue 已能把 guarded-apply task 绑定到 stage attempt；三篇 active paper line 先做 read-only closeout projection，再由 MAS owner gate 决定 live guarded apply；有效结果可以是 artifact delta、publication gate replay、AI reviewer update、route decision、human gate、stop-loss 或 typed blocker。
3. 再把 MAS/MAG/RCA 迁移为 OPL-admitted domain agents：统一 skeleton、stage descriptor、sidecar export/dispatch、owner receipt、artifact locator、projection builder、authority refs，并保持 direct skill path 等价。MAG/RCA 本轮只保持 descriptor/index 不回退。
4. 同步把新旧功能逐块分类、迁移、分层或沉淀：domain truth 留在 domain；framework-generic lifecycle/index/restore/retention、state-machine runner、transition matrix runner、operator workbench shell 和 provider SLO 执行证据上收到 OPL；local diagnostics 和 evidence surfaces 显式降级。
5. 旧 Hermes/Gateway/frontdoor/local-manager/default-compat wording 和重复 UI / runtime 入口，在替代证据与 no-default-caller 扫描通过后立刻退役清理；直接删除或迁入 tombstone，不保留兼容入口。

这里的“最后测试”指真实 provider/domain/app 验收。每个代码、contract、provider、projection 或 cleanup 步骤仍必须跑对应 focused tests 和 repo-native verification。

结构质量 gate 现在按执行层级拆分语义。`sentrux gate .` 的 baseline drift 是 advisory：它仍应输出 OPL quality details 供排查，但不会单独让结构 lane 失败。line budget 和显式 `sentrux check .` rules 仍是 blocking。文档和状态更新必须保留这个分层，不能把所有 Sentrux 输出都写成同一种失败。

## 内容线路

| 顺序 | 线路 | 当前 owner | 当前实际要做 |
| --- | --- | --- | --- |
| `1` | `opl_framework_foundation` | OPL roadmap + Runtime Manager / provider contracts | 完成 Temporal/provider readiness、stage attempt ledger、workflow/activity/signal/query、typed queue、retry/dead-letter、human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `2` | `mas_paper_autonomy_acceptance` | OPL provider + MAS owner surfaces | 当前主验收线。三篇 MAS 真实 paper line 已有 read-only typed closeout projection：DM002 为 `ai_reviewer_re_eval`，DM003/Obesity 为 `artifact_delta`，且 OPL 禁止写 MAS truth 的边界可见；OPL queue 已为 MAS `paper_autonomy/guarded-apply` 建立 task-bound provider-backed stage attempt，并已证明 source-fingerprint aware rehydrate 可在同一 dedupe key 下重新创建 provider attempt、ingest MAS source-keyed dispatch receipt。最新证据是 DM002 task `frt_54187384a4fa403abda12ce5` -> attempt `sat_df08b839ce33a33ee92974f2` -> receipt `artifacts/runtime/opl_family_sidecar/dispatch_receipts/e97b1c8cd25f3a019f90.json`，结果是 MAS owner `stable_blocker` receipt observed。下一步是把这个 owner receipt chain scale out 到 DM002/DM003/Obesity，并争取 progress delta、human gate、stop-loss 或稳定 blocker，而不是把 stable blocker 写成论文完成。 |
| `3` | `domain_framework_migration` | OPL + MAS/MAG/RCA domain repos | descriptor / manifest 层已经三仓 aligned；`opl agents descriptors` 现在是维护者总入口，`opl agents inspect`、`opl stages`、`opl actions`、`opl domain-memory` 是专题 drilldown；OPL agents 读模型已暴露 physical skeleton evidence refs / gap projection，当前 MAS/MAG/RCA 均 observed。MAG/RCA 已有 live task-bound sidecar receipt ingestion；MAG `grant_transition_oracle` 已能被 OPL ingestion adapter 转成 generic transition spec / matrix cases。MAS transition descriptor locator 已与 MAS `study-state-matrix` 对齐：完整 `family_transition_spec` / `family_transition_matrix_cases` 只由 `study-state-matrix` 物化，sidecar / product-entry manifest 只挂 descriptor。下一步是 MAG oracle provider attempt bridge、path compatibility audit、direct skill path 与 OPL-hosted path 的持续同源 owner receipt 证明，以及 MAS/MAG/RCA 真实 provider-hosted transition owner receipt / typed blocker / no-regression evidence 对账。workspace/runtime receipt parity 和 provider-hosted owner-chain soak 仍属于 production closure。 |
| `4` | `feature_partition_and_retirement` | OPL active docs + domain owner docs | 把 framework-generic 能力上收到 OPL，把 domain-specific truth 留在 domain；当前 OPL 应继续承接 generic state-machine runner、transition matrix runner、memory/artifact/lifecycle transport、operator SLO 和 App/workbench shell；通过 no-default-caller evidence 退役 Hermes/Gateway/frontdoor/local-manager/MDS-default 等 active-path residue；已证明无 active caller 的代码、接口和测试直接删除或迁入 history/tombstone，不保留兼容入口。 |
| `5` | `opl_app_runtime_workbench` | OPL App / Runtime Manager | 展示 provider readiness、provider proof operator item、stage-attempt operator item、domain status、human gate、action receipt、artifact refs 和 source refs；不重写 domain truth；stage-attempt workbench 当前已提供只读分组、过滤键、attention counters、controlled apply refs、artifact locator / restore proof、memory-ref counters 和 transition bridge evidence refs-only drilldown，供 App 面板筛选。 |
| `6` | `domain_soak_and_acceptance` | Domain repos + OPL provider | MAS 先完成真实论文线 read-only / guarded apply 证据；MAG/RCA 之后再做 controlled grant / visual stage attempt 泛化证明。 |
| `7` | `new_domain_admission` | OPL domain admission + candidate domain repos | 新 domain 只按 skeleton/descriptor/locator/authority boundary 接入，不复制旧 gateway/frontdoor 路线。 |

## 合并与退役规则

| 内容类型 | 归属 |
| --- | --- |
| stage attempt、provider runtime、queue、signal/query、retry/dead-letter、approval transport | OPL framework / Runtime Manager |
| lifecycle ledger、artifact locator/index、retention、restore proof、migration ledger、workspace lifecycle metadata | OPL framework primitive |
| MAS study truth、publication gate、evidence/review ledger、manuscript/package authority | MAS |
| MAG grant strategy、fundability / proposal quality、specific aims authority | MAG |
| RCA visual direction、creative artifact generation、review/export gate | RCA |
| old gateway/frontdoor/Hermes-first/local-manager default wording | replacement proof 与 no-default-caller scan 通过后删除或迁入 history/tombstone；不保留 active compatibility entrypoint |
| external framework learning | references only until promoted into contracts/source/active owner docs |

## 优先级规则

1. Framework-first：OPL 完整智能体框架是 domain migration 和真实 domain soak 的前置条件。
2. 迁移优先于验收：真实 soak 应验证迁移后的目标形态，不应验证即将退役的旧路径。
3. 清理是迁移收口：旧默认路径不应无限期保留；一旦有 no-active-caller 与 replacement evidence，就删除模块/接口/测试或迁入 history/tombstone，不保留兼容路径。
4. App workbench 跟随 framework：App 展示 framework/provider + domain owner receipts 和只读 stage-attempt 分组/过滤元数据；不成为第二 truth source，也不成为 domain action loop。
5. Domain authority 不迁出：OPL 可以持有 refs、receipts、attempt history、projection 和 lifecycle metadata；质量、业务真相和最终 artifact authority 留在 domain。

## 完成信号

| 线路 | 完成信号 |
| --- | --- |
| `opl_framework_foundation` | OPL provider/framework 能稳定承载 stage attempt、queue/wakeup、retry/dead-letter、approval/human gate、receipt/projection 和 shared lifecycle/index primitive。 |
| `mas_paper_autonomy_acceptance` | Read-only acceptance 已满足：三篇 MAS 真实 paper line 各有 OPL-ingestable typed closeout packet 和 MAS-owned evidence ref；DM002 已证明 publication-route memory consumed/writeback receipt；OPL 没有写 MAS truth、publication verdict、artifact authority、memory body 或 receipt instance。OPL task-bound guarded-apply attempt bridge 已由 focused test、2026-05-15 live source-fingerprint requeue 和 MAS owner stable-blocker receipt 覆盖。Production acceptance 仍要求更多真实 provider-hosted guarded apply attempt 留下 MAS owner receipt、progress delta / human gate / stop-loss / stable blocker 和 no-forbidden-write proof，而不是只证明 provider transport 完成或把 stable blocker 写成论文完成。 |
| `domain_framework_migration` | MAS/MAG/RCA 通过统一 descriptor/skeleton/locator/receipt 接入；维护者可通过 `opl agents descriptors` 看到整体接入状态，再进入 stage/action/memory/transition-oracle 子入口 drill down；MAG transition oracle ingestion 已有 matrix smoke，三仓 repo-source anchor evidence 已 observed，真实 workspace/runtime receipt proof、MAG oracle provider attempt bridge 和 direct/OPL-hosted owner receipt parity 仍需后续闭合。 |
| `feature_partition_and_retirement` | 旧默认依赖、legacy compat、重复 UI、过时 manager surface 完成分类、替代和退役；无 active caller 的模块/接口/测试已经删除或 tombstone；保留项都有明确 owner 和用途；active-path residue 测试证明默认 help/docs 不再展示 legacy operator 路径。 |
| `opl_app_runtime_workbench` | OPL App 能从一个工作台读取 provider readiness/proof、stage attempt、domain progress、human gate、artifact refs、source refs、safe action receipts、controlled apply refs、transition bridge evidence refs、restore proof 和 stage-attempt 分组/过滤摘要。 |
| `domain_soak_and_acceptance` | MAS/MAG/RCA 在迁移后目标形态下各自产出真实或 controlled progress delta、quality gate movement、human gate、stop-loss、domain owner receipt、no-regression evidence 或 typed blocker。 |

## 规划文档落点

- `docs/active/`：当前执行地图、runtime/activation/shared-boundary 支撑文档。
- `docs/active/development-document-portfolio*`：开发文档组合整理入口；旧开发文档按内容块吸收、保留、降级、退役或归档时先读这里。
- `docs/references/runtime-substrate/`：runtime/provider/executor 参考、roadmap、Temporal provider 支撑计划、legacy migration material。
- `docs/public/`：面向用户和外部读者的公开路线图与产品方向。
- `docs/specs/`：仍活跃的 runtime/product-boundary 规格入口；当前为空时回到核心五件套、`docs/active/`、runtime-substrate roadmap 和机器可读合同。
- `docs/history/`：退役路线、旧计划、dated snapshot、compatibility / frontdoor / gateway 归档。

如果内容仍决定“接下来按什么顺序做、什么算完成”，优先放 `docs/active/` 或当前 roadmap owner；如果只是背景或对照，放 `docs/references/`；如果只保存来龙去脉，放 `docs/history/`。

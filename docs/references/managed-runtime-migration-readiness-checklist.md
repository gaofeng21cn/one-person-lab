# Managed Runtime 迁移准备清单

状态锚点：`2026-04-11`

## 文档目的

这份文档把 `OPL` 当前已经冻结的 runtime 命名与边界，进一步压成一张可执行的迁移准备清单。

它主要回答四个问题：

1. 当前从 `host-agent runtime` 迁到 future `managed runtime`，到底在迁什么。
2. 哪些 readiness 维度已经具备。
3. 四仓分别还卡在哪些 blocker 上。
4. 后续最合理的推进顺序是什么。

这份文档属于 `docs/references/` 下的参考级同步面。
它不反向抬升为 `OPL` 公开主线 truth owner；统一命名与边界定义仍以：

- `docs/opl-runtime-naming-and-boundary-contract.zh-CN.md`
- `AGENTS.md`

为准。

## 一、迁移对象到底是什么

当前这条迁移，不是：

- 从一个 domain 切到另一个 domain
- 从 `Codex` 切到别的模型
- 把 `OPL` 改写成 runtime owner
- 把多个 domain 压成单体 runtime

当前这条迁移真正指的是：

- 从：主要依附用户机器、由本地 host agent 驱动的 execution plane
- 到：主要依附平台、由平台托管生命周期的 execution plane

因此，迁移保持不变的部分应包括：

- `OPL Gateway / Federation` 语义
- `Unified Harness Engineering Substrate` 共享不变量
- `Domain Gateway` / `Domain Harness OS` 边界
- formal-entry matrix
- execution handle 语义
- domain-owned audit / review / delivery / canonical truth

迁移允许变化的部分应集中在：

- session / quest / run 生命周期由谁负责
- sandbox、工具连接、凭证注入由谁管理
- watch / status / resume / replay 是否由平台统一托管
- operator 是否还要照料本地 daemon、tmux、机器路径和手工恢复

## 二、统一 readiness 维度

当前建议用下面八个维度判断是否已经准备好进入 future `managed runtime`：

| 维度 | 要回答的问题 |
| --- | --- |
| `R1 / 命名与 ontology` | 是否已经把 federation、domain、execution plane、deployment shape 分开写清楚 |
| `R2 / formal-entry` | 是否已经冻结 `CLI / MCP / controller` 的层级语义 |
| `R3 / execution handle` | 是否已经冻结 run / quest / topic / draft / workspace / program 这类句柄边界 |
| `R4 / durable surface` | 是否已经冻结 audit / review / delivery / status / report 的持久表面 |
| `R5 / hosted-friendly contract extraction` | 是否已经能从当前 local runtime 抽出 future host 必须兼容的 contract bundle |
| `R6 / runtime protocol narrowness` | execution plane 是否已经被压到稳定、可审计、可验证的最小协议面 |
| `R7 / external dependency clearance` | 进入 cutover / hostedization 前依赖的 external runtime、workspace、human gate 是否已经清掉 |
| `R8 / platform-owned lifecycle` | 平台托管的 session / watch / resume / replay / sandbox 是否已经存在 |

## 三、当前中央判断

### 总体结论

截至当前，四仓已经把 `host-agent runtime -> future managed runtime` 这条路线的：

- `R1 / 命名与 ontology`
- `R2 / formal-entry`
- `R3 / execution handle`
- `R4 / durable surface`

压到较稳定状态。

真正明显不足的仍然是：

- `R5 / hosted-friendly contract extraction`
- `R6 / runtime protocol narrowness`
- `R7 / external dependency clearance`
- `R8 / platform-owned lifecycle`

也就是说：

- 迁移目标已经清楚
- 迁移对象边界已经开始冻结
- 但距离 actual `managed runtime` 仍有明显距离

### 中央成熟度判断

| 维度 | 当前判断 | 说明 |
| --- | --- | --- |
| `R1 / 命名与 ontology` | 高 | 新增 `OPL Runtime 命名与边界合同` 后，中央口径已清楚 |
| `R2 / formal-entry` | 高 | 三仓都已按 `CLI / MCP / controller` 表达 |
| `R3 / execution handle` | 中高 | 三仓已冻结各自 handle 集合，但风格仍不完全同构 |
| `R4 / durable surface` | 中高 | 三仓都已有 repo-tracked canonical surface，但行为面仍在继续收口 |
| `R5 / hosted-friendly contract extraction` | 低到中 | `med-autogrant` 走得最远，其他仓尚未形成等价 package |
| `R6 / runtime protocol narrowness` | 中 | `med-autoscience` 最明确，`redcube-ai` / `med-autogrant` 仍偏 product-runtime 表达 |
| `R7 / external dependency clearance` | 低 | `med-autoscience` 明确仍被 external runtime gate 阻塞 |
| `R8 / platform-owned lifecycle` | 很低 | 当前没有 actual hosted runtime、remote execution、multi-tenant、platform-owned session lifecycle |

## 四、逐仓 readiness 判断

### 1. one-person-lab

当前角色：

- 中央 `Gateway / Federation` truth owner
- 统一命名、统一边界、统一 readiness 语言的 owner

当前已经具备：

- 顶层 ontology、层级和命名已冻结
- `Codex-default host-agent runtime` 与 future `managed runtime` 的关系已被写清
- 四仓统一迁移目标已进入 repo-tracked 中央文档

当前 blocker：

- 它不拥有 domain-local runtime truth
- 它不能代替业务仓产出 hosted-friendly contract bundle
- 它不能把 reference-sync 文档误写成 runtime-owner truth

当前下一步：

1. 继续维护中央命名与 readiness 语言。
2. 继续同步三仓 hostedization / cutover 的真实阶段，不抢跑。
3. 保持 `OPL` 不越界成 runtime owner。

### 2. med-autoscience

当前判断：

- `R1-R4` 已较强
- `R6 / runtime protocol narrowness` 也最强
- 但 `R7 / external dependency clearance` 是当前最大 blocker

当前已经具备：

- `MedAutoScience -> MedDeepScientist` 边界清楚
- `program_id / study_id / quest_id / active_run_id` 已冻结
- stable runtime protocol 已独立成文
- `monorepo / runtime core ingest / controlled cutover` 已被诚实定义为后置长线

当前 blocker：

- external `med-deepscientist` controlled fork 真实证据仍需 external surface 提供
- `behavior_equivalence_gate.yaml` 仍需 external workspace 放行
- external workspace contract 与真实热身 study 仍需外部证据
- 当前正式终态仍是 `EXTERNAL_RUNTIME_DEPENDENCY_BLOCKED_AFTER_ABSORB`

对 future `managed runtime` 的含义：

- 它不是还没想清楚怎么迁
- 它是已经知道要迁什么，但 execution plane 的 external gate 还没放行

当前下一步：

1. 继续收紧 `MedAutoScience -> MedDeepScientist` runtime protocol。
2. 清 external runtime dependency gate，而不是抢跑 monorepo physical migration。
3. 只有 external gate 真正放行后，才继续更大的 cutover / hostedization 讨论。

### 3. redcube-ai

当前判断：

- runtime ontology 与 host-agent 口径已很清楚
- 当前 repo-tracked absorbed tranche 已推进到 `Phase 2 / runtime watch locator integrity hardening`，并额外吸收了 `e8146a1` verification surface 分层与 `762ea4c` repo-local control-plane migration back to repo-tracked truth
- 但 `R5 / hosted-friendly contract extraction` 仍缺一份明确的 hostedization-prep contract slice

当前已经具备：

- `CLI / MCP / controller` 语义已统一
- `program_id / topic_id / deliverable_id / run_id` 边界已冻结
- canonical audit / watch / review / projection surface 已有 repo-verified mainline
- `future managed web runtime` 与 ontology 不得混写的边界已明确

当前 blocker：

- 尚未看到与 `med-autogrant R5.A` 对等的 hostedization-prep package
- 尚未把 current topic / deliverable / run / audit surfaces 抽成一个 future host 必须兼容的 contract bundle
- `workspace / operator quickstart convergence` 已被冻结进当前 repo truth，operator bootstrap 面不再是当前未冻结 blocker
- 虽然 `phase_2_family_parity_autopilot_continuation_board` 已预冻结，但还没有把 family parity / autopilot continuity 真正推进到 hosted-friendly contract extraction
- 尚未看到 platform-owned session lifecycle 的 repo-tracked design slice

对 future `managed runtime` 的含义：

- `RedCube AI` 的 domain ontology 已较清楚
- execution plane 将来可以 hosted，但现在主要缺的是一份“如何 hosted 而不改 ontology”的显式 contract export 面

当前下一步：

1. 继续在 current mainline 上保持 audit / watch / review / projection 与 quickstart route 收口。
2. 承认 `workspace / operator quickstart convergence` 已 absorbed，不再把它列为等待 freeze 的前置条件。
3. 只有在 current mainline 形成新的 concrete hostedization-prep contract slice 后，才冻结首个 hostedization-prep activation package。
4. 先抽 contract compatibility，不直接跳 hosted runtime。

### 4. med-autogrant

当前判断：

- 四仓里在 `R5 / hosted-friendly contract extraction` 上走得最远
- `R5.A / Hosted-Friendly Session Boundary` 已经实现并 absorbed
- `98df81f` 已进一步把 control-plane state 迁回 repo-tracked truth
- 但它仍然明确停在 hostedization prep，而不是 actual hosted runtime

当前已经具备：

- 本地 `CLI-first + host-agent` runtime baseline
- `grant_run_id / workspace_id / draft_id / program_id` 边界已冻结
- `run-local / resume-local / build-artifact-bundle / execute-revision-pass / build-final-package` 等本地 canonical runtime 面已存在
- `build-hosted-contract-bundle` 与 `R5.A / Hosted-Friendly Session Boundary` 已形成清晰的 hostedization-prep 语义

当前 blocker：

- 文档明确禁止把 hosted-friendly contract prep 写成 actual hosted runtime
- `R5.A` 之后的 truthful continuation 仍只允许停留在 `post-R5A local runtime hardening`
- 仍无 remote execution、Web UI、multi-tenant、platform-owned session lifecycle

对 future `managed runtime` 的含义：

- `med-autogrant` 已经开始把 local runtime 抽象成 future host 可以消费的 contract bundle
- 但它仍只是在做 contract prep，不是在做 actual hosted runtime

当前下一步：

1. 继续把 local runtime baseline 收紧成 honest local product baseline。
2. 围绕 `post-R5A local runtime hardening` 继续收紧 validator / checkpoint truth、operator walkthrough 与 docs/runtime 对齐。
3. 继续明确把 hostedization prep 与 actual hosted runtime 分开。

## 五、当前统一迁移顺序

当前最合理的顺序不是“三仓一起做 hosted runtime”，而是：

1. `one-person-lab`
   继续持有中央命名、边界与 readiness 清单，不越界为 runtime owner。
2. `med-autogrant`
   作为 hosted-friendly contract extraction 的先行参考实现，继续把 post-R5A 本地 runtime hardening 收紧。
3. `med-autoscience`
   继续清 external runtime gate；在 gate 放行前，不提前进入 physical cutover 或 hostedization。
4. `redcube-ai`
   quickstart 已吸收；只有在形成新的 concrete contract-export delta 时，才补首个 hostedization-prep contract slice。

## 六、当前不应做的事

以下动作当前仍应明确后置：

- 把 future `managed runtime` 写成已完成 reality
- 把 `OPL` 写成 runtime owner
- 在 `med-autoscience` external gate 未清时，提前做 monorepo physical migration
- 在 `redcube-ai` 尚无 hostedization-prep contract slice 时，直接谈 remote hosted runtime
- 把 `med-autogrant` 的 `hosted-friendly contract bundle` 误写成 actual hosted platform
- 直接跳到统一平台 runtime、web runtime、multi-tenant、shared execution core

## 七、当前结论

当前这次语义对齐带来的最大收益，确实是：

- 现在的 `Codex-default host-agent runtime` 已经被诚实定位成可工作的正式 baseline
- future `managed runtime` 已经被诚实定位成后续托管目标
- 迁移的对象不是 domain ontology，而是 execution plane 的 deployment shape

因此，当前真正需要继续做的，不是重新争论目标，而是按仓分别补齐：

- hosted-friendly contract extraction
- runtime protocol narrowness
- external runtime dependency clearance
- platform-owned lifecycle 所需的前置 contract

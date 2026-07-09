# OPL 过度设计退役与收薄计划

Owner: `One Person Lab`
Purpose: `active_cleanup_plan`
State: `active_plan`
Machine boundary: 本文是人读规划与执行地图。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、package lock、domain-owned manifest 和 repo-native verification。

## 目标读法

本轮目标不是削弱 OPL，而是把 OPL 收回到标准平台边界：Framework 持有通用 runtime、package lifecycle、generated/hosted surface、projection、receipt 和 refs-only control plane；App 负责 cockpit 与用户操作；domain agent 继续持有领域 truth、quality verdict、artifact authority、owner receipt、typed blocker 和 human gate。

完成口径按功能/结构与证据分账：

- 功能/结构完成：active caller 已迁移、重复 wrapper/facade 已删除或 tombstone、package/runtime/observability/test surface 回到 owner 边界，repo-native tests 通过。
- 后置证据：真实 App release、live provider long-soak、domain owner-chain scaleout、Brand L5、真实 package install/uninstall/rollback evidence 另账验收。docs、contract pass、focused tests 或 dry-run readback 不能声明 release-ready、domain-ready 或 production-ready。

## 模块定位

| 模块 | 保留职责 | 收薄方向 | 禁止承担 |
| --- | --- | --- | --- |
| `OPL Connect` | Agent Package registry / manifest / lock / lifecycle receipt；Skill / connector / external descriptor 分发；provider refs 与 no-authority receipt。 | 保留 Agent Package Manager，但拆成 package core 与 carrier adapter。Package core 只管 `id/version/digest/dependencies/trust/lock/lifecycle receipt/exposure/shortcut`；carrier adapter 只负责 Codex Plugin、OPL App、Capability Pack、MCP/Web/native 等物理投影。 | 不做通用私有 package manager；不写 domain workflow、prompt body、artifact schema、quality verdict、owner receipt 或 runtime authority。 |
| `OPL App` / `OPL Console` | cockpit、安装/更新/回滚操作、权限/审批、read-model 展示、operator action refs。 | 只消费 Framework package/runtime/action refs；缺 ref 时显示不可执行或需要 owner action。 | 不 hard-code MAS/MAG/RCA 语义；不拥有 package truth、domain truth 或 runtime dependency truth。 |
| `OPL Runway` | Temporal-backed durable stage run、attempt、lease、retry/dead-letter、execution authorization、repair/readiness projection。 | Durable lifecycle 只保 Temporal/provider 路径；删除本地 scheduler / queue / intake / enqueue / tick / redrive 成功路径，SQLite sidecar 只保 stage-attempt projection、diagnostic 和 readback index。 | 不保留第二套 scheduler、queue runtime、local provider 或 attempt authority。 |
| `OPL Ledger` | refs-only evidence、lineage、receipt/blocker refs、OpenTelemetry-compatible observability projection。 | 观测字段优先映射 OpenTelemetry semantic conventions；只保 OPL authority refs 和 audit packet。 | 不自建独立 observability truth ledger；不把 telemetry clean 写成 ready。 |
| `OPL Stagecraft` / `OPL Pack` | declarative pack、stage prompt policy、capability ABI、generated/hosted surface。 | 删除只为历史 alias 存在的 one-line wrappers；active caller 直连 owner module public entry。 | 不保留兼容 facade 来维持旧路线。 |
| tests / fixtures | 验证 machine-readable contract、CLI/API 行为、runtime projection 与 no-authority guard。 | 超大 narrative / alias / tombstone assertions 合并成 semantic fixtures；删除重复实现细节测试；旧测试变红只说明现有断言被影响，最终判断看必要覆盖是否仍由更小测试、contract reader 或 readback 保住。 | 不用测试固定 prose wording、历史文档章节或兼容 alias；不把“当前测试依赖它”当成必须保留的充分理由。 |

## 落地清单

| 优先级 | 项 | 动作 | 验证 |
| --- | --- | --- | --- |
| P0 | Agent Package Manager 边界 | 保留 `connect agent-packages`，把 docs/source 中的读法改成 `package core + carrier adapters`；Codex Plugin 只是 carrier 之一；OPL App 管理 package，但不拥有 package/domain semantics。 | `npm run test:fast` 或 touched package tests；`./bin/opl connect agent-packages ... --json` shape 不回归；docs/contract 不出现 Codex Plugin-only 读法。 |
| P0 | 一行 wrapper / re-export | 迁移 active imports 后删除无语义 wrapper，例如 Console management/runtime/workspace、stage-run cockpit、runway family runtime id 等只转发文件。 | `rg` 无 active import 指向退役 wrapper；`npm run typecheck`；source-module strict import/cycle gate。 |
| P1 | Runway local scheduler / queue tail | 物理删除本地 scheduler / queue / intake / enqueue / tick / redrive 成功路径；保留 SQLite sidecar 作为 stage-attempt projection/readback index 与 retired-provider negative guard。 | focused runtime tests；readback false-ready flags；CLI/help/contract 不再暴露本地 queue 或 scheduler tick 成功入口。 |
| P1 | Ledger observability tail | 将私有 drilldown/ledger 字段收敛到 OTel-compatible event/ref projection；保留 OPL receipt refs。 | focused ledger/observability tests；no domain authority write proof。 |
| P2 | 测试与 fixture surface | `10 万行`最低线已完成，`18 万行`上沿仍未完成。当前推进范围排除 MedOPL、已归档 DeepScientist/med-deepscientist，以及上游拥有的 `opl-aion-shell` fork；Aion 只允许 OPL-owned overlay 目标进入，非我们设计的上游测试/实现不再作为瘦身对象。2026-07-08 起非 Aion mainline slim/shrink 提交按 test-path numstat 净删 `100,373` 行（`13,572` insertions / `113,945` deletions）。最新补充吸收：OPL `340991c4` 测试内容 final tranche；OPL `a6aa4d04` 修复 evidence-profile 新测试 lane/typecheck；此前已吸收 OPL `9336fe348`、`8e2e523ba`，MAS `113126be1`、`6aa937500`，RCA `5219ccc4`、`a90df1c8`，MAG `142733e`，App `300dbca`，OMA `d71dc8a`。按 fresh tracked-test 统计口径（`tests/`/`test/` 下文件 + 根级 `test_*.py` / `.test.*` / `.spec.*`，排除 Aion），非 Aion 当前仍有 `1,993` 个文件、`562,965` 行：OPL `148,215`、MAS `317,242`、RCA `47,051`、MAG `28,802`、App `13,109`、OMA `8,546`。按 `10-18 万` 首批目标折算，本轮完成最低线 `100%`，上沿约 `56%`；若继续追 18 万，还需净删 `79,627` 行，必须继续分类为 `delete / merge / rewrite / keep / owner-blocked`，不能把旧测试会红当成保留理由。 | focused P2 tests + `test-lanes assert-coverage` + sibling App/RCA/MAS/MAG/OMA repo-native validators；Aion fork 只做 read-only ownership/readback 或回退误动，不做测试瘦身；旧测试变红不是最终否决理由，必须区分必要覆盖缺失、旧 wrapper/文案断言被删除、实现细节绑定、或 helper 改坏行为；同写集 dirty 或需要真实 owner 降低覆盖粒度的 lane 只能记 blocker/owner decision。 |

## 执行流水生命周期

本文件只保留当前收薄目标、owner boundary、完成度审计和下一轮入口。已吸收的 P0-P2、test lane registry、Connect package preference、Runway fallow、Codex carrier、low-risk export、semantic cleanout 和 four-lane cleanup 过程记录不再作为 active truth 维护；它们的验证命令、commit、行数变化、结构计数和 worktree closeout 只按提交历史、ops ledger、automation memory 或 `docs/history/process/` provenance 读取。

当前维护规则：

- 新增收薄或退役候选先回到上方落地清单和 completion audit，不在本文追加逐日流水。
- 纯 line-budget、cycle、duplicate helper、wide export 或大函数自然拆分默认路由到 `refactor_patrol`；只有它们制造 docs/machine truth 冲突、第二真相源或 retired public surface 泄漏时，才进入本治理主线。
- `done` 只表示对应结构/功能边界已经由 repo-native evidence 支撑；Live App install、Codex reload、provider long-soak、owner-chain scaleout、Brand L5、release currentness 和 production evidence 仍是后置 owner lane。
- 需要过程细节时，从 fresh `git log --oneline -- docs/active/overengineering-retirement-plan.md`、相关提交 diff、repo-native tests 和 ops ledger 读取，不能从本文继承旧 snapshot。

## 完成度审计

| 条目 | 状态 | 完成度 | 当前证据 owner 口径 | 剩余缺口 / 下一步 |
| --- | --- | ---: | --- | --- |
| Agent Package Manager 边界 | done | 100% | package core、carrier adapter、canonical package action、Managed Update owner route 和 modular distribution 读法回 source/contracts/CLI/tests。 | Live App installed-user-path、Codex reload、real install/uninstall/rollback、release currentness 与 owner-chain scaleout 仍是后置证据 lane。 |
| 一行 wrapper / re-export | done | 100% | active imports 已迁到 owning module public entry 或 kernel；retired wrapper 只能按 history/tombstone 读取。 | 继续用 source-module gate 和 active-import scan 防止 wrapper 复活；不为未来统一指标新增 facade。 |
| Runway local scheduler / queue tail | partial | 95% | 当前目标是 Temporal/provider path + stage-attempt projection/readback index；local scheduler/queue/tick/redrive 成功路径不得作为 active runtime。 | 需要后续 refactor/runtime owner 用 fresh source、CLI help、focused tests 和 provider readback 关闭剩余 tail；外部 Temporal long-soak 另账。 |
| Ledger observability tail | done | 100% | OPL Ledger 只持 refs-only evidence、lineage、receipt/blocker refs 和 OTel-compatible projection。 | telemetry clean 不等于 provider/domain/production ready。 |
| 测试与 fixture surface：10 万最低线 | done | 100% | 2026-07-08 起非 Aion mainline slim/shrink 提交按 test-path numstat 净删 `100,373` 行（`13,572` insertions / `113,945` deletions），超过 `10 万`最低线。最新 OPL final tranche `340991c4` 在 `workspace-domain.initializer`、`family-runtime-worker-lifecycle`、`system-workspace-settings`、`runtime-environment-substrate-command-surface`、`family-runtime-evidence-worklist-domain-blockers` 保留入口与代表性 smoke，净删 `3,276` 行。fresh 验证：affected 40/40 pass、`node scripts/test-lanes.mjs assert-coverage`、`npm run typecheck`。当前非 Aion tracked test surface：`1,993` 文件 / `562,965` 行。 | 最低线已关闭；后续不能再用“离 10 万还差”作为 blocker。 |
| 测试与 fixture surface：18 万上沿 | partial | 56% | 同一 fresh numstat 口径已完成 `100,373 / 180,000`。剩余主要在 active semantic coverage，而不是 Aion 上游或 MedOPL。 | 若继续追上沿，还需净删 `79,627` 行。后续每个候选必须分类为 `delete / merge / rewrite / keep / owner-blocked`：旧 wrapper/文案/实现细节断言可删或改写，必要 authority/currentness/no-authority 覆盖要用更小测试或 contract/readback 替代，真实 owner 降低覆盖粒度才需要 human decision。 |
| Aion upstream fork 边界 | done | 100% | 用户明确 `opl-aion-shell` 是 fork 的 AionUI，上游主要维护；本轮误动的 Aion 测试瘦身类提交已在 `opl-aion-shell` main/`gh-https/main` 通过普通 revert 回退到 HEAD `7a189f788`。后续统计与执行排除 `opl-aion-shell` 和 App 内 AionUI 上游体，除非目标明确是 OPL-owned overlay。 | 不再对 Aion upstream body 做测试瘦身、结构重写或实现清理；只允许 read-only 核查、误动回退、或 OPL overlay 边界内改动。 |
| Source size / fallow / cycle advisory | partial | 0% | 纯结构复杂度不计入本治理实质成果；只有制造 SSOT 冲突或 retired public surface 泄漏时才进入 governance_ssot。 | 默认 route 为 `refactor_patrol`；physical delete 仍需 active caller、owner surface 和 verification gate。 |
| Test lane registry / full gate wrapper | done | 100% | 机器 truth 回 `scripts/test-lanes.mjs`、`scripts/verify.sh`、`package.json` 和 GitHub workflow。 | 若将来需要并发性能，在 CI matrix 或显式 runner lane 重新设计，不恢复第二 wrapper。 |
| Codex carrier / Skill 暴露 | done | 100% | Agent Package 是统一抽象；Codex Plugin、App、MCP/Web/native 是 carrier/projection；Skill 暴露按 source -> explicit sync -> workspace/quest local。 | 真实 Codex App reload、用户级可见性、App release owner acceptance 和 external skill content security 仍是后置证据 lane。 |

## 停止条件

- 若 active caller、source of truth 或 authority owner 不清，先停在 typed blocker，不能靠兼容 wrapper 掩盖。
- 若真实 App install/rollback、provider long-soak 或 owner-chain evidence 未跑，只能声明结构 landed，不能声明 ready。
- 若 root checkout 或 sibling repo 有同写集脏改，必须先保留对方变更，在隔离 worktree 中完成后再由主线吸收。

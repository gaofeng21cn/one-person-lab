# OPL 过度设计退役与收薄计划

Owner: `One Person Lab`
Purpose: `active_cleanup_plan`
State: `active_plan`
Machine boundary: 本文是人读规划与执行地图。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、package lock、domain-owned manifest 和 repo-native verification。

## 2026-07-09 边界修复声明

- `209,869` 行净删与 `10-18 万`完成口径属于历史 mixed-commit snapshot，不能继续作为严格“测试内容瘦身”完成证据；其中 RCA `0a986912` 是源码 / 脚本 / docs / tests 混合收薄，MAS `0e7b005da` 也包含 `src/`、`contracts/` 与 `Makefile` 联动。后续只能用 path-filtered `tests/**` / `*.test.*` / `*.spec.*` / 根级 `test_*.py` 重新计算。
- `opl-aion-shell` 与 App `shells/aionui/**` 不属于本测试瘦身任务。若 Aion checkout 出现 upstream body dirty diff，该写集只能由 Aion owner 线程处理，本计划不得把它修复、清理或统计为测试瘦身成果。
- OMA 若处于非测试 rebase/conflict 状态，测试瘦身 lane 只能停在 owner handoff；不得在本任务内接管 `agent/`、`docs/`、`scripts/` 或 stage-decomposition feature 写集。

## 2026-07-10 严格测试瘦身落地快照

本快照只统计本轮主会话复核、focused 验证、吸收并推送到各仓 `main` 的测试面改动；mixed source/docs/scripts commit、Aion upstream body、MedOPL、DeepScientist / med-deepscientist、App `shells/aionui/**` 均不计入。

| Repo | Commit | 测试面 | 净行数 | Fresh verification |
| --- | --- | --- | ---: | --- |
| OPL | `47913390a` + `555a7f531` + `63bdc710e` + `b3615ce96` + `6afbda9b7` + `f2c3f5fe` + `cfef857ab` | domain progress transition runtime；runtime manager native cases；Codex default shell generated-surface helpers；runtime drilldown helper fixtures；workspace domain transitions coverage；system module fixture cases | `-433` | domain progress transition runtime：`22/22 pass`；runtime manager native：`11/11 pass`；Codex default shell：`21/21 pass`；runtime drilldown：`2/2 pass`；workspace transitions：`11/11 pass`；system modules：`11/11 pass`；`npm run typecheck` |
| MAS | `2e361d8ec` + `3ccd05fcb` + `66c94dbac` + `c7e7311f4` + `86bee42d3` + `e7d98dcb3` + `caa0e9a8d` | currentness / provider admission owner identity tests；AI reviewer routeback cases；runtime protocol study runtime cases；runtime health kernel tests；stage artifact index cases；CLI command import cleanup；stage memory CLI cases | `-584` | owner/currentness：`27 passed`；routeback focused pytest：`21 passed`；runtime protocol focused pytest：`42 passed`；runtime health kernel focused pytest：`25 passed`；stage artifact index focused pytest：`18 passed`；CLI command import cleanup focused pytest：`5 passed`；stage memory CLI focused pytest：`14 passed`；display QC helper candidate was reverted on MAS `main` and is not counted |
| RCA | `fb1cb34c` + `a630314a` + `f00f2b18` + `3eff3f75` + `50a09950` | native PPT Python layout fixture parts；RedCube Playwright mock helper；native PPT layout fixtures；source intake cases；RedCube mock Python helper payloads | `-393` | native PPT focused tests：`11/11 pass`；helper-referencing focused tests：`60/60 pass`；source intake：`17/17 pass`；native PPT quality nonregression：`3/3 pass`；`npm run typecheck` |
| MAG | `c5cab6a` + `8f6a8fb` + `f7b8ad3` + `8858cbf` + `e9747e7` | product entry / workspace summary / critique executor tests；domain handler receipt assertion preservation；workspace summary cases；critique executor tests；domain entry cases | `-389` | affected product/workspace/critique focused tests：`51 passed, 60 subtests passed`；workspace summary focused pytest：`4 passed, 51 subtests passed`；critique executor focused pytest：`7 passed, 2 subtests passed`；domain entry focused pytest：`7 passed, 19 subtests passed`；`./scripts/verify.sh`：`234 passed, 351 subtests passed` |
| App | `23d450e` + `d44dd99` + `72b490a` + `3dc9dee` | release boundary tests；release closeout cases；release helper core；release closeout fixtures | `-470` | `OPL_APP_SHELL_ROOT=/Users/gaofeng/workspace/one-person-lab-app/shells/aionui npm run test:release-boundary`：`116 pass, 2 skip`；release closeout focused node test：`9/9 pass` |
| OMA | `6cbda67` + `5be0845` | external-suite fixture tests；takeover-loop assertions | `-121` | `scripts/run-with-repo-temp-env.sh node --test tests/external-suite-*.test.ts`：`16/16 pass`；takeover-loop focused node test：`5/5 pass`；`npm run typecheck` |

Strict test-only landed total after main-session semantic repairs and reverted candidates: `-2,390` lines.

Tracked-test surface inventory is not a completion proof in this snapshot. Fresh path-filtered inventory on 2026-07-10 is OPL `503` files / `125,238` lines, MAS `885` / `247,054`, RCA `250` / `44,913`, MAG `120` / `20,413`, App `37` / `8,141`, OMA `36` / `7,339`, total `1,831` files / `453,098` lines. The bound slimming evidence here is still the absorbed test-only commit numstat plus the listed repo-native verification.

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
| P2 | 测试与 fixture surface | 历史 `10-18 万`口径已撤销为 mixed-commit snapshot，不能作为测试瘦身完成证据。本轮严格 test-only 已落地并推送 OPL/MAS/RCA/MAG/App/OMA 六仓净删 `2,390` 行；所有计入候选均限制在 `tests/**` 或等价测试文件，且通过 focused repo-native 验证；MAS display QC helper candidate、OMA bootstrap-loop candidate、MAS owner-route unused-import candidate 与 OPL work-order candidate 均因净增或 focused 验证不满足被拒绝，不计入收益。当前推进范围继续排除 MedOPL、已归档 DeepScientist/med-deepscientist、`opl-aion-shell` upstream fork body 和 App `shells/aionui/**` vendor copy。2026-07-10 path-filtered 当前库存是 `1,831` 个测试文件 / `453,098` 行，但库存不作为本快照完成证据。 | focused P2 tests + sibling App/RCA/MAS/MAG/OMA repo-native validators；Aion fork 与 App `shells/aionui/**` 只做 read-only ownership/readback 或误动回退，不做测试瘦身；继续瘦身必须按新候选分类为 `delete / merge / rewrite / keep / owner-blocked`，不能把旧测试会红当成保留理由，也不能把 mixed commit 当测试收益。 |

## 执行流水生命周期

本文件只保留当前收薄目标、owner boundary、完成度审计和下一轮入口。已吸收的 P0-P2、test lane registry、Connect package preference、Runway fallow、Codex carrier、low-risk export、semantic cleanout 和 four-lane cleanup 过程记录不再作为 active truth 维护；它们的验证命令、commit、行数变化、结构计数和 worktree closeout 只按提交历史、ops ledger、automation memory 或 `docs/history/process/` provenance 读取。

当前维护规则：

- 新增收薄或退役候选先回到上方落地清单和 completion audit，不在本文追加逐日流水。
- 涉及测试内容瘦身时，完成度只接受 path-filtered 测试文件证据；mixed source/docs/scripts commit 只能作为旁路治理记录，不能支撑“测试代码已净删 N 行”。
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
| 测试与 fixture surface：严格 test-only 吸收 | partial | 2% | 本轮已吸收并推送六仓严格测试瘦身：OPL `47913390a` / `555a7f531` / `63bdc710e` / `b3615ce96` / `6afbda9b7` / `f2c3f5fe` / `cfef857ab`、MAS `2e361d8ec` / `3ccd05fcb` / `66c94dbac` / `c7e7311f4` / `86bee42d3` / `e7d98dcb3` / `caa0e9a8d`、RCA `fb1cb34c` / `a630314a` / `f00f2b18` / `3eff3f75` / `50a09950`、MAG `c5cab6a` / `8f6a8fb` / `f7b8ad3` / `8858cbf` / `e9747e7`、App `23d450e` / `d44dd99` / `72b490a` / `3dc9dee`、OMA `6cbda67` / `5be0845`，合计净删 `2,390` 行；所有计入候选均由主会话复核 write set 与 focused verification。 | 相对于历史 `10-18 万`目标，只能确认 `2,390 / 100,000` 的严格 test-only 证据；剩余大体量必须重新按语义候选审计，不能从旧 mixed snapshot 继承完成度。 |
| 测试与 fixture surface：当前库存与下一轮候选 | partial | 0% | 2026-07-10 fresh path-filtered 库存：OPL `503` 文件 / `125,238` 行，MAS `885` / `247,054`，RCA `250` / `44,913`，MAG `120` / `20,413`，App `37` / `8,141`，OMA `36` / `7,339`，总计 `1,831` 文件 / `453,098` 行；MAS display QC helper candidate 已在 MAS `main` revert，不计入收益。 | 后续如继续追更深瘦身，必须重新列候选并分类为 `delete / merge / rewrite / keep / owner-blocked`：旧 wrapper/文案/实现细节断言可删或改写，必要 authority/currentness/no-authority 覆盖要用更小测试或 contract/readback 替代，真实 owner 降低覆盖粒度才需要 human decision。 |
| Aion upstream fork 边界 | done | 100% | 用户明确 `opl-aion-shell` 是 fork 的 AionUI，上游主要维护；本测试瘦身任务不处理、不修复、不统计 Aion upstream body，也不触碰 App `shells/aionui/**` vendor copy。 | 不再对 Aion upstream body 做测试瘦身、结构重写、样式交互重构、依赖升级或实现清理；只允许 read-only 核查、误动回退、或 OPL-owned overlay 边界内改动。 |
| Source size / fallow / cycle advisory | partial | 0% | 纯结构复杂度不计入本治理实质成果；只有制造 SSOT 冲突或 retired public surface 泄漏时才进入 governance_ssot。 | 默认 route 为 `refactor_patrol`；physical delete 仍需 active caller、owner surface 和 verification gate。 |
| Test lane registry / full gate wrapper | done | 100% | 机器 truth 回 `scripts/test-lanes.mjs`、`scripts/verify.sh`、`package.json` 和 GitHub workflow。 | 若将来需要并发性能，在 CI matrix 或显式 runner lane 重新设计，不恢复第二 wrapper。 |
| Codex carrier / Skill 暴露 | done | 100% | Agent Package 是统一抽象；Codex Plugin、App、MCP/Web/native 是 carrier/projection；Skill 暴露按 source -> explicit sync -> workspace/quest local。 | 真实 Codex App reload、用户级可见性、App release owner acceptance 和 external skill content security 仍是后置证据 lane。 |

## 停止条件

- 若 active caller、source of truth 或 authority owner 不清，先停在 typed blocker，不能靠兼容 wrapper 掩盖。
- 若真实 App install/rollback、provider long-soak 或 owner-chain evidence 未跑，只能声明结构 landed，不能声明 ready。
- 若 root checkout 或 sibling repo 有同写集脏改，必须先保留对方变更，在隔离 worktree 中完成后再由主线吸收。

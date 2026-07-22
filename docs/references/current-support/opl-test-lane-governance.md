# OPL 测试 Lane 治理参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_test_lane_governance`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

本参考说明当前测试入口语义。机器真相在 `scripts/test-lanes.mjs`、`scripts/verify.sh`、`package.json` 和 GitHub workflow；本文只解释维护口径，不冻结 lane 细节、单个测试文件列表、Sentrux baseline 数字或 CI 通过状态。

Currentness policy：查看当前 lane 集合时先读 `package.json` 的 `test:*` scripts、`node scripts/test-lanes.mjs list`、`scripts/verify.sh` 的 case 分支和 `.github/workflows/verify.yml`。本文中的 lane 角色是稳定读法；测试文件增减、CI job 通过状态、quality details 数字、compare-ref 可用性和 full lane 内部日志都必须从 fresh 命令输出读取。

## Lane 语义

| Lane | 命令 | 角色 |
| --- | --- | --- |
| smoke | `npm test` / `npm run test:smoke` | 默认秒级核心入口，覆盖 lane registry、CLI 模块边界、runtime state path 与 OPL session runtime 基础合同。 |
| fast | `npm run test:fast` | 显式标准本地入口；覆盖 repo hygiene、合同治理、native helper prebuild、轻量 runtime contract、stage pack 与 quality details。 |
| read-model-gates | `npm run test:read-model-gates` | 串行重型 read-model / runtime gate；覆盖 framework readiness、App drilldown、evidence worklist、Temporal/provider、workspace-domain、domain-pack compiler 与 agent conformance。 |
| meta | `npm run test:meta` | 治理、quality、contract 和 generated/default surface 元测试 lane；不等价于 `fast`。 |
| regression | `npm run test:regression` | 宽回归入口；覆盖 CLI 默认 shell、domain catalog、entry contracts、product-entry、orchestration、skills、automation 与 full internal package。 |
| integration | `npm run test:integration` | ACP/session runtime、install/configure、retired Product API fail-closed 与 domain definition 黑盒入口。 |
| artifact | `npm run test:artifact` | 构建后 artifact 行为，先 `npm run build`，再跑 built CLI 测试。 |
| fresh-install | `npm run test:fresh-install` | 本机 clean-room install / initialize 矩阵；真实 GUI 首启由 `one-person-lab-app` 的 App VM workflow 承担，并通过 external checkout 调用 `opl-aion-shell`。 |

`scripts/verify.sh` 是 repo-native 验证分发入口。它分发到 smoke、fast、meta、regression、integration、structure、structure:strict、family、fresh-install、artifact、native、full、lint、line-budget、line-budget:strict 或 typecheck。line budget 不再作为所有 lane 的前置硬门；`line-budget` lane 只执行 advisory 检查并默认 exit 0，`line-budget:strict` 才执行维护用 strict ratchet。line-budget 的预算、near-limit 阈值、reasonable-refactor 分类口径与 reviewed baseline 由 `contracts/opl-framework/source-structure-budget.json` 持有；脚本默认报告新增超线、超过 reviewed baseline、stale baseline 与 retired baseline，只有 `--strict` 或 `OPL_LINE_BUDGET_STRICT=1` 才把 findings 作为失败。

| Verify lane | 命令 | 角色 |
| --- | --- | --- |
| native | `./scripts/verify.sh native` | native helper doctor、prebuild check、package dry-run、Rust test/build、state cache 与 family smoke。 |
| structure | `./scripts/verify.sh structure` | 本地结构质量 advisory 入口；line budget 和 Sentrux baseline/rules findings 都会输出诊断与 OPL quality details，但默认不阻断普通开发。 |
| structure:strict | `./scripts/verify.sh structure:strict` | 显式维护硬门；line budget strict 与 Sentrux explicit rules failure 会返回失败，供每日结构治理或维护者手动检查。 |
| family | `./scripts/verify.sh family` | Python shared harness bootstrap 验证；Python cache、pytest cache 和临时 venv 必须走 repo 外 temp env。 |
| lint | `./scripts/verify.sh lint` | `npm run lint`，只执行 JS lint；行数预算通过 `line-budget` / `line-budget:strict` 或 `structure` / `structure:strict` 查看。 |
| typecheck | `./scripts/verify.sh typecheck` | `npm run typecheck`。 |
| full | `npm run test:full` | clean-clone / release-style 基线入口；先把 artifact、fast、fresh-install、read-model-gates、meta、regression、integration 与结构/类型/native gate 编译成唯一执行计划，再执行。 |

`npm test` 等同 `npm run test:smoke`，用于普通开发的最低成本入口。`npm run test:fast` 是显式标准本地入口；当改动触及 shared runtime、contract registry、stage pack、Foundry Kernel 或 quality details 时再运行。`test:meta` 是独立治理 / quality / contract meta lane，不再等价 `test:fast`；共享 SQLite/state 的 framework readiness、App drilldown 和 evidence worklist 相关 read-model gates 通过 `test:read-model-gates` 串行执行，避免并行抢占同一状态面。

## 开发时如何选测试

普通实现循环默认先跑 changed/focused tests，再跑 `npm test`。字面改动可用 `rg` 找到直接测试；源码影响范围优先用 `codegraph affected <changed-files...>` 找候选入口，然后用 Node 原生 focused 入口执行：

```bash
node --experimental-strip-types --test <test-file...>
npm test
```

只有改动触及共享 runtime、contract/schema registry、stage pack、跨模块 read model 或 Foundry Kernel 时，才补 `npm run test:fast` 或对应的 `read-model-gates` / `meta` / `regression` lane。开发循环不要求每次跑 `full`；CI 按独立 job 运行 standalone lane，发布、clean-clone 基线或跨 lane 治理变更再跑 `npm run test:full`。

`npm run test:full:plan` 输出 full 的 fresh machine-readable 执行计划。组合器会展开只包含 import 的纯测试聚合器，按原 lane 的 env 与 batch isolation 为重复入口选择唯一 owner，并对最终 test import closure 执行零重复硬门。独立 lane 的 standalone 行为保持不变；去重只发生在 full 组合执行中，因此不会改变 focused、CI 分 job 或手工单 lane 的语义。

CLI 测试中的 `runCliReadOnly*` 只用于显式确认无 mutation、无 passthrough、无 child-process 合同的只读命令。它复用当前测试进程已经加载的 CLI invocation，并串行保护临时 cwd/env；成功 stdout JSON、失败 stderr/exit code 和父进程状态恢复由 focused governance test 固定。每个被迁移的命令族仍须保留少量真实 subprocess 用例覆盖 argv、进程退出和 stderr 合同。写命令、raw passthrough、安装/启动、worker/provider lifecycle 与 child-process 行为继续使用 `runCli*` subprocess helper。

CLI helper 的 state 隔离不依赖 test lane：`runCli*`、`runCliAsync` 与 `runCliReadOnly*` 默认共同使用当前测试进程专属的临时 `OPL_STATE_DIR`，并在进程退出时清理。调用点显式传入的 `OPL_STATE_DIR` 仍优先，以便测试 fixture 自己管理 state；但 shell、Codex task 或用户环境里继承的 `OPL_STATE_DIR` 永远不能成为测试默认 state。因此直接运行 `node --experimental-strip-types --test <focused-file>` 与通过 `scripts/test-lanes.mjs` 运行具有相同的 live-registry 隔离边界。

Workspace 测试若调用 `workspace init` / `ensure`，不应依赖真实 registry 或 sibling repo discovery。测试临时 workspace 可以被 initializer 绑定到隔离 state；删除 workspace fixture 后，隔离 state 随测试进程或 fixture 一并清理。若维护者需要治理历史 registry 污染，先用 `workspace maintenance prune` dry-run 检查；active missing binding 必须按精确 project/path 显式 `workspace archive`，再执行 prune dry-run 和 apply。该流程不按 `tmp`、测试前缀或目录名猜测，也不创建缺失的 MAG/OBF/MAS 项目。

## 归属规则

- 所有 active `tests/src/**/*.test.ts` 与 `tests/built/**/*.test.mjs` 必须被 `scripts/test-lanes.mjs assert-coverage` 覆盖。
- 聚合测试文件可以作为 lane 入口；被聚合文件通过 import closure 归属到同一 lane。
- 公共 helper 不得在模块顶层注册测试；helper 合同必须有唯一 `.test.ts` owner，避免每个引用入口重复注册同一断言。
- active 测试目录不得保留无理由 `test.skip` 或 `describe.skip`。退役 surface 应改为 fail-closed 守护，或迁入历史文档。
- `web` 与旧 alias 属于 retired surface；active 测试只保留 retired `cli_usage_error` 或 Codex-default passthrough 防回归断言。`mcp-stdio` 已恢复为 OPL Connect 的 active stdio server，必须由真实 MCP client/server 子进程测试覆盖 list/search/describe/execute、只读 annotations、输入 fail-closed 和 provider delegation。
- 文档不作为机器断言对象；测试只钉 registry、contracts、schemas、CLI/API 行为、workflow 命令和生成产物结构。
- CLI 测试 helper 只能提供 isolated `OPL_STATE_DIR` 和必要的显式 env；不得默认注入 `OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite`。若用例要断言产品默认 Temporal 未配置、`provider_ready=false` 或 runtime health `offline`，必须在该用例的 `runCli` env 中同时显式设置 `OPL_FAMILY_RUNTIME_PROVIDER: ''`、`OPL_TEMPORAL_ADDRESS: ''`、`TEMPORAL_ADDRESS: ''`、`OPL_TEMPORAL_WORKER_STATUS: ''` 和 `OPL_TEMPORAL_WORKER_ENABLED: ''`。若用例要验证 retired-provider guard，应显式传 `--provider local_sqlite` 并断言 fail-closed。
- App/operator drilldown 纯 selection fixture 若只测试 provider、domain dispatch、legacy cleanup 或 diagnostic route 选择，必须显式满足或隔离无关 owner-delta surface，尤其 App release user-path evidence；不要让 `buildAppReleaseUserPathEvidence` 从开发机默认 ledger 或 GitHub runner clean state 推导 open gate，否则本地 verified ledger 与 CI 空 ledger 会产生不同的默认 next action。

## CI 与结构质量

GitHub `Verify` workflow 按 gate 拆开运行 build/typecheck、fast、read-model-gates、regression、integration、fresh-install、native、lint 和本地 structure。`lint-and-structure` job 会先取 `origin/main` compare ref、安装 Sentrux、运行 `./scripts/verify.sh lint`，再运行 `./scripts/verify.sh structure`。默认结构 lane 是 advisory：line budget、Sentrux baseline regression 与 explicit rules findings 都用于 review visibility 和每日治理队列，不阻断普通开发 CI。显式维护检查使用 `line-budget:strict` 或 `structure:strict`，不混入默认 feature verification。`artifact` 与 `full` 是本地 / clean-clone release-style 验证入口，不是当前 Verify workflow 的独立 job。

`read-model-gates` 只放 owner/currentness/provider lifecycle、App/read-model 默认路径、StageRun closeout、workspace topology、domain-pack compiler、agent conformance 等会影响普通执行正确性的大边界。root help 是否列出某个细粒度入口、示例文案是否完整、报告措辞和 display-only discoverability 属于 `meta` / advisory 范围；命令本身 fail-closed、scoped help 可解析、JSON/usage shape 和 contract/API 行为仍可测试，但不应让 root help 展示细节阻断 default-branch hard CI。

`.github/workflows/sentrux-advisory.yml` 是非阻断 advisory signal：它发布 Sentrux 和 OPL quality details sidecar，帮助定位结构变化，但不替代显式 strict 维护入口，也不改变 `.sentrux/rules.toml`、line budget、reasonable-refactor 分类口径或 lane registry 的 owner。

更新测试文件时，先运行：

```bash
node scripts/test-lanes.mjs assert-coverage
rg "test\\.skip|describe\\.skip" tests/src tests/built
```

根据变更面选择最小充分验证：先跑 CodeGraph/字面检索命中的 focused tests，再跑 `npm test` / `npm run test:smoke`；触及 shared runtime、contract registry、stage pack、Foundry Kernel 或 quality details 时再补 `npm run test:fast`；runtime/install 改动跑 `npm run test:integration`；发布前先用 `npm run test:full:plan` readback 唯一执行计划，再跑 `npm run test:full` 或 `./scripts/verify.sh full`。

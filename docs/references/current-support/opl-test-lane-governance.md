# OPL 测试 Lane 治理参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_test_lane_governance`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

本参考说明当前测试入口语义。机器真相在 `scripts/test-lanes.mjs`、`scripts/run-parallel-test-lanes.sh`、`scripts/verify.sh`、`package.json` 和 GitHub workflow；本文只解释维护口径，不冻结 lane 细节、单个测试文件列表、Sentrux baseline 数字或 CI 通过状态。

Currentness policy：查看当前 lane 集合时先读 `package.json` 的 `test:*` scripts、`node scripts/test-lanes.mjs list`、`scripts/verify.sh` 的 case 分支和 `.github/workflows/verify.yml`。本文中的 lane 角色是稳定读法；测试文件增减、CI job 通过状态、quality details 数字、compare-ref 可用性和 full lane 内部日志都必须从 fresh 命令输出读取。

## Lane 语义

| Lane | 命令 | 角色 |
| --- | --- | --- |
| smoke | `npm run test:smoke` | 秒级核心入口，覆盖 lane registry、CLI 模块边界、runtime state path 与 OPL session runtime 基础合同。 |
| fast | `npm run test:fast` | 默认本地快速入口；覆盖 repo hygiene、合同治理、family shared release、native helper prebuild、轻量 runtime contract、stage pack 与 quality details。 |
| fast-parallel | `npm run test:fast:parallel` | full wrapper 的并行 fast lane；与 `fast` 使用同一测试集合。 |
| read-model-gates | `npm run test:read-model-gates` | 串行重型 read-model / runtime gate；覆盖 framework readiness、App drilldown、evidence worklist、Temporal/provider、workspace-domain、domain-pack compiler 与 agent conformance。 |
| meta | `npm run test:meta` | 治理、quality、contract 和 generated/default surface 元测试 lane；不等价于 `fast`。 |
| regression | `npm run test:regression` | 宽回归入口；覆盖 CLI 默认 shell、domain catalog、entry contracts、product-entry、orchestration、skills、automation 与 full internal package。 |
| integration | `npm run test:integration` | ACP/session runtime、install/configure、retired Product API fail-closed 与 domain definition 黑盒入口。 |
| artifact | `npm run test:artifact` | 构建后 artifact 行为，先 `npm run build`，再跑 built CLI 测试。 |
| fresh-install | `npm run test:fresh-install` | 本机 clean-room install / initialize 矩阵；真实 GUI 首启由 `one-person-lab-app` 的 App VM workflow 承担，并通过 external checkout 调用 `opl-aion-shell`。 |

`scripts/verify.sh` 是 repo-native 验证分发入口。它会先执行 line budget，再分发到 smoke、fast、meta、regression、integration、structure、family、fresh-install、artifact、native、full、lint、line-budget 或 typecheck。`line-budget` lane 只执行统一入口前置的 line-budget 检查，不追加测试。line-budget 的预算与 reviewed baseline 由 `contracts/opl-framework/source-structure-budget.json` 持有；脚本按 no-growth ratchet 阻断新增超线、超过 locked baseline、stale baseline 与 retired baseline。

| Verify lane | 命令 | 角色 |
| --- | --- | --- |
| native | `./scripts/verify.sh native` | native helper doctor、prebuild check、package dry-run、Rust test/build、state cache 与 family smoke。 |
| structure | `./scripts/verify.sh structure` | 本地结构质量入口；line budget 先由 `scripts/verify.sh` 执行并按 reviewed-baseline ratchet 阻断结构增长，Sentrux baseline regression 输出 OPL quality details 后按 advisory 处理，`.sentrux/rules.toml` explicit rules failure 仍是 blocking。 |
| family | `./scripts/verify.sh family` | family shared release 与 Python shared harness bootstrap 验证；Python cache、pytest cache 和临时 venv 必须走 repo 外 temp env。 |
| lint | `./scripts/verify.sh lint` | `npm run lint`，包含 JS lint 与 line budget。 |
| typecheck | `./scripts/verify.sh typecheck` | `npm run typecheck`。 |
| full | `npm run test:full` / `./scripts/run-parallel-test-lanes.sh full` | clean-clone 基线入口；先并行 fast-parallel、fresh-install、structure、typecheck 与 lint，再串行 read-model-gates、meta、regression、integration、artifact 与 native。 |

`npm test` 等同 `npm run test:fast`。`test:fast:parallel` 与 `fast` 使用同一测试集合，只是供 full wrapper 并行调度。`test:meta` 是独立治理 / quality / contract meta lane，不再等价 `test:fast`；共享 SQLite/state 的 framework readiness、App drilldown 和 evidence worklist 相关 read-model gates 通过 `test:read-model-gates` 串行执行，避免并行抢占同一状态面。

## 归属规则

- 所有 active `tests/src/**/*.test.ts` 与 `tests/built/**/*.test.mjs` 必须被 `scripts/test-lanes.mjs assert-coverage` 覆盖。
- 聚合测试文件可以作为 lane 入口；被聚合文件通过 import closure 归属到同一 lane。
- active 测试目录不得保留无理由 `test.skip` 或 `describe.skip`。退役 surface 应改为 fail-closed 守护，或迁入历史文档。
- `web`、`mcp-stdio` 与旧 alias 属于 retired surface；active 测试只保留 retired `cli_usage_error` 或 Codex-default passthrough 防回归断言。
- 文档不作为机器断言对象；测试只钉 registry、contracts、schemas、CLI/API 行为、workflow 命令和生成产物结构。
- CLI 测试 helper 默认会注入 `OPL_FAMILY_RUNTIME_PROVIDER=local_sqlite` 作为 dev/CI offline diagnostic baseline；若用例要断言产品默认 Temporal 未配置、`provider_ready=false` 或 runtime health `offline`，必须在该用例的 `runCli` env 中同时显式设置 `OPL_FAMILY_RUNTIME_PROVIDER: ''`、`OPL_TEMPORAL_ADDRESS: ''`、`TEMPORAL_ADDRESS: ''`、`OPL_TEMPORAL_WORKER_STATUS: ''` 和 `OPL_TEMPORAL_WORKER_ENABLED: ''`，不要依赖宿主或 CI 环境。
- App/operator drilldown 纯 selection fixture 若只测试 provider、domain dispatch、legacy cleanup 或 diagnostic route 选择，必须显式满足或隔离无关 owner-delta surface，尤其 App release user-path evidence；不要让 `buildAppReleaseUserPathEvidence` 从开发机默认 ledger 或 GitHub runner clean state 推导 open gate，否则本地 verified ledger 与 CI 空 ledger 会产生不同的默认 next action。

## CI 与结构质量

GitHub `Verify` workflow 按 gate 拆开运行 build/typecheck、fast、read-model-gates、regression、integration、fresh-install、native、lint 和本地 structure。`lint-and-structure` job 会先取 `origin/main` compare ref、安装 Sentrux、运行 `./scripts/verify.sh lint`，再运行 `./scripts/verify.sh structure`。其中 line budget 与 explicit Sentrux rules 是阻断面；line budget 阻断结构增长和 baseline 漂移，不把 reviewed historical baseline 当成必须在每次提交中一次性清空的旧债；baseline regression 由结构脚本降为 advisory 并附带 OPL quality details。`artifact` 与 `full` 是本地 / clean-clone release-style 验证入口，不是当前 Verify workflow 的独立 job。

`.github/workflows/sentrux-advisory.yml` 是非阻断 advisory signal：它发布 Sentrux 和 OPL quality details sidecar，帮助定位结构变化，但不替代 Verify workflow 的 lint / structure gate，也不改变 `.sentrux/rules.toml`、line budget 或 lane registry 的 owner。

更新测试文件时，先运行：

```bash
node scripts/test-lanes.mjs assert-coverage
rg "test\\.skip|describe\\.skip" tests/src tests/built
```

根据变更面选择最小充分验证：入口/registry 改动跑 `npm run test:smoke && npm run test:fast`；runtime/install 改动跑 `npm run test:integration`；发布前跑 `npm run test:full` 或 `./scripts/verify.sh full`。

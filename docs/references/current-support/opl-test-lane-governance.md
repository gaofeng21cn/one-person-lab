# OPL 测试 Lane 治理参考

本参考冻结当前测试入口语义。机器真相在 `scripts/test-lanes.mjs`、`package.json` 和 `scripts/verify.sh`；本文只解释维护口径。

## Lane 语义

| Lane | 命令 | 角色 |
| --- | --- | --- |
| smoke | `npm run test:smoke` | 秒级核心入口，覆盖 lane registry、CLI 模块边界、runtime state path 与 OPL session runtime 基础合同。 |
| fast | `npm run test:fast` | 默认本地入口；覆盖 repo hygiene、合同治理、family shared release、native helper prebuild、family runtime/quality/incident/operator projection 与 quality details。 |
| regression | `npm run test:regression` | 宽回归入口；覆盖 CLI 默认 shell、domain catalog、entry contracts、product-entry、orchestration、skills、automation 与 full internal package。 |
| integration | `npm run test:integration` | ACP/session runtime、install/configure、retired Product API fail-closed 与 domain definition 黑盒入口。 |
| artifact | `npm run test:artifact` | 构建后 artifact 行为，先 `npm run build`，再跑 built CLI 测试。 |
| fresh-install | `npm run test:fresh-install` | 本机 clean-room install / initialize 矩阵；真实 GUI 首启仍由 `one-person-lab-app/shells/aionui` 的 VM workflow 承担。 |
| native | `./scripts/verify.sh native` | native helper doctor、prebuild check、package dry-run、Rust test/build、state cache 与 family smoke。 |
| structure | `./scripts/verify.sh structure` | 本地 Sentrux blocking gate，失败时输出 OPL quality details sidecar。 |
| full | `./scripts/verify.sh full` | 聚合 fast、regression、integration、artifact、fresh-install、native、structure、typecheck 与 lint。 |

`npm test` 等同 `npm run test:fast`。`test:meta` 仍作为兼容 alias 指向 fast lane，新增工作应使用 `test:fast`、`test:regression` 或 `test:integration` 的当前语义。

## 归属规则

- 所有 active `tests/src/**/*.test.ts` 与 `tests/built/**/*.test.mjs` 必须被 `scripts/test-lanes.mjs assert-coverage` 覆盖。
- 聚合测试文件可以作为 lane 入口；被聚合文件通过 import closure 归属到同一 lane。
- active 测试目录不得保留无理由 `test.skip` 或 `describe.skip`。退役 surface 应改为 fail-closed 守护，或迁入历史文档。
- `web`、`mcp-stdio` 与旧 alias 属于 retired surface；active 测试只保留 retired `cli_usage_error` 或 Codex-default passthrough 防回归断言。
- 文档不作为机器断言对象；测试只钉 registry、contracts、schemas、CLI/API 行为、workflow 命令和生成产物结构。

## CI 与结构质量

GitHub `Verify` workflow 按 gate 拆开运行 build/typecheck、fast、regression、integration、fresh-install、native、lint 和本地 structure。`structure` 在 Verify workflow 中是阻断 gate。

`.github/workflows/sentrux-advisory.yml` 是非阻断 advisory signal：它发布 Sentrux 和 OPL quality details sidecar，帮助定位结构变化，但不替代本地 `./scripts/verify.sh structure` 的 blocking gate。

更新测试文件时，先运行：

```bash
node scripts/test-lanes.mjs assert-coverage
rg "test\\.skip|describe\\.skip" tests/src
```

根据变更面选择最小充分验证：入口/registry 改动跑 `npm run test:smoke && npm run test:fast`；runtime/install 改动跑 `npm run test:integration`；发布前跑 `./scripts/verify.sh full`。

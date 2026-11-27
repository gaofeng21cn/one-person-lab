# Framework 测试分组

执行入口由 [`scripts/test-lanes.mjs`](../../../scripts/test-lanes.mjs)、
[`scripts/verify.sh`](../../../scripts/verify.sh)、
[`package.json`](../../../package.json) 和 [CI workflow](../../../.github/workflows/ci.yml)
持有；本文解释选择方式，不维护另一份测试清单。

| 层级 | 目的 | 执行方式 |
| --- | --- | --- |
| `smoke` | 合同检查、`v2:guard`、核心单测与独立的 fast-cache 性能 SLA | `npm run test:smoke` / `scripts/verify.sh smoke` |
| `fast` | build、typecheck、hygiene、coverage 校验、package 单测、独立性能 SLA 与 extensions/scripts 测试 | `npm run test:fast` / `scripts/verify.sh fast` |
| `artifact` | 基于构建产物的 CLI/daemon 产物测试（`tests/built/*.test.mjs`） | `npm run test:artifact` / `scripts/verify.sh artifact` |
| `structure` | 导入边界与结构质量门禁 | `scripts/verify.sh structure` |
| `family` | Foundry、Foundation Skills、Python SDK、Release 与依赖解析集成测试 | `scripts/verify.sh family` |
| `full` | 串联 `smoke`、`artifact`、`structure`、`family` 及 E2E 自检（可选完整 E2E） | `scripts/verify.sh full` |

针对单 phase 或分片排查时，可沿同一入口选择：

```sh
npm ci
npm run test:fast -- --phase quality
npm run test:fast -- --phase unit --shard 1/3
npm run test:fast -- --phase performance
npm run test:fast -- --phase extensions
node scripts/test-lanes.mjs plan fast --phase unit --shard 1/3
```

`--shard` 只接受纯测试 phase；各分片按稳定文件顺序分配，每个文件只出现一次。
未指定 phase 时，`test:fast` 按顺序执行全部检查及 build；每个步骤输出耗时、文件与退出状态。
fast-cache 的重负载 SLA 保留 100 次 RPC 样本和 `<20ms` 阈值，并在 `performance` phase 单独运行，避免与并行 package 单测争用测试进程。
`assert-coverage` 用于确保所有活跃测试文件均被至少一个 test lane 覆盖无遗漏。

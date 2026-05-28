# OPL Quality Details 参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_quality_details`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

`opl quality details` 是 OPL family-owned 的代码质量排查 sidecar 诊断面。它配合 Sentrux Free 使用：Sentrux 继续持有结构评分、趋势、baseline 和 rules source；OPL 只输出 deterministic details，帮助 agent 定位结构问题涉及的文件、函数、依赖路径、测试缺口和本地规则。

该命令不 fork Sentrux、不绕过 Sentrux 授权、不依赖 Sentrux Pro，也不创建第二套质量分数。它只读取目标仓库，并只写 stdout 或 caller 指定的 artifact。

Currentness rule：本文只解释当前诊断边界。阻断行为归 `scripts/run-structural-quality-gate.sh`、`scripts/verify.sh`、`.github/workflows/verify.yml` 和 `.sentrux/rules.toml`；本文不能被读成 merge policy、Sentrux replacement、quality verdict 或 domain readiness proof。

## 命令

```bash
opl quality details --root <repo_path> \
  [--format <json|markdown>] \
  [--limit <n>] \
  [--focus <auto|depth|equality|modularity|redundancy|test_gaps|rules>] \
  [--compare-ref <git_ref>]
```

JSON 输出是机器面：

- `surface_kind`: `opl_code_quality_details.v1`
- `repo_summary`: source / test / function / import / depth / test-gap / rules 计数
- `baseline_diff`: 可选的 compare-ref complex-function 变化摘要
- `function_change_findings`: 新越过或继续恶化到 complex-function threshold 以上的函数
- `function_findings`: 函数名、文件、行范围、长度、参数数量、复杂度和原因
- `file_findings`: 文件长度、local fan-in / fan-out、函数数量和原因
- `dependency_findings`: 深层 local dependency path 与 high fan-in / fan-out target
- `test_gap_findings`: 没有匹配本地测试 import / reference 的 source file
- `rules_findings`: 本地 `.sentrux/rules.toml` constraint 与 boundary details
- `agent_triage_targets`: 下一步 agent action 的排序目标

Markdown 输出刻意保持 compact，用于 GitHub step summary。

`--compare-ref` 会为给定 ref 创建临时 detached Git worktree，把它和当前 target tree 做比较，并报告 function-level change。它用于排查 Sentrux gate 里的 `Complex functions increased` 等失败；Markdown 表格列出 `file`、`function`、行号和 old/new complexity。

## 语言覆盖

TypeScript 和 JavaScript 通过 TypeScript compiler API 解析。Python 通过 Python standard-library `ast` 模块解析。source-code discovery 在目标是 Git repo 时使用 tracked files；非 Git 目录回退到保守 filesystem walk。

v1 rules reader 覆盖 family `.sentrux/rules.toml` 形状：`[constraints]`、`[[layers]]` 和 `[[boundaries]]`。它只是本 repo family 的 diagnostic reader，不是通用 TOML replacement，也不是 Sentrux rules authority。

## Family 使用

Domain repositories 可以在各自 Sentrux lane 之前或旁边消费该 advisory output。MAS、MAG、RCA 继续持有 domain-owned truth 和 product/runtime semantics；OPL 只持有 shared diagnostic tool。

本地 structure lane 应先运行既有 Sentrux gate/check。在 OPL 中，`./scripts/verify.sh structure` 委托给 `scripts/run-structural-quality-gate.sh`：

- line budget 仍由 `scripts/verify.sh` 在 lane dispatch 之前执行；
- `sentrux gate .` baseline regression 会输出 `opl quality details` 并按 advisory success 返回，因此普通 baseline drift 本身不阻断 lane；
- `sentrux check .` rules failure 会输出 `opl quality details`，并保留 rules failure 的 blocking 状态；
- 缺少 `.sentrux/baseline.json` 或 `.sentrux/rules.toml` 会报告为 skipped local structural check，不伪造 pass/fail evidence。

structure gate 输出 sidecar 时，命令形状是：

```bash
opl quality details --root . --format markdown --limit 30 --focus auto --compare-ref "${OPL_QUALITY_DETAILS_COMPARE_REF:-origin/main}"
```

这保持 Sentrux 作为 structural source，并让 function-level regression 在开发时可见，同时保留当前 policy split：baseline drift 是 advisory，explicit rules 是 blocking。

GitHub `Sentrux Advisory` workflow 刻意保持 non-blocking。它发布 Sentrux output 和该 sidecar 供 review visibility 使用，但不替代 `Verify` workflow 的 `lint-and-structure` job。该 job 运行 `./scripts/verify.sh lint` 和 `./scripts/verify.sh structure`；真实 blocking policy 仍由脚本和 `.sentrux/rules.toml` 定义，不由 advisory workflow 文案定义。

其他 GitHub workflow 若要使用该 OPL-owned action，应以目标分支实际包含该 action 为前提：

```yaml
- uses: gaofeng21cn/one-person-lab/.github/actions/quality-details@<ref>
  with:
    root: .
    compare-ref: origin/main
    output-dir: artifacts/opl-quality-details
```

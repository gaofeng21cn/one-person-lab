# OPL Family Directory Governance

owner: `OPL maintainers`
purpose: 冻结 OPL family 仓库目录归属和 hygiene baseline，避免把源码、合同、叙述文档与运行态输出混放。
state: active reference
machine boundary: 叙述性治理参考；机读约束由 repo hygiene 测试和 `.gitignore` 承担。

## 范围

这份规则适用于 OPL family 的 shared workbench 仓和 domain agent 仓。它描述目录归属，不改变 domain repo 当前 source tree，也不把 domain runtime truth 搬到 OPL。

## 共享目录规则

- 源码、产品实现、脚本和测试留在对应仓库的 source tree 中，由该仓维护。
- 机读合同、schema、registry、manifest 和 stable machine surface 留在 `contracts/` 或已声明的机读 source surface 中。
- 叙述性项目文档、治理材料、参考材料和历史说明留在 `docs/`，并按 lifecycle index 归入 active、public、references 或 history。
- 运行态状态、build output、package output、cache、临时执行痕迹和本地 agent 状态只允许作为 ignored transient 存在，不进入 tracked tree。
- Domain repo 保持自己的 current source tree、runtime truth、quality authority 和 deliverable ownership。OPL 可以消费 shared contracts 和 projections，但不搬迁 domain repo 的当前实现树。

## 禁止 tracked 的目录和文件

OPL family 仓库不应 track 下列本地或生成态路径：

- `dist/`
- `build/`
- `out/`
- `__pycache__/`
- `*.egg-info/`
- `.DS_Store`
- `.codex/`
- `.omx/`
- `.runtime-program/`
- `runtime-state/`
- `.agent-contract-baseline.json`

如果某个仓库确实需要发布构建产物，应通过 release artifact、package manifest、archive 或可再生成的 contract 描述，而不是把 build output 放进 tracked source tree。

## Repo-specific allowlist

Hygiene audit 只检查明确的路径段和 root 文件，不做字符串子串匹配。`src/cli/modules/*` 这类源码模块目录属于正常 source tree，不应被 `modules` 字样或 package/module 语义误拦。

如果未来出现 repo-specific 例外，例外必须在对应仓库的 hygiene 测试中显式列出，并写明 owner、purpose、state 和退役条件。
